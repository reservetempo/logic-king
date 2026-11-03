// The Bearer: a monk who carries one torch, lit (1) or dark (0), and nothing else.
//
// The model only, so the design page's viewer (viewer.js) and a later game pass can share it.
// Built in the game's units: feet at y = 0, facing +z, about 0.42 tall to the top of the flame
// (the game's stone arch is 0.48 high). A glossy painted toy in the doc's "dark toy diorama"
// style: rounded, smoothly shaded pieces with a slight lacquer sheen. A small bowed hooded monk
// with short legs: rough black habit, oxblood hood, a bone-white rope girdle, ash-grey bare feet,
// and a torch high on a long pole in his right hand.
//
// createBearer({ lit }) -> { group, setLit(lit) }. Lit: a bright self-lit flame that flickers a
// little, a halo and a warm point light. Dark: a charred wick, a thread of smoke, no light.
// The flicker and smoke run off the clock while the flame or smoke is drawn, so nothing needs
// to call an update; they hold still under prefers-reduced-motion.

import * as THREE from 'three';

// Copied from the tokens in design/style.css (light values), not imported.
const C = {
  cope: '#1a1410', // the habit and sleeves
  oxblood: '#4a1414', // the hood and its cape
  ash: '#68696d', // bare feet, hands, the tip of his nose
  bone: '#efe6cf', // the rope girdle
  iron: '#3f454d', // the band at the top of the pole
  wood: '#634528', // --habit: the pole
  wick: '#33281e',
  smoke: '#776d64',
  soot: '#05070d', // the dark inside the hood
  flameCore: '#fff4b8',
  flame: '#f5a623',
  flameEdge: '#d4400f',
};

const LIGHT = 0.7; // the torch's point light when lit (candela)

const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const still = () => !!(motion && motion.matches);

// Smooth pseudo-noise in [-1, 1] for the flicker.
const wobble = (t, s) => 0.55 * Math.sin(t * 11.3 + s) + 0.3 * Math.sin(t * 17.9 + s * 2.3) + 0.15 * Math.sin(t * 29.7 + s * 0.7);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// Painted-toy materials: smooth shading and a thin coat of lacquer.
const toy = (color, extra) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.35, ...extra });
const glow = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });

function mesh(geo, material, { cast = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  return m;
}
function put(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}

// A smooth body of revolution through [radius, y] control points.
function lathe(profile, segments = 32) {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getPoints(28).map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y));
  return new THREE.LatheGeometry(pts, segments);
}

// A rounded drop, base at y = 0 and point at y = height (flames, the hood's tail).
function teardrop(radius, height, segments = 16) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(radius * Math.sin(Math.PI * Math.pow(t, 0.62)), height * t));
  }
  return new THREE.LatheGeometry(pts, segments);
}

// A tapered tube from a (radius r0) to b (radius r1), for sleeves and cords.
function tube(a, b, r0, r1, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = mesh(new THREE.CylinderGeometry(r1, r0, dir.length(), 16), material);
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  return m;
}

