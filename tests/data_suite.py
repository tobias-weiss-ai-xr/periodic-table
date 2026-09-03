#!/usr/bin/env python3
"""Data-pipeline unit suite for The Periodic Table Room.

Asserts the invariants of the element-data pipeline
    docs/assets/elements.json  --(scripts/build_elements_data.py)-->  docs/assets/elements-data.js
using only the standard library:

  - exactly 118 real elements (atomic numbers 1..118, unique, ordered)
  - well-formed, unique symbols and names
  - grid coordinates: x in 1..18 (18 groups), row in 1..9 (7 periods + 2 f-block rows)
  - shell electrons sum to the atomic number for every element
  - exactly 10 normalised categories, no raw "unknown, probably ..." strings
  - every element carries a 6-digit CPK hex colour (no '#' prefix)
  - lanthanides live in row 8, actinides in row 9
  - the committed bundle is byte-identical to what the build script regenerates

Usage:  python tests/data_suite.py
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
SRC_JSON = ROOT / "docs/assets/elements.json"
GEN_JS = ROOT / "docs/assets/elements-data.js"
BUILD_SCRIPT = ROOT / "scripts/build_elements_data.py"

HEX6 = re.compile(r"^[0-9a-fA-F]{6}$")
SYMBOL = re.compile(r"^[A-Z][a-z]{0,2}$")


# --------------------------------------------------------------------------- helpers

def load_source_elements() -> list[dict]:
    """Raw elements from docs/assets/elements.json (may include >118 synthetics)."""
    with open(SRC_JSON, encoding="utf-8") as fh:
        return json.load(fh)["elements"]


def load_generated() -> tuple[list[dict], list[list[str]]]:
    """Parse (ELEMENTS, ELEMENT_CATEGORIES) back out of the generated JS bundle."""
    text = GEN_JS.read_text(encoding="utf-8")
    m = re.search(
        r"const ELEMENTS = (\[.*?\]);\nconst ELEMENT_CATEGORIES = (\[.*?\]);",
        text, re.S,
    )
    if not m:
        raise AssertionError("elements-data.js does not contain ELEMENTS/ELEMENT_CATEGORIES")
    return json.loads(m.group(1)), json.loads(m.group(2))


def row_of(source_element: dict) -> int:
    """The pipeline's ypos -> row mapping (extended table: lanthanides 9->8, actinides 10->9)."""
    y = source_element["ypos"]
    return y - 1 if y >= 9 else y


def normalised_category(source_element: dict, aliases: dict) -> str:
    return aliases.get(source_element["category"], source_element["category"])


