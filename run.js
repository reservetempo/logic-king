// Lords & Logicians prototype: the run. Send walks Hob from S to Lord Gainsay at N, who
// snuffs or lights his torch, then on to the beacon at B. Reset puts everything back.
// Each run has a token: every step checks it after waiting, so a Reset mid-run leaves no
// stray Promise behind to flip a torch or light the beacon later.

import * as THREE from 'three';
import { path } from './map.js';
import { reducedMotion } from './pieces.js';

const N = 5;                 // path index of the lord's tile
const B = path.length - 1;   // path index of the road's end, under the beacon
const SPEED = 1.5;           // tiles a second (TILE = 1)
const EASE = 0.45;           // seconds to get up to speed, and to stop
const ROUND = 0.35;          // how far along the road a bend is rounded off
const STRIDE = 0.1;          // one step, for the bob
const POP = 0.1;             // each half of the reduced-motion scale pop
const GRIP = 0.07;           // Hob's hand holds the pole this far above its foot
const RAISE = 0.5;           // radians the torch tips toward the brazier

const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z); // +z faces the target, as lookAt
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const smooth = (k) => k * k * (3 - 2 * k);
const dur = (s) => (reducedMotion() ? 0 : s);

function bezier(a, c, b, t, out) {
  const u = 1 - t;
  return out.copy(a).multiplyScalar(u * u).addScaledVector(c, 2 * u * t).addScaledVector(b, t * t);
}

/**
 * Wire the run to the pieces and the page. Returns { send, reset, state }.
 * ui: { sendBtn, resetBtn, readout, status, radios }.
 */