let haloTex = null;
function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255, 244, 184, 0.9)');
  grd.addColorStop(0.3, 'rgba(245, 166, 35, 0.4)');
  grd.addColorStop(1, 'rgba(212, 64, 15, 0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

// ---- the torch: pole, iron band, wrapped wick, flame, halo, light, smoke ----

function createTorch(seed) {
  const group = new THREE.Group(); // origin at the hand that holds it
  group.name = 'torch';
  group.add(put(mesh(new THREE.CylinderGeometry(0.0058, 0.007, 0.315, 12), toy(C.wood, { roughness: 0.7 })), 0, 0.0325, 0));
  group.add(put(mesh(new THREE.TorusGeometry(0.0082, 0.0032, 8, 20).rotateX(Math.PI / 2), toy(C.iron, { metalness: 0.5, roughness: 0.4 })), 0, 0.184, 0));
  const wickMat = new THREE.MeshStandardMaterial({ color: C.wick, roughness: 0.95, emissive: C.flameEdge, emissiveIntensity: 0 });
  group.add(put(mesh(new THREE.CapsuleGeometry(0.0115, 0.012, 6, 14), wickMat), 0, 0.2, 0));

  const FLAME_Y = 0.207; // the flame's base, inside the top of the wick
  const MID_Y = FLAME_Y + 0.02; // the flame's heart, where the light and halo sit

  const flame = put(new THREE.Group(), 0, FLAME_Y, 0);
  const layers = [[C.flameEdge, 0.022, 0.05, 0.85], [C.flame, 0.016, 0.038, 0.95], [C.flameCore, 0.0095, 0.025, 1]];
  const meshes = layers.map(([col, r, h, opacity], i) => {
    const m = mesh(teardrop(r, h), glow(col, opacity), { cast: false });
    m.renderOrder = 10 + i;
    flame.add(m);
    return m;
  });
  group.add(flame);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture(), color: C.flame, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false,
  }));
  halo.scale.setScalar(0.15);
  halo.renderOrder = 13;
  group.add(put(halo, 0, MID_Y, 0));

  // Always in the scene (toggling a light recompiles every material): dark = intensity 0.
  const light = new THREE.PointLight(C.flame, 0, 1.6, 1);
  group.add(put(light, 0, MID_Y + 0.01, 0));

  // A thread of smoke over the dead wick.
  const puffs = [0, 1, 2].map(() => {
    const p = mesh(new THREE.SphereGeometry(1, 10, 8), glow(C.smoke, 0), { cast: false });
    p.renderOrder = 9;
    group.add(p);
    return p;
  });

  // The flame's outer layer drives the flicker; the lowest puff drives the smoke.
  meshes[0].onBeforeRender = () => {
    const t = performance.now() / 1000;
    const s = still();
    const f = s ? 0 : wobble(t, seed);
    const g = s ? 0 : wobble(t * 0.8 + 3, seed + 1.7);
    flame.scale.set(1 - 0.05 * g, 1 + 0.1 * g, 1 - 0.05 * g);
    flame.rotation.z = s ? 0 : 0.06 * wobble(t * 0.6, seed + 4);
    light.intensity = LIGHT * (1 + 0.15 * f);
    halo.material.opacity = 0.85 + 0.1 * f;
  };
  puffs[0].onBeforeRender = () => {
    const t = performance.now() / 1000;
    const s = still();
    puffs.forEach((p, i) => {
      const k = s ? (i + 0.5) / puffs.length : (t * 0.35 + i / puffs.length) % 1;
      p.position.set(Math.sin(k * 4 + i) * 0.004 + k * 0.008, 0.215 + k * 0.05, 0);
      p.scale.setScalar(0.0045 + k * 0.006);
      p.material.opacity = 0.45 * Math.sin(Math.PI * k);
    });
  };

  function setLit(lit) {
    flame.visible = lit;
    halo.visible = lit;
    puffs.forEach((p) => { p.visible = !lit; });
    wickMat.emissiveIntensity = lit ? 0.85 : 0;
    light.intensity = lit ? LIGHT : 0;
  }

  return { group, setLit };
}

// ---- the Bearer ----

/**
 * The Bearer, a small bowed monk with a torch on a long pole in his right hand.
 * Feet at y = 0, facing +z, about 0.42 tall to the top of the flame.
 * @param {{ lit?: boolean }} [options]
 * @returns {{ group: THREE.Group, setLit: (lit: boolean) => void }}
 */
