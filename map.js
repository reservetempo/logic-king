// Lords & Logicians prototype: the board as data, and the meshes built from it.
//
// World axes: +x = map column (east), +z = map row (south), +y = up.
// Tiles are TILE apart, the board is centred on the origin, tile tops sit at TILE_TOP
// and the road surface at ROAD_Y.

import * as THREE from 'three';

// .  grass        #  road        t  decor (tree or rock)
// S  start: Hob's village end of the road
// N  Lord Gainsay's tile: road with his gatehouse beside it
// B  beacon tower at the road's end
// Rows run north (top) to south; the camera looks from the south, so they read top to
// bottom on screen as written here.
export const MAP = [
  '.t.S..',
  '...#.t',
  '.###..',
  '.#..t.',
  '.#....',
  '.N##.t',
  't..#..',
  '.t.#..',
  '...##.',
  '.t..#.',
  '...B#.',
  't....t',
  '..t...',
];

export const TILE = 1;             // tile pitch, centre to centre (world units)
export const TILE_HEIGHT = 0.34;   // height of one tile block
export const TILE_TOP = 0;         // y of the tiles' top faces (grass level)
const GAP = 0.06;                  // gap between neighbouring blocks
const BLOCK = TILE - GAP;
const BEVEL = 0.045;
const ROAD_WIDTH = 0.36;
const ROAD_THICK = 0.025;
const ROAD_LIFT = 0.002;
export const ROAD_Y = TILE_TOP + ROAD_LIFT + ROAD_THICK; // y of the road surface

const ROWS = MAP.length;
const COLS = MAP[0].length;
const ROAD_CHARS = new Set(['#', 'S', 'N', 'B']);
const STEPS = [
  { dr: -1, dc: 0 }, // north
  { dr: 0, dc: 1 },  // east
  { dr: 1, dc: 0 },  // south
  { dr: 0, dc: -1 }, // west
];
// direction the camera looks from (due south, see main.js); used to pick sides facing the viewer
const VIEW_SIDE = new THREE.Vector3(0, 0, 1);

const charAt = (row, col) => (MAP[row] && MAP[row][col]) || '';
const isRoad = (row, col) => ROAD_CHARS.has(charAt(row, col));
const roadLinks = (row, col) => STEPS.filter((s) => isRoad(row + s.dr, col + s.dc));
const stepVec = (from, to) => new THREE.Vector3(to.col - from.col, 0, to.row - from.row);

/** World position of a tile's centre (on the road surface unless another y is given). */
export function tileCenter(row, col, y = ROAD_Y) {
  return new THREE.Vector3((col - (COLS - 1) / 2) * TILE, y, (row - (ROWS - 1) / 2) * TILE);
}

function find(ch) {
  for (let row = 0; row < ROWS; row++) {
    const col = MAP[row].indexOf(ch);
    if (col !== -1) return { row, col };
  }
  throw new Error(`map.js: no '${ch}' on the map`);
}

// Follow road neighbours from S until B; the road must not fork or break.
function traceRoad() {
  const start = find('S');
  const tiles = [start];
  const seen = new Set([`${start.row},${start.col}`]);
  let cur = start;
  while (charAt(cur.row, cur.col) !== 'B') {
    const next = roadLinks(cur.row, cur.col)
      .map((s) => ({ row: cur.row + s.dr, col: cur.col + s.dc }))
      .filter((t) => !seen.has(`${t.row},${t.col}`));
    if (next.length !== 1) {
      throw new Error(`map.js: the road ${next.length ? 'forks' : 'breaks'} at row ${cur.row}, col ${cur.col}`);
    }
    cur = next[0];
    seen.add(`${cur.row},${cur.col}`);
    tiles.push(cur);
  }
  if (!tiles.some((t) => charAt(t.row, t.col) === 'N')) throw new Error("map.js: the road doesn't pass N");
  return tiles;
}

const ROAD_TILES = traceRoad();

/** Road tiles in walking order, S first, B last: [{ row, col }]. */
export const pathTiles = ROAD_TILES.map(({ row, col }) => ({ row, col }));

/** Road-surface tile centres from S to B (world Vector3s; clone before mutating). */
export const path = ROAD_TILES.map(({ row, col }) => tileCenter(row, col));

function tileInfo(ch) {
  const { row, col } = find(ch);
  return { row, col, index: pathTiles.findIndex((t) => t.row === row && t.col === col), position: tileCenter(row, col) };
}

/** S, N and B: { row, col, index (in path), position (road-surface centre) }. */
export const startTile = tileInfo('S');
export const lordTile = tileInfo('N');
export const beaconTile = tileInfo('B');

