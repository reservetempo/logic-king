// The design doc's 3D figures: shows the Bearer (bearer.js) in each [data-model="bearer"]
// placeholder of the rendered page.
//
// A small night diorama: a deep night-blue sky (the placeholder's own CSS background, seen
// through a transparent canvas), cool moonlight with a soft shadow, a low hemisphere light, and
// his torch as the only warm light, on a bevelled grass tile crossed by a packed-earth road.
// He turns slowly on the tile, about once every 20 s, with no controls; under
// prefers-reduced-motion he holds still at a three-quarter angle. Rendering pauses while the
// viewer is off screen. index.html imports this once the markdown is in the page, so it
// queries the DOM straight away. If three.js or WebGL is missing, a line of text stands in.

const TURN_SECONDS = 20;
const STILL_ANGLE = -0.62; // three-quarter view, torch to the left and a little behind

// Copied from the tokens in design/style.css (night values), not imported.
const C = {
  moonlight: '#bccce4',
  mist: '#8794a8',
  grass: '#3e4d3a',
  grassDeep: '#263023',
  earth: '#806849',
  earthDeep: '#4a3a29',
};

// What the camera frames: from the bottom of the tile to the top of the flame.
const FOCUS_Y = 0.125;
const HALF_H = 0.36;
const HALF_W = 0.3;
const ELEVATION = 18; // degrees above the horizon

const slots = [...document.querySelectorAll('[data-model="bearer"]')];
if (slots.length) start(slots);

async function start(els) {
  let THREE;
  let createBearer;
  try {
    [THREE, { createBearer }] = await Promise.all([import('three'), import('./bearer.js')]);
  } catch (err) {
    console.warn('The Bearer could not be loaded.', err);
    els.forEach((el) => note(el, 'The Bearer could not be shown here.'));
    return;
  }
  for (const el of els) {
    if (!hasWebGL2()) {
      note(el, 'This browser cannot show the Bearer in 3D.');
      continue;
    }
    try {
      mount(el, THREE, createBearer);
    } catch (err) {
      console.warn('The Bearer could not be shown.', err);
      note(el, 'This browser cannot show the Bearer in 3D.');
    }
  }
}

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

function note(el, text) {
  el.removeAttribute('role');
  el.removeAttribute('aria-label');
  const p = document.createElement('p');
  p.className = 'model-note';
  p.textContent = text;
  el.replaceChildren(p);
}

function mount(el, THREE, createBearer) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  el.replaceChildren(canvas);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(C.mist, C.grassDeep, 0.7));
  // The moon, high behind his left shoulder: a cold rim, and his shadow falls toward us.
  const moon = new THREE.DirectionalLight(C.moonlight, 2.2);
  moon.position.set(-1.3, 2.4, -0.9);
  moon.castShadow = true;
  moon.shadow.mapSize.set(512, 512);
  Object.assign(moon.shadow.camera, { left: -0.36, right: 0.36, top: 0.36, bottom: -0.36, near: 1.5, far: 4.5 });
  moon.shadow.bias = -0.0005;
  moon.shadow.normalBias = 0.003;
  moon.shadow.radius = 3;
  scene.add(moon);

  scene.add(createPlinth(THREE));
  const bearer = createBearer({ lit: true });
  scene.add(bearer.group);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
  const focus = new THREE.Vector3(0, FOCUS_Y, 0);
  function frame(w, h) {
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(HALF_H / t, HALF_W / (t * camera.aspect));
    const e = THREE.MathUtils.degToRad(ELEVATION);
    camera.position.set(0, FOCUS_Y + Math.sin(e) * dist, Math.cos(e) * dist);
    camera.lookAt(focus);
    camera.updateProjectionMatrix();
  }

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let angle = STILL_ANGLE;
  let visible = false;
  let raf = 0;
  let last = 0;

  function tick(now) {
    raf = 0;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (motion.matches) angle = STILL_ANGLE;
    else angle = (angle + dt * ((Math.PI * 2) / TURN_SECONDS)) % (Math.PI * 2);
    bearer.group.rotation.y = angle;
    renderer.render(scene, camera);
    if (visible && !motion.matches) raf = requestAnimationFrame(tick);
  }
  // Draw again (and keep turning, unless motion is reduced) while he is on screen.
  function wake() {
    if (raf || !visible) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  }

  new ResizeObserver(() => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    frame(w, h);
    wake();
  }).observe(el);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
  }, { rootMargin: '64px' }).observe(el);

  motion.addEventListener('change', wake);
}

// A small bevelled grass tile, top at y = 0, with a packed-earth road running front to back.
function createPlinth(THREE) {
  const SIZE = 0.38;
  const group = new THREE.Group();
  group.name = 'plinth';

  const rounded = (size, r) => {
    const h = size / 2;
    const s = new THREE.Shape();
    s.moveTo(-h + r, -h);
    s.lineTo(h - r, -h);
    s.quadraticCurveTo(h, -h, h, -h + r);
    s.lineTo(h, h - r);
    s.quadraticCurveTo(h, h, h - r, h);
    s.lineTo(-h + r, h);
    s.quadraticCurveTo(-h, h, -h, h - r);
    s.lineTo(-h, -h + r);
    s.quadraticCurveTo(-h, -h, -h + r, -h);
    return s;
  };
  // An extruded slab with rounded edges, lying flat, its top at y = top.
  const slab = (size, r, depth, bevel, top) =>
    new THREE.ExtrudeGeometry(rounded(size, r), {
      depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 8,
    }).rotateX(-Math.PI / 2).translate(0, top - depth - bevel, 0);

  const mat = (color, roughness) => new THREE.MeshStandardMaterial({ color, roughness });
  const earth = new THREE.Mesh(slab(SIZE - 0.012, 0.045, 0.07, 0.014, -0.018), mat(C.earthDeep, 0.85));
  const grass = new THREE.Mesh(slab(SIZE, 0.05, 0.008, 0.01, -0.003), mat(C.grass, 0.6));
  const road = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.006, SIZE).translate(0, -0.003, 0), mat(C.earth, 0.8));
  for (const m of [earth, grass, road]) {
    m.receiveShadow = true;
    group.add(m);
  }
  earth.castShadow = true;
  return group;
}
