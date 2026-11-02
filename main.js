// Lords & Logicians prototype: entry point (renderer, scene, camera, loop).
// Three.js and the board load through dynamic import() so a failed CDN fetch, like a
// missing WebGL context, ends in a plain message in the stage instead of a blank box.

const SKY = '#1f2a4d';
const stage = document.getElementById('stage');

function showMessage(text) {
  stage.removeAttribute('role');
  stage.removeAttribute('aria-label');
  const p = document.createElement('p');
  p.className = 'stage-msg';
  p.textContent = text;
  stage.replaceChildren(p);
}

async function start() {
  let THREE, map, pieces, runner;
  try {
    [THREE, map, pieces, runner] = await Promise.all([
      import('three'), import('./map.js'), import('./pieces.js'), import('./run.js'),
    ]);
  } catch (err) {
    console.warn('Lords & Logicians: the 3D engine failed to load.', err);
    showMessage('The board could not be drawn: the 3D engine failed to load. Check your connection and reload the page.');
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (err) {
    console.warn('Lords & Logicians: no WebGL.', err);
    showMessage('The board needs WebGL, which this browser or device has turned off or does not support.');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  // ---- scene: dusk, so torches will matter later ----
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);

  const sky = new THREE.HemisphereLight('#6a7db8', '#2e2618', 1.5);
  scene.add(sky);

  const moon = new THREE.DirectionalLight('#c5d2f7', 2.3);
  // high in the west-south-west: the tile tops and the south and west faces the camera sees
  // catch it, and shadows fall away up-screen to the east-north-east
  moon.position.set(-6, 10, 4);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.02;
  scene.add(moon);

  const board = map.buildBoard();
  scene.add(board);

  // ---- pieces: in the scene, not the board, so they don't move the camera fit ----
  const hob = pieces.createHob();
  hob.group.position.copy(map.path[0]);
  hob.group.lookAt(map.path[1]);
  scene.add(hob.group);

  const lord = pieces.createLord();
  lord.group.position.copy(map.lordSpot);
  lord.group.lookAt(map.tileCenter(map.lordTile.row, map.lordTile.col, map.lordSpot.y));
  scene.add(lord.group);

  // The beacon replaces the board's placeholder: tower 0.26 past the road's end, door to the road.
  const roadEnd = map.path[map.path.length - 1];
  const roadIn = roadEnd.clone().sub(map.path[map.path.length - 2]).setY(0).normalize();
  const beacon = pieces.createBeacon();
  beacon.group.position.copy(roadEnd).addScaledVector(roadIn, 0.26).setY(map.TILE_TOP);
  beacon.group.lookAt(roadEnd.clone().setY(map.TILE_TOP));
  scene.add(beacon.group);
  const placeholder = board.getObjectByName('beaconPlaceholder');
  if (placeholder) placeholder.visible = false;

  // ---- camera: fixed view from due south looking north, so the tall board's road runs from
  // the top of the screen (S) to the bottom (B); screen right is east, screen up is north ----
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const AZIMUTH = 0;                              // around the vertical axis: 0 = from the south
  const ELEVATION = THREE.MathUtils.degToRad(45); // steeper fills a tall screen, shallower keeps pieces tall
  const DISTANCE = 40;
  const target = new THREE.Vector3(0, map.TILE_TOP, 0);
  camera.position.set(
    target.x + DISTANCE * Math.cos(ELEVATION) * Math.sin(AZIMUTH),
    target.y + DISTANCE * Math.sin(ELEVATION),
    target.z + DISTANCE * Math.cos(ELEVATION) * Math.cos(AZIMUTH),
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();

  // Fit the frustum to everything in the board group (static scenery; add moving pieces to
  // the scene, not the board, so they don't change the fit).
  // `inset` (CSS px from each edge of the stage) is the part the board must stay clear of:
  // on phones the controls bar and caption over the bottom, and the notches. All 0 on desktop.
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const MARGIN = 1.05;
  const NO_INSET = { top: 0, right: 0, bottom: 0, left: 0 };
  function fitCamera(w, h, inset = NO_INSET) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const fit = (o) => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
          .applyMatrix4(camera.matrixWorldInverse);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
    };
    board.updateMatrixWorld(true);
    board.traverseVisible(fit);
    beacon.bounds.updateWorldMatrix(true, false);
    fit(beacon.bounds); // the static beacon, lit flame included (hidden box)
    // fit the board into the free area, then widen the frustum by the insets at the same scale
    let aw = w - inset.left - inset.right;
    let ah = h - inset.top - inset.bottom;
    if (aw < w * 0.3 || ah < h * 0.3) { inset = NO_INSET; aw = w; ah = h; } // overlay too big: ignore it
    const aspect = aw / ah;
    let halfW = ((maxX - minX) / 2) * MARGIN;
    let halfH = ((maxY - minY) / 2) * MARGIN;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    const perPx = (2 * halfW) / aw; // world units per CSS pixel
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    camera.left = cx - halfW - inset.left * perPx;
    camera.right = cx + halfW + inset.right * perPx;
    camera.top = cy + halfH + inset.top * perPx;
    camera.bottom = cy - halfH - inset.bottom * perPx;
    camera.updateProjectionMatrix();
  }

  // On phones style.css floats .controls over the bottom of the stage and pads the stage by the
  // safe areas; measure both. On desktop .controls sits below the stage and the padding is 0.
  const controls = document.querySelector('.controls');
  function stageInset() {
    const cs = getComputedStyle(stage);
    const inset = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    if (controls && getComputedStyle(controls).position !== 'static') {
      const s = stage.getBoundingClientRect();
      const c = controls.getBoundingClientRect();
      if (c.height) inset.bottom = Math.max(0, Math.min(s.bottom, c.bottom) - Math.max(s.top, c.top));
    }
    return inset;
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // follows browser zoom
    renderer.setSize(w, h, false);
    fitCamera(w, h, stageInset());
    renderer.render(scene, camera);
  }
  const resizer = new ResizeObserver(resize);
  resizer.observe(stage);
  if (controls) resizer.observe(controls); // the bar and caption can change height
  resize();

  // ---- loop, with a per-frame hook: onFrame(fn) calls fn(dt, elapsed) in seconds ----
  const hooks = new Set();
  const failed = new WeakSet();
  function onFrame(fn) {
    hooks.add(fn);
    return () => hooks.delete(fn);
  }
  let last = performance.now();
  let elapsed = 0;
  function frame(now) {
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1); // clamp after a hidden tab
    last = now;
    elapsed += dt;
    for (const fn of Array.from(hooks)) {
      try {
        fn(dt, elapsed);
      } catch (err) {
        if (!failed.has(fn)) console.error('Lords & Logicians: a frame hook failed.', err);
        failed.add(fn);
      }
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  onFrame(pieces.update);

  // ---- controls: the Lit/Dark radios set Hob's torch at the start ----
  const radios = document.querySelectorAll('input[name="torch"]');
  const checked = document.querySelector('input[name="torch"]:checked');
  hob.setLit(!checked || checked.value === '1');
  for (const r of radios) {
    r.addEventListener('change', () => {
      if (r.checked) hob.setLit(r.value === '1', { animate: true });
    });
  }

  // ---- the run: Send walks Hob past Lord Gainsay to the beacon; Reset puts it all back ----
  const run = runner.createRun({
    hob, lord, beacon, scene, onFrame,
    ui: {
      sendBtn: document.getElementById('send'),
      resetBtn: document.getElementById('reset'),
      readout: document.getElementById('readout'),
      status: document.getElementById('status'),
      radios,
    },
  });

  window.__gates = { scene, camera, renderer, board, onFrame, pieces: { hob, lord, beacon }, run };
}

start();
