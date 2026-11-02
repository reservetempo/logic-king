// Lords & Logicians prototype: the pieces (Hob Wickfoot, Lord Gainsay, the beacon tower).
//
// Low-poly "chess piece" figures. Each create*() returns { group, ... }; the caller places
// `group` in the scene (not in the board, which the camera fits to). Model forward is +z,
// so `group.lookAt(point)` turns a piece to face a point. Everything animated runs off
// update(dt, elapsed), which main.js calls every frame through its onFrame hook.

import * as THREE from 'three';

const C = {
  flameCore: '#fff4b8',
  flame: '#f5a623',
  flameEdge: '#d4400f',
  wick: '#4a3d31',
  smoke: '#8b8178',
  rubric: '#9e1b16',
  skin: '#e2b48c',
  wool: '#b9a47a',
  silver: '#b9bcc2',
  madder: '#a8322a',
  ink: '#2b1d0e',
  torchLight: '#ffb35c',
  beaconLight: '#ffa040',
};

const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
/** True when the visitor asked for reduced motion (checked live, so a change applies at once). */
export const reducedMotion = () => !!(motion && motion.matches);

// ---- per-frame tickers and tweens ----

const tickers = new Set();

/** Advance flicker, smoke, tweens and gestures. main.js calls this every frame. */
export function update(dt, elapsed) {
  for (const fn of Array.from(tickers)) fn(dt, elapsed);
}

/** Calls step(k, seconds) each frame with k going 0 → 1 over `duration` seconds; resolves at
 *  the end, or early if step returns false. */
function tween(duration, step) {
  return new Promise((resolve, reject) => {
    let t = 0;
    const tick = (dt) => {
      try {
        t += dt;
        const k = duration > 0 ? Math.min(t / duration, 1) : 1;
        if (step(k, t) === false || k >= 1) {
          tickers.delete(tick);
          resolve();
        }
      } catch (err) {
        tickers.delete(tick);
        reject(err);
      }
    };
    tickers.add(tick);
  });
}

const smooth = (k) => k * k * (3 - 2 * k);
const seg = (t, a, b) => smooth(THREE.MathUtils.clamp((t - a) / (b - a), 0, 1));
const pulse = (t, at, len) => (t > at && t < at + len ? Math.sin((Math.PI * (t - at)) / len) : 0);
// Smooth pseudo-noise in [-1, 1] for flicker.
const wobble = (t, s) => 0.55 * Math.sin(t * 11.3 + s) + 0.3 * Math.sin(t * 17.9 + s * 2.3) + 0.15 * Math.sin(t * 29.7 + s * 0.7);

function safeCall(fn) {
  if (typeof fn !== 'function') return;
  try { fn(); } catch (err) { console.error('Lords & Logicians: onContact failed.', err); }
}

// ---- small builders ----

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const mat = (color, extra) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...extra });
const glow = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

function mesh(geo, material, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
function put(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}

// A limb: a unit cylinder along y, stretched between two points by setLimb().
const limb = (radius, material) => mesh(new THREE.CylinderGeometry(radius, radius, 1, 6), material);
const _limb = new THREE.Vector3();
function setLimb(m, a, b) {
  _limb.subVectors(b, a);
  const len = _limb.length() || 1e-6;
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, _limb.divideScalar(len));
  m.scale.set(1, len, 1);
}

function toVec3(p) {
  if (!p) return null;
  return p.isVector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z);
}

