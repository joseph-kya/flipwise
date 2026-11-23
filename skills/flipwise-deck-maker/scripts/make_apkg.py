#!/usr/bin/env python3
"""Generate a legacy Basic Anki package with Python's standard library only."""
import argparse
from contextlib import closing
import hashlib
import html
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import time
from urllib.parse import parse_qs, urlencode, urlsplit
import zipfile

MODEL_ID = 1800000000001
SCHEMA = '''
CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer,
 ver integer, dty integer, usn integer, ls integer, conf text, models text,
 decks text, dconf text, tags text);
CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer,
 usn integer, tags text, flds text, sfld integer, csum integer, flags integer, data text);
CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer,
 mod integer, usn integer, type integer, queue integer, due integer, ivl integer,
 factor integer, reps integer, lapses integer, left integer, odue integer,
 odid integer, flags integer, data text);
CREATE TABLE revlog (id integer primary key, cid integer, usn integer, ease integer,
 ivl integer, lastIvl integer, factor integer, time integer, type integer);
CREATE TABLE graves (usn integer, oid integer, type integer);
CREATE INDEX ix_notes_usn ON notes (usn);
CREATE INDEX ix_cards_usn ON cards (usn);
CREATE INDEX ix_cards_nid ON cards (nid);
CREATE INDEX ix_cards_sched ON cards (did, queue, due);
CREATE INDEX ix_revlog_usn ON revlog (usn);
CREATE INDEX ix_revlog_cid ON revlog (cid);
CREATE INDEX ix_notes_csum ON notes (csum);
'''


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def numeric_id(kind, value):
    # Stable, positive and exactly representable by JavaScript numbers.
    return int(hashlib.sha256((kind + ':' + value).encode()).hexdigest()[:13], 16) or 1