def load_build_module():
    """Import scripts/build_elements_data.py without executing main()."""
    spec = importlib.util.spec_from_file_location("build_elements_data", BUILD_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --------------------------------------------------------------------------- tests

class DataSuite(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls):
        cls.source = {e["number"]: e for e in load_source_elements()}
        cls.compact, cls.cats = load_generated()
        cls.build = load_build_module()

    # -- count & atomic numbers ------------------------------------------------

    def test_exactly_118_real_elements(self):
        self.assertEqual(len(self.compact), 118,
                         "the generated bundle must contain exactly 118 real elements")

    def test_atomic_numbers_unique_and_complete(self):
        numbers = [e["n"] for e in self.compact]
        self.assertEqual(len(numbers), len(set(numbers)), "atomic numbers must be unique")
        self.assertEqual(sorted(numbers), list(range(1, 119)),
                         "atomic numbers must cover exactly 1..118")
        self.assertEqual(numbers, sorted(numbers),
                         "bundle must be sorted by atomic number")

    def test_source_json_covers_all_real_elements(self):
        for n in range(1, 119):
            self.assertIn(n, self.source, f"source JSON is missing element {n}")
        for n in self.source:
            if n <= 118:
                continue
            self.assertGreater(n, 118,
                               "synthetic elements beyond 118 may exist but must be > 118")

    # -- identity fields --------------------------------------------------------

    def test_symbols_unique_and_well_formed(self):
        symbols = [e["s"] for e in self.compact]
        self.assertEqual(len(symbols), len(set(symbols)), "symbols must be unique")
        for e in self.compact:
            self.assertIsInstance(e["s"], str)
            self.assertRegex(e["s"], SYMBOL,
                             f"element {e['n']}: symbol {e['s']!r} is not 1-3 letters, capitalised")

    def test_names_unique_and_non_empty(self):
        names = [e["name"] for e in self.compact]
        self.assertEqual(len(names), len(set(names)), "names must be unique")
        for e in self.compact:
            self.assertIsInstance(e["name"], str)
            self.assertTrue(e["name"].strip(), f"element {e['n']} has an empty name")

    # -- grid coordinates -------------------------------------------------------

    def test_x_within_group_columns_1_to_18(self):
        for e in self.compact:
            self.assertIsInstance(e["x"], int)
            self.assertTrue(1 <= e["x"] <= 18,
                            f"element {e['n']} ({e['s']}): x={e['x']} outside 1..18")

    def test_row_within_1_to_9(self):
        for e in self.compact:
            self.assertIsInstance(e["row"], int)
            self.assertTrue(1 <= e["row"] <= 9,
                            f"element {e['n']} ({e['s']}): row={e['row']} outside 1..9")

    # -- shells ------------------------------------------------------------------

    def test_shell_electrons_sum_to_atomic_number(self):
        for e in self.compact:
            self.assertEqual(sum(e["sh"]), e["n"],
                             f"element {e['n']} ({e['s']}): shells {e['sh']} sum to "
                             f"{sum(e['sh'])}, not the atomic number")

    def test_shell_structure_well_formed(self):
        for e in self.compact:
            self.assertIsInstance(e["sh"], list)
            self.assertTrue(e["sh"], f"element {e['n']} has no shells")
            self.assertTrue(all(isinstance(v, int) and v > 0 for v in e["sh"]),
                            f"element {e['n']}: shells {e['sh']} must be positive integers")
            self.assertLessEqual(len(e["sh"]), 7,
                                 f"element {e['n']}: more than 7 electron shells")

    # -- categories ----------------------------------------------------------------

    def test_exactly_10_normalized_categories(self):
        self.assertEqual(len(self.cats), 10,
                         f"expected 10 normalised categories, got {len(self.cats)}: "
                         f"{[c[0] for c in self.cats]}")

    def test_every_element_uses_a_declared_category(self):
        declared = {c[0] for c in self.cats}
        for e in self.compact:
            self.assertIn(e["cat"], declared,
                          f"element {e['n']} ({e['s']}): category {e['cat']!r} not declared")

    def test_no_unnormalised_category_strings(self):
        for e in self.compact:
            self.assertNotIn("unknown", e["cat"].lower(),
                             f"element {e['n']}: raw category {e['cat']!r} was not normalised")

    def test_category_entries_have_labels(self):
        for entry in self.cats:
            self.assertEqual(len(entry), 2, f"category entry {entry} must be [key, label]")
            self.assertIsInstance(entry[0], str) and self.assertIsInstance(entry[1], str)
            self.assertTrue(entry[0].strip() and entry[1].strip(),
                            f"category entry {entry} has an empty key or label")
        labels = [c[1] for c in self.cats]
        self.assertEqual(len(labels), len(set(labels)), "category labels must be unique")

    def test_every_category_has_at_least_one_element(self):
        used = {e["cat"] for e in self.compact}
        for key, _ in self.cats:
            self.assertIn(key, used, f"category {key!r} declares no elements")

    # -- colours -----------------------------------------------------------------

    def test_every_element_has_6_digit_cpk_hex(self):
        for e in self.compact:
            self.assertIsInstance(e["c"], str)
            self.assertNotIn("#", e["c"], f"element {e['n']}: colour {e['c']!r} keeps its '#'")
            self.assertRegex(e["c"], HEX6,
                             f"element {e['n']}: colour {e['c']!r} is not a 6-digit hex value")

    # -- f-block placement ---------------------------------------------------------

    def test_lanthanides_in_row_8(self):
        lan = [e for e in self.compact if e["cat"] == "lanthanide"]
        self.assertEqual([e["n"] for e in lan], list(range(57, 72)),
                         "lanthanides must be exactly elements 57..71")
        for e in lan:
            self.assertEqual(e["row"], 8,
                             f"lanthanide {e['n']} ({e['s']}) sits in row {e['row']}, not 8")

    def test_actinides_in_row_9(self):
        act = [e for e in self.compact if e["cat"] == "actinide"]
        self.assertEqual([e["n"] for e in act], list(range(89, 104)),
                         "actinides must be exactly elements 89..103")
        for e in act:
            self.assertEqual(e["row"], 9,
                             f"actinide {e['n']} ({e['s']}) sits in row {e['row']}, not 9")

    # -- pipeline consistency (JSON -> build script -> JS bundle) --------------------

    def test_generated_fields_match_source_json(self):
        aliases = self.build.CATEGORY_ALIASES
        for e in self.compact:
            src = self.source[e["n"]]
            self.assertEqual(e["s"], src["symbol"])
            self.assertEqual(e["name"], src["name"])
            self.assertEqual(e["x"], src["xpos"])
            self.assertEqual(e["row"], row_of(src),
                             f"element {e['n']}: row does not follow the ypos mapping")
            self.assertEqual(e["cat"], normalised_category(src, aliases),
                             f"element {e['n']}: category was not normalised as the build script does")
            self.assertEqual(e["sh"], src.get("shells") or [])

    def test_missing_cpk_hex_replaced_by_fallback(self):
        fallbacks = set(self.build.FALLBACK_CPK)
        for e in self.compact:
            src_hex = (self.source[e["n"]].get("cpk-hex") or "").lstrip("#")
            if src_hex:
                self.assertEqual(e["c"], src_hex,
                                 f"element {e['n']}: colour must come from the source cpk-hex")
            else:
                self.assertIn(e["c"], fallbacks,
                              f"element {e['n']}: colour {e['c']!r} is not from the fallback palette")

    def test_bundle_exports_window_globals(self):
        text = GEN_JS.read_text(encoding="utf-8")
        self.assertIn("Generated by scripts/build_elements_data.py", text,
                      "bundle must credit the generator")
        self.assertIn("window.ELEMENTS = ELEMENTS", text)
        self.assertIn("window.ELEMENT_CATEGORIES = ELEMENT_CATEGORIES", text)

    def test_rebuilding_reproduces_committed_bundle(self):
        """The committed elements-data.js must be exactly what the build script emits."""
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "regen.js"
            self.build.OUT = out
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    self.build.main()
                regenerated = out.read_text(encoding="utf-8")
            finally:  # never leave the module pointing at a deleted temp file
                self.build.OUT = GEN_JS
        committed = GEN_JS.read_text(encoding="utf-8")
        self.assertEqual(regenerated, committed,
                         "committed elements-data.js differs from a fresh build — "
                         "run: python scripts/build_elements_data.py")


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(DataSuite)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print("PASS" if result.wasSuccessful() else "FAIL")
    sys.exit(0 if result.wasSuccessful() else 1)