// Lord Gainsay's tile: the road comes in from S's side and goes out towards B.
const lordIn = stepVec(ROAD_TILES[lordTile.index], ROAD_TILES[lordTile.index - 1]);
const lordOut = stepVec(ROAD_TILES[lordTile.index], ROAD_TILES[lordTile.index + 1]);
const lordIsCorner = Math.abs(lordIn.dot(lordOut)) < 1e-6;

/**
 * The free side of the road on N (unit vector, horizontal). On a bend it points away from
 * the incoming leg, beside the outgoing one; the gatehouse fills the inside of the bend.
 * On this map: (0, 0, 1), south of the road where it leaves N eastwards (the camera's side).
 */
export const lordFreeSide = lordIsCorner
  ? lordIn.clone().negate()
  : new THREE.Vector3(lordOut.z, 0, -lordOut.x).multiplyScalar(
      new THREE.Vector3(lordOut.z, 0, -lordOut.x).dot(VIEW_SIDE) >= 0 ? 1 : -1);

/** Where the lord stands: on the grass beside the road on N, clear of the strip (y = TILE_TOP). */
export const lordSpot = tileCenter(lordTile.row, lordTile.col, TILE_TOP)
  .addScaledVector(lordFreeSide, 0.31)
  .addScaledVector(lordOut, lordIsCorner ? 0.24 : 0);

// ---------------------------------------------------------------------------------------
// Meshes

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A bevelled block, top face at y = 0, with two material groups: 0 = top + top chamfer, 1 = the rest.
function bevelledBlock(size, height, bevel) {
  const s = size / 2 - bevel;
  const shape = new THREE.Shape([
    new THREE.Vector2(-s, -s), new THREE.Vector2(s, -s), new THREE.Vector2(s, s), new THREE.Vector2(-s, s),
  ]);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 1, curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);           // extrude along +y
  geo.translate(0, -(height - bevel), 0); // top face at y = 0

  const pos = geo.getAttribute('position').array;
  const nor = geo.getAttribute('normal').array;
  const top = { p: [], n: [] };
  const rest = { p: [], n: [] };
  for (let i = 0; i < pos.length; i += 9) {
    const ny = (nor[i + 1] + nor[i + 4] + nor[i + 7]) / 3;
    const dst = ny > 0.5 ? top : rest;
    for (let k = 0; k < 9; k++) { dst.p.push(pos[i + k]); dst.n.push(nor[i + k]); }
  }
  geo.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(top.p.concat(rest.p), 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(top.n.concat(rest.n), 3));
  out.addGroup(0, top.p.length / 3, 0);
  out.addGroup(top.p.length / 3, rest.p.length / 3, 1);
  return out;
}

