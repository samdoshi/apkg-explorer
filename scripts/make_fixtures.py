#!/usr/bin/env python3
"""Build the synthetic Anki packages in fixtures/ (unit tests, smoke tests, sample deck).

    python3 scripts/make_fixtures.py

Output is deterministic: re-running only changes files when this script changes.
Uses only the Python standard library (sqlite3, zipfile, compression.zstd needs 3.14+).
The sample deck's video, scripts/media/mandelbrot.webm, is committed; scripts/make_video.sh
(ffmpeg) remakes it. Its font, _pixel.ttf, is drawn here (pixel_font).

Packages written (see SPEC.md section 1 for the formats):
  fixtures/sample.apkg              current format: collection.anki21b (zstd, schema 18),
                                    protobuf media map, zstd media, plus the dummy anki2
  fixtures/legacy-anki2.apkg        Anki 2.0/2.1 legacy: collection.anki2 (schema 11), JSON map
  fixtures/legacy-anki21.apkg       collection.anki21 (schema 11, WAL header) + dummy anki2;
                                    one note's cards sit in a filtered deck (JSON "dyn")
  fixtures/collection.colpkg        current format collection package; one card sits in a
                                    filtered deck (protobuf deck kind), with its real due in odue
  fixtures/large.apkg               current format, 5,000 text-only notes (virtual scrolling)
  fixtures/invalid/*.apkg           files the app must reject with a clear message
"""

from __future__ import annotations

import hashlib
import html
import json
import math
import random
import re
import sqlite3
import struct
import tempfile
import zipfile
import zlib
from dataclasses import dataclass, field
from pathlib import Path

from compression import zstd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "fixtures"
MEDIA = Path(__file__).resolve().parent / "media"  # media files made by other tools (committed)
BASE_MS = 1_709_251_200_000  # 2024-03-01T00:00:00Z: note/card ids count up from here
CRT = BASE_MS // 1000 - 30 * 86400  # collection creation time (seconds)
ZIP_DATE = (2024, 3, 1, 0, 0, 0)

# --------------------------------------------------------------------------------------
# Note types


@dataclass
class NoteType:
    id: int
    name: str
    fields: list[str]
    templates: list[tuple[str, str, str]]  # (name, front template, back template)
    css: str
    cloze: bool = False
    sort_field: int = 0
    stock_kind: int = 0  # OriginalStockKind in notetypes.proto (6 = image occlusion)


STOCK_CSS = """.card {
    font-family: arial;
    font-size: 20px;
    line-height: 1.5;
    text-align: center;
    color: black;
    background-color: white;
}
"""

CLOZE_CSS = STOCK_CSS + """
.cloze {
    font-weight: bold;
    color: blue;
}
.nightMode .cloze {
    color: lightblue;
}
"""

ANSWER = "{{FrontSide}}\n\n<hr id=answer>\n\n"


def basic(nt_id: int) -> NoteType:
    return NoteType(nt_id, "Basic", ["Front", "Back"],
                    [("Card 1", "{{Front}}", ANSWER + "{{Back}}")], STOCK_CSS, stock_kind=1)


def basic_reversed(nt_id: int) -> NoteType:
    return NoteType(nt_id, "Basic (and reversed card)", ["Front", "Back"],
                    [("Card 1", "{{Front}}", ANSWER + "{{Back}}"),
                     ("Card 2", "{{Back}}", ANSWER + "{{Front}}")], STOCK_CSS, stock_kind=2)


def basic_typing(nt_id: int) -> NoteType:
    return NoteType(nt_id, "Basic (type in the answer)", ["Front", "Back"],
                    [("Card 1", "{{Front}}\n\n{{type:Back}}",
                      "{{Front}}\n\n<hr id=answer>\n\n{{type:Back}}")], STOCK_CSS, stock_kind=4)


def cloze(nt_id: int) -> NoteType:
    return NoteType(nt_id, "Cloze", ["Text", "Back Extra"],
                    [("Cloze", "{{cloze:Text}}", "{{cloze:Text}}<br>\n{{Back Extra}}")],
                    CLOZE_CSS, cloze=True, stock_kind=5)


# The badge's font is declared in a stylesheet of its own, as some shared decks do.
COUNTRY_CSS = """@import url("_country.css");
.card {
    font-family: system-ui, sans-serif;
    font-size: 22px;
    text-align: center;
    color: #1f2933;
    background: #f5f7fa url("_waves.svg") bottom / 100% auto no-repeat;
    min-height: 100vh;
}
.card.nightMode {
    color: #e4e7eb;
    background-color: #1f2933;
}
.globe { width: 48px; height: 48px; }
.flag img { max-width: 240px; border: 1px solid #9aa5b1; }
.capital { font-size: 32px; font-weight: 600; color: #0b69a3; }
.notes { font-size: 16px; color: #616e7c; }
"""


def country(nt_id: int) -> NoteType:
    return NoteType(
        nt_id, "Country", ["Country", "Capital", "Flag", "Anthem", "Notes"],
        [
            ("Capital",
             '<div class="badge">&#xE004; GEOGRAPHY</div>\n<img class="globe" src="_globe.svg" alt="">\n'
             '<p>What is the capital of {{Country}}?</p>',
             '{{FrontSide}}\n\n<hr id=answer>\n\n<p class="capital">{{Capital}}</p>\n'
             '<div class="flag">{{Flag}}</div>\n{{Anthem}}\n'
             '{{#Notes}}<p class="notes">{{Notes}}</p>{{/Notes}}'),
            ("Flag",
             '<div class="badge">&#xE004; GEOGRAPHY</div>\n<div class="flag">{{Flag}}</div>\n'
             '<p>Which country has this flag?</p>',
             '{{FrontSide}}\n\n<hr id=answer>\n\n<p class="capital">{{Country}}</p>\n'
             '<p>Capital: {{Capital}}</p>'),
        ],
        COUNTRY_CSS,
    )