let haloTex = null;
function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255, 228, 160, 1)');
  grd.addColorStop(0.35, 'rgba(245, 166, 35, 0.45)');
  grd.addColorStop(1, 'rgba(212, 64, 15, 0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

// ---- fire: a layered flame plus a warm point light, with a 0..1 "level" ----

function createFire({ radius, height, intensity, distance, lightY, seed = 0, tongues = 0, color }) {
  const root = new THREE.Group(); // sits at the flame's base
  const flame = new THREE.Group(); // scaled by level and flicker
  root.add(flame);
  const layers = [[C.flameEdge, 1, 1, 0.82], [C.flame, 0.68, 0.74, 0.92], [C.flameCore, 0.38, 0.46, 1]];
  layers.forEach(([col, r, h, opacity], i) => {
    const geo = new THREE.ConeGeometry(radius * r, height * h, 7).translate(0, (height * h) / 2, 0);
    const m = new THREE.Mesh(geo, glow(col, opacity));
    m.renderOrder = 10 + i;
    flame.add(m);
  });
  const tongueMeshes = [];
  for (let i = 0; i < tongues; i++) {
    const a = (i / tongues) * Math.PI * 2 + seed;
    const geo = new THREE.ConeGeometry(radius * 0.36, height * 0.5, 5).translate(0, height * 0.25, 0);
    const m = new THREE.Mesh(geo, glow(i % 2 ? C.flameEdge : C.flame, 0.9));
    m.position.set(Math.sin(a) * radius * 0.6, 0, Math.cos(a) * radius * 0.6);
    m.rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
    m.renderOrder = 10;
    flame.add(m);
    tongueMeshes.push(m);
  }
  // Always in the scene (toggling a light's visibility recompiles every material): dark = 0.
  const light = new THREE.PointLight(color, 0, distance, 1);
  light.castShadow = false;
  light.position.y = lightY;
  root.add(light);

  let level = 0;
  let lit = false;
  let fadeId = 0;
  const listeners = [];

  tickers.add((dt, t) => {
    const still = reducedMotion();
    const f = still ? 0 : wobble(t, seed);
    const g = still ? 0 : wobble(t * 0.8 + 3, seed + 1.7);
    flame.visible = level > 0.002;
    flame.scale.set(level * (1 - 0.04 * g), level * (1 + 0.09 * g), level * (1 - 0.04 * g));
    flame.rotation.z = still ? 0 : 0.05 * wobble(t * 0.6, seed + 4);
    tongueMeshes.forEach((m, i) => { m.scale.y = still ? 1 : 1 + 0.25 * wobble(t * 1.3, seed + i * 2.1); });
    light.intensity = intensity * level * (1 + 0.15 * f);
    for (const fn of listeners) fn(level, t, still);
  });

  return {
    root,
    light,
    get level() { return level; },
    get isLit() { return lit; },
    onLevel(fn) { listeners.push(fn); },
    setLit(on, { animate = false } = {}) {
      lit = !!on;
      const to = lit ? 1 : 0;
      const from = level;
      const id = ++fadeId;
      if (!animate || from === to) {
        level = to;
        return Promise.resolve();
      }
      const duration = (reducedMotion() ? 0.2 : 0.5) * Math.max(Math.abs(to - from), 0.2);
      return tween(duration, (k) => {
        if (id !== fadeId) return false; // superseded by a newer setLit
        level = from + (to - from) * smooth(k);
      });
    },
  };
}

// ---- the torch: pole, wrapped head, fire, and a wisp of smoke when dark ----

function createTorch({ pole = 0.25, seed = 0 } = {}) {
  const group = new THREE.Group(); // origin at the pole's foot
  group.name = 'torch';
  group.add(mesh(new THREE.CylinderGeometry(0.0065, 0.008, pole, 5).translate(0, pole / 2, 0), mat('#6b4a2b')));
  const headMat = mat(C.wick, { emissive: C.flameEdge, emissiveIntensity: 0 });
  group.add(put(mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.03, 6), headMat), 0, pole + 0.005, 0));

  const fire = createFire({
    radius: 0.021, height: 0.048, intensity: 1.4, distance: 2.6, lightY: 0.03, seed, color: C.torchLight,
  });
  fire.root.position.y = pole + 0.018;
  group.add(fire.root);

  const tip = new THREE.Object3D(); // the flame's centre
  tip.position.y = pole + 0.038;
  group.add(tip);

  const puffs = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), glow(C.smoke, 0));
    p.renderOrder = 9;
    p.visible = false;
    group.add(p);
    puffs.push(p);
  }
  fire.onLevel((level, t, still) => {
    headMat.emissiveIntensity = 0.9 * level;
    const dark = 1 - level;
    puffs.forEach((p, i) => {
      const ph = still ? (i + 0.5) / puffs.length : (t * 0.5 + i / puffs.length) % 1;
      p.visible = dark > 0.01;
      p.position.set(Math.sin(ph * 5 + i * 1.7) * 0.004 + ph * 0.006, pole + 0.025 + ph * 0.04, ph * 0.003);
      p.scale.setScalar(0.004 + ph * 0.005);
      p.material.opacity = 0.55 * Math.sin(Math.PI * ph) * dark;
    });
  });

  return { group, fire, tip };
}