export function createBearer({ lit = true } = {}) {
  const group = new THREE.Group();
  group.name = 'bearer';

  const M = {
    habit: toy(C.cope, { roughness: 0.75, clearcoat: 0.35, clearcoatRoughness: 0.45 }),
    hood: toy(C.oxblood, { roughness: 0.55 }),
    ash: toy(C.ash, { roughness: 0.6, clearcoat: 0.3 }),
    rope: toy(C.bone, { roughness: 0.8, clearcoat: 0.2 }),
    soot: new THREE.MeshStandardMaterial({ color: C.soot, roughness: 1 }),
  };

  // Short legs and bare feet, the left foot a little forward in his slow walk.
  for (const [s, z] of [[-1, 0.012], [1, 0.03]]) {
    group.add(put(mesh(new THREE.CylinderGeometry(0.0105, 0.0115, 0.04, 12), M.ash), s * 0.025, 0.03, z - 0.012));
    const foot = put(mesh(new THREE.CapsuleGeometry(0.0125, 0.022, 6, 12).rotateX(Math.PI / 2), M.ash), s * 0.025, 0.0094, z);
    foot.scale.y = 0.75;
    group.add(foot);
  }

  // Everything above the feet leans a little forward: a bowed walk.
  const body = new THREE.Group();
  body.rotation.x = 0.05;
  group.add(body);

  // The habit: a rounded bell with a thick hem, a little flatter front to back.
  const habit = mesh(lathe([
    [0, 0.042], [0.05, 0.04], [0.072, 0.042], [0.078, 0.05], [0.074, 0.062],
    [0.066, 0.1], [0.058, 0.14], [0.046, 0.17], [0.026, 0.19], [0, 0.196],
  ]), M.habit);
  habit.scale.z = 0.88;
  body.add(habit);

  // The hood's cape over the shoulders.
  const cape = mesh(lathe([
    [0.064, 0.137], [0.071, 0.146], [0.063, 0.168], [0.046, 0.19], [0.022, 0.205], [0, 0.21],
  ]), M.hood);
  cape.scale.z = 0.9;
  body.add(cape);

  // The rope girdle, knotted at the front with two hanging ends.
  const girdle = put(mesh(new THREE.TorusGeometry(0.066, 0.0062, 10, 40).rotateX(Math.PI / 2), M.rope), 0, 0.105, 0);
  girdle.scale.z = 0.88;
  body.add(girdle);
  body.add(put(mesh(new THREE.SphereGeometry(0.0095, 14, 10), M.rope), 0.02, 0.103, 0.058));
  for (const [a, b] of [[V(0.021, 0.1, 0.06), V(0.027, 0.047, 0.072)], [V(0.016, 0.1, 0.06), V(0.011, 0.054, 0.07)]]) {
    body.add(tube(a, b, 0.0045, 0.004, M.rope));
    body.add(put(mesh(new THREE.SphereGeometry(0.0058, 10, 8), M.rope), b.x, b.y, b.z));
  }

  // Sleeves: the right arm raised to hold the pole, the left resting at the girdle.
  const handR = V(-0.078, 0.168, 0.054);
  const handL = V(0.044, 0.118, 0.052);
  for (const [shoulder, wrist, hand] of [
    [V(-0.044, 0.163, 0), V(-0.073, 0.166, 0.045), handR],
    [V(0.044, 0.163, 0), V(0.046, 0.123, 0.043), handL],
  ]) {
    body.add(put(mesh(new THREE.SphereGeometry(0.016, 16, 12), M.habit), shoulder.x, shoulder.y, shoulder.z));
    body.add(tube(shoulder, wrist, 0.015, 0.02, M.habit));
    body.add(put(mesh(new THREE.SphereGeometry(0.0125, 14, 10), M.ash), hand.x, hand.y, hand.z));
  }

  // The hood, bowed forward: a rounded cowl with a dark opening and a tail down the back.
  const head = put(new THREE.Group(), 0, 0.19, 0);
  head.rotation.x = 0.3;
  body.add(head);
  const hood = put(mesh(new THREE.SphereGeometry(0.05, 28, 20), M.hood), 0, 0.042, 0);
  hood.scale.set(1, 1.06, 1.08);
  const opening = put(mesh(new THREE.SphereGeometry(0.034, 24, 16), M.soot), 0, 0.036, 0.04);
  opening.scale.set(1, 1.2, 0.5);
  const rim = put(mesh(new THREE.TorusGeometry(0.034, 0.0075, 12, 32), M.hood), 0, 0.036, 0.043);
  rim.scale.y = 1.2;
  const nose = put(mesh(new THREE.SphereGeometry(0.0105, 14, 10), M.ash), 0, 0.027, 0.053);
  const tail = put(mesh(teardrop(0.022, 0.062), M.hood), 0, 0.05, -0.036);
  tail.rotation.x = -2.2;
  head.add(hood, opening, rim, nose, tail);

  // The torch, high on its pole, leaning a little outward.
  const torch = createTorch(Math.random() * 10);
  torch.group.position.copy(handR);
  torch.group.rotation.z = 0.06;
  body.add(torch.group);
  torch.setLit(lit);

  return {
    group,
    /** Light (true) or douse (false) the torch, at once. */
    setLit: (on) => torch.setLit(!!on),
  };
}
