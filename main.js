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
  moon.position.set(-5, 10, -6); // high in the north-west: west and north faces catch it
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

  // ---- camera: fixed isometric view from the south-west, so the road runs left to right ----
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const AZIMUTH = THREE.MathUtils.degToRad(-45);      // around the vertical axis
  const ELEVATION = THREE.MathUtils.degToRad(35.264); // atan(1/√2): classic isometric
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
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const MARGIN = 1.05;
  function fitCamera(aspect) {
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
    let halfW = ((maxX - minX) / 2) * MARGIN;
    let halfH = ((maxY - minY) / 2) * MARGIN;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    camera.left = cx - halfW;
    camera.right = cx + halfW;
    camera.top = cy + halfH;
    camera.bottom = cy - halfH;
    camera.updateProjectionMatrix();
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // follows browser zoom
    renderer.setSize(w, h, false);
    fitCamera(w / h);
    renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe(stage);
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
