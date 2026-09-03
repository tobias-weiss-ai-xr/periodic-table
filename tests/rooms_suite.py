#!/usr/bin/env python3
"""Element-room suite for The Periodic Table Room.

Asserts the invariants of the per-element room pipeline
    docs/assets/elements.json  --(scripts/build_rooms.py)-->  docs/rooms/NNN-name.html
using only the standard library:

  - exactly 118 room pages (atomic numbers 1..118), one per element, named
    "<NNN>-<lowercase name>.html", unique and in atomic-number order
  - every page embeds its element's record (window.ROOM_ELEMENT) that is
    identical to what the data pipeline emits (shared build_compact)
  - every page is self-contained: correct <title>, meta description with the
    atomic number, CPK-coloured favicon, three.js import map, shared assets
    (style.css, room.css, room.js) and a back link to ../index.html
  - the main gallery (docs/index.html + assets/app.js) links into the rooms:
    app.js builds "rooms/NNN-name.html" hrefs and the apps share ./lib/*
  - the committed rooms are byte-identical to a fresh build (regeneration)

Usage:  python tests/rooms_suite.py
Exit code 0 on success, 1 on any failure.
"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROOMS = ROOT / "docs/rooms"
ROOMS_SCRIPT = ROOT / "scripts/build_rooms.py"
DATA_BUILD = ROOT / "scripts/build_elements_data.py"
APP_JS = ROOT / "docs/assets/app.js"
ROOM_JS = ROOT / "docs/assets/room.js"
INDEX_HTML = ROOT / "docs/index.html"
LIB = ROOT / "docs/assets/lib"

ROOM_FILE = re.compile(r"^(\d{3})-([a-z]+)\.html$")
ROOM_ELEMENT = re.compile(r"window\.ROOM_ELEMENT = (\{.*?\});", re.S)


# --------------------------------------------------------------------------- helpers

def load_build_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def canonical_elements() -> list[dict]:
    build = load_build_module(DATA_BUILD, "build_elements_data")
    return build.build_compact()[0]


def room_filename(element: dict) -> str:
    return f"{element['n']:03d}-{element['name'].lower()}.html"


def parse_room_element(page_text: str) -> dict:
    m = ROOM_ELEMENT.search(page_text)
    if not m:
        raise AssertionError("page does not embed window.ROOM_ELEMENT")
    return json.loads(m.group(1))


# --------------------------------------------------------------------------- tests

class RoomsSuite(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls):
        cls.canon = canonical_elements()
        cls.files = sorted(ROOMS.glob("*.html"))
        cls.build = load_build_module(ROOMS_SCRIPT, "build_rooms")

    # -- count, naming, ordering -------------------------------------------------

    def test_exactly_118_rooms(self):
        self.assertEqual(len(self.files), 118,
                         f"expected 118 room pages in docs/rooms, found {len(self.files)}")

    def test_room_filenames_match_elements(self):
        expected = [room_filename(e) for e in self.canon]
        actual = [f.name for f in self.files]
        self.assertEqual(actual, expected,
                         "room filenames must be <NNN>-<lowercase name>.html in atomic-number order")

    def test_room_filenames_unique_and_well_formed(self):
        names = [f.name for f in self.files]
        self.assertEqual(len(names), len(set(names)), "room filenames must be unique")
        for name in names:
            m = ROOM_FILE.match(name)
            self.assertIsNotNone(m, f"room file {name!r} does not match NNN-name.html")
            num, slug = int(m.group(1)), m.group(2)
            self.assertTrue(1 <= num <= 118, f"room file {name!r}: number out of range")
            self.assertTrue(slug.isalpha(), f"room file {name!r}: slug has non-letter chars")

    # -- per-page content ---------------------------------------------------------

    def test_every_page_embeds_the_correct_element(self):
        for f in self.files:
            page = f.read_text(encoding="utf-8")
            embedded = parse_room_element(page)
            number = int(f.name[:3])
            canon = self.canon[number - 1]
            self.assertEqual(embedded, canon,
                             f"{f.name}: embedded record differs from the canonical element {number}")

    def test_every_page_has_element_title_and_description(self):
        for f in self.files:
            page = f.read_text(encoding="utf-8")
            embedded = parse_room_element(page)
            name, n = embedded["name"], embedded["n"]
            self.assertIn(f"<title>{name}'s room", page, f"{f.name}: title missing")
            self.assertIn(name, page, f"{f.name}: name missing from page")
            self.assertIn(f"atomic number {n}", page, f"{f.name}: atomic number missing")

    def test_every_page_links_back_to_the_gallery(self):
        for f in self.files:
            page = f.read_text(encoding="utf-8")
            self.assertIn('id="back" href="../index.html"', page, f"{f.name}: back link missing")

    def test_every_page_uses_shared_assets(self):
        for f in self.files:
            page = f.read_text(encoding="utf-8")
            self.assertIn("../assets/style.css", page, f"{f.name}: no style.css")
            self.assertIn("../assets/room.css", page, f"{f.name}: no room.css")
            self.assertIn('type="module" src="../assets/room.js"', page, f"{f.name}: no room.js module")
            self.assertIn("three@0.160.0", page, f"{f.name}: no three.js import map")

    def test_every_page_has_cpk_favicon(self):
        for f in self.files:
            page = f.read_text(encoding="utf-8")
            embedded = parse_room_element(page)
            cpk = embedded["c"]
            self.assertIn(cpk, page, f"{f.name}: CPK colour {cpk!r} not in the page (favicon)")

    # -- main app integration -----------------------------------------------------

    def test_app_js_builds_room_hrefs(self):
        app = APP_JS.read_text(encoding="utf-8")
        self.assertIn("roomHref", app, "app.js must expose a roomHref helper")
        self.assertIn("rooms/${", app, "app.js must build room URLs under rooms/")

    def test_app_js_uses_shared_lib(self):
        app = APP_JS.read_text(encoding="utf-8")
        for mod in ("util.js", "theme.js", "primitives.js", "controls.js", "xr.js", "shell.js", "infocard.js"):
            self.assertIn(f"./lib/{mod}", app, f"app.js does not import ./lib/{mod}")

    def test_room_js_uses_shared_lib(self):
        room = ROOM_JS.read_text(encoding="utf-8")
        for mod in ("util.js", "theme.js", "primitives.js", "controls.js", "xr.js", "shell.js", "infocard.js", "learn.js"):
            self.assertIn(f"./lib/{mod}", room, f"room.js does not import ./lib/{mod}")

    def test_room_js_declares_five_learning_stations(self):
        room = ROOM_JS.read_text(encoding="utf-8")
        for key in ("model", "uses", "history", "experiment", "quiz"):
            self.assertIn(f"key: '{key}'", room, f"learning station '{key}' missing in room.js")
        for hook in ("buildLattice", "buildQuizPanel", "quizPick", "quizNext", "focusStation"):
            self.assertIn(hook, room, f"learning hook '{hook}' missing in room.js")

    def test_lib_modules_exist(self):
        expected = {"util.js", "theme.js", "primitives.js", "controls.js", "xr.js", "shell.js", "infocard.js", "learn.js"}
        present = {p.name for p in LIB.glob("*.js")}
        self.assertEqual(expected, present, "missing/extra lib modules")

    def test_every_page_embeds_learning_content(self):
        """Mayer-style stations data must reach every generated room page."""
        problems = []
        for page in self.files:
            rec = parse_room_element(page.read_text(encoding="utf-8"))
            if not (isinstance(rec.get("u"), list) and rec["u"]):
                problems.append(f"{page.name}: uses (u)")
            for field in ("xp", "pn"):
                if not rec.get(field):
                    problems.append(f"{page.name}: {field}")
            mo = rec.get("mo") or {}
            if mo.get("t") not in {"atom", "dumbbell", "tetra", "ring8", "sc", "bcc", "fcc", "hcp", "diamond"}:
                problems.append(f"{page.name}: model type {mo.get('t')!r}")
            if not mo.get("c"):
                problems.append(f"{page.name}: model caption")
        self.assertEqual(problems, [], "pages with missing learning content")

    def test_element_content_covers_all_elements(self):
        build = load_build_module(DATA_BUILD, "build_elements_data")
        ec = load_build_module(build.ROOT / "scripts" / "element_content.py", "element_content")
        missing = [e["s"] for e in self.canon if e["s"] not in ec.CONTENT or e["s"] not in ec.MODEL]
        self.assertEqual(missing, [], "symbols missing curated content")

    def test_index_mentions_element_rooms(self):
        idx = INDEX_HTML.read_text(encoding="utf-8")
        self.assertIn("its room", idx, "main page hint should mention element rooms")

    # -- regeneration --------------------------------------------------------------

    def test_rebuilding_reproduces_committed_rooms(self):
        """The committed docs/rooms must be exactly what build_rooms.py emits."""
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            self.build.ROOMS = out
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    self.build.main()
                regenerated = {p.name: p.read_text(encoding="utf-8") for p in out.glob("*.html")}
            finally:
                self.build.ROOMS = ROOMS
        committed = {p.name: p.read_text(encoding="utf-8") for p in ROOMS.glob("*.html")}
        self.assertEqual(committed, regenerated,
           
                         "committed docs/rooms differ from a fresh build — "
                         "run: python scripts/build_rooms.py")


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(RoomsSuite)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print("PASS" if result.wasSuccessful() else "FAIL")
    sys.exit(0 if result.wasSuccessful() else 1)
