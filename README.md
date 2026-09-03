# The Periodic Table Room

A walkable **3D periodic table**: 118 elements in one gallery room, each element a live
Bohr-style atom model (nucleus + electron shells with orbiting electrons), with a
**WebXR option** for viewing it in a VR headset.

Live page: **https://tobias-weiss-ai-xr.github.io/periodic-table/** (GitHub Pages from `docs/`)

## What you can do

- **Fly** the room (`click` to look around, `WASD`/arrow keys to move, `Space`/`Shift` up and down, `Ctrl` to sprint, `Esc` to release the mouse); in VR the headset sets your height and the left thumbstick walks
- **Click any atom** — the camera glides to it, a detail panel opens (name, symbol, atomic mass, electron shells & configuration, phase, melt/boil points, density, electronegativity, summary), and a **holographic info card floats in front of the element** — readable both on screen *and inside the VR headset*.
- **Every element has its own learning lab** — select an element and a glowing **portal door** appears above it (plus an *Enter its room →* button in the detail panel); click/trigger it to teleport into that element's dedicated 3D room. Each room is a grand, airy hall: the element's giant Bohr atom as the monument over a category-coloured floor mandala, its symbol as huge wall lettering, drifting star dust — and a ring of **five numbered learning stations**: ① the element's real crystal/molecular structure as a 3D model (`buildLattice`), ② where you meet it, ③ who found it, ④ the classic experiment, ⑤ a self-check quiz with instant feedback — all designed around Mayer's multimedia-learning principles and retrieval practice. Free flight + WebXR + a return portal to the gallery. 118 rooms live in `docs/rooms/` (deep-linkable, e.g. `rooms/026-iron.html`).
- **Search** for an element by name, symbol or number (Enter flies to the best match)
- **Filter by family** via the colour chips (alkali metal, transition metal, lanthanide, …)
- **Enter XR** (button, bottom right) — full room-scale VR on an `immersive-vr` headset:
  move with the left thumbstick, point with the right controller ray, trigger to select.
  If no headset is detected the button explains why.

## Tech

- [three.js](https://threejs.org/) r160 (CDN, ES modules) + WebXR (`immersive-vr`)
- Element data: [Bowserinator/Periodic-Table-JSON](https://github.com/Bowserinator/Periodic-Table-JSON)
  (Bohr `shells`, periodic-table `xpos`/`ypos`, CPK colours) plus curated
  learning content for all 118 elements (uses, experiments, discovery notes,
  crystal structures) in `scripts/element_content.py` — bundled compactly
  by `scripts/build_elements_data.py`
- **Modular**: the gallery room and the 118 element rooms share one reusable
  layer in `docs/assets/lib/` (atoms, portals, lattice models, labels/glows,
  free-flight controls, WebXR rig, room shell, fact cards, learning
  stations + quiz) — nothing is copy-pasted between the two apps
- No build step, no dependencies to install — serve `docs/` and go.

```
docs/
├── index.html               ← app shell + import map
├── rooms/                   ← 118 per-element rooms (generated)
│   ├── 001-hydrogen.html    ← each is a self-contained walkable 3D room
│   └── … 118-oganesson.html
└── assets/
    ├── style.css            ← UI (HUD, search, legend, detail panel, XR button)
    ├── room.css             ← element-room tweaks (back link, room title)
    ├── elements-data.js     ← generated compact element data (window.ELEMENTS)
    ├── elements.json        ← raw source dataset (Bowserinator)
    ├── app.js               ← gallery room (three.js scene, walk, pick, search, XR)
    ├── room.js              ← single-element room viewer (consumes ./lib/*)
    └── lib/                 ← shared, reusable modules (used by both apps)
        ├── util.js          ← clamp/lerp/easing/pad helpers
        ├── theme.js         ← category palette, labels, number/K formatting
        ├── primitives.js    ← text sprites, glows, geometry, buildAtom, buildDoor
        ├── controls.js      ← free flight: keys + pointer lock + VR gamepad
        ├── xr.js            ← WebXR button lifecycle + controller ray rig
        ├── shell.js         ← parameterised room shell (floor/grid/walls/titles)
        └── infocard.js      ← canvas-painted holographic fact cards
scripts/
├── build_elements_data.py   ← regenerate elements-data.js from elements.json
└── build_rooms.py           ← regenerate docs/rooms/*.html from the same data
```

## Local preview

```bash
cd docs && python -m http.server 8099     # WebXR + modules need a real server
# open http://localhost:8099/
```

WebXR requires a secure context: GitHub Pages works out of the box;
for local testing use `https://localhost` or a headset that allows `localhost`.

## Regenerate the element bundle

```bash
python scripts/build_elements_data.py    # writes docs/assets/elements-data.js
python scripts/build_rooms.py            # writes docs/rooms/*.html (118 pages)
```

## Deploy

Repo **Settings → Pages → Source = Deploy from a branch → `master` / `docs`**.
(`docs/.nojekyll` is already in place.)