// ---- Hob Wickfoot, the torchbearer ----

/**
 * Hob: small and round, undyed wool tunic, rope belt, bound feet, patched hood, and a torch
 * on a long pole held up in his right hand. About 0.42 tall with the flame at full flicker,
 * so he fits under the gatehouse arch. `body` is the part to bob when he walks.
 */
export function createHob({ hood = C.madder, lit = true } = {}) {
  const group = new THREE.Group();
  group.name = 'hobWickfoot';
  const body = new THREE.Group();
  group.add(body);

  const M = {
    wool: mat(C.wool),
    hood: mat(hood, { side: THREE.DoubleSide }),
    patchDark: mat(new THREE.Color(hood).multiplyScalar(0.62)),
    patchWool: mat('#cdbb8f'),
    rope: mat('#8a6d43'),
    skin: mat(C.skin),
    wrap: mat('#8d7b5a'),
    eye: mat(C.ink),
  };

  for (const s of [-1, 1]) {
    body.add(put(mesh(new THREE.BoxGeometry(0.032, 0.02, 0.046), M.wrap), s * 0.03, 0.01, 0.008)); // bound foot
    body.add(put(mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.04, 6), M.wrap), s * 0.03, 0.035, 0)); // leg
  }
  const tunic = put(mesh(new THREE.SphereGeometry(0.076, 9, 7), M.wool), 0, 0.108, 0);
  tunic.scale.set(1, 0.95, 0.92);
  const belt = put(mesh(new THREE.TorusGeometry(0.071, 0.008, 4, 12).rotateX(Math.PI / 2), M.rope), 0, 0.098, 0);
  belt.scale.set(1, 1, 0.92);
  const capelet = put(mesh(new THREE.ConeGeometry(0.07, 0.07, 9), M.hood), 0, 0.19, 0);
  const head = put(mesh(new THREE.SphereGeometry(0.046, 10, 8), M.skin), 0, 0.232, 0);
  // Hood: a sphere cap open at the front so the face shows.
  const hoodMesh = put(mesh(new THREE.SphereGeometry(0.054, 10, 7, Math.PI / 2 + 1, Math.PI * 2 - 2, 0, Math.PI * 0.6), M.hood), 0, 0.236, -0.004);
  const tail = put(mesh(new THREE.ConeGeometry(0.018, 0.06, 5), M.hood), 0, 0.236, -0.074);
  tail.rotation.x = (-2 * Math.PI) / 3; // the hood's tail hangs back and down
  body.add(tunic, belt, capelet, head, hoodMesh, tail);
  for (const s of [-1, 1]) body.add(put(mesh(new THREE.SphereGeometry(0.0065, 5, 4), M.eye), s * 0.016, 0.238, 0.042));
  body.add(put(mesh(new THREE.SphereGeometry(0.008, 5, 4), M.skin), 0, 0.226, 0.047)); // nose

  // Patches sewn on the hood.
  const hoodCentre = V(0, 0.236, -0.004);
  [[V(0.8, 0.45, -0.3), M.patchWool], [V(-0.75, 0.35, -0.45), M.patchDark]].forEach(([n, m]) => {
    n.normalize();
    const patch = mesh(new THREE.BoxGeometry(0.024, 0.022, 0.006), m);
    patch.position.copy(hoodCentre).addScaledVector(n, 0.054);
    patch.lookAt(patch.position.clone().add(n));
    body.add(patch);
  });

  // Arms: left hangs, right holds the torch pole up.
  const armL = limb(0.013, M.wool);
  setLimb(armL, V(0.06, 0.155, 0.005), V(0.08, 0.1, 0.02));
  const handPos = V(-0.088, 0.17, 0.04);
  const armR = limb(0.013, M.wool);
  setLimb(armR, V(-0.058, 0.155, 0.01), handPos);
  body.add(armL, armR,
    put(mesh(new THREE.SphereGeometry(0.013, 6, 5), M.skin), 0.08, 0.1, 0.02),
    put(mesh(new THREE.SphereGeometry(0.014, 6, 5), M.skin), handPos.x, handPos.y, handPos.z));

  const torch = createTorch({ pole: 0.25, seed: Math.random() * 10 });
  torch.group.position.set(handPos.x, 0.1, handPos.z);
  torch.group.rotation.z = 0.08; // leans a little outward
  body.add(torch.group);
  torch.fire.setLit(lit);

  return {
    group,
    body,
    torch,
    get isLit() { return torch.fire.isLit; },
    /** Light or douse the torch. Returns a Promise that resolves when the fade ends. */
    setLit: (on, opts) => torch.fire.setLit(on, opts),
    /** World position of the flame's centre (into `target` if given). */
    torchTip: (target = new THREE.Vector3()) => torch.tip.getWorldPosition(target),
  };
}

