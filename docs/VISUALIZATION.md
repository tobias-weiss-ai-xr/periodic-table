# The Periodic Table Room — visualisation notes

Interactive three.js + WebXR page, served from `/docs` on GitHub Pages.

## Scene layout

- The **extended periodic table** is mounted on the back wall (`z = -18`) as
  `18` columns × `9` rows (periods 1–7 + lanthanide row 8 + actinide row 9),
  column width 2.6 units, row height 2.6, wall centre height 12.
- Every element is a **display case**: frosted glass tile (category colour),
  soft halo, live **Bohr atom** (nucleus in CPK colour + up to 7 electron shells;
  electrons are `InstancedMesh`, one draw call per shell), symbol sprite above,
  atomic number below, plus a glowing floor beacon under its column.
- The room shell (floor + grid, side walls, back wall with table grid lines,
  ceiling, entrance wall with the room title) gives the walkable-gallery feel;
  `Fog` + point lights (cyan/gold) keep it moody but readable.

## Interaction

- **Pointer-lock first person**: click empty space to lock; `WASD`/arrows to
  move, `Shift` sprint, `Esc` release. Movement is HMD-relative in VR.
- **Picking**: `Raycaster` against atom groups (`recursive=true`), walking the
  parent chain back to the owning element node. Unlocked → cursor ray;
  pointer-locked → centre reticle.
- **Select**: camera tween (ease-in-out, `stepCamera`) glides to a viewpoint in
  front of the element; the atom scales ×1.55, a gold ring appears and the
  detail panel opens (melt/boil Kelvin→°C, mass, shells, configuration, …)
  and a **3D holographic info card** (`buildInfoCard`/`paintInfoCard`, a
  canvas sprite) floats in front of the element so the facts stay legible
  inside a VR headset too (HTML overlays are not visible in immersive VR).
- **Search / family chips** filter and highlight (dim non-matching / non-active).

## WebXR

- `renderer.xr.enabled` + `renderer.setAnimationLoop`; button does
  `navigator.xr.requestSession('immersive-vr')` then `renderer.xr.setSession`.
- Two controllers (models via `XRControllerModelFactory`): right one draws a
  ray (`Line` from a unit `-Z` geometry, oriented by `setFromUnitVectors`,
  scaled to hit distance) and `selectstart` selects the pointed element; the
  left thumbstick moves, right thumbstick yaws.
- **LOD swap** on session start/end (`setNodeLOD`): VR caps shells at
  `MAX_VR_SHELLS = 4` and electrons per shell at 6 to keep the headset happy.

## Data

- `elements.json` — raw Bowserinator dataset (118 elements).
- `elements-data.js` — generated (scripts/build_elements_data.py): keeps only
  the used fields, normalises categories and the extended-table rows, patches
  the 9 synthetic elements' missing CPK colours with a fallback palette.

## Verification

`window.RPRoom` exposes a handful of hooks used for headless checks:
`{ elements, nodes, shellsDrawn(), selected(), selectByNumber(n) }`.