def quiz(nt_id: int) -> NoteType:
    # A template that relies on JavaScript, to exercise the "scripts blocked" notice and the
    # script list: a script file from the package (_shuffle.js) and an inline script using it.
    script = (
        '<script src="_shuffle.js"></script>\n'
        "<script>\n"
        "  shuffle(document.getElementById('options'));\n"
        "</script>"
    )
    return NoteType(
        nt_id, "Quiz (shuffled options)", ["Question", "Options", "Answer"],
        [("Card 1",
          '<p>{{Question}}</p>\n<ul id="options">{{Options}}</ul>\n' + script,
          '<p>{{Question}}</p>\n\n<hr id=answer>\n\n<p><b>{{Answer}}</b></p>')],
        STOCK_CSS + "ul { display: inline-block; text-align: left; }\n",
    )


# --------------------------------------------------------------------------------------
# Notes and packages


@dataclass
class Review:
    ivl: int
    factor: int
    reps: int
    lapses: int


@dataclass
class Note:
    notetype: NoteType
    fields: list[str]
    deck: str
    tags: list[str] = field(default_factory=list)
    reviews: dict[int, Review] = field(default_factory=dict)  # card ord -> scheduling
    # A filtered deck the note's cards have been moved into; `deck` stays their home deck.
    filtered_deck: str | None = None


@dataclass
class Package:
    notetypes: list[NoteType]
    notes: list[Note]
    media: dict[str, bytes]


def card_ords(note: Note) -> list[int]:
    if note.notetype.cloze:
        numbers = {int(n) for n in re.findall(r"\{\{c(\d+)::", note.fields[0])}
        return sorted(n - 1 for n in numbers)
    return list(range(len(note.notetype.templates)))


def deck_names(package: Package) -> list[str]:
    names = {"Default"}
    for note in package.notes:
        for deck in filter(None, [note.deck, note.filtered_deck]):
            parts = deck.split("::")
            for i in range(1, len(parts) + 1):
                names.add("::".join(parts[:i]))
    return sorted(names, key=lambda n: (n != "Default", n))


def filtered_deck_names(package: Package) -> set[str]:
    return {note.filtered_deck for note in package.notes if note.filtered_deck}


def deck_ids(package: Package) -> dict[str, int]:
    ids = {}
    for i, name in enumerate(deck_names(package)):
        ids[name] = 1 if name == "Default" else BASE_MS - 1_000_000 + i
    return ids


BASE91 = ("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
          "!#$%&()*+,-./:;<=>?@[]^_`{|}~")


def guid_for(note: Note) -> str:
    n = int.from_bytes(hashlib.sha1("\x1f".join(note.fields).encode()).digest()[:8], "big")
    out = ""
    while n:
        n, r = divmod(n, len(BASE91))
        out = BASE91[r] + out
    return out


def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\[sound:[^\]]+\]", "", text)
    return html.unescape(text).strip()


def checksum(text: str) -> int:
    return int(hashlib.sha1(text.encode()).hexdigest()[:8], 16)


# --------------------------------------------------------------------------------------
# SQLite collections

SCHEMA_11 = """
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null,
  scm integer not null, ver integer not null, dty integer not null, usn integer not null,
  ls integer not null, conf text not null, models text not null, decks text not null,
  dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null,
  mod integer not null, usn integer not null, tags text not null, flds text not null,
  sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null,
  ord integer not null, mod integer not null, usn integer not null, type integer not null,
  queue integer not null, due integer not null, ivl integer not null, factor integer not null,
  reps integer not null, lapses integer not null, left integer not null, odue integer not null,
  odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null,
  ease integer not null, ivl integer not null, lastIvl integer not null,
  factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
"""

# The parts of Anki's schema 18 that differ from 11. Names use Anki's custom `unicase`
# collation, which sql.js can't register, so the reader must cope with it.
SCHEMA_18_EXTRA = """
CREATE TABLE deck_config (id integer PRIMARY KEY NOT NULL, name text NOT NULL COLLATE unicase,
  mtime_secs integer NOT NULL, usn integer NOT NULL, config blob NOT NULL);
CREATE TABLE config (KEY text NOT NULL PRIMARY KEY, usn integer NOT NULL,
  mtime_secs integer NOT NULL, val blob NOT NULL) WITHOUT ROWID;
CREATE TABLE fields (ntid integer NOT NULL, ord integer NOT NULL,
  name text NOT NULL COLLATE unicase, config blob NOT NULL, PRIMARY KEY (ntid, ord)) WITHOUT ROWID;
CREATE TABLE templates (ntid integer NOT NULL, ord integer NOT NULL,
  name text NOT NULL COLLATE unicase, mtime_secs integer NOT NULL, usn integer NOT NULL,
  config blob NOT NULL, PRIMARY KEY (ntid, ord)) WITHOUT ROWID;
CREATE TABLE notetypes (id integer NOT NULL PRIMARY KEY, name text NOT NULL COLLATE unicase,
  mtime_secs integer NOT NULL, usn integer NOT NULL, config blob NOT NULL);
CREATE TABLE decks (id integer PRIMARY KEY NOT NULL, name text NOT NULL COLLATE unicase,
  mtime_secs integer NOT NULL, usn integer NOT NULL, common blob NOT NULL, kind blob NOT NULL);
CREATE TABLE tags (tag text NOT NULL PRIMARY KEY COLLATE unicase, usn integer NOT NULL,
  collapsed boolean NOT NULL, config blob NULL) WITHOUT ROWID;
CREATE UNIQUE INDEX idx_fields_name_ntid ON fields (name, ntid);
CREATE UNIQUE INDEX idx_templates_name_ntid ON templates (name, ntid);
CREATE UNIQUE INDEX idx_notetypes_name ON notetypes (name);
CREATE UNIQUE INDEX idx_decks_name ON decks (name);
CREATE INDEX idx_notes_mid ON notes (mid);
CREATE INDEX idx_cards_odid ON cards (odid) WHERE odid != 0;
"""


def unicase(a: str, b: str) -> int:
    a, b = a.casefold(), b.casefold()
    return (a > b) - (a < b)


def build_collection(package: Package, schema: int, wal: bool = False) -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "collection.db"
        con = sqlite3.connect(path)
        con.create_collation("unicase", unicase)
        if wal:
            con.execute("PRAGMA journal_mode=WAL")
        con.executescript(SCHEMA_11 + (SCHEMA_18_EXTRA if schema == 18 else ""))
        fill_collection(con, package, schema)
        con.commit()
        con.close()
        data = path.read_bytes()
    assert data[18] == (2 if wal else 1), "unexpected journal mode in header"
    return data