export function createRun({ hob, lord, beacon, scene, onFrame, ui }) {
  const { sendBtn, resetBtn, readout, status, radios } = ui;
  let token = 0;
  let phase = 'idle'; // idle → running → done
  let input = null;
  let output = null;
  const live = new Set(); // cancel functions for this run's tweens and sparks

  // ---- Hob's pose ----
  let yaw = 0;
  const setYaw = (a) => { yaw = wrap(a); hob.group.rotation.set(0, yaw, 0); };

  const torch = hob.torch.group;
  const torchPos = torch.position.clone();
  const torchRot = torch.rotation.clone();
  const gripRest = new THREE.Vector3(0, GRIP, 0).applyEuler(torchRot);
  const _e = new THREE.Euler();
  const _g = new THREE.Vector3();
  /** k = 0 at rest, 1 tipped toward the brazier, pivoting at his hand, up on his toes. */
  function poseTorch(k) {
    _e.set(torchRot.x + RAISE * k, torchRot.y, torchRot.z);
    torch.rotation.copy(_e);
    _g.set(0, GRIP, 0).applyEuler(_e);
    torch.position.copy(torchPos).add(gripRest).sub(_g);
    hob.body.position.y = 0.012 * k;
  }

  // ---- frame tweens that a Reset can cancel; each resolves true at its end, false if cancelled ----
  function tween(duration, step) {
    return new Promise((resolve) => {
      if (!(duration > 0)) { step(1, 0); resolve(true); return; }
      let t = 0;
      const cancel = () => { off(); live.delete(cancel); resolve(false); };
      const off = onFrame((dt) => {
        t += dt;
        const k = Math.min(t / duration, 1);
        step(k, dt);
        if (k >= 1) { off(); live.delete(cancel); resolve(true); }
      });
      live.add(cancel);
    });
  }
  const wait = (s) => tween(s, () => {});

  function turnTo(target) {
    const from = yaw;
    const delta = wrap(target - from);
    const d = reducedMotion() ? 0 : clamp(0.4 * Math.abs(delta) / (Math.PI / 2), 0.12, 0.6);
    return tween(d, (k) => setYaw(from + delta * smooth(k)));
  }

  /** Walk path[from] → path[to] at SPEED, easing in and out, bends rounded, bobbing. */
  function walk(from, to) {
    const pts = path.slice(from, to + 1).map((p) => p.clone());
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const L = cum[cum.length - 1];
    const _p = new THREE.Vector3();
    const along = (s, out) => {
      s = clamp(s, 0, L);
      let i = 1;
      while (i < pts.length - 1 && cum[i] < s) i++;
      const seg = cum[i] - cum[i - 1];
      return out.lerpVectors(pts[i - 1], pts[i], seg > 0 ? (s - cum[i - 1]) / seg : 0);
    };
    // A small weighted average along the road rounds each bend; it is exact on straights
    // and at both ends, and stays well inside the road's 0.36 width.
    const TAPS = [[-1, 1], [-0.5, 2], [0, 3], [0.5, 2], [1, 1]];
    const at = (s, out) => {
      const r = Math.min(ROUND, s, L - s);
      out.set(0, 0, 0);
      for (const [u, w] of TAPS) out.addScaledVector(along(s + u * r, _p), w / 9);
      return out;
    };
    // trapezoid speed profile (a triangle if the leg is too short to reach full speed)
    const a = SPEED / EASE;
    let vmax = SPEED;
    let t1 = EASE;
    if (L < SPEED * EASE) { vmax = Math.sqrt(L * a); t1 = vmax / a; }
    const T = 2 * t1 + (L - vmax * t1) / vmax;
    const dist = (t) => (t <= t1 ? 0.5 * a * t * t
      : t >= T - t1 ? L - 0.5 * a * (T - t) ** 2
        : 0.5 * a * t1 * t1 + vmax * (t - t1));

    const endYaw = yawTo(pts[pts.length - 2], pts[pts.length - 1]);
    const pos = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    let sPrev = 0;
    let stride = 0;
    return tween(T, (k, dt) => {
      const s = dist(k * T);
      hob.group.position.copy(at(s, pos));
      at(Math.min(s + 0.06, L), ahead);
      const target = ahead.distanceToSquared(pos) > 1e-8 ? yawTo(pos, ahead) : endYaw;
      setYaw(yaw + wrap(target - yaw) * (1 - Math.exp(-14 * dt)));
      const ds = s - sPrev;
      sPrev = s;
      stride += (ds / STRIDE) * Math.PI;
      const f = dt > 0 ? Math.min(ds / dt / SPEED, 1) : 0;
      hob.body.position.y = Math.abs(Math.sin(stride)) * 0.012 * f;
      hob.body.rotation.z = Math.sin(stride) * 0.05 * f;
      if (k >= 1) {
        hob.group.position.copy(pts[pts.length - 1]);
        setYaw(endYaw);
        hob.body.position.y = 0;
        hob.body.rotation.z = 0;
      }
    });
  }

  /** Reduced motion: a quick scale pop out, a jump, and a pop back in (about 0.2 s). */
  async function popTo(p, faceYaw) {
    if (!(await tween(POP, (k) => hob.group.scale.setScalar(Math.max(1 - k, 0.001))))) return false;
    hob.group.position.copy(p);
    setYaw(faceYaw);
    return tween(POP, (k) => hob.group.scale.setScalar(Math.max(k, 0.001)));
  }

  // ---- sparks from Hob's torch toward the brazier (lit), or a few that fizzle (dark) ----
  const sparkGeo = new THREE.SphereGeometry(0.018, 6, 4);
  const SPARK = ['#fff4b8', '#ffb347', '#f5a623'];
  const EMBER = ['#c8662a', '#8b5a3c'];
  function sparks({ count, reach = 1, dim = false }) {
    const from = hob.torchTip();
    const to = beacon.firePoint();
    const mid = from.clone().lerp(to, 0.5);
    const group = new THREE.Group();
    scene.add(group);
    const items = [];
    for (let i = 0; i < count; i++) {
      const colors = dim ? EMBER : SPARK;
      const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({
        color: colors[i % colors.length], transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false;
      group.add(m);
      items.push({
        m,
        ctrl: mid.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.18, 0.16 + Math.random() * 0.16, (Math.random() - 0.5) * 0.18)),
        delay: i * (dim ? 0.07 : 0.04) + Math.random() * 0.03,
        life: (dim ? 0.55 : 0.5) + Math.random() * 0.2,
        size: 0.7 + Math.random() * 0.6,
      });
    }
    const total = Math.max(...items.map((s) => s.delay + s.life));
    let gone = false;
    const dispose = () => {
      if (gone) return;
      gone = true;
      live.delete(dispose);
      scene.remove(group);
      for (const s of items) s.m.material.dispose();
    };
    live.add(dispose);
    const done = tween(total, (k) => {
      const t = k * total;
      for (const s of items) {
        const u = clamp((t - s.delay) / s.life, 0, 1);
        s.m.visible = u > 0 && u < 1;
        bezier(from, s.ctrl, to, u * reach, s.m.position);
        if (dim) s.m.position.y -= 0.1 * u * u; // embers sag as they die
        s.m.material.opacity = dim ? 0.8 * (1 - u) : 0.95 * Math.min(1, (1 - u) * 4);
        s.m.scale.setScalar(s.size * (dim ? 1 - 0.75 * u : 1 - 0.3 * u));
      }
    });
    done.then(dispose);
    return { done, firstLanding: items[0].delay + items[0].life };
  }

  // ---- the page ----
  const radioLit = () => {
    const c = Array.from(radios).find((r) => r.checked);
    return !c || c.value === '1';
  };
  function setRunning(on) {
    for (const r of radios) r.disabled = on;
    // aria-disabled, not disabled, so a keyboard user's focus stays on Send
    if (on) sendBtn.setAttribute('aria-disabled', 'true');
    else sendBtn.removeAttribute('aria-disabled');
  }
  const bit = (b) => `${b} ${b ? 'lit' : 'dark'}`;
  const span = (text, className) => {
    const s = document.createElement('span');
    if (className) s.className = className;
    s.textContent = text;
    return s;
  };
  /** "In 1 lit → Lord Gainsay → Out 0 dark", one step at a time. Each step keeps its arrow,
   *  so a narrow screen wraps between steps, never inside one. */
  function showReadout(steps) {
    const parts = [`In ${bit(input)}`, 'Lord Gainsay', output === null ? null : `Out ${bit(output)}`];
    readout.replaceChildren();
    parts.slice(0, steps).filter(Boolean).forEach((text, i) => {
      const step = span('', 'step');
      if (i) {
        const arrow = span('→ ');
        arrow.setAttribute('aria-hidden', 'true');
        step.append(arrow, span('then ', 'vh'));
        readout.append(' ');
      }
      step.append(text);
      readout.append(step);
    });
  }
  function setStatus(text, kind) {
    status.textContent = text;
    status.className = kind ? `status ${kind}` : 'status';
  }
  function finish(text, kind) {
    phase = 'done';
    setStatus(text, kind);
    setRunning(false);
    sendBtn.textContent = 'Send again';
  }

  // ---- the run ----
  async function play(my) {
    const ok = (r) => r !== false && my === token;
    const lit = radioLit();
    if (hob.isLit !== lit) hob.setLit(lit);
    input = lit ? 1 : 0;
    showReadout(1);

    // S → N, then face the lord
    const faceLord = yawTo(path[N], lord.group.position);
    if (reducedMotion()) {
      if (!ok(await popTo(path[N], faceLord))) return;
    } else {
      if (!ok(await walk(0, N))) return;
      if (!ok(await turnTo(faceLord))) return;
    }
    showReadout(2);

    // the lord snuffs a lit torch or lights a dark one; Hob's torch flips at contact
    const tip = new THREE.Vector3();
    let frozen = null; // after a Reset the lord finishes his gesture at the last spot, not at S
    const target = () => (my === token ? hob.torchTip(tip) : (frozen ||= tip.clone()));
    const onContact = () => {
      if (my !== token || output !== null) return;
      output = lit ? 0 : 1;
      hob.setLit(!lit, { animate: true });
      showReadout(3);
    };
    await (lit ? lord.snuff(target, { onContact }) : lord.light(target, { onContact }));
    if (my !== token) return;
    onContact(); // no-op unless the gesture somehow never touched the torch

    // N → B, facing the beacon
    const faceBeacon = yawTo(path[B - 1], path[B]);
    if (reducedMotion()) {
      if (!ok(await wait(0.35))) return; // a still beat, so the flipped torch is seen at N
      if (!ok(await popTo(path[B], faceBeacon))) return;
    } else {
      if (!ok(await turnTo(yawTo(path[N], path[N + 1])))) return;
      if (!ok(await walk(N, B))) return;
    }

    // raise the torch toward the brazier
    if (!ok(await tween(dur(0.45), (k) => poseTorch(smooth(k))))) return;
    if (output === 1) {
      if (!reducedMotion()) {
        const burst = sparks({ count: 16 });
        if (!ok(await wait(burst.firstLanding))) return;
      }
      await beacon.setLit(true, { animate: true });
      if (my !== token) return;
      finish('The beacon burns over Contrary Keep!', 'is-win');
    } else {
      if (!reducedMotion() && !ok(await sparks({ count: 5, reach: 0.4, dim: true }).done)) return;
      if (my !== token) return;
      finish('The beacon stays dark. Try again.', 'is-fail');
    }
    if (!ok(await wait(dur(0.5)))) return;
    tween(dur(0.4), (k) => poseTorch(1 - smooth(k)));
  }

  function reset() {
    token++;
    for (const cancel of Array.from(live)) cancel();
    live.clear();
    phase = 'idle';
    input = null;
    output = null;
    hob.group.scale.setScalar(1);
    hob.group.position.copy(path[0]);
    setYaw(yawTo(path[0], path[1]));
    hob.body.position.set(0, 0, 0);
    hob.body.rotation.set(0, 0, 0);
    poseTorch(0);
    hob.setLit(radioLit());
    beacon.setLit(false);
    readout.replaceChildren();
    setStatus('');
    setRunning(false);
    sendBtn.textContent = 'Send';
  }

  function send() {
    if (phase === 'running') return;
    if (phase === 'done') reset();
    phase = 'running';
    setRunning(true);
    setStatus('');
    const my = ++token;
    play(my).catch((err) => {
      console.error('Lords & Logicians: the run failed.', err);
      if (my === token) { phase = 'done'; setRunning(false); }
    });
  }

  sendBtn.addEventListener('click', () => {
    if (sendBtn.getAttribute('aria-disabled') !== 'true') send();
  });
  resetBtn.addEventListener('click', reset);
  setYaw(yawTo(path[0], path[1]));

  return {
    send,
    reset,
    get state() {
      return {
        phase, input, output,
        readout: readout.textContent, status: status.textContent,
        hob: { position: hob.group.position.toArray(), yaw, lit: hob.isLit },
        beaconLit: beacon.isLit,
      };
    },
  };
}