// ---- Lord Gainsay, the NOT gate ----

/**
 * Lord Gainsay: tall and gaunt, black cone cloak with a rubric-red lining showing at the
 * front, white ruff (triangle plus bubble: the NOT symbol), pale face, pointed beard, a long
 * silver snuffer in his right hand and a flint in his left. About 0.64 tall (0.66 with the
 * snuffer up).
 */
export function createLord() {
  const group = new THREE.Group();
  group.name = 'lordGainsay';
  const lean = new THREE.Group(); // pivots at his feet for the lean
  group.add(lean);

  const M = {
    cloak: mat('#141217'),
    lining: mat(C.rubric),
    ruff: mat('#f3efe4'),
    face: mat('#efd8c2'),
    beard: mat('#2c2622'),
    silver: mat(C.silver, { metalness: 0.35, roughness: 0.45, side: THREE.DoubleSide }),
    flint: mat('#5f5a55'),
    eye: mat(C.ink),
  };

  const CLOAK_H = 0.56;
  const CLOAK_R = 0.14;
  const GAP = 0.85; // radians open at the front, where the red lining shows
  lean.add(
    mesh(new THREE.ConeGeometry(CLOAK_R, CLOAK_H, 9, 1, true, GAP / 2, Math.PI * 2 - GAP).translate(0, CLOAK_H / 2, 0), M.cloak),
    mesh(new THREE.ConeGeometry(CLOAK_R * 0.9, CLOAK_H * 0.92, 9).translate(0, CLOAK_H * 0.46, 0), M.lining),
    put(mesh(new THREE.TorusGeometry(0.044, 0.019, 5, 14).rotateX(Math.PI / 2), M.ruff), 0, 0.5, 0),
  );
  const head = put(mesh(new THREE.SphereGeometry(0.047, 10, 8), M.face), 0, 0.565, 0);
  head.scale.set(0.92, 1.15, 0.95);
  const cap = put(mesh(new THREE.SphereGeometry(0.05, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.4), M.cloak), 0, 0.568, -0.004);
  cap.scale.set(0.92, 1.15, 0.95);
  const beard = put(mesh(new THREE.ConeGeometry(0.02, 0.07, 6), M.beard), 0, 0.515, 0.045);
  beard.rotation.x = Math.PI - 0.55; // points down and forward over the ruff
  lean.add(head, cap, beard);
  for (const s of [-1, 1]) lean.add(put(mesh(new THREE.SphereGeometry(0.006, 5, 4), M.eye), s * 0.017, 0.575, 0.041));

  // Arms: sleeves stretched from the shoulders to the hands each frame of a gesture.
  const SHOULDER_R = V(-0.042, 0.45, 0.012);
  const SHOULDER_L = V(0.042, 0.45, 0.012);
  const REST_GRIP_R = V(-0.1, 0.31, 0.07);
  const REST_HAND_L = V(0.09, 0.32, 0.075);
  const armR = limb(0.014, M.cloak);
  const armL = limb(0.014, M.cloak);
  const handR = mesh(new THREE.SphereGeometry(0.015, 6, 5), M.face);
  const handL = new THREE.Group();
  handL.add(mesh(new THREE.SphereGeometry(0.015, 6, 5), M.face),
    put(mesh(new THREE.IcosahedronGeometry(0.013, 0), M.flint), 0.008, 0.012, 0.01));
  lean.add(armR, armL, handR, handL);

  // Snuffer: in its own frame the rod runs along +z from the grip, the bell hangs at the far
  // end with its mouth facing -y. At rest it is held upright like a staff.
  const L = 0.32;
  const BUTT = 0.1;
  const snuffer = new THREE.Group();
  snuffer.add(
    put(mesh(new THREE.CylinderGeometry(0.0045, 0.0045, L + BUTT, 5).rotateX(Math.PI / 2), M.silver), 0, 0, (L - BUTT) / 2),
    put(mesh(new THREE.ConeGeometry(0.022, 0.04, 8, 1, true), M.silver), 0, -0.016, L),
    put(mesh(new THREE.SphereGeometry(0.008, 6, 4), M.silver), 0, 0, -BUTT),
  );
  lean.add(snuffer);
  const Q_REST = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2);
  const BELL_DROP = 0.041; // rod end above the target, so the bell's mouth sits on the flame
  const HOVER = 0.08;

  const sparks = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.007, 0), glow(i % 2 ? C.flame : C.flameCore));
    m.visible = false;
    m.renderOrder = 12;
    group.add(m);
    sparks.push({ mesh: m, a: new THREE.Vector3(), b: new THREE.Vector3(), t0: 0, dur: 0.2, arc: 0.03, active: false });
  }

  const _p = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _aim = new THREE.Vector3();
  const _reach = new THREE.Vector3();
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();

  function rest() {
    lean.rotation.x = 0;
    snuffer.position.copy(REST_GRIP_R);
    snuffer.quaternion.copy(Q_REST);
    handR.position.copy(REST_GRIP_R);
    handL.position.copy(REST_HAND_L);
    setLimb(armR, SHOULDER_R, REST_GRIP_R);
    setLimb(armL, SHOULDER_L, REST_HAND_L);
    for (const s of sparks) { s.active = false; s.mesh.visible = false; }
  }
  rest();

  // w: 0 rest → 1 aimed; c: 0 hovering → 1 bell on the flame; k: lean amount.
  function poseSnuffer(target, w, c, k) {
    lean.rotation.x = 0.13 * k;
    lean.updateWorldMatrix(true, false);
    _p.copy(target);
    _p.y += BELL_DROP + HOVER * (1 - c);
    lean.worldToLocal(_p);
    _dir.set(_p.x, 0, _p.z).normalize();
    _dir.y = 0.28;
    _dir.normalize();
    _aim.copy(_p).addScaledVector(_dir, -L);
    _q.setFromRotationMatrix(_m4.lookAt(_p, _aim, UP));
    snuffer.position.lerpVectors(REST_GRIP_R, _aim, w);
    snuffer.quaternion.slerpQuaternions(Q_REST, _q, w);
    handR.position.copy(snuffer.position);
    setLimb(armR, SHOULDER_R, snuffer.position);
  }

  function poseFlint(target, w, k, jolt) {
    lean.rotation.x = 0.08 * k;
    lean.updateWorldMatrix(true, false);
    _p.copy(target);
    lean.worldToLocal(_p);
    _dir.set(_p.x, 0, _p.z).normalize();
    _aim.copy(_p).addScaledVector(_dir, -0.1);
    _aim.y -= 0.015;
    _reach.subVectors(_aim, SHOULDER_L);
    if (_reach.length() > 0.26) _aim.copy(SHOULDER_L).addScaledVector(_reach.normalize(), 0.26);
    handL.position.lerpVectors(REST_HAND_L, _aim, w);
    handL.position.y -= jolt;
    setLimb(armL, SHOULDER_L, handL.position);
  }

  function throwSparks(from, to, count, t0) {
    group.updateWorldMatrix(true, false);
    const thrown = [];
    for (const s of sparks) {
      if (thrown.length >= count) break;
      if (s.active && t0 < s.t0 + s.dur) continue;
      s.a.copy(from);
      group.worldToLocal(s.a);
      s.b.copy(to);
      group.worldToLocal(s.b);
      s.b.lerpVectors(s.a, s.b, 0.75 + Math.random() * 0.3);
      s.b.x += (Math.random() - 0.5) * 0.04;
      s.b.y += (Math.random() - 0.5) * 0.03;
      s.b.z += (Math.random() - 0.5) * 0.04;
      s.t0 = t0 + Math.random() * 0.04;
      s.dur = 0.16 + Math.random() * 0.1;
      s.arc = 0.02 + Math.random() * 0.03;
      s.active = true;
      thrown.push(s);
    }
    return thrown;
  }
  function moveSparks(t) {
    for (const s of sparks) {
      const k = (t - s.t0) / s.dur;
      s.mesh.visible = s.active && k >= 0 && k <= 1;
      if (!s.mesh.visible) continue;
      s.mesh.position.lerpVectors(s.a, s.b, k);
      s.mesh.position.y += s.arc * 4 * k * (1 - k) - 0.02 * k * k;
      s.mesh.scale.setScalar(1 - 0.6 * k);
    }
  }

  function targetFn(target) {
    if (typeof target === 'function') {
      const v = new THREE.Vector3(); // reused every frame, not reallocated
      return () => { const p = target(); return p ? v.set(p.x, p.y, p.z) : null; };
    }
    const fixed = toVec3(target) || group.localToWorld(V(0, 0.42, 0.38));
    return () => fixed;
  }
  function contactOf(opts) {
    return typeof opts === 'function' ? opts : opts && opts.onContact;
  }

  let queue = Promise.resolve();
  function enqueue(run) {
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return p;
  }

  function snuffGesture(target, onContact) {
    let touched = false;
    const touch = () => { if (!touched) { touched = true; safeCall(onContact); } };
    if (reducedMotion()) {
      return tween(0.45, (k, t) => {
        if (t < 0.4) { poseSnuffer(target(), 1, 1, 0); touch(); } else rest();
      }).finally(rest);
    }
    return tween(1.7, (k, t) => {
      const w = t < 1.15 ? seg(t, 0, 0.55) : 1 - seg(t, 1.15, 1.7);
      const c = t < 1.0 ? seg(t, 0.55, 0.8) : 1 - seg(t, 1.0, 1.15);
      poseSnuffer(target(), w, c, w);
      if (t >= 0.8) touch();
    }).finally(() => { touch(); rest(); });
  }

  function lightGesture(target, onContact) {
    let touched = false;
    const touch = () => { if (!touched) { touched = true; safeCall(onContact); } };
    const strikes = [0.55, 0.78];
    let struck = 0;
    let still = [];
    if (reducedMotion()) {
      return tween(0.45, (k, t) => {
        if (t < 0.35) {
          const p = target();
          poseFlint(p, 1, 0, 0);
          if (!touched) {
            handL.updateWorldMatrix(true, false);
            still = throwSparks(handL.getWorldPosition(new THREE.Vector3()), p, 5, 0); // shown still, not thrown
            touch();
          }
          for (const s of still) {
            s.mesh.visible = true;
            s.mesh.position.copy(s.b);
            s.mesh.scale.setScalar(0.8);
          }
        } else rest();
      }).finally(rest);
    }
    return tween(1.6, (k, t) => {
      const p = target();
      const w = t < 1.1 ? seg(t, 0, 0.5) : 1 - seg(t, 1.1, 1.6);
      const jolt = 0.02 * (pulse(t, strikes[0], 0.09) + pulse(t, strikes[1], 0.09));
      poseFlint(p, w, w, jolt);
      if (struck < strikes.length && t >= strikes[struck]) {
        handL.updateWorldMatrix(true, false);
        throwSparks(handL.getWorldPosition(new THREE.Vector3()), p, 6, t);
        struck++;
      }
      moveSparks(t);
      if (t >= 0.98) touch();
    }).finally(() => { touch(); rest(); });
  }

  return {
    group,
    /**
     * Lean in and bring the snuffer down onto the flame at `target` (a world Vector3, or a
     * function returning one each frame), then back up. onContact (`{ onContact }` or a
     * function as the second argument) fires once, when the bell covers the flame (about
     * 0.8 s in); the Promise resolves when he is back at rest (1.7 s). Gestures queue.
     */
    snuff: (target, opts) => enqueue(() => snuffGesture(targetFn(target), contactOf(opts))),
    /**
     * Raise the flint and strike sparks at the torch at `target`, then lower it. onContact
     * fires once, when the second burst of sparks lands (about 1 s in); the Promise
     * resolves when he is back at rest (1.6 s).
     */
    light: (target, opts) => enqueue(() => lightGesture(targetFn(target), contactOf(opts))),
  };
}