def fill_collection(con: sqlite3.Connection, package: Package, schema: int) -> None:
    decks = deck_ids(package)
    filtered = filtered_deck_names(package)
    mod = BASE_MS // 1000
    if schema == 11:
        models = {str(nt.id): model_json(nt) for nt in package.notetypes}
        deck_json = {str(i): deck_json_entry(i, name, name in filtered) for name, i in decks.items()}
        con.execute("INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)", (
            CRT, BASE_MS, BASE_MS, json.dumps({"nextPos": 1, "curModel": package.notetypes[0].id}),
            json.dumps(models), json.dumps(deck_json), json.dumps({"1": {"id": 1, "name": "Default"}}),
            "{}"))
    else:
        con.execute("INSERT INTO col VALUES (1,?,?,?,18,0,0,0,'','','','','')", (CRT, BASE_MS, BASE_MS))
        for nt in package.notetypes:
            con.execute("INSERT INTO notetypes VALUES (?,?,?,0,?)", (nt.id, nt.name, mod, notetype_config(nt)))
            for ord_, name in enumerate(nt.fields):
                con.execute("INSERT INTO fields VALUES (?,?,?,?)", (nt.id, ord_, name, field_config()))
            for ord_, (name, qfmt, afmt) in enumerate(nt.templates):
                con.execute("INSERT INTO templates VALUES (?,?,?,?,0,?)",
                            (nt.id, ord_, name, mod, template_config(qfmt, afmt)))
        for name, i in decks.items():
            # Schema 18 stores deck names with \x1f between levels instead of "::", and the
            # deck's kind as a protobuf oneof: 1 = normal, 2 = filtered.
            kind = pb_bytes(2 if name in filtered else 1, b"")
            con.execute("INSERT INTO decks VALUES (?,?,?,0,?,?)",
                        (i, name.replace("::", "\x1f"), mod, b"", kind))
        con.execute("INSERT INTO deck_config VALUES (1,'Default',?,0,?)", (mod, b""))
        con.execute("INSERT INTO config VALUES ('curModel',0,?,?)", (mod, str(package.notetypes[0].id).encode()))
        for tag in sorted({t for note in package.notes for t in note.tags}):
            con.execute("INSERT INTO tags VALUES (?,0,0,NULL)", (tag,))

    rng = random.Random(42)
    card_id = BASE_MS
    for i, note in enumerate(package.notes):
        note_id = BASE_MS + i * 1000
        sort_text = strip_html(note.fields[note.notetype.sort_field])
        tags = f" {' '.join(note.tags)} " if note.tags else ""
        con.execute("INSERT INTO notes VALUES (?,?,?,?,-1,?,?,?,?,0,'')", (
            note_id, guid_for(note), note.notetype.id, mod + i, tags, "\x1f".join(note.fields),
            sort_text, checksum(sort_text)))
        for position, ord_ in enumerate(card_ords(note)):
            card_id += 1
            review = note.reviews.get(ord_)
            if review:
                ctype, queue, due = 2, 2, 30 + rng.randint(1, review.ivl)
                ivl, factor, reps, lapses = review.ivl, review.factor, review.reps, review.lapses
            else:
                ctype, queue, due, ivl, factor, reps, lapses = 0, 0, i + position, 0, 0, 0, 0
            did, odid, odue = decks[note.deck], 0, 0
            if note.filtered_deck:
                # In a filtered deck, odid and odue keep the home deck and the real due date;
                # due becomes the card's place in the filtered deck.
                did, odid, odue, due = decks[note.filtered_deck], did, due, -100_000 + position
            con.execute("INSERT INTO cards VALUES (?,?,?,?,?,-1,?,?,?,?,?,?,?,0,?,?,0,'')", (
                card_id, note_id, did, ord_, mod + i, ctype, queue, due, ivl,
                factor, reps, lapses, odue, odid))


def model_json(nt: NoteType) -> dict:
    return {
        "id": nt.id, "name": nt.name, "type": 1 if nt.cloze else 0, "mod": BASE_MS // 1000,
        "usn": -1, "sortf": nt.sort_field, "did": 1, "css": nt.css,
        "latexPre": "\\documentclass[12pt]{article}\n\\begin{document}\n",
        "latexPost": "\\end{document}", "latexsvg": False, "tags": [], "vers": [],
        "req": [[i, "any", [0]] for i in range(len(nt.templates))],
        "flds": [{"name": name, "ord": i, "sticky": False, "rtl": False, "font": "Arial",
                  "size": 20, "media": []} for i, name in enumerate(nt.fields)],
        "tmpls": [{"name": name, "ord": i, "qfmt": q, "afmt": a, "did": None,
                   "bqfmt": "", "bafmt": ""} for i, (name, q, a) in enumerate(nt.templates)],
    }


def deck_json_entry(deck_id: int, name: str, filtered: bool = False) -> dict:
    return {"id": deck_id, "name": name, "desc": "", "dyn": 1 if filtered else 0, "conf": 1, "collapsed": False,
            "browserCollapsed": False, "mod": BASE_MS // 1000, "usn": -1, "extendNew": 0,
            "extendRev": 0, "newToday": [0, 0], "revToday": [0, 0], "lrnToday": [0, 0],
            "timeToday": [0, 0]}


# --------------------------------------------------------------------------------------
# Protobuf (proto3) encoding for schema 18 config blobs and the current-format media map


def pb_varint(n: int) -> bytes:
    n &= (1 << 64) - 1
    out = bytearray()
    while True:
        b, n = n & 0x7F, n >> 7
        out.append(b | 0x80 if n else b)
        if not n:
            return bytes(out)


def pb_uint(num: int, value: int) -> bytes:
    return pb_varint(num << 3) + pb_varint(value) if value else b""


def pb_bytes(num: int, value: bytes) -> bytes:
    return pb_varint(num << 3 | 2) + pb_varint(len(value)) + value


def pb_str(num: int, value: str) -> bytes:
    return pb_bytes(num, value.encode()) if value else b""


