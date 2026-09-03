#!/usr/bin/env python3
"""Generate one HTML room per element into docs/rooms/.

Each element of the periodic table gets its own walkable 3D room
(docs/rooms/NNN-name.html): a self-contained page that embeds that single
element's record inline (window.ROOM_ELEMENT) and loads the shared room
viewer (docs/assets/room.js) from the main app. The main room links each
element to its room; every room links back to the main room.

The element records come from scripts/build_elements_data.build_compact(),
so rooms and the main app bundle are guaranteed to use byte-identical data.

Usage:  python scripts/build_rooms.py
Output: docs/rooms/001-hydrogen.html … docs/rooms/118-oganesson.html
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import quote

# allow ``from build_elements_data import …`` both when run as a script and
# when imported by tests (scripts/ is not a package).
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_elements_data import ROOMS, build_compact

CATEGORY_LABEL = {
    "alkali metal": "Alkali metal",
    "alkaline earth metal": "Alkaline earth",
    "transition metal": "Transition metal",
    "post-transition metal": "Post-transition",
    "lanthanide": "Lanthanide",
    "actinide": "Actinide",
    "diatomic nonmetal": "Nonmetal (diatomic)",
    "polyatomic nonmetal": "Nonmetal (polyatomic)",
    "metalloid": "Metalloid",
    "noble gas": "Noble gas",
}


def room_filename(element: dict) -> str:
    """docs/rooms/<NNN>-<name>.html for a compact element record."""
    return f"{element['n']:03d}-{element['name'].lower()}.html"


def room_href(element: dict) -> str:
    """Relative URL of an element's room from the main page (docs/index.html)."""
    return quote(room_filename(element))


def page_title(element: dict) -> str:
    return f"{element['name']}'s room — The Periodic Table Room"


def favicon_svg(element: dict, cat_hex: str) -> str:
    cpk = "#" + element["c"]
    return (
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>"
        f"<circle cx='16' cy='16' r='5' fill='#05060a' stroke='{cat_hex}' stroke-width='2'/>"
        f"<circle cx='16' cy='16' r='4' fill='{cpk}'/>"
        f"<ellipse cx='16' cy='16' rx='13' ry='5.5' fill='none' stroke='{cat_hex}' stroke-width='1.6' transform='rotate(-24 16 16)'/>"
        f"<ellipse cx='16' cy='16' rx='13' ry='5.5' fill='none' stroke='{cpk}' stroke-width='1.6' transform='rotate(34 16 16)'/>"
        "</svg>"
    )


def build_room_page(element: dict) -> str:
    n, symbol, name = element["n"], element["s"], element["name"]
    cat = element["cat"]
    cat_hex = CATEGORY_LABEL.get(cat, cat.title())
    json_blob = json.dumps(element, ensure_ascii=False, separators=(",", ":"))
    desc = (
        f"{name} — {cat_hex}, atomic number {n}. A walkable 3D room with a live "
        f"Bohr atom model, facts and a WebXR option."
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>{page_title(element)}</title>
  <meta name="description" content="{desc}" />
  <link rel="icon" href="data:image/svg+xml,{quote(favicon_svg(element, cat_hex))}" />
  <link rel="preconnect" href="https://cdn.jsdelivr.net" />
  <link rel="stylesheet" href="../assets/style.css" />
  <link rel="stylesheet" href="../assets/room.css" />
  <script type="importmap">
  {{
    "imports": {{
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
    }}
  }}
  </script>
</head>
<body>
  <canvas id="room"></canvas>

  <div id="loading">
    <div class="spinner"></div>
    <div class="loading-text">Building {name}'s room…</div>
  </div>

  <header id="hud">
    <h1><span class="room-symbol" style="color:{cat_hex}">{symbol}</span> {name}'s room</h1>
    <p class="sub" id="sub">atomic number {n} · {cat_hex}</p>
  </header>

  <a id="back" href="../index.html" title="Back to the full periodic table room">← Periodic Table Room</a>

  <aside id="panel" class="hidden">
    <button id="panel-close" title="Close" aria-label="Close">×</button>
    <div id="panel-body">
      <p class="peeknote">Walk the room — the atom is life-sized to this room. Click it to focus.</p>
    </div>
  </aside>

  <button id="xr" class="hidden" type="button">Enter XR</button>

  <footer id="hint">
    <span>click to look around</span> · <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> fly</span> ·
    <span><kbd>Space</kbd> up</span> · <span><kbd>Shift</kbd> down</span> · <span><kbd>Ctrl</kbd> sprint</span> ·
    <span>click the atom to focus</span> · <span>walk through the ring to return</span> · <span><kbd>Esc</kbd> release</span>
  </footer>
  <div id="xr-hint" class="hidden">In VR: move with the left stick, point &amp; trigger to select.</div>

  <div id="fps"></div>

  <!-- this single element's record (generated; matches docs/assets/elements-data.js) -->
  <script>window.ROOM_ELEMENT = {json_blob};</script>
  <script type="module" src="../assets/room.js"></script>
</body>
</html>
"""


def main() -> None:
    elements, _cats = build_compact()
    ROOMS.mkdir(parents=True, exist_ok=True)
    written = 0
    for element in elements:
        target = ROOMS / room_filename(element)
        target.write_text(build_room_page(element), encoding="utf-8")
        written += 1
    print(f"wrote {written} element rooms into {ROOMS}")


if __name__ == "__main__":
    main()
