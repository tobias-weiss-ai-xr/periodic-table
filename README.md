# The Periodic Table Room

A walkable **3D periodic table**: 118 elements in one gallery room, each element a live
Bohr-style atom model (nucleus + electron shells with orbiting electrons), with a
**WebXR option** for viewing it in a VR headset.

Live page: **https://tobias-weiss-ai-xr.github.io/periodic-table/** (GitHub Pages from `docs/`)

## What you can do

- **Walk** the room (`click` to look around, `WASD`/arrow keys to move, `Shift` to sprint, `Esc` to release the mouse)
- **Click any atom** — the camera glides to it, a detail panel opens (name, symbol, atomic mass, electron shells & configuration, phase, melt/boil points, density, electronegativity, summary), and a **holographic info card floats in front of the element** — readable both on screen *and inside the VR headset*.
- **Search** for an element by name, symbol or number (Enter flies to the best match)
- **Filter by family** via the colour chips (alkali metal, transition metal, lanthanide, …)
- **Enter XR** (button, bottom right) — full room-scale VR on an `immersive-vr` headset:
  move with the left thumbstick, point with the right controller ray, trigger to select.
  If no headset is detected the button explains why.

## Tech

- [three.js](https://threejs.org/) r160 (CDN, ES modules) + WebXR (`immersive-vr`)
- Element data: [Bowserinator/Periodic-Table-JSON](https://github.com/Bowserinator/Periodic-Table-JSON)
  (Bohr `shells`, periodic-table `xpos`/`ypos`, CPK colours) — bundled compactly
  by `scripts/build_elements_data.py`
- No build step, no dependencies to install — serve `docs/` and go.

```
docs/
├── index.html               ← app shell + import map
└── assets/
    ├── style.css            ← UI (HUD, search, legend, detail panel, XR button)
    ├── elements-data.js     ← generated compact element data (window.ELEMENTS)
    ├── elements.json        ← raw source dataset (Bowserinator)
    └── app.js               ← three.js room, atoms, movement, picking, XR
scripts/
└── build_elements_data.py   ← regenerate elements-data.js from elements.json
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
```

## Deploy

Repo **Settings → Pages → Source = Deploy from a branch → `master` / `docs`**.
(`docs/.nojekyll` is already in place.)
