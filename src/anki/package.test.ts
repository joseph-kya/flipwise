// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { zipSync, strToU8, unzipSync } from "fflate";
import { parsePackage, exportPackage, exportFlipwise } from "./package";
import { allCards, mergeImport, mergeReviews } from "./types";
import { sanitizeAnki, hasMath, sourceUrl, CardContent } from "./content";
import { ratingEvent, queue } from "../scheduler";
let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs({
    useOldExtensionFunctions: false,
    locateFile: () => `${process.cwd()}/node_modules/sql.js/dist/sql-wasm.wasm`,
  });
});
function fixture(edit = false) {
  const db = new SQL.Database();
  db.run(
    "CREATE TABLE col (decks text,models text); CREATE TABLE notes (id integer,guid text,mid integer,flds text,tags text); CREATE TABLE cards (id integer,nid integer,did integer,ord integer,due integer); CREATE TABLE revlog (id integer,cid integer,ease integer,time integer);",
  );
  db.run("INSERT INTO col VALUES (?,?)", [
    JSON.stringify({
      1: { name: "Root::Course::Lec1" },
      2: { name: "Root::Course::Lec2" },
    }),
    JSON.stringify({
      1: {
        flds: [
          { name: "Front", ord: 0 },
          { name: "Back", ord: 1 },
          { name: "Source", ord: 2 },
          { name: "Other", ord: 3 },
        ],
        tmpls: [
          { name: "Forward", ord: 0 },
          { name: "Reverse", ord: 1 },
        ],
      },
    }),
  ]);
  for (let i = 1; i <= 3; i++)
    db.run("INSERT INTO notes VALUES (?,?,?,?,?)", [
      i,
      `guid-${i}`,
      1,
      [
        i === 1 ? `<b>${edit ? "Edited" : "Math"}</b> \\(x^2\\)` : `Front ${i}`,
        `Back ${i}`,
        i === 1
          ? '<a href="obsidian://open?vault=Uni&file=Test">Source</a>'
          : "",
        `extra ${i}`,
      ].join("\x1f"),
      " core definition ",
    ]);
  [
    [1, 1, 1, 0, 20],
    [2, 2, 2, 0, 10],
    [3, 3, 2, 0, 30],
    [4, 3, 2, 1, 31],
  ].forEach((v) => db.run("INSERT INTO cards VALUES (?,?,?,?,?)", v));
  db.run("INSERT INTO revlog VALUES (?,?,?,?)", [1700000000000, 1, 3, 1200]);
  const bytes = zipSync({
    "collection.anki2": db.export(),
    media: strToU8("{}"),
  });
  db.close();
  return bytes;
}
describe("Anki packages", () => {
  it("maps hierarchy, fields, source, ord and positions", () => {
    const d = parsePackage(fixture(), SQL, "tiny.apkg");
    expect(d.notes).toBe(3);
    expect(allCards(d)).toHaveLength(4);
    expect(d.subjects[0].name).toBe("Course");
    expect(d.subjects[0].collectionLabel).toBe("Root");
    expect(d.subjects[0].lectures.map((l) => l.title)).toEqual([
      "Lec1",
      "Lec2",
    ]);
    expect(allCards(d)[0].extra.Other).toBe("extra 1");
    expect(allCards(d)[3]).toMatchObject({
      ord: 1,
      template: "Reverse",
      front: "Back 3",
    });
    expect(allCards(d)[0].queuePosition).toBe(20);
    expect(d.revlog[0].source).toBe("anki");
  });
  it("upserts GUIDs without duplicates and preserves progress", () => {
    const d = parsePackage(fixture(), SQL, "tiny.apkg"),
      c = allCards(d)[0];
    const event = ratingEvent(
      {
        ...c,
        cardId: c.stableId,
        subjectId: d.subjects[0].id,
        lessonId: d.subjects[0].lectures[0].id,
      },
      "good",
      [],
      new Date(),
      1000,
      0.9,
      "local",
    );
    const log = [event];
    const merged = mergeImport(
      d,
      parsePackage(fixture(true), SQL, "tiny.apkg"),
      log,
    );
    expect(merged.report).toEqual({
      new: 0,
      updated: 1,
      unchanged: 2,
      missing: 0,
    });
    expect(allCards(merged.data)).toHaveLength(4);
    expect(log).toEqual([event]);
    expect(
      queue(
        allCards(merged.data).map((c) => ({
          ...c,
          cardId: c.stableId,
          subjectId: d.subjects[0].id,
          lessonId: "Lec1",
        })),
        log,
      ).some((c) => c.cardId === event.cardId),
    ).toBe(false);
    expect(mergeReviews(d.revlog, d.revlog)).toHaveLength(1);
  });
  it("retains missing notes and reports them", () => {
    const d = parsePackage(fixture(), SQL, "a");
    const incoming = structuredClone(d);
    incoming.subjects[0].lectures[0].cards = [];
    incoming.notes = 2;
    const m = mergeImport(d, incoming, []);
    expect(m.report.missing).toBe(1);
    expect(allCards(m.data)).toHaveLength(4);
  });
  it("exports an Anki database and round-trips stable cards", () => {
    const d = parsePackage(fixture(), SQL, "tiny.apkg");
    const bytes = exportPackage(d, SQL);
    expect(unzipSync(bytes)["collection.anki2"]).toBeDefined();
    const round = parsePackage(bytes, SQL, "round.apkg");
    expect(round.notes).toBe(3);
    expect(
      allCards(round)
        .map((c) => c.stableId)
        .sort(),
    ).toEqual(
      allCards(d)
        .map((c) => c.stableId)
        .sort(),
    );
    expect(allCards(round)[0].source).toBe(allCards(d)[0].source);
    expect(exportFlipwise(d, d.subjects[0].id)).toMatchObject({
      format: "flipwise-deck",
      version: 1,
    });
  });
  it("reads normalized schema names and a two-level General lesson", () => {
    const files = unzipSync(fixture());
    const db = new SQL.Database(files["collection.anki2"]);
    db.run(
      "CREATE TABLE decks (id integer,name text); INSERT INTO decks VALUES (1,'Root::Course'),(2,'Root::Course'); CREATE TABLE notetypes (id integer,name text); INSERT INTO notetypes VALUES (1,'Basic'); CREATE TABLE fields (ntid integer,ord integer,name text); INSERT INTO fields VALUES (1,0,'Front'),(1,1,'Back'),(1,2,'Source'); CREATE TABLE templates (ntid integer,ord integer,name text); INSERT INTO templates VALUES (1,0,'Forward'),(1,1,'Reverse');",
    );
    files["collection.anki21"] = new Uint8Array(db.export());
    db.close();
    const d = parsePackage(zipSync(files), SQL, "modern.colpkg");
    expect(d.subjects[0].name).toBe("Root");
    expect(d.subjects[0].lectures[0].title).toBe("General");
  });
  it("sanitizes HTML and allows only mapped image blobs and safe links", () => {
    const result = sanitizeAnki(
      '<script>alert(1)</script><img src="pic.png" onerror="alert(1)"><img src="https://evil.test/x"><a href="javascript:alert(1)">bad</a><b>safe</b>',
      { "pic.png": "blob:local" },
    );
    expect(result).not.toContain("<script");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("evil.test");
    expect(result).toContain("blob:local");
    expect(result).toContain("<b>safe</b>");
    expect(sourceUrl('<a href="obsidian://open?vault=Uni">link</a>')).toBe(
      "obsidian://open?vault=Uni",
    );
    expect(sourceUrl("javascript:alert(1)")).toBeUndefined();
  });
  it.each(["\\(x\\)", "\\[x\\]", "$x$", "$$x$$"])("detects math %s", (text) =>
    expect(hasMath(text)).toBe(true),
  );
});