def validate(document):
    if not isinstance(document, dict) or set(document) != {'cards'}:
        raise ValueError('Expected an object with exactly one cards array.')
    if not isinstance(document['cards'], list) or not document['cards']:
        raise ValueError('cards must be a nonempty array.')
    result, seen = [], set()
    for index, raw in enumerate(document['cards'], 1):
        label = f'Card {index}'
        if not isinstance(raw, dict) or set(raw) - {'deck', 'front', 'back', 'tags', 'source', 'id'}:
            raise ValueError(f'{label}: unknown fields or invalid card object.')
        for key in ('deck', 'front', 'back', 'source'):
            if not isinstance(raw.get(key), str) or not raw[key].strip():
                raise ValueError(f'{label}: {key} must be a nonempty string.')
            if any(c in raw[key] for c in ('\x00', '\x1f')):
                raise ValueError(f'{label}: {key} contains an Anki field separator.')
        parts = raw['deck'].split('::')
        if len(parts) != 3 or any(not p.strip() or p != p.strip() for p in parts):
            raise ValueError(f'{label}: deck must be Root::Subject::Lecture.')
        tags = raw.get('tags')
        if not isinstance(tags, list) or any(not isinstance(t, str) or not re.fullmatch(r'[\w-]+', t) for t in tags):
            raise ValueError(f'{label}: tags must be an array of flat letter/digit/underscore/hyphen tags.')
        url = urlsplit(raw['source'])
        query = parse_qs(url.query)
        source_path = query.get('file', [''])[0]
        if url.scheme != 'obsidian' or url.netloc != 'open' or not query.get('vault', [''])[0] or not source_path:
            raise ValueError(f'{label}: source must be obsidian://open with vault and file parameters.')
        if url.fragment or source_path.startswith(('/', '\\')) or re.match(r'^[A-Za-z]:', source_path) or '..' in source_path.replace('\\', '/').split('/'):
            raise ValueError(f'{label}: file must be vault-relative; encode heading fragments inside file.')
        guid = raw.get('id')
        if guid is not None and (not isinstance(guid, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,80}', guid)):
            raise ValueError(f'{label}: id must be 1–80 letters/digits or _ . : - characters.')
        if guid is None:
            guid = hashlib.sha256(compact([raw['deck'], source_path, raw['front']]).encode('utf-8')).hexdigest()[:32]
        if guid in seen:
            raise ValueError(f'{label}: duplicate GUID {guid}; assign a distinct stable id to a distinct concept.')
        seen.add(guid)
        result.append({**raw, 'id': guid, 'tags': sorted(set(tags))})
    return result


def markdown_cards(path, deck, vault, source_path):
    source = 'obsidian://open?' + urlencode({'vault': vault, 'file': source_path or path.name})
    cards, question, answer = [], None, None
    def finish():
        if question is not None:
            if not answer or not '\n'.join(answer).strip():
                raise ValueError(f'Question has no answer: {question}')
            cards.append({'deck': deck, 'front': question, 'back': '\n'.join(answer).strip(), 'tags': [], 'source': source})
    for line in path.read_text(encoding='utf-8').splitlines():
        if line.startswith('Q:'):
            finish()
            question, answer = line[2:].strip(), None
        elif line.startswith('A:'):
            if question is None or answer is not None:
                raise ValueError('Each Q: needs exactly one A: block.')
            answer = [line[2:].strip()]
        elif question is not None:
            if answer is not None:
                answer.append(line)
            elif line.strip():
                question += '\n' + line
    finish()
    return {'cards': cards}


def make_package(cards, output):
    now, now_ms = int(time.time()), int(time.time() * 1000)
    model = {'id': MODEL_ID, 'name': 'Flipwise Basic', 'type': 0, 'mod': now, 'usn': -1,
             'sortf': 0, 'did': 1, 'css': '.card { font-family: Arial; font-size: 19px; text-align: left; }',
             'flds': [{'name': name, 'ord': i, 'sticky': False, 'rtl': False, 'font': 'Arial', 'size': 19}
                      for i, name in enumerate(('Front', 'Back', 'Source'))],
             'tmpls': [{'name': 'Card 1', 'ord': 0, 'qfmt': '{{Front}}',
                        'afmt': '{{FrontSide}}<hr id="answer">{{Back}}<br>{{Source}}', 'bqfmt': '', 'bafmt': ''}],
             'req': [[0, 'all', [0]]]}
    decks = {}
    for card in cards:
        parts = card['deck'].split('::')
        for length in range(1, len(parts) + 1):
            name = '::'.join(parts[:length])
            did = numeric_id('deck', name)
            if str(did) in decks and decks[str(did)]['name'] != name:
                raise ValueError('Deck ID hash collision; change a deck name.')
            decks[str(did)] = {'id': did, 'name': name, 'mod': now, 'usn': -1, 'desc': '',
                'dyn': 0, 'collapsed': False, 'conf': 1, 'extendNew': 0, 'extendRev': 0,
                'newToday': [0, 0], 'revToday': [0, 0], 'lrnToday': [0, 0], 'timeToday': [0, 0]}
    config = {'id': 1, 'name': 'Default', 'mod': now, 'usn': -1, 'maxTaken': 60,
              'autoplay': True, 'timer': 0, 'replayq': True,
              'new': {'bury': True, 'delays': [1, 10], 'initialFactor': 2500, 'ints': [1, 4, 0], 'order': 1, 'perDay': 20, 'separate': True},
              'rev': {'bury': True, 'ease4': 1.3, 'fuzz': .05, 'ivlFct': 1, 'maxIvl': 36500, 'perDay': 200, 'hardFactor': 1.2},
              'lapse': {'delays': [10], 'leechAction': 1, 'leechFails': 8, 'minInt': 1, 'mult': 0}}
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as temporary:
        db_path = Path(temporary) / 'collection.anki2'
        with closing(sqlite3.connect(db_path)) as db, db:
            db.executescript(SCHEMA)
            first_deck = numeric_id('deck', cards[0]['deck'])
            db.execute('INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                (1, now, now_ms, now_ms, 11, 0, 0, 0,
                 compact({'nextPos': len(cards) + 1, 'curDeck': first_deck, 'activeDecks': [first_deck], 'curModel': MODEL_ID}),
                 compact({str(MODEL_ID): model}), compact(decks), compact({'1': config}), '{}'))
            note_ids, card_ids = set(), set()
            for position, card in enumerate(cards, 1):
                nid, cid = numeric_id('note', card['id']), numeric_id('card', card['id'])
                if nid in note_ids or cid in card_ids:
                    raise ValueError('Numeric ID collision; assign a different explicit id.')
                note_ids.add(nid)
                card_ids.add(cid)
                plain = html.unescape(re.sub(r'<[^>]*>', '', card['front']))
                checksum = int(hashlib.sha1(plain.encode()).hexdigest()[:8], 16)
                source_html = '<a href="' + html.escape(card['source'], quote=True) + '">Open source</a>'
                db.execute('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                    (nid, card['id'], MODEL_ID, now, -1, ' ' + ' '.join(card['tags']) + ' ',
                     '\x1f'.join((card['front'], card['back'], source_html)), plain, checksum, 0, ''))
                db.execute('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    (cid, nid, numeric_id('deck', card['deck']), 0, now, -1, 0, 0, position, 0, 2500, 0, 0, 0, 0, 0, 0, ''))
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.write(db_path, 'collection.anki2')
            archive.writestr('media', '{}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--from-markdown', action='store_true', help='Read simple Q:/A: Markdown instead of JSON')
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--deck')
    parser.add_argument('--vault')
    parser.add_argument('--source-path')
    args = parser.parse_args()
    try:
        manifest = args.output.with_suffix('.cards.json')
        if args.output.suffix.lower() != '.apkg':
            raise ValueError('Output must end in .apkg.')
        if args.input.resolve() == args.output.resolve():
            raise ValueError('Choose an output name that will not overwrite the input file.')
        if args.from_markdown and (not args.deck or not args.vault):
            raise ValueError('--from-markdown requires --deck and --vault.')
        document = markdown_cards(args.input, args.deck, args.vault, args.source_path) if args.from_markdown else json.loads(args.input.read_text(encoding='utf-8'))
        cards = validate(document)
        make_package(cards, args.output)
        manifest.write_text(json.dumps({'cards': cards}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        counts = {}
        for card in cards:
            counts[card['deck']] = counts.get(card['deck'], 0) + 1
        print(json.dumps({'output': str(args.output), 'manifest': str(manifest), 'notes': len(cards), 'cards': len(cards), 'decks': counts, 'guids': [c['id'] for c in cards]}, ensure_ascii=False, indent=2))
    except (ValueError, OSError, sqlite3.Error, zipfile.BadZipFile) as error:
        parser.exit(1, f'Error: {error}\n')


if __name__ == '__main__':
    main()