// Triangular prism (a roof), ridge along x, base at y = 0.
function prism(width, height, length) {
  const shape = new THREE.Shape([
    new THREE.Vector2(-width / 2, 0), new THREE.Vector2(width / 2, 0), new THREE.Vector2(0, height),
  ]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geo.translate(0, 0, -length / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

// Turn an object about y so its local +z points along `dir` (horizontal).
function face(obj, dir) {
  obj.rotation.y = Math.atan2(dir.x, dir.z);
  return obj;
}

function makeMesh(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function at(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}

/**
 * Build the board: tiles, road strips, start hut, Lord Gainsay's gatehouse, the beacon
 * placeholder (group 'beaconPlaceholder') and decor. Returns a THREE.Group named 'board'.
 */
export function buildBoard() {
  const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, ...extra });
  const flat = (color, extra) => std(color, { flatShading: true, ...extra });
  const M = {
    grass: ['#5b6838', '#535f35', '#646d3e'].map((c) => std(c)),
    earth: std('#57412f'),
    road: std('#a3845a'),
    stone: flat('#8f8b83'),
    stoneDark: flat('#6d6a64'),
    daub: flat('#9c8665'),
    thatch: flat('#806b3b'),
    timber: flat('#4f3824'),
    window: std('#3a2410', { emissive: '#f5a623', emissiveIntensity: 1.3 }),
    royal: flat('#7a2346'),
    iron: flat('#2e2925'),
    bark: flat('#4a3626'),
    pine: flat('#2f4b3b'),
    leaf: flat('#4f6234'),
    rock: flat('#7a776f'),
    tuft: flat('#6a7440'),
  };
  const G = {
    block: bevelledBlock(BLOCK, TILE_HEIGHT, BEVEL),
    // road pieces: an arm from the centre to the tile's edge (half the gap included, so
    // neighbouring strips meet) and a disc that rounds ends and bends
    arm: new THREE.BoxGeometry(ROAD_WIDTH, ROAD_THICK, TILE / 2).translate(0, ROAD_THICK / 2, -TILE / 4),
    disc: new THREE.CylinderGeometry(ROAD_WIDTH / 2, ROAD_WIDTH / 2, ROAD_THICK, 16).translate(0, ROAD_THICK / 2, 0),
    box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), // unit box standing on y = 0; scale it
    trunk: new THREE.CylinderGeometry(0.03, 0.045, 0.16, 6).translate(0, 0.08, 0),
    coneLow: new THREE.ConeGeometry(0.2, 0.3, 7).translate(0, 0.27, 0),
    coneHigh: new THREE.ConeGeometry(0.14, 0.24, 7).translate(0, 0.46, 0),
    crown: new THREE.IcosahedronGeometry(0.19, 0),
    rock: new THREE.DodecahedronGeometry(0.12, 0),
    tuft: new THREE.ConeGeometry(0.03, 0.09, 4).translate(0, 0.045, 0),
    roof: prism(0.3, 0.15, 0.42),
    beaconTower: new THREE.CylinderGeometry(0.16, 0.2, 0.82, 8).translate(0, 0.41, 0),
    brazier: new THREE.CylinderGeometry(0.15, 0.09, 0.1, 8).translate(0, 0.05, 0),
    pole: new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4).translate(0, 0.15, 0),
  };
  const box = (material, w, h, d, opts) => {
    const m = makeMesh(G.box, material, opts);
    m.scale.set(w, h, d);
    return m;
  };

  const rng = mulberry32(20261102);
  const board = new THREE.Group();
  board.name = 'board';

  // tiles
  const tiles = new THREE.Group();
  tiles.name = 'tiles';
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const grass = M.grass[Math.floor(rng() * M.grass.length)];
      const tile = makeMesh(G.block, [grass, M.earth]);
      tile.position.copy(tileCenter(row, col, TILE_TOP));
      tile.name = `tile ${row},${col}`;
      tiles.add(tile);
    }
  }
  board.add(tiles);

  // road strips: straight, bend or end, from each tile's road neighbours
  const road = new THREE.Group();
  road.name = 'road';
  for (const { row, col } of ROAD_TILES) {
    const centre = tileCenter(row, col, TILE_TOP + ROAD_LIFT);
    road.add(at(makeMesh(G.disc, M.road, { cast: false }), centre.x, centre.y, centre.z));
    for (const s of roadLinks(row, col)) {
      const arm = makeMesh(G.arm, M.road, { cast: false });
      arm.position.copy(centre);
      arm.rotation.y = Math.atan2(-s.dc, -s.dr); // local -z along the link
      road.add(arm);
    }
  }
  board.add(road);

  // start: Hob's cottage, set back from the road's end, door facing the road
  {
    const out = stepVec(ROAD_TILES[0], ROAD_TILES[1]);
    let back = new THREE.Vector3(out.z, 0, -out.x);
    if (back.dot(VIEW_SIDE) > 0) back.negate();
    const hut = new THREE.Group();
    hut.name = 'startHut';
    hut.add(box(M.daub, 0.34, 0.19, 0.22));
    hut.add(at(makeMesh(G.roof, M.thatch), 0, 0.19, 0));
    hut.add(at(box(M.timber, 0.07, 0.12, 0.012, { cast: false }), -0.07, 0, 0.11));      // door
    hut.add(at(box(M.window, 0.06, 0.05, 0.012, { cast: false }), 0.08, 0.08, 0.11));   // lit window
    hut.add(at(box(M.timber, 0.03, 0.12, 0.03), 0.1, 0.22, -0.04));                      // chimney
    face(hut, back.clone().negate());
    hut.position.copy(tileCenter(startTile.row, startTile.col, TILE_TOP))
      .addScaledVector(back, 0.31)
      .addScaledVector(out, -0.06);
    board.add(hut);
  }

  // N: Lord Gainsay's gatehouse. A tower in the inside of the bend and an arch over the
  // incoming road; the free side (lordFreeSide) stays open for the lord.
  {
    const gate = new THREE.Group();
    gate.name = 'gatehouse';
    const inner = lordIsCorner ? lordIn.clone().add(lordOut) : lordFreeSide.clone().negate();
    const towerAt = inner.clone().multiplyScalar(lordIsCorner ? 0.33 : 0.33);
    const T = 0.26;  // tower footprint
    const TH = 0.62; // tower height
    const tower = new THREE.Group();
    tower.add(box(M.stone, T, TH, T));
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      tower.add(at(box(M.stone, 0.07, 0.07, 0.07), x * (T / 2 - 0.035), TH, z * (T / 2 - 0.035)));
    }
    tower.add(at(box(M.stoneDark, 0.08, 0.1, 0.012, { cast: false }), 0, 0.36, T / 2 + 0.001)); // arrow slit
    tower.add(at(makeMesh(G.pole, M.iron), 0, TH, 0));
    tower.add(at(box(M.royal, 0.012, 0.07, 0.13), 0, TH + 0.2, 0.065));                          // pennant
    face(tower, lordFreeSide);
    tower.position.copy(towerAt);
    gate.add(tower);

    if (lordIsCorner) {
      // arch across the incoming leg: a post on the outer side, a lintel to the tower
      const archAt = lordIn.clone().multiplyScalar(0.36);
      const reach = 0.37; // post centre, out from the road's centre line
      const post = box(M.stone, 0.11, 0.5, 0.11);
      post.position.copy(archAt).addScaledVector(lordOut, -(reach - 0.05));
      gate.add(post);
      const span = reach + (0.33 - T / 2);
      const lintel = box(M.stone, span, 0.1, 0.12);
      lintel.position.copy(archAt).addScaledVector(lordOut, (0.33 - T / 2 - reach) / 2).setY(0.48);
      face(lintel, lordIn);
      gate.add(lintel);
      for (const k of [-0.3, 0, 0.3]) {
        const merlon = box(M.stone, 0.06, 0.06, 0.12);
        merlon.position.copy(lintel.position).addScaledVector(lordOut, k * span * 0.9).setY(0.58);
        face(merlon, lordIn);
        gate.add(merlon);
      }
    }
    gate.position.copy(tileCenter(lordTile.row, lordTile.col, TILE_TOP));
    board.add(gate);
  }

  // B: placeholder beacon tower (replaced later), just past the road's end
  {
    const beacon = new THREE.Group();
    beacon.name = 'beaconPlaceholder';
    const back = stepVec(ROAD_TILES[ROAD_TILES.length - 2], ROAD_TILES[ROAD_TILES.length - 1]);
    beacon.add(at(makeMesh(G.beaconTower, M.stone), back.x * 0.26, 0, back.z * 0.26));
    beacon.add(at(makeMesh(G.brazier, M.iron), back.x * 0.26, 0.82, back.z * 0.26));
    beacon.position.copy(tileCenter(beaconTile.row, beaconTile.col, TILE_TOP));
    board.add(beacon);
  }

  // decor on 't': pines, an oak or a few rocks, placed a little off-centre
  const decor = new THREE.Group();
  decor.name = 'decor';
  const kinds = ['pine', 'oak', 'rocks'];
  let n = 0;
  const pine = (s) => {
    const g = new THREE.Group();
    g.add(makeMesh(G.trunk, M.bark), makeMesh(G.coneLow, M.pine), makeMesh(G.coneHigh, M.pine));
    g.scale.setScalar(s);
    return g;
  };
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (charAt(row, col) !== 't') continue;
      const p = tileCenter(row, col, TILE_TOP);
      const jx = (rng() - 0.5) * 0.16;
      const jz = (rng() - 0.5) * 0.16;
      const kind = kinds[n++ % kinds.length];
      const g = new THREE.Group();
      if (kind === 'pine') {
        g.add(at(pine(1.1), -0.06, 0, -0.04));
        g.add(at(pine(0.75), 0.2, 0, 0.16));
      } else if (kind === 'oak') {
        const crown = makeMesh(G.crown, M.leaf);
        crown.rotation.set(rng() * 3, rng() * 3, 0);
        crown.position.y = 0.33;
        g.add(makeMesh(G.trunk, M.bark), crown);
        g.scale.setScalar(1.15);
      } else {
        for (const [x, z, s] of [[0, 0, 1.2], [0.17, 0.1, 0.7], [-0.12, 0.16, 0.55]]) {
          const rock = makeMesh(G.rock, M.rock);
          rock.scale.set(s, s * 0.7, s * 0.9);
          rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
          rock.position.set(x, 0.05 * s, z);
          g.add(rock);
        }
      }
      g.rotation.y = rng() * Math.PI * 2;
      g.position.set(p.x + jx, p.y, p.z + jz);
      decor.add(g);
    }
  }
  // a few grass tufts on plain grass tiles
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (charAt(row, col) !== '.' || rng() > 0.3) continue;
      const p = tileCenter(row, col, TILE_TOP);
      const cx = p.x + (rng() - 0.5) * 0.6;
      const cz = p.z + (rng() - 0.5) * 0.6;
      for (let k = 0; k < 3; k++) {
        const tuft = makeMesh(G.tuft, M.tuft, { cast: false });
        tuft.position.set(cx + (rng() - 0.5) * 0.08, p.y, cz + (rng() - 0.5) * 0.08);
        tuft.rotation.set((rng() - 0.5) * 0.5, rng() * 3, (rng() - 0.5) * 0.5);
        decor.add(tuft);
      }
    }
  }
  board.add(decor);

  return board;
}