function rawZstd(bytes: Uint8Array) {
  const output = new Uint8Array(12 + bytes.length);
  output.set([0x28, 0xb5, 0x2f, 0xfd, 0xa0]);
  new DataView(output.buffer).setUint32(5, bytes.length, true);
  const block = (bytes.length << 3) | 1;
  output.set([block & 255, (block >> 8) & 255, (block >> 16) & 255], 9);
  output.set(bytes, 12);
  return output;
}
it('prefers zstd anki21b and reads compressed protobuf media manifests and media', () => {
  const files = unzipSync(fixture());
  files['collection.anki21b'] = rawZstd(files['collection.anki2']);
  files['collection.anki2'] = strToU8('invalid fallback');
  const name = strToU8('pic.png');
  const entry = new Uint8Array([10, name.length, ...name]);
  files.media = rawZstd(new Uint8Array([10, entry.length, ...entry]));
  files['0'] = rawZstd(new Uint8Array([1, 2, 3]));
  const parsed = parsePackage(zipSync(files), SQL, 'compressed.colpkg');
  expect(parsed.notes).toBe(3);
  expect(parsed.media['pic.png']).toEqual(new Uint8Array([1, 2, 3]));
});
it('puts notes directly in a course deck into General', () => {
  const files = unzipSync(fixture());
  const db = new SQL.Database(files['collection.anki2']);
  const decks = {1: {name: 'Root::Course'}, 2: {name: 'Root::Course::Lec2'}};
  db.run('UPDATE col SET decks=?', [JSON.stringify(decks)]);
  files['collection.anki2'] = new Uint8Array(db.export()); db.close();
  const parsed = parsePackage(zipSync(files), SQL, 'direct.apkg');
  expect(parsed.subjects).toHaveLength(1);
  expect(parsed.subjects[0].name).toBe('Course');
  expect(parsed.subjects[0].lectures.map(l=>l.title)).toEqual(['General','Lec2']);
});

it('renders bundled KaTeX and a quiet source link on imported answers',()=>{
 const card={id:'math',format:'anki' as const,front:'\\(x^2\\)',back:'$$x+1$$',source:'obsidian://open?vault=Uni'};
 const front=renderToStaticMarkup(createElement(CardContent,{card,side:'front'}));
 const back=renderToStaticMarkup(createElement(CardContent,{card,side:'back'}));
 expect(front).toContain('class="katex"');expect(back).toContain('katex-display');
 expect(front).not.toContain('Open source');expect(back).toContain('Open source');
});
