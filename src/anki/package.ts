import { mediaManifest } from "./media";
import type { SqlJsStatic, Database } from "sql.js";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { decompress } from "fzstd";
import type { Subject } from "../demoSubjects";
import type { ReviewEvent, Rating } from "../reviewLog";
import {
  allCards,
  courseCap,
  type ImportedCard,
  type ImportedData,
} from "./types";
const modernMessage =
  "This package uses Anki's new format. In Anki, export with 'Support older Anki versions' checked.";
const decode = (bytes: Uint8Array) =>
  bytes[0] === 0x28 &&
  bytes[1] === 0xb5 &&
  bytes[2] === 0x2f &&
  bytes[3] === 0xfd
    ? decompress(bytes)
    : bytes;
function rows(db: Database, sql: string): Record<string, any>[] {
  const r = db.exec(sql)[0];
  return r
    ? r.values.map((v) =>
        Object.fromEntries(r.columns.map((k, i) => [k, v[i]])),
      )
    : [];
}
const identity = (s: string) => encodeURIComponent(s);
export function parsePackage(
  bytes: Uint8Array,
  SQL: SqlJsStatic,
  packageName: string,
): ImportedData {
  const files = unzipSync(bytes),
    name = ["collection.anki21b", "collection.anki21", "collection.anki2"].find(
      (n) => files[n],
    );
  if (!name) throw new Error("No Anki collection database found.");
  let db: Database;
  try {
    db = new SQL.Database(decode(files[name]));
  } catch {
    throw new Error(modernMessage);
  }
  try {
    const tables = new Set(
      rows(db, "SELECT name FROM sqlite_master WHERE type='table'").map(
        (r) => r.name,
      ),
    );
    const col = rows(db, "SELECT * FROM col LIMIT 1")[0] ?? {};
    let decks: Record<string, any> = {},
      models: Record<string, any> = {};
    try {
      decks = JSON.parse(col.decks || "{}") ?? {};
      models = JSON.parse(col.models || "{}") ?? {};
    } catch {
      /* normalized schemas below */
    }
    if (tables.has("decks"))
      for (const d of rows(db, "SELECT id,name FROM decks"))
        decks[String(d.id)] = {
          id: d.id,
          name: String(d.name).replace(/\x1f/g, "::"),
        };
    if (tables.has("notetypes"))
      for (const m of rows(db, "SELECT id,name FROM notetypes"))
        models[String(m.id)] = {
          id: m.id,
          name: m.name,
          flds: tables.has("fields")
            ? rows(
                db,
                `SELECT name,ord FROM fields WHERE ntid=${Number(m.id)} ORDER BY ord`,
              )
            : [],
          tmpls: tables.has("templates")
            ? rows(
                db,
                `SELECT name,ord FROM templates WHERE ntid=${Number(m.id)} ORDER BY ord`,
              )
            : [],
        };
    const warnings: string[] = [];
    const subjects: Subject[] = [];
    const notes = rows(db, "SELECT * FROM notes"),
      cardRows = rows(db, "SELECT * FROM cards");
    if (notes.some((n) => String(n.flds).includes("[sound:")))
      warnings.push(
        "Audio files are retained, but audio playback is not supported.",
      );
    if (
      Object.values(models).some((m: any) =>
        /image occlusion/i.test(m.name ?? ""),
      )
    )
      warnings.push(
        "Image occlusion templates are not rendered; raw fields are retained.",
      );
    const noteMap = new Map(notes.map((n) => [String(n.id), n]));
    const cardMap = new Map<
      string,
      { card: ImportedCard; subjectId: string; lessonId: string }
    >();
    for (const r of cardRows) {
      const note = noteMap.get(String(r.nid));
      if (!note) continue;
      const model = models[String(note.mid)] ?? {};
      if (
        (model.type === 1 || /cloze/i.test(model.name ?? "")) &&
        !warnings.includes(
          "Cloze templates are preserved as fields but cloze expansion is not supported.",
        )
      )
        warnings.push(
          "Cloze templates are preserved as fields but cloze expansion is not supported.",
        );
      const parts = String(decks[String(r.did)]?.name ?? "Imported").split(
        "::",
      );
      const roots = new Set(
        Object.values(decks)
          .filter((d: any) => String(d.name).split("::").length >= 3)
          .map((d: any) => String(d.name).split("::")[0]),
      );
      const inRoot =
        parts.length >= 3 || (parts.length === 2 && roots.has(parts[0]));
      const collection = inRoot ? parts[0] : undefined;
      const course = inRoot ? parts[1] : parts[0];
      const lessonName =
        parts.length >= 3 ? parts.slice(2).join("::") : "General";
      const subjectId = `anki-${identity(collection ? collection + "::" + course : course)}`,
        lessonId = identity(lessonName);
      let subject = subjects.find((s) => s.id === subjectId);
      if (!subject) {
        subject = {
          id: subjectId,
          name: course,
          collectionLabel: collection,
          total: 0,
          dailyNew: courseCap(course),
          lectures: [],
        };
        subjects.push(subject);
      }
      let lesson = subject.lectures.find((l) => l.id === lessonId);
      if (!lesson) {
        lesson = { id: lessonId, title: lessonName, cards: [] };
        subject.lectures.push(lesson);
      }
      const values = String(note.flds).split("\x1f"),
        fields: Record<string, string> = Object.create(null);
      values.forEach(
        (v, i) =>
          (fields[
            model.flds?.find((f: any) => Number(f.ord) === i)?.name ??
              model.flds?.[i]?.name ??
              `Field ${i + 1}`
          ] = v),
      );
      const entries = Object.entries(fields);
      const pick = (key: string, index: number) =>
        entries.find(([k]) => k.toLowerCase() === key)?.[1] ??
        values[index] ??
        "";
      const guid = String(note.guid ?? ""),
        ord = Number(r.ord);
      if (!guid)
        throw new Error(
          "A note has no GUID; import stopped to protect existing cards.",
        );
      const front = pick("front", 0),
        back = pick("back", 1),
        source = entries.find(([k]) => k.toLowerCase() === "source")?.[1];
      if (
        ord > 1 &&
        !warnings.includes(
          "Custom templates are kept by ordinal; display uses the basic Front/Back fields.",
        )
      )
        warnings.push(
          "Custom templates are kept by ordinal; display uses the basic Front/Back fields.",
        );
      const stableId = `anki:${identity(guid)}:${ord}`;
      const card: ImportedCard = {
        id: stableId,
        stableId,
        guid,
        ord,
        template:
          model.tmpls?.find((t: any) => Number(t.ord) === ord)?.name ??
          `Card ${ord + 1}`,
        front: ord === 1 ? back : front,
        back: ord === 1 ? front : back,
        source,
        format: "anki",
        queuePosition: Number(r.due),
        tags: String(note.tags ?? "")
          .trim()
          .split(/\s+/)
          .filter(Boolean),
        fields,
        extra: Object.fromEntries(
          entries.filter(
            ([k]) => !["front", "back", "source"].includes(k.toLowerCase()),
          ),
        ),
        deckPath: parts.join("::"),
      };
      lesson.cards.push(card);
      subject.total++;
      cardMap.set(String(r.id), { card, subjectId, lessonId });
    }
    const seen = new Set<string>();
    const revlog: ReviewEvent[] = [];
    if (tables.has("revlog"))
      for (const r of rows(db, "SELECT * FROM revlog ORDER BY id")) {
        const c = cardMap.get(String(r.cid));
        if (!c || r.ease < 1 || r.ease > 4) continue;
        revlog.push({
          id: `anki-review:${r.id}:${c.card.stableId}`,
          cardId: c.card.stableId,
          subjectId: c.subjectId,
          lessonId: c.lessonId,
          rating: (
            [null, "again", "hard", "good", "easy"] as (Rating | null)[]
          )[Number(r.ease)]!,
          at: new Date(Number(r.id)).toISOString(),
          durationMs: Number(r.time) || 0,
          isNew: !seen.has(c.card.stableId),
          source: "anki",
          retention: 0.9,
          fuzz: true,
        });
        seen.add(c.card.stableId);
      }
    const media: Record<string, Uint8Array> = Object.create(null);
    if (files.media) {
      try {
        const map = mediaManifest(decode(files.media));
        for (const [id, filename] of Object.entries(map))
          if (typeof filename === "string" && files[id])
            media[filename] = decode(files[id]);
      } catch {
        warnings.push(
          "The media manifest could not be decoded; media was not imported. " +
            modernMessage,
        );
      }
    }
    return {
      subjects,
      media,
      packageName,
      notes: notes.length,
      revlog,
      warnings,
    };
  } finally {
    db.close();
  }
}
export function exportPackage(
  data: ImportedData,
  SQL: SqlJsStatic,
): Uint8Array {
  const db = new SQL.Database();
  const now = Math.floor(Date.now() / 1000);
  try {
    db.run(
      "CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text); CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld integer, csum integer, flags integer, data text); CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text); CREATE TABLE revlog (id integer primary key, cid integer, usn integer, ease integer, ivl integer, lastIvl integer, factor integer, time integer, type integer); CREATE TABLE graves (usn integer, oid integer, type integer);",
    );
    const model = {
      id: 1,
      name: "Flipwise Basic",
      type: 0,
      mod: now,
      usn: -1,
      sortf: 0,
      did: 1,
      css: ".card { font-family: Arial; font-size: 20px; text-align: left; }",
      flds: ["Front", "Back", "Source", "Extra"].map((name, ord) => ({
        name,
        ord,
        sticky: false,
        rtl: false,
        font: "Arial",
        size: 20,
      })),
      tmpls: [
        {
          name: "Card 1",
          ord: 0,
          qfmt: "{{Front}}",
          afmt: "{{FrontSide}}<hr id=answer>{{Back}}<br>{{Source}}",
          bqfmt: "",
          bafmt: "",
        },
        {
          name: "Card 2",
          ord: 1,
          qfmt: "{{Back}}",
          afmt: "{{FrontSide}}<hr id=answer>{{Front}}<br>{{Source}}",
          bqfmt: "",
          bafmt: "",
        },
      ],
      req: [
        [0, "all", [0]],
        [1, "all", [1]],
      ],
    };
    const maxOrd = Math.max(0, ...allCards(data).map((c) => c.ord ?? 0));
    model.tmpls = Array.from({ length: maxOrd + 1 }, (_, ord) => ({
      name: `Card ${ord + 1}`,
      ord,
      qfmt: ord === 1 ? "{{Back}}" : "{{Front}}",
      afmt:
        ord === 1
          ? "{{FrontSide}}<hr id=answer>{{Front}}<br>{{Source}}"
          : "{{FrontSide}}<hr id=answer>{{Back}}<br>{{Source}}",
      bqfmt: "",
      bafmt: "",
    }));
    model.req = model.tmpls.map((t) => [t.ord, "all", [t.ord === 1 ? 1 : 0]]);
    const decks: Record<string, any> = {};
    let deckId = 1,
      noteId = Date.now(),
      cardId = Date.now();
    const noteIds = new Map<string, number>();
    for (const s of data.subjects)
      for (const l of s.lectures) {
        const did = deckId++;
        decks[did] = {
          id: did,
          name: `${s.name}::${l.title}`,
          mod: now,
          usn: -1,
          desc: "",
          dyn: 0,
          collapsed: false,
          conf: 1,
          extendNew: 0,
          extendRev: 0,
          newToday: [0, 0],
          revToday: [0, 0],
          lrnToday: [0, 0],
          timeToday: [0, 0],
        };
        for (const c of l.cards) {
          const imported = c as ImportedCard;
          const guid = imported.guid ?? `${s.id}/${l.id}/${c.id}`;
          let nid = noteIds.get(guid);
          if (nid === undefined) {
            nid = noteId++;
            noteIds.set(guid, nid);
            const fields = imported.fields ?? { Front: c.front, Back: c.back };
            const front =
                Object.entries(fields).find(
                  ([k]) => k.toLowerCase() === "front",
                )?.[1] ?? c.front,
              back =
                Object.entries(fields).find(
                  ([k]) => k.toLowerCase() === "back",
                )?.[1] ?? c.back;
            db.run("INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)", [
              nid,
              guid,
              1,
              now,
              -1,
              ` ${(imported.tags ?? []).join(" ")} `,
              [
                front,
                back,
                imported.source ?? "",
                JSON.stringify(imported.extra ?? {}),
              ].join("\x1f"),
              front,
              0,
              0,
              "",
            ]);
          }
          db.run(
            "INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
              cardId++,
              nid,
              did,
              imported.ord ?? 0,
              now,
              -1,
              0,
              0,
              imported.queuePosition ?? cardId,
              0,
              2500,
              0,
              0,
              0,
              0,
              0,
              0,
              "",
            ],
          );
        }
      }
    const dconf = {
      1: {
        id: 1,
        name: "Default",
        mod: now,
        usn: -1,
        maxTaken: 60,
        autoplay: true,
        timer: 0,
        replayq: true,
        new: {
          bury: true,
          delays: [1, 10],
          initialFactor: 2500,
          ints: [1, 4, 0],
          order: 1,
          perDay: 20,
          separate: true,
        },
        rev: {
          bury: true,
          ease4: 1.3,
          fuzz: 0.05,
          ivlFct: 1,
          maxIvl: 36500,
          perDay: 200,
          hardFactor: 1.2,
        },
        lapse: {
          delays: [10],
          leechAction: 1,
          leechFails: 8,
          minInt: 1,
          mult: 0,
        },
      },
    };
    db.run("INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [
      1,
      now,
      Date.now(),
      Date.now(),
      11,
      0,
      0,
      0,
      JSON.stringify({
        nextPos: cardId,
        curDeck: 1,
        activeDecks: [1],
        curModel: 1,
      }),
      JSON.stringify({ 1: model }),
      JSON.stringify(decks),
      JSON.stringify(dconf),
      "{}",
    ]);
    const files: Record<string, Uint8Array> = {
      "collection.anki2": db.export(),
    };
    const manifest: Record<string, string> = {};
    Object.entries(data.media).forEach(([name, bytes], i) => {
      files[String(i)] = bytes;
      manifest[String(i)] = name;
    });
    files.media = strToU8(JSON.stringify(manifest));
    return zipSync(files);
  } finally {
    db.close();
  }
}
export function exportFlipwise(data: ImportedData, subjectId: string) {
  const s = data.subjects.find((s) => s.id === subjectId);
  if (!s) throw new Error("Choose a subject to export.");
  return {
    format: "flipwise-deck",
    version: 1,
    subject: { id: s.id, name: s.name, term: s.collectionLabel ?? "" },
    contentFormat: "markdown+katex",
    sections: s.lectures.map((l, i) => ({
      id: l.id,
      title: l.title,
      order: i + 1,
    })),
    cards: s.lectures.flatMap((l) =>
      l.cards.map((c) => ({ ...c, section: l.id, sectionId: l.id })),
    ),
  };
}