def notetype_config(nt: NoteType) -> bytes:
    # Notetype.Config: kind=1 sort_field_idx=2 css=3 latex_pre=5 latex_post=6 original_stock_kind=9
    return (pb_uint(1, 1 if nt.cloze else 0) + pb_uint(2, nt.sort_field) + pb_str(3, nt.css)
            + pb_str(5, "\\documentclass[12pt]{article}\n\\begin{document}\n")
            + pb_str(6, "\\end{document}") + pb_uint(9, nt.stock_kind))


def field_config() -> bytes:
    # Notetype.Field.Config: font_name=3 font_size=4
    return pb_str(3, "Arial") + pb_uint(4, 20)


def template_config(qfmt: str, afmt: str) -> bytes:
    # Notetype.Template.Config: q_format=1 a_format=2
    return pb_str(1, qfmt) + pb_str(2, afmt)


def media_entries(media: dict[str, bytes]) -> bytes:
    # MediaEntries { repeated MediaEntry entries = 1 }; MediaEntry: name=1 size=2 sha1=3
    return b"".join(
        pb_bytes(1, pb_str(1, name) + pb_uint(2, len(data)) + pb_bytes(3, hashlib.sha1(data).digest()))
        for name, data in media.items())


# --------------------------------------------------------------------------------------
# zstd and zip


def zstd_streamed(data: bytes) -> bytes:
    """Like Anki's Rust exporter: a streamed frame with no content size in its header."""
    compressor = zstd.ZstdCompressor(level=3)
    out = compressor.compress(data) + compressor.flush()
    assert out[4] & 0xC0 == 0 and not out[4] & 0x20, "expected a frame without content size"
    return out


def zstd_one_shot(data: bytes) -> bytes:
    """A frame that records its content size (exercises the other header layout)."""
    return zstd.compress(data, level=3)


STORED, DEFLATED = zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED


def write_zip(path: Path, entries: list[tuple[str, bytes, int]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as zf:
        for name, data, method in entries:
            info = zipfile.ZipInfo(name, date_time=ZIP_DATE)
            info.compress_type = method
            info.external_attr = 0o644 << 16
            zf.writestr(info, data)
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)")


def dummy_collection() -> bytes:
    """The stub collection.anki2 newer Anki versions add so old versions show a message."""
    nt = basic(1_000_000_000_001)
    note = Note(nt, ["Please update to the latest Anki version, then import the .colpkg/.apkg file again.", ""],
                "Default")
    return build_collection(Package([nt], [note], {}), 11)


def write_legacy(path: Path, package: Package, collection_name: str, wal: bool = False) -> None:
    """Anki's Python exporter: deflated collection and JSON map, media files stored."""
    names = list(package.media)
    entries = [(collection_name, build_collection(package, 11, wal), DEFLATED)]
    if collection_name == "collection.anki21":
        entries.append(("collection.anki2", dummy_collection(), DEFLATED))
    entries += [(str(i), package.media[name], STORED) for i, name in enumerate(names)]
    entries.append(("media", json.dumps({str(i): name for i, name in enumerate(names)}).encode(), DEFLATED))
    write_zip(path, entries)


def write_latest(path: Path, package: Package) -> None:
    """Anki 2.1.50+ exporter: everything stored in the zip, content zstd-compressed."""
    names = list(package.media)
    entries = [
        ("meta", pb_uint(1, 3), STORED),  # PackageMetadata { version = VERSION_LATEST }
        ("collection.anki21b", zstd_streamed(build_collection(package, 18)), STORED),
        ("collection.anki2", dummy_collection(), STORED),
    ]
    for i, name in enumerate(names):
        compress = zstd_one_shot if i % 2 else zstd_streamed
        entries.append((str(i), compress(package.media[name]), STORED))
    entries.append(("media", zstd_streamed(media_entries(package.media)), STORED))
    write_zip(path, entries)


# --------------------------------------------------------------------------------------
# Generated media


def png(width: int, height: int, pixel) -> bytes:
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            rows.extend(pixel(x, y))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b""))


def hex_rgb(colour: str) -> tuple[int, int, int]:
    return int(colour[1:3], 16), int(colour[3:5], 16), int(colour[5:7], 16)