// ---- the beacon tower on B ----

/**
 * A stone tower with an iron brazier on top. Origin at the tower's foot; its door faces +z,
 * so `group.lookAt(roadEnd)` turns the door to the road. Starts dark (cold coals).
 * `bounds` is a hidden box covering the tower and its full flame, for the camera fit.
 */
export function createBeacon() {
  const group = new THREE.Group();
  group.name = 'beacon';
  const M = {
    stone: mat('#8f8b83'),
    stoneDark: mat('#77736c'),
    iron: mat('#2e2925', { roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide }),
    dark: mat('#1c1713'),
    coals: mat('#3a3430', { roughness: 1, emissive: C.flameEdge, emissiveIntensity: 0 }),
  };
  const oct = (rTop, rBot, h, y, m) =>
    put(mesh(new THREE.CylinderGeometry(rTop, rBot, h, 8).rotateY(Math.PI / 8), m, { receive: true }), 0, y, 0);

  group.add(
    oct(0.14, 0.17, 0.8, 0.4, M.stone),
    oct(0.163, 0.165, 0.025, 0.36, M.stoneDark),
    oct(0.175, 0.14, 0.06, 0.8, M.stoneDark),
    put(mesh(new THREE.BoxGeometry(0.075, 0.13, 0.012), M.dark), 0, 0.065, 0.167), // door, toward the road
    put(mesh(new THREE.BoxGeometry(0.012, 0.07, 0.016), M.dark), 0.155, 0.56, 0), // arrow slit
    put(mesh(new THREE.BoxGeometry(0.016, 0.07, 0.012), M.dark), 0, 0.6, 0.145),
  );
  // Brazier: stem, open bowl, bottom, rim; coals inside.
  group.add(
    put(mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.05, 8), M.iron), 0, 0.855, 0),
    put(mesh(new THREE.CylinderGeometry(0.15, 0.085, 0.1, 8, 1, true), M.iron), 0, 0.93, 0),
    put(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 8), M.iron), 0, 0.885, 0),
    put(mesh(new THREE.TorusGeometry(0.15, 0.012, 4, 8).rotateX(Math.PI / 2), M.iron), 0, 0.98, 0),
    put(mesh(new THREE.CylinderGeometry(0.115, 0.1, 0.03, 8), M.coals), 0, 0.93, 0),
  );
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.3;
    const r = i === 5 ? 0 : 0.065;
    const lump = put(mesh(new THREE.IcosahedronGeometry(0.035, 0), M.coals), Math.sin(a) * r, 0.952 + (i % 2) * 0.008, Math.cos(a) * r);
    lump.rotation.set(a, a * 2, 0);
    group.add(lump);
  }

  const fire = createFire({
    radius: 0.12, height: 0.36, intensity: 5, distance: 8, lightY: 0.18, seed: 2.3, tongues: 4, color: C.beaconLight,
  });
  fire.root.position.y = 0.95;
  group.add(fire.root);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0,
  }));
  halo.scale.setScalar(1.2);
  halo.position.y = 1.12;
  halo.visible = false;
  group.add(halo);
  fire.onLevel((level) => {
    M.coals.emissiveIntensity = 1.4 * level;
    halo.material.opacity = 0.45 * level;
    halo.visible = level > 0.01;
  });

  const bounds = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, 0.4).translate(0, 0.7, 0));
  bounds.visible = false;
  group.add(bounds);

  return {
    group,
    bounds,
    get isLit() { return fire.isLit; },
    /** Light or put out the beacon. Returns a Promise that resolves when the fade ends. */
    setLit: (on, opts) => fire.setLit(on, opts),
    /** World position of the brazier's coals (into `target` if given). */
    firePoint: (target = new THREE.Vector3()) => fire.root.getWorldPosition(target),
  };
}
