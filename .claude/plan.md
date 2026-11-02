# Plan

## Shared context (include in every subagent prompt)

- Static site, **no build step**, published by GitHub Pages from `main` (repo root) at https://reservetempo.github.io/logic-king/ (repo `reservetempo/logic-king`, public). The game is at the root, the design doc at `design/`. The site is served under `/logic-king/`, so **use relative paths only** (`style.css`, `main.js`, `../`), never `/...`. `.nojekyll` is there so Pages serves files as is. Moved here from `dominic_my_website` (`public/gates/`), whose `/gates` and `/gates/play` now redirect here.
- `design/` is the design doc "Lords & Logicians" for a 2.5D game where logic gates are medieval people. **World rule:** signals are torchbearers (messengers) walking the roads between gates. **Lit torch = 1, dark = 0.** The doc's cast: **Hob Wickfoot**, the torchbearer (small round peasant, patched red hood, torch on a long pole), and **Lord Gainsay**, Baron of Contrary Keep, the **NOT** gate (tall and gaunt, black cloak falling in a hard triangle, round white ruff at the throat, so he wears the NOT symbol; pale face, pointed beard, a long snuffer in one hand and a flint in the other; colors black, rubric-red lining, cold silver). He snuffs a lit torch and, out of spite, lights a dark one. Read their sheets (`id="torchbearer"` and `id="not"` in `design/index.html`) with targeted greps, not whole-file reads. Portraits are inline SVG; edit the markup directly.
- **The game** (root): `index.html`, `style.css`, and ES modules `main.js` (entry: renderer, scene, loop, wiring), `map.js` (board data and tiles), `pieces.js` (characters, torches, beacon), `run.js` (the walk and the gate's moment). The user's choices: Three.js, low-poly chess-piece characters, "pick the torch, then send", a beacon at the road's end. Links: "Design notes" (`.doc-link`, end of the kicker line) → `design/`; the doc's "Play the prototype" (`.play-link`, under the subtitle) → `../`.
  - Three.js loaded with an import map pinned to `three@0.170.0` on jsDelivr: `"three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js"` and, only if an addon is needed, `"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"`. No npm dependencies.
  - **2.5D view:** fixed `OrthographicCamera` at the classic isometric angle (45° around, about 35° down) looking at the board centre, refit on resize so the whole board fills the canvas at any size, phone width included. No orbit controls.
  - **Look:** dusk/night so torches matter: a cool moonlight directional light (soft shadows) plus a low hemisphere light, a deep night-blue background (`#1f2a4d`-ish). Colors copied from the palette tokens in `design/style.css` (`--flame-core`, `--flame`, `--flame-edge`, `--rubric`, `--gold`, `--lapis`, `--skin`, `--wool`, `--night`, `--silver`, etc.), not imported, so the two pages can drift. Page chrome (title, goal line, controls) in the doc's manuscript style: Google Fonts Cinzel (headings) and EB Garamond (text), parchment colors, with darker vellum under `prefers-color-scheme: dark`. The 3D scene stays dusk in both modes. `<title>` "Lords & Logicians · Prototype". Phone width: 16px side gutter, no horizontal page scroll.
  - **Board** (in `map.js`, as data so later levels or road-building are easy). Rows of characters: `.` grass, `#` road, `S` start (Hob's village end), `N` Lord Gainsay's tile (a road tile with his small gatehouse; he stands beside the road), `B` beacon tower (road's end), `t` decor (tree or rock). Keep one unbroken road S → N → B with bends:
    ```
    ..t.....t.
    S###......
    ...#..t...
    .t.N###...
    ......#.t.
    ..t...##B.
    ..........
    ```
    Tiles are separate slightly bevelled blocks with small gaps between them (grass tops, earthy sides). The road is a packed-earth strip inset on the tile top, shaped straight, corner or end from its road neighbours.
  - **Play:** the player picks Hob's torch, **Lit (1)** or **Dark (0)** (the torch at the start updates at once), and presses **Send**. Hob walks the road to Lord Gainsay, stops on his tile, the lord snuffs a lit torch or lights a dark one, and **Hob himself continues** with the opposite torch to the beacon. The beacon lights only if he arrives lit. Goal line: "Light the beacon" (so the winning move is to send him dark). Readout in truth-table terms, e.g. "In 1 lit → Lord Gainsay → Out 0 dark".
- **`map.js`:** exports `MAP`; `TILE` (1, centre to centre), `TILE_HEIGHT` (0.34), `TILE_TOP` (0, grass level), `ROAD_Y` (0.027, road surface); `tileCenter(row, col, y = ROAD_Y)` → `Vector3`. Axes: +x = map column (east), +z = map row (south), board centred on the origin. `path`: 13 shared `Vector3`s (clone before changing) on the road surface, S to B, with matching `pathTiles` `{row, col}`. `startTile`, `lordTile`, `beaconTile`: `{row, col, index, position}`, path index S = 0, N = 5, B = 12; N at (-1.5, ROAD_Y, 0). `lordFreeSide` = (0, 0, 1) (south). `lordSpot` = (-1.26, 0, 0.31), where the lord stands on the grass south of the outgoing road. `buildBoard()` → group `'board'` with children `tiles`, `road`, `startHut`, `gatehouse`, `beaconPlaceholder`, `decor`.
  - N is a bend (road in from the north, out to the east). The gatehouse fills the inside of the bend, and a stone arch spans the incoming north leg with its lintel underside about **0.48 above the grass**, so Hob must be shorter than that.
  - The camera looks from the south-west, so the road runs left to right on screen and the lord stands beside Hob at N. The camera refits to every mesh in `board`, so **add moving pieces and their lights to `scene`, not `board`**. The `beaconPlaceholder` group sits at the B tile centre, with its tower 0.26 east of the road's end; `path`'s last point is the foot of the tower.
- **`main.js`:** no static imports; loads three, `./map.js`, `./pieces.js` and `./run.js` with `Promise.all([import(...)])` inside `start()` and shows a plain message if that fails or WebGL is missing. `onFrame(fn)` calls `fn(dt, elapsed)` (seconds, `dt` capped at 0.1) each frame and returns an unsubscribe function; a throwing hook is logged once and the loop continues. Pixel ratio is reapplied on resize. `window.__gates = { scene, camera, renderer, board, onFrame, pieces: { hob, lord, beacon }, run: { send, reset, state } }`.
  - Page ids: `#stage`, `#torch-lit` (checked by default) and `#torch-dark` (radios, `name="torch"`, values 1 and 0), `#send`, `#reset`, `#readout`, `#status` (`aria-live="polite"`). A `.btn:disabled` style exists.
- **`pieces.js`:** exports `update(dt, elapsed)` (registered with `onFrame`) and `reducedMotion()` (checked live).
  - `createHob({ hood?, lit? })` → `{ group, body, torch, isLit, setLit(lit, { animate }), torchTip(target?) }`. Move `group`; bob `body` while walking. `torchTip()` is the world position of the flame centre (about 0.4 high). Height 0.42, fits under the arch. Starts on S (`path[0]`) facing `path[1]`.
  - `createLord()` → `{ group, snuff(target, opts), light(target, opts) }`. `target` is a world `Vector3` or a function returning one each frame (e.g. `() => hob.torchTip()`). `opts` is `{ onContact }` or the callback itself. `onContact` fires once when the torch should flip; **the caller flips the torch** in it. The Promise resolves when he is back at rest. Snuff: contact about 0.8 s, done 1.7 s. Light: contact about 1.0 s, done 1.6 s. Reduced motion: contact on the first frame, done about 0.45 s. Gestures queue. Stands at `lordSpot` facing N.
  - `createBeacon()` → `{ group, bounds, isLit, setLit(lit, { animate }), firePoint(target?) }`. `firePoint()` is the brazier's coals (about 0.95 high), out of Hob's reach from the road's end (torch tip about 0.4), so lighting it uses a sparks/flame hand-off from `hob.torchTip()` to `beacon.firePoint()`. Starts dark. The board's `beaconPlaceholder` is hidden; the camera fit includes `beacon.bounds`.
  - `setLit` always returns a Promise: animate fades over 0.5 s (0.2 s under reduced motion), otherwise instant. A newer call cancels a running fade. Point lights don't cast shadows and stay at intensity 0 when dark.
- **`run.js`:** a run takes about 12.5 s (about 1 s under reduced motion, with a 0.35 s pause at N). During a run the radios are `disabled` and Send is `aria-disabled` (kept focusable so keyboard focus isn't dropped; clicks are ignored). Reset cancels with a run token at any point; Send again resets first.
- **The preview pane may be hidden**, in which case `requestAnimationFrame` never fires: front the tab (`tabs_select`) before watching animation, or step the `__gates.onFrame` hooks by hand. The animation has so far only been checked by stepping frames, never watched live.
- Checking: launch config `static` in `.claude/launch.json` (`python -m http.server 8000`), pages `http://localhost:8000/` and `http://localhost:8000/design/` (ES modules don't load from `file://`). `preview_start` reads the launch config of the session's main folder only, so run sessions from this folder. Check the browser console and network log for errors and 404s. After a push, Pages rebuilds in about a minute (`gh api repos/reservetempo/logic-king/pages/builds/latest --jq .status` says `built`); check the live URL for changes that could differ there (paths).
- Git: branch `main`. Pull with `git pull --rebase`, push with `git push`.

## Next

The user wants the game playable on a phone held upright: the board full screen, the road running from the top of the screen to the bottom, and the controls shrunk into a little nav bar. Their answers: a **new tall board everywhere** (desktop too), the bar at the **bottom, over the board**, the bar holds the torch toggle, Send and the **goal line** (no Reset, no Design notes link, no fullscreen button in it), and the full-screen layout is for **phones only** (desktop keeps today's framed layout). Task 1 replaces the map and camera details in the shared context above (the old map, the south-west view, path of 13, N = 5, `lordSpot`), so where they differ, the task wins.

### 1. Tall board with the road running top to bottom (map.js, main.js, run.js; pieces.js only if needed)

Replace today's wide map with a tall, narrow one at all screen sizes, and turn the camera so the road starts at the top of the screen (Hob's village) and ends at the bottom (the beacon).

- **New `MAP`** in `map.js`, 6 columns × 13 rows; the rows read top to bottom on screen just as in the text:
  ```
  .t.S..
  ...#.t
  .###..
  .#..t.
  .#....
  .N##.t
  t..#..
  .t.#..
  ...##.
  .t..#.
  ...B#.
  t....t
  ..t...
  ```
  The road: S (row 0, col 3) south, west along row 2, south down col 1 to N (row 5, col 1), in from the north and out to the east (the same bend as today, so the gatehouse and arch code works as is), east, south down col 3, a jog east, south, and finally west into B (row 10, col 3). B is entered from the side, so the beacon tower stands beside the road's end, not in front of it as seen from the camera. 17 road tiles: N is path index 7, B is 16. Small changes are fine if something doesn't fit (decor in the way of the hut, gatehouse or tower), as long as: one unbroken road from S on the top row to B near the bottom, N a bend in from the north and out to the east, B entered from the east or west, and no road tile touches a road tile that isn't its neighbour on the path (`traceRoad()` throws on forks).
- **Camera** (`main.js`, the `AZIMUTH`/`ELEVATION` block): from due south (azimuth 0) looking north at the board centre, elevation about 45°. Tune between 40° and 50°: steeper fills a tall screen better, shallower keeps the pieces taller on screen. Screen right = east, screen up = north. Still orthographic, still refit on resize. Update the comment ("view from the south-west, so the road runs left to right").
- **`VIEW_SIDE`** in `map.js` (the side the camera looks from; used for the start hut and the straight-N case) becomes (0, 0, 1), or derive it from the camera. Update comments that describe the old map or view (for example "On this map: (0, 0, 1)…").
- **`run.js`:** `const N = 5` becomes `lordTile.index` from `map.js`. Look for any other number tied to the old path.
- **Lord and Hob at N:** seen from the south, the lord (at `lordSpot`, south-east of the N centre) stands in front of Hob. Make sure Hob, his torch and the snuff and light gestures stay visible. Adjust `lordSpot`'s offsets if needed, as long as the snuffer and flint still reach Hob's torch tip.
- **Lighting:** the camera now sees the tile tops and south sides. Make sure the board still reads (south faces not flat black, shadows sensible). Move the moon (now high in the north-west at (-5, 10, -6)) if needed and keep its shadow camera covering the whole board.
- **Run length:** the road is 17 tiles instead of 13. Keep a full run about 12–14 s (nudge `SPEED` if needed), and about 1 s under reduced motion.
- Desktop layout unchanged (title, framed stage, controls under it). The tall board sits centred in the wide stage with night sky either side; that's expected.
- Update `README.md` if it describes the board or the camera.
- **Done when:** the new board shows at desktop size and in a narrow, tall window with the road running top to bottom; both runs work start to finish (Lit → beacon stays dark, Dark → beacon lights), watched live with the preview tab fronted or stepped through `__gates.onFrame`; no console errors or 404s.
- **Also report:** the final camera angles, `lordSpot`, `lordTile` and `beaconTile` (index and position), `path.length`, the run's duration, and anything changed in `pieces.js`, so the shared context can be updated.

### 2. Full-screen phone layout with a small nav bar (index.html, style.css, a small change in main.js)

On phones the board fills the whole screen and the controls shrink into a slim bar over the bottom of the board. Desktop keeps today's layout, unchanged.

- **Phone** = the existing `@media (max-width: 40rem)` breakpoint, plus short viewports (`max-height: 32rem`) so a phone turned sideways still gets it.
- **Board:** `#stage` fills the viewport edge to edge: `100dvh` with a `100vh` fallback, no body gutter, no gold double frame or shadow. No page scroll in either direction, `overscroll-behavior: none`. Add `viewport-fit=cover` to the viewport meta and keep the bar and the board clear of notches and the home indicator with `env(safe-area-inset-*)`.
- **Hidden on phones:** the masthead (kicker with the Design notes link, the title), the "Hob's torch" legend, and Reset. Keep the `h1` for screen readers (visually hidden, like `.vh`) and keep `#reset` in the DOM (run.js wires it). Send already restarts after a run ends.
- **Nav bar:** slim (about 48–56 px plus the safe area), slightly translucent, in the page's manuscript style (parchment, dark vellum under `prefers-color-scheme: dark`, Cinzel and EB Garamond). It holds the compact Lit/Dark segmented toggle with its pips, Send (primary), and the goal "Light the beacon" in small type. Controls smaller than today's 44 px (about 36 px tall) but easy to tap, with `touch-action: manipulation`. Keep the ids, the radio names and values, and the disabled / `aria-disabled` styling working. Moving markup is fine as long as desktop looks the same, and screen readers must not read the goal twice.
- **Readout and status** (`#readout`, `#status`): a small caption floating over the board just above the bar, readable on the night sky (for example parchment text with a soft shadow), one or two lines, not a box over the road. Keep `aria-live` on `#status`.
- **Camera fit** (`main.js`, `fitCamera`/`resize`): on phones the board must not sit under the bar and caption. Fit the board into the part of the stage above the overlay: measure the overlay's height (for example the bar and caption container's height when it is overlaid, 0 on desktop) plus the top safe area, offset the frustum to match, and refit when it changes (observe it too). The desktop fit stays as it is.
- **Done when:** at 375×812 and 390×844 (preview `resize_window`), the board fills the screen with the road running top to bottom clear of the bar; the bar and caption are readable in light and dark mode; both runs work from the bar (Lit → fail, Dark → win); no page scroll; desktop width looks as before; no console errors.

## Done

- Move from dominic_my_website: 1dfd3a5. The game at the root and the design doc in `design/` with relative paths, links each way, `.nojekyll`, `README.md`, `.claude/launch.json`; public repo created and Pages turned on. Checked locally (both runs stepped by hand, phone width, keyboard) and live (both URLs load, no 404s or console errors).
- Earlier history (commits in the `dominic_my_website` repo): design doc page and styling ecd11a3, character portraits a25792d, board and camera 31edaae, pieces 370e060, the run c633515, final check and polish 0a93fcc.