def striped_flag(colours: list[str], vertical: bool) -> bytes:
    rgb = [hex_rgb(c) for c in colours]
    w, h = 150, 100
    return png(w, h, lambda x, y: rgb[(x if vertical else y) * len(rgb) // (w if vertical else h)])


def japan_flag() -> bytes:
    w, h = 150, 100
    return png(w, h, lambda x, y: (188, 0, 45) if math.hypot(x - w / 2, y - h / 2) < 30 else (255, 255, 255))


def old_diagram() -> bytes:
    """A bar chart no note uses any more: the sample deck's unused file."""
    w, h = 160, 100
    bars = [(20, 40), (60, 75), (100, 30)]  # (left edge, height)

    def pixel(x: int, y: int) -> tuple[int, int, int]:
        if x == 10 or y == h - 10:
            return (60, 60, 60)  # axes
        for left, top in bars:
            if left <= x < left + 30 and h - 10 - top <= y < h - 10:
                shade = (y * 7 + x * 3) % 40  # shaded bars
                return (70 + shade, 120 + shade, 200)
        return (255, 255, 255)

    return png(w, h, pixel)


def wav(notes: list[float], seconds_per_note: float = 0.25, rate: int = 16000) -> bytes:
    samples = bytearray()
    per_note = int(rate * seconds_per_note)
    for freq in notes:
        for i in range(per_note):
            envelope = min(1.0, i / 400, (per_note - i) / 800)
            value = int(12000 * envelope * math.sin(2 * math.pi * freq * i / rate))
            samples += struct.pack("<h", value)
    header = b"RIFF" + struct.pack("<I", 36 + len(samples)) + b"WAVE"
    fmt = b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
    return header + fmt + b"data" + struct.pack("<I", len(samples)) + bytes(samples)


WATER_SVG = b"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 140" width="220" height="140">
  <line x1="110" y1="60" x2="45" y2="105" stroke="#7b8794" stroke-width="8"/>
  <line x1="110" y1="60" x2="175" y2="105" stroke="#7b8794" stroke-width="8"/>
  <circle cx="110" cy="60" r="38" fill="#e12d39"/>
  <circle cx="45" cy="105" r="24" fill="#cbd2d9"/>
  <circle cx="175" cy="105" r="24" fill="#cbd2d9"/>
  <text x="110" y="70" font-size="30" text-anchor="middle" fill="#fff" font-family="sans-serif">O</text>
  <text x="45" y="114" font-size="24" text-anchor="middle" fill="#323f4b" font-family="sans-serif">H</text>
  <text x="175" y="114" font-size="24" text-anchor="middle" fill="#323f4b" font-family="sans-serif">H</text>
</svg>
"""

SHUFFLE_JS = b"""// Shuffles a list's items, then says so underneath.
function shuffle(list) {
  for (var i = list.children.length; i >= 0; i--) {
    list.appendChild(list.children[Math.random() * i | 0]);
  }
  var done = document.createElement('p');
  done.textContent = 'Options shuffled by a script.';
  list.after(done);
}
"""

GLOBE_SVG = b"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <circle cx="24" cy="24" r="21" fill="#2bb0ed" stroke="#0b69a3" stroke-width="2"/>
  <path d="M24 3v42M3 24h42M8 13h32M8 35h32" stroke="#0b69a3" stroke-width="1.5" fill="none"/>
  <ellipse cx="24" cy="24" rx="10" ry="21" stroke="#0b69a3" stroke-width="1.5" fill="none"/>
</svg>
"""

WAVES_SVG = b"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 60" preserveAspectRatio="none">
  <path d="M0 30 Q50 10 100 30 T200 30 T300 30 T400 30 V60 H0Z" fill="#2bb0ed" opacity="0.15"/>
  <path d="M0 40 Q50 20 100 40 T200 40 T300 40 T400 40 V60 H0Z" fill="#0b69a3" opacity="0.12"/>
</svg>
"""

# --------------------------------------------------------------------------------------
# A pixel font (TrueType) for the Country cards and the media browser's font preview

# Each glyph: the character, then 7 rows of 5 pixels, top first. a-z use the A-Z glyphs.
PIXEL_GLYPHS = """
A .###. #...# #...# ##### #...# #...# #...#
B ####. #...# #...# ####. #...# #...# ####.
C .###. #...# #.... #.... #.... #...# .###.
D ####. #...# #...# #...# #...# #...# ####.
E ##### #.... #.... ####. #.... #.... #####
F ##### #.... #.... ####. #.... #.... #....
G .###. #...# #.... #.### #...# #...# .####
H #...# #...# #...# ##### #...# #...# #...#
I .###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.
J ..### ...#. ...#. ...#. ...#. #..#. .##..
K #...# #..#. #.#.. ##... #.#.. #..#. #...#
L #.... #.... #.... #.... #.... #.... #####
M #...# ##.## #.#.# #.#.# #...# #...# #...#
N #...# #...# ##..# #.#.# #..## #...# #...#
O .###. #...# #...# #...# #...# #...# .###.
P ####. #...# #...# ####. #.... #.... #....
Q .###. #...# #...# #...# #.#.# #..#. .##.#
R ####. #...# #...# ####. #.#.. #..#. #...#
S .#### #.... #.... .###. ....# ....# ####.
T ##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..
U #...# #...# #...# #...# #...# #...# .###.
V #...# #...# #...# #...# #...# .#.#. ..#..
W #...# #...# #...# #.#.# #.#.# #.#.# .#.#.
X #...# #...# .#.#. ..#.. .#.#. #...# #...#
Y #...# #...# .#.#. ..#.. ..#.. ..#.. ..#..
Z ##### ....# ...#. ..#.. .#... #.... #####
0 .###. #...# #..## #.#.# ##..# #...# .###.
1 ..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.
2 .###. #...# ....# ...#. ..#.. .#... #####
3 ####. ....# ....# .###. ....# ....# ####.
4 ...#. ..##. .#.#. #..#. ##### ...#. ...#.
5 ##### #.... ####. ....# ....# #...# .###.
6 ..##. .#... #.... ####. #...# #...# .###.
7 ##### ....# ...#. ..#.. .#... .#... .#...
8 .###. #...# #...# .###. #...# #...# .###.
9 .###. #...# #...# .#### ....# ...#. .##..
. ..... ..... ..... ..... ..... .##.. .##..
, ..... ..... ..... ..... .##.. ..#.. .#...
! ..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..
? .###. #...# ....# ...#. ..#.. ..... ..#..
' ..#.. ..#.. .#... ..... ..... ..... .....
- ..... ..... ..... ##### ..... ..... .....
: ..... .##.. .##.. ..... .##.. .##.. .....
( ...#. ..#.. .#... .#... .#... ..#.. ...#.
) .#... ..#.. ...#. ...#. ...#. ..#.. .#...
"""

# Icons in the private use area, 7 x 7, with the glyph names icon fonts usually have.
# The last is outside the BMP (plane 15), so the font needs a format 12 cmap too.
PIXEL_ICONS = """
E000 star ...#... ...#... ####### .#####. ..###.. .##.##. .#...#.
E001 heart .##.##. ####### ####### ####### .#####. ..###.. ...#...
E002 music ..##### ..#...# ..#...# ..#...# ###.### ###.### .......
E003 check ....... ......# .....## #...##. ##.##.. .###... ..#....
E004 globe ..###.. .#.#.#. #..#..# ####### #..#..# .#.#.#. ..###..
F0000 diamond ...#... ..###.. .#####. ####### .#####. ..###.. ...#...
"""

PIXEL = 100  # font units per pixel (1000 per em)
FONT_TIME = 2_082_844_800 + BASE_MS // 1000  # LONGDATETIME: seconds since 1904


def pixel_contours(rows: list[str]) -> list[list[tuple[int, int]]]:
    """Rectangles (clockwise contours) covering the pixels, one per run of rows alike."""
    rects: list[list[int]] = []  # [first column, end column, top row, bottom row]
    open_runs: dict[tuple[int, int], list[int]] = {}
    for r, row in enumerate(rows):
        runs = {}
        for match in re.finditer("#+", row):
            run = (match.start(), match.end())
            rect = open_runs.get(run)
            if rect:
                rect[3] = r
            else:
                rect = [run[0], run[1], r, r]
                rects.append(rect)
            runs[run] = rect
        open_runs = runs
    contours = []
    for x0, x1, top, bottom in rects:
        left, right = 50 + x0 * PIXEL, 50 + x1 * PIXEL
        low, high = (len(rows) - 1 - bottom) * PIXEL, (len(rows) - top) * PIXEL
        contours.append([(left, low), (left, high), (right, high), (right, low)])
    return contours


def glyf_entry(contours: list[list[tuple[int, int]]]) -> bytes:
    """A simple glyph: on-curve points only, coordinates as 16-bit deltas."""
    if not contours:
        return b""
    points = [point for contour in contours for point in contour]
    xs, ys = [x for x, _ in points], [y for _, y in points]
    out = struct.pack(">hhhhh", len(contours), min(xs), min(ys), max(xs), max(ys))
    end = -1
    for contour in contours:
        end += len(contour)
        out += struct.pack(">H", end)
    out += struct.pack(">H", 0) + bytes([0x01]) * len(points)  # no instructions; flags
    previous = [(0, 0), *points]
    out += b"".join(struct.pack(">h", x - px) for (x, _), (px, _) in zip(points, previous))
    out += b"".join(struct.pack(">h", y - py) for (_, y), (_, py) in zip(points, previous))
    return out + b"\0" * (-len(out) % 4)


def cmap_format4(pairs: list[tuple[int, int]]) -> bytes:
    segments: list[list[int]] = []  # [start, end, delta]
    for cp, gid in pairs:
        if segments and cp == segments[-1][1] + 1 and gid - cp == segments[-1][2]:
            segments[-1][1] = cp
        else:
            segments.append([cp, cp, gid - cp])
    segments.append([0xFFFF, 0xFFFF, 1])
    n = len(segments)
    selector = n.bit_length() - 1
    body = struct.pack(">HHHH", 2 * n, 2 << selector, selector, 2 * n - (2 << selector))
    body += b"".join(struct.pack(">H", end) for _, end, _ in segments) + b"\0\0"
    body += b"".join(struct.pack(">H", start) for start, _, _ in segments)
    body += b"".join(struct.pack(">H", delta & 0xFFFF) for _, _, delta in segments)
    body += b"\0\0" * n  # idRangeOffset
    return struct.pack(">HHH", 4, 6 + len(body), 0) + body


def cmap_format12(pairs: list[tuple[int, int]]) -> bytes:
    groups: list[list[int]] = []  # [start, end, first glyph]
    for cp, gid in pairs:
        if groups and cp == groups[-1][1] + 1 and gid == groups[-1][2] + cp - groups[-1][0]:
            groups[-1][1] = cp
        else:
            groups.append([cp, cp, gid])
    body = b"".join(struct.pack(">III", *group) for group in groups)
    return struct.pack(">HHIII", 12, 0, 16 + len(body), 0, len(groups)) + body


def table_checksum(data: bytes) -> int:
    data += b"\0" * (-len(data) % 4)
    return sum(struct.unpack(f">{len(data) // 4}I", data)) & 0xFFFFFFFF


def sfnt(tables: dict[str, bytes]) -> bytes:
    tags = sorted(tables)
    n = len(tags)
    selector = n.bit_length() - 1
    header = struct.pack(">IHHHH", 0x00010000, n, 16 << selector, selector, 16 * n - (16 << selector))
    offset = 12 + 16 * n
    directory, data, head_at = b"", b"", 0
    for tag in tags:
        table = tables[tag]
        if tag == "head":
            head_at = offset + len(data)
        directory += struct.pack(">4sIII", tag.encode("latin-1"), table_checksum(table), offset + len(data), len(table))
        data += table + b"\0" * (-len(table) % 4)
    font = bytearray(header + directory + data)
    font[head_at + 8:head_at + 12] = struct.pack(">I", (0xB1B0AFBA - table_checksum(bytes(font))) & 0xFFFFFFFF)
    return bytes(font)


def pixel_font() -> bytes:
    """"Sample Pixel": A-Z (a-z share them), digits, some punctuation and PUA icons."""
    notdef = [[(50, 0), (50, 700), (550, 700), (550, 0)], [(150, 100), (450, 100), (450, 600), (150, 600)]]
    # (post name: a standard Macintosh glyph index or a name of its own, contours, advance)
    glyphs: list[tuple[int | str, list[list[tuple[int, int]]], int]] = [(0, notdef, 600), (3, [], 600)]
    pairs = [(0x20, 1)]
    for line in PIXEL_GLYPHS.strip().splitlines():
        char, *rows = line.split()
        gid = len(glyphs)
        glyphs.append((ord(char) - 29, pixel_contours(rows), 600))  # printable ASCII: index = code - 29
        pairs.append((ord(char), gid))
        if char.isalpha():
            pairs.append((ord(char.lower()), gid))
    for line in PIXEL_ICONS.strip().splitlines():
        code, name, *rows = line.split()
        pairs.append((int(code, 16), len(glyphs)))
        glyphs.append((name, pixel_contours(rows), 800))
    pairs.sort()

    outlines = [glyf_entry(contours) for _, contours, _ in glyphs]
    loca = [0]
    for outline in outlines:
        loca.append(loca[-1] + len(outline))
    drawn = [(contours, advance) for _, contours, advance in glyphs if contours]
    xs = [x for contours, _ in drawn for contour in contours for x, _ in contour]
    ys = [y for contours, _ in drawn for contour in contours for _, y in contour]
    lsbs = [min(x for contour in contours for x, _ in contour) if contours else 0 for _, contours, _ in glyphs]
    rsbs = [advance - max(x for contour in contours for x, _ in contour) for contours, advance in drawn]
    advances = [advance for _, _, advance in glyphs]
    num_glyphs = len(glyphs)

    custom = [name for name, _, _ in glyphs if isinstance(name, str)]
    post = struct.pack(">IihhIIIII", 0x00020000, 0, -100, 50, 0, 0, 0, 0, 0) + struct.pack(">H", num_glyphs)
    post += b"".join(struct.pack(">H", name if isinstance(name, int) else 258 + custom.index(name))
                     for name, _, _ in glyphs)
    post += b"".join(bytes([len(name)]) + name.encode("ascii") for name in custom)

    names = {0: "Public domain. Made by scripts/make_fixtures.py for APKG Explorer's sample deck.",
             1: "Sample Pixel", 2: "Regular", 3: "Sample Pixel Regular 1.000", 4: "Sample Pixel Regular",
             5: "Version 1.000", 6: "SamplePixel-Regular"}
    records, strings = b"", b""
    for name_id, text in names.items():
        encoded = text.encode("utf-16-be")
        records += struct.pack(">HHHHHH", 3, 1, 0x409, name_id, len(encoded), len(strings))
        strings += encoded
    name = struct.pack(">HHH", 0, len(names), 6 + len(records)) + records + strings

    bmp = cmap_format4([pair for pair in pairs if pair[0] <= 0xFFFF])
    cmap = struct.pack(">HHHHIHHI", 0, 2, 3, 1, 20, 3, 10, 20 + len(bmp)) + bmp + cmap_format12(pairs)

    return sfnt({
        "head": struct.pack(">IIIIHHqqhhhhHHhhh", 0x00010000, 0x00010000, 0, 0x5F0F3CF5, 0x0003, 1000,
                            FONT_TIME, FONT_TIME, min(xs), min(ys), max(xs), max(ys), 0, 8, 2, 1, 0),
        "hhea": struct.pack(">IhhhHhhhhhhhhhhhH", 0x00010000, 800, -200, 200, max(advances), min(lsbs), min(rsbs),
                            max(xs), 1, 0, 0, 0, 0, 0, 0, 0, num_glyphs),
        "maxp": struct.pack(">IHHHHHHHHHHHHHH", 0x00010000, num_glyphs,
                            max(sum(len(contour) for contour in contours) for contours, _ in drawn),
                            max(len(contours) for contours, _ in drawn), 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0),
        "OS/2": struct.pack(">HhHHH" + "h" * 11 + "10sIIII4sHHHhhhHHIIhhHHH", 4,
                            round(sum(advances[1:]) / (num_glyphs - 1)), 400, 5, 0,
                            650, 600, 0, 75, 650, 600, 0, 350, 50, 300, 0, bytes(10),
                            # Basic Latin; non-BMP and private use (BMP and plane 15)
                            1, (1 << 25) | (1 << 28), 1 << 26, 0, b"NONE",
                            0x00C0, 0x20, 0xFFFF, 800, -200, 200, 800, 200, 1, 0, 700, 700, 0, 0x20, 0),
        "hmtx": b"".join(struct.pack(">Hh", advance, lsb) for advance, lsb in zip(advances, lsbs)),
        "loca": b"".join(struct.pack(">I", offset) for offset in loca),
        "glyf": b"".join(outlines),
        "cmap": cmap,
        "name": name,
        "post": post,
    })


COUNTRY_STYLE = b"""/* Imported by the Country note type's styling. */
@font-face {
    font-family: "Sample Pixel";
    src: url("_pixel.ttf");
}
.badge {
    font-family: "Sample Pixel", monospace;
    font-size: 20px;
    letter-spacing: 2px;
    color: #616e7c;
}
"""


# --------------------------------------------------------------------------------------
# Package contents

C4, D4, E4, F4, G4, A4, B4, C5 = 261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25

COUNTRIES = [
    # name, capital, flag png, chime, tags, notes
    ("France", "Paris", striped_flag(["#002395", "#ffffff", "#ed2939"], True), [C4, E4, G4],
     ["geography", "europe"], "Paris has been the capital since 987 (with interruptions)."),
    ("Italy", "Rome", striped_flag(["#009246", "#ffffff", "#ce2b37"], True), [D4, F4, A4],
     ["geography", "europe"], ""),
    ("Germany", "Berlin", striped_flag(["#000000", "#dd0000", "#ffce00"], False), [E4, G4, B4],
     ["geography", "europe"], "Bonn was the capital of West Germany until 1990."),
    ("Japan", "Tokyo", japan_flag(), [F4, A4, C5], ["geography", "asia"], ""),
    ("Ireland", "Dublin", striped_flag(["#169b62", "#ffffff", "#ff883e"], True), [G4, B4, D4],
     ["geography", "europe"], ""),
    ("Netherlands", "Amsterdam", striped_flag(["#ae1c28", "#ffffff", "#21468b"], False), [A4, C5, E4],
     ["geography", "europe"], "The government sits in The Hague."),
]


def sample_package() -> Package:
    nt_basic, nt_rev, nt_type = basic(1_700_000_000_001), basic_reversed(1_700_000_000_002), basic_typing(1_700_000_000_003)
    nt_cloze, nt_country, nt_quiz = cloze(1_700_000_000_004), country(1_700_000_000_005), quiz(1_700_000_000_006)
    media: dict[str, bytes] = {"_globe.svg": GLOBE_SVG, "_waves.svg": WAVES_SVG, "water.svg": WATER_SVG,
                               "_shuffle.js": SHUFFLE_JS, "mandelbrot.webm": (MEDIA / "mandelbrot.webm").read_bytes(),
                               "_pixel.ttf": pixel_font(), "_country.css": COUNTRY_STYLE,
                               # Left behind by a deleted note: the media browser lists it as unused.
                               "old-diagram.png": old_diagram()}
    notes: list[Note] = []

    for i, (name, capital, flag, chime, tags, extra) in enumerate(COUNTRIES):
        slug = name.lower()
        media[f"flag-{slug}.png"] = flag
        media[f"chime-{slug}.wav"] = wav(chime)
        reviews = {0: Review(ivl=3 + i * 4, factor=2500, reps=2 + i, lapses=i % 2)} if i < 4 else {}
        notes.append(Note(nt_country, [name, capital, f'<img src="flag-{slug}.png">', f"[sound:chime-{slug}.wav]", extra],
                          "Sample::Geography", tags, reviews))

    science = "Sample::Science"
    notes += [
        Note(nt_basic, ["What is the chemical symbol for <b>gold</b>?", "Au (from Latin <i>aurum</i>)"], science,
             ["science::chemistry"], {0: Review(21, 2650, 5, 0)}),
        Note(nt_basic, ["Which molecule is this?<br><img src=\"water.svg\">", "Water, H<sub>2</sub>O"], science,
             ["science::chemistry"]),
        Note(nt_basic, ["State the quadratic formula.",
                        "\\[x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\\]"], science, ["maths"]),
        Note(nt_basic, ["Solve \\(x^2 = 9\\).", "\\(x = \\pm 3\\)"], science, ["maths"]),
        Note(nt_basic, ["Speed of light in a vacuum?", "299&nbsp;792&nbsp;458 m/s"], science, ["science::physics"],
             {0: Review(4, 2300, 3, 1)}),
        # A video in a [sound:] tag, as Anki stores one: it plays inline on the card.
        Note(nt_basic, ["Which fractal is this?<br>[sound:mandelbrot.webm]", "The Mandelbrot set"], science,
             ["maths"]),
        Note(nt_cloze, ["The {{c1::mitochondrion}} is the {{c2::powerhouse}} of the cell.", "Biology 101"],
             science, ["science::biology"]),
        Note(nt_cloze, ["{{c1::Photosynthesis turns {{c2::light}} energy}} into chemical energy.", ""],
             science, ["science::biology"]),
        Note(nt_cloze, ["{{c1::Canberra::city}} is the capital of {{c2::Australia::country}}.", ""],
             "Sample::Geography", ["geography", "oceania"]),
        Note(nt_quiz, ["Which is the largest planet?", "<li>Jupiter</li><li>Saturn</li><li>Neptune</li>",
                       "Jupiter"], science, ["demo", "science::astronomy"]),
        Note(nt_basic, ["This card shows an image from the web.",
                        '<img src="https://example.com/remote-diagram.png" alt="Remote diagram">'],
             science, ["demo"]),
    ]

    languages = "Sample::Languages"
    for english, spanish in [("dog", "perro"), ("cat", "gato"), ("house", "casa"), ("book", "libro")]:
        notes.append(Note(nt_rev, [english, spanish], languages, ["language::spanish"]))
    notes += [
        Note(nt_type, ["Spanish for <i>thank you</i>?", "gracias"], languages, ["language::spanish"]),
        Note(nt_basic, ["This card refers to a file that isn't in the package.",
                        '<img src="missing-picture.png">'], languages, ["demo"]),
    ]
    return Package([nt_basic, nt_rev, nt_type, nt_cloze, nt_country, nt_quiz], notes, media)


def legacy_anki2_package() -> Package:
    nt_basic, nt_cloze = basic(1_600_000_000_001), cloze(1_600_000_000_002)
    media = {"flag-france.png": COUNTRIES[0][2], "chime-france.wav": wav(COUNTRIES[0][3])}
    notes = [
        Note(nt_basic, ["Capital of France?", 'Paris<br><img src="flag-france.png">'], "Legacy", ["geography"]),
        Note(nt_basic, ["Listen", "[sound:chime-france.wav]"], "Legacy", ["audio"]),
        Note(nt_basic, ["Größte Stadt Österreichs?", "Wien"], "Legacy::Deutsch", ["deutsch"]),
        Note(nt_cloze, ["{{c1::Rome}} is the capital of {{c2::Italy}}.", ""], "Legacy", ["geography"]),
    ]
    return Package([nt_basic, nt_cloze], notes, media)


def legacy_anki21_package() -> Package:
    nt_rev, nt_basic = basic_reversed(1_650_000_000_001), basic(1_650_000_000_002)
    notes = [
        Note(nt_rev, ["water", "agua"], "Spanish", ["language::spanish"]),
        Note(nt_rev, ["bread", "pan"], "Spanish", ["language::spanish"], filtered_deck="Cram"),
        Note(nt_basic, ["Which molecule?<br><img src=\"water.svg\">", "H<sub>2</sub>O"], "Science", []),
    ]
    return Package([nt_rev, nt_basic], notes, {"water.svg": WATER_SVG})


def colpkg_package() -> Package:
    nt_basic = basic(1_680_000_000_001)
    notes = [Note(nt_basic, [f"Question {i}", f"Answer {i}"], "Default", []) for i in range(1, 4)]
    # A collection backup can have cards sitting in a filtered deck.
    notes[1].reviews = {0: Review(ivl=12, factor=2500, reps=5, lapses=1)}
    notes[1].filtered_deck = "Filtered Deck 1"
    return Package([nt_basic], notes, {"water.svg": WATER_SVG})


def large_package() -> Package:
    nt_basic = basic(1_690_000_000_001)
    decks = ["Large::Part A", "Large::Part B", "Large::Part C"]
    tags = [["even"], ["odd"]]
    notes = [
        Note(nt_basic, [f"Word {i:04d}", f"Meaning number {i}"], decks[i % 3], tags[i % 2])
        for i in range(1, 5001)
    ]
    return Package([nt_basic], notes, {})


def write_invalid() -> None:
    folder = OUT / "invalid"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "not-a-zip.apkg").write_bytes(b"This is plain text, not an Anki package.\n")
    print("wrote fixtures/invalid/not-a-zip.apkg")
    write_zip(folder / "no-collection.apkg", [("media", b"{}", DEFLATED)])
    write_zip(folder / "future-version.apkg", [
        ("meta", pb_uint(1, 99), STORED),
        ("collection.anki21b", zstd_streamed(b"not used"), STORED),
    ])
    write_zip(folder / "corrupt-collection.apkg", [
        ("collection.anki2", b"SQLite format 3\x00" + bytes(range(256)) * 8, DEFLATED),
        ("media", b"{}", DEFLATED),
    ])
    write_zip(folder / "damaged-note-types.apkg", [
        ("collection.anki2", damaged_note_types_collection(), DEFLATED),
        ("media", b"{}", DEFLATED),
    ])


def damaged_note_types_collection() -> bytes:
    """A readable database whose note type list (JSON in col.models) is cut short."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "collection.db"
        path.write_bytes(build_collection(legacy_anki2_package(), schema=11))
        con = sqlite3.connect(path)
        con.execute("UPDATE col SET models = substr(models, 1, 40)")
        con.commit()
        con.close()
        return path.read_bytes()


def main() -> None:
    write_latest(OUT / "sample.apkg", sample_package())
    write_legacy(OUT / "legacy-anki2.apkg", legacy_anki2_package(), "collection.anki2")
    write_legacy(OUT / "legacy-anki21.apkg", legacy_anki21_package(), "collection.anki21", wal=True)
    write_latest(OUT / "collection.colpkg", colpkg_package())
    write_latest(OUT / "large.apkg", large_package())
    write_invalid()


if __name__ == "__main__":
    main()
