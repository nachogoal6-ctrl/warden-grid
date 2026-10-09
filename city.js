// Warden Grid — the city: ground, sky wall, filler blocks, data cables and the seven programs (districts).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { codeMaterial, glowMaterial, codeUV, box, shared, G, HOT, MINT, FOG, FOG_DENSITY } from './shaders.js';

let seed = 4242; export const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const flat = geo => { const g = geo.index ? geo.toNonIndexed() : geo; g.computeVertexNormals(); return g; };
const prism = (r, h, sides, unit) => codeUV(flat(new THREE.CylinderGeometry(r, r, h, sides, 1)), unit);
const edges = (geo, mat, thresh = 20) => new THREE.LineSegments(new THREE.EdgesGeometry(geo, thresh), mat);

export const DISTRICTS = {
  hook:    { name: 'The Gate',       code: '0x01 · THE HOOK',       color: G,    pos: [0, 0] },
  oracle:  { name: 'Oracle Node',    code: '0x02 · THE ORACLE',     color: HOT,  pos: [-32, -16] },
  hive:    { name: 'The Nest',       code: '0x03 · THE SWARM',      color: G,    pos: [32, -20] },
  vault:   { name: 'The Vault',      code: '0x04 · TEAM TOKENS',    color: MINT, pos: [-28, 24] },
  furnace: { name: 'The Furnace',    code: '0x05 · BUYBACK & BURN', color: HOT,  pos: [28, 24] },
  ledger:  { name: 'The Ledger',     code: '0x06 · THE RECORD',     color: HOT,  pos: [6, -44] },
  loyalty: { name: "Holders' Block", code: '0x07 · LOYAL HOLDERS',  color: MINT, pos: [-48, -46] },
};
export const DKEYS = Object.keys(DISTRICTS);

export function buildCity(scene) {
  const anim = [];   // per-frame updaters

  /* ---------------- ground & horizon ---------------- */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800),
    new THREE.MeshStandardMaterial({ color: 0x010d06, roughness: 0.16, metalness: 0.92 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const grid = new THREE.GridHelper(300, 75, 0x0f6b38, 0x06301a);
  grid.position.y = 0.03; grid.material.transparent = true; grid.material.opacity = 0.5; scene.add(grid);

  const skyMat = codeMaterial(G, { level: 0.5, cells: 1, base: 0x010402, fog: false, speed: 0.8 });
  skyMat.side = THREE.BackSide;
  {
    const g = new THREE.CylinderGeometry(340, 340, 280, 96, 1, true);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 180, uv.getY(i) * 74);
    const sky = new THREE.Mesh(g, skyMat); sky.position.y = 120; sky.renderOrder = -1; scene.add(sky);
    skyMat.uniforms.reveal = { value: 999 };   // the horizon is always there
  }

  /* ---------------- the seven programs ---------------- */
  const heroEdges = {};
  const extra = {};          // named moving parts for mechanics

  const group = (k) => { const d = DISTRICTS[k]; const g = new THREE.Group(); g.position.set(d.pos[0], 0, d.pos[1]); scene.add(g); return g; };
  const mkEdge = (k, mult = 1.9) => { const m = glowMaterial(DISTRICTS[k].color, { intensity: mult }); heroEdges[k] = m; return m; };
  const add = (grp, geo, mat, edgeMat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); grp.add(m);
    if (edgeMat) { const e = edges(geo, edgeMat); e.position.copy(m.position); grp.add(e); }
    return m;
  };
  const pad = (grp, color, size = 24) => {
    const p = new THREE.Mesh(new THREE.CircleGeometry(size / 2, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.1 }));
    p.rotation.x = -Math.PI / 2; p.rotation.z = Math.PI / 6; p.position.y = 0.05; grp.add(p);
    const ring = new THREE.Mesh(new THREE.RingGeometry(size / 2 - 0.25, size / 2, 6), glowMaterial(color, { intensity: 1.6 }));
    ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 6; ring.position.y = 0.07; grp.add(ring);
  };

  // 0x01 THE GATE — the hook: a portal every trade passes through, with the hook ring turning inside it
  {
    const k = 'hook', d = DISTRICTS[k], grp = group(k), em = mkEdge(k);
    const mat = codeMaterial(d.color, { level: 1.8, base: 0x031208 });
    for (const sx of [-1, 1]) {
      add(grp, box(7, 46, 7), mat, em, sx * 10, 23, 0);
      add(grp, box(5, 12, 5), mat, em, sx * 10, 52, 0);
      add(grp, box(2.2, 10, 2.2), mat, em, sx * 10, 63, 0);
    }
    add(grp, box(27, 5, 8), mat, em, 0, 44.5, 0);                 // lintel
    add(grp, box(17, 2.5, 6), mat, em, 0, 49.5, 0);
    const ringMat = glowMaterial(d.color, { intensity: 2.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.28, 8, 140), ringMat); ring.position.y = 22; grp.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.14, 8, 120), ringMat); ring2.position.y = 22; grp.add(ring2);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(2.6, 0), glowMaterial(HOT, { intensity: 3 })); core.position.y = 22; grp.add(core);
    const coreE = edges(new THREE.OctahedronGeometry(3.6, 0), ringMat); coreE.position.y = 22; grp.add(coreE);
    pad(grp, d.color, 30);
    d.top = 68; d.focus = 26; d.labelY = 54;
    extra.hook = { ring, ring2, core, coreE, ringMat };
    anim.push((t, dt) => { ring.rotation.z += dt * 0.35; ring2.rotation.z -= dt * 0.6; ring2.rotation.y = Math.sin(t * 0.4) * 0.5;
      core.rotation.y += dt * 0.8; core.position.y = coreE.position.y = 22 + Math.sin(t * 1.3) * 0.8; coreE.rotation.y -= dt * 0.5; });
  }

  // 0x02 ORACLE NODE — a needle with a turning dish and a signal mast
  {
    const k = 'oracle', d = DISTRICTS[k], grp = group(k), em = mkEdge(k);
    const mat = codeMaterial(d.color, { level: 1.7, base: 0x031208 });
    add(grp, prism(5, 30, 8), mat, em, 0, 15, 0);
    add(grp, prism(3.6, 26, 8), mat, em, 0, 43, 0);
    add(grp, prism(2.4, 12, 8), mat, em, 0, 62, 0);
    const dish = new THREE.Group(); dish.position.y = 69; grp.add(dish);
    const dishGeo = new THREE.CylinderGeometry(9, 2.5, 2.2, 32, 1, true);
    dish.add(new THREE.Mesh(dishGeo, glowMaterial(d.color, { intensity: 0.6, transparent: true, opacity: 0.35 })));
    dish.add(edges(new THREE.CylinderGeometry(9, 2.5, 2.2, 16, 1, true), em, 1));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.35, 22, 6), glowMaterial(d.color, { intensity: 2 })); mast.position.y = 81; grp.add(mast);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), glowMaterial(HOT, { intensity: 4 })); tip.position.y = 92; grp.add(tip);
    const pulseMat = glowMaterial(HOT, { intensity: 2, transparent: true, opacity: 0, additive: true });
    const pulse = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 3, 160, 16, 1, true), pulseMat); pulse.position.y = 172; grp.add(pulse);
    pad(grp, d.color);
    d.top = 93; d.focus = 40;
    extra.oracle = { dish, tip, pulseMat, flare: 0 };
    anim.push((t, dt) => { dish.rotation.y += dt * 0.5; tip.scale.setScalar(1 + 0.35 * Math.sin(t * 2.4));
      const o = extra.oracle; o.flare = Math.max(0, o.flare - dt * 0.6); pulseMat.uniforms.opacity.value = o.flare * 0.6; });
  }

  // 0x03 THE NEST — a honeycomb of hexagonal columns, home of the swarm
  {
    const k = 'hive', d = DISTRICTS[k], grp = group(k), em = mkEdge(k);
    const mat = codeMaterial(d.color, { level: 1.7, base: 0x031208 });
    const r = 3.1, cells = [];
    for (let q = -2; q <= 2; q++) for (let s = -2; s <= 2; s++) {
      if (Math.abs(q + s) > 2) continue;
      const x = r * 1.74 * (q + s / 2), z = r * 1.5 * s;
      const dist = Math.hypot(x, z);
      const h = 34 - dist * 2.2 + rnd() * 6;
      const geo = prism(r * 0.98, h, 6); geo.rotateY(Math.PI / 6);
      const m = add(grp, geo, mat, em, x, h / 2, z); cells.push(m);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(15, 0.14, 6, 140), glowMaterial(d.color, { intensity: 2.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 26; grp.add(ring);
    pad(grp, d.color, 34);
    d.top = 42; d.focus = 18;
    extra.hive = { mat, ring, glow: 0 };
    anim.push((t, dt) => { ring.rotation.z += dt * 0.2; ring.position.y = 26 + Math.sin(t * 0.7) * 1.5;
      const h = extra.hive; h.glow = Math.max(0, h.glow - dt * 1.2); mat.uniforms.level.value = 1.7 + h.glow * 2.2; });
  }

  // 0x04 THE VAULT — an armoured block with a round door that only opens on a verified milestone
  {
    const k = 'vault', d = DISTRICTS[k], grp = group(k), em = mkEdge(k);
    const mat = codeMaterial(d.color, { level: 1.5, base: 0x031208 });
    add(grp, box(16, 18, 16), mat, em, 0, 9, 0);
    add(grp, box(12, 6, 12), mat, em, 0, 21, 0);
    add(grp, box(7, 4, 7), mat, em, 0, 26, 0);
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(grp, box(3, 22, 3), mat, em, x * 8.5, 11, z * 8.5);   // corner bastions
    // the door faces the city centre
    grp.rotation.y = Math.atan2(-d.pos[0], -d.pos[1]);
    const door = new THREE.Group(); door.position.set(0, 8, 8.2); grp.add(door);
    const doorMat = glowMaterial(d.color, { intensity: 2.2 });
    door.add(new THREE.Mesh(new THREE.TorusGeometry(5, 0.45, 10, 60), doorMat));
    const wheel = new THREE.Group(); door.add(wheel);
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 8, 40), doorMat));
    for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.8, 0.2), doorMat); s.rotation.z = i * Math.PI / 3; wheel.add(s); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4.6, 48), new THREE.MeshBasicMaterial({ color: 0x041a0c })); disc.position.z = -0.05; door.add(disc);
    const beamMat = glowMaterial(d.color, { intensity: 1.6, transparent: true, opacity: 0, additive: true });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 6, 150, 24, 1, true), beamMat); beam.position.y = 100; grp.add(beam);
    pad(grp, d.color, 30);
    d.top = 30; d.focus = 12;
    extra.vault = { door, wheel, beamMat, open: 0 };
    anim.push((t, dt, mode) => { const v = extra.vault; const target = mode === 'milestone' ? 1 : 0;
      v.open += (target - v.open) * Math.min(1, dt * 1.5);
      wheel.rotation.z += dt * (0.2 + v.open * 2.5); door.position.x = v.open * 6; door.rotation.y = v.open * 1.2;
      beamMat.uniforms.opacity.value = v.open * 0.24; });
  }

  // 0x05 THE FURNACE — a forge with two stacks; embers rise in the Burn state
  {
    const k = 'furnace', d = DISTRICTS[k], grp = group(k), em = mkEdge(k);
    const mat = codeMaterial(d.color, { level: 1.6, base: 0x031208 });
    grp.rotation.y = Math.atan2(-d.pos[0], -d.pos[1]);
    add(grp, box(14, 12, 12), mat, em, 0, 6, 0);
    add(grp, box(9, 10, 9), mat, em, -1, 17, 0);
    const stacks = [];
    for (const [x, z, h] of [[3.5, 2.5, 26], [4, -3, 20]]) {
      const s = add(grp, prism(1.7, h, 12), mat, em, x, 12 + h / 2, z); stacks.push({ x, z, top: 12 + h });
    }
    const mouthMat = glowMaterial(HOT, { intensity: 1 });
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), mouthMat); mouth.position.set(0, 3, 6.05); grp.add(mouth);
    const EMB = 420; const eg = new THREE.BufferGeometry(); const ep = new Float32Array(EMB * 3);
    const em2 = Array.from({ length: EMB }, (_, i) => ({ s: stacks[i % 2], x: 0, y: rnd() * 50, z: 0, v: 5 + rnd() * 9, o: rnd() * 6 }));
    eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
    const pts = new THREE.Points(eg, new THREE.PointsMaterial({ size: 0.75, color: new THREE.Color(HOT).multiplyScalar(2.5), transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
    grp.add(pts);
    pad(grp, d.color, 28);
    d.top = 40; d.focus = 14;
    extra.furnace = { mouthMat, pts };
    anim.push((t, dt, mode) => {
      const burn = mode === 'buyback';
      pts.material.opacity += ((burn ? 1 : 0.22) - pts.material.opacity) * Math.min(1, dt * 2);
      mouthMat.uniforms.intensity.value = burn ? 3 + Math.sin(t * 9) * 0.6 : 0.9 + Math.sin(t * 1.5) * 0.2;
      const sp = burn ? 1.6 : 0.6;
      for (let i = 0; i < EMB; i++) { const e = em2[i]; e.y += e.v * dt * sp; if (e.y > 50) e.y = 0;
        ep[i * 3] = e.s.x + Math.sin(t + e.o + e.y * 0.25) * e.y * 0.09; ep[i * 3 + 1] = e.s.top + e.y; ep[i * 3 + 2] = e.s.z + Math.cos(t * 0.7 + e.o) * e.y * 0.06; }
      eg.attributes.position.needsUpdate = true;
    });
  }

  // 0x06 THE LEDGER — a monolith of falling code with pages orbiting it
  {
    const k = 'ledger', d = DISTRICTS[k], grp = group(k), em = mkEdge(k);
    const mat = codeMaterial(d.color, { level: 2.6, cells: 3, base: 0x031208 });
    add(grp, box(10, 64, 10, 1.2), mat, em, 0, 32, 0);
    const pages = new THREE.Group(); grp.add(pages);
    const pageMat = codeMaterial(d.color, { level: 2.2, cells: 1.5, base: 0x041a0c });
    pageMat.side = THREE.DoubleSide;
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Mesh(codeUV(new THREE.BoxGeometry(3.2, 4.2, 0.05), 0.6), pageMat);
      const a = i / 14 * Math.PI * 2; p.position.set(Math.cos(a) * 11, 10 + i * 3.4, Math.sin(a) * 11); p.rotation.y = -a + Math.PI / 2; pages.add(p);
    }
    pad(grp, d.color);
    d.top = 66; d.focus = 30;
    extra.ledger = { mat, pages, pulse: 0 };
    anim.push((t, dt) => { pages.rotation.y += dt * 0.12; const l = extra.ledger; l.pulse = Math.max(0, l.pulse - dt * 0.8); mat.uniforms.level.value = 2.4 + l.pulse * 3; });
  }

  // 0x07 HOLDERS' BLOCK — a walled quarter of low towers around a glowing square
  {
    const k = 'loyalty', d = DISTRICTS[k], grp = group(k), em = mkEdge(k);
    const mat = codeMaterial(d.color, { level: 1.4, base: 0x031208 });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, h = 7 + (i % 3) * 3.5;
      add(grp, box(3.6, h, 3.6), mat, em, Math.cos(a) * 8, h / 2, Math.sin(a) * 8);
    }
    add(grp, box(5, 18, 5), mat, em, 0, 9, 0);
    pad(grp, d.color, 26);
    d.top = 19; d.focus = 8;
  }

  /* ---------------- filler city ---------------- */
  const occupied = Object.values(DISTRICTS).map(d => ({ x: d.pos[0], z: d.pos[1], r: 15 }));
  const roofs = [];
  {
    const geos = [], antennas = [], bridges = [];
    const STEP = 7, HALF = 126;
    for (let x = -HALF; x <= HALF; x += STEP) for (let z = -HALF; z <= HALF; z += STEP) {
      if (Math.abs(x) % 28 === 0 || Math.abs(z) % 35 === 0) continue;
      if (occupied.some(o => Math.hypot(o.x - x, o.z - z) < o.r)) continue;
      const dist = Math.hypot(x, z);
      if (rnd() < 0.08 + dist / 480) continue;
      const w = 3 + rnd() * 2.6, dd = 3 + rnd() * 2.6;
      const h = 3 + Math.pow(rnd(), 2) * (44 - Math.min(dist, 115) * 0.27);
      const ox = x + (rnd() - 0.5) * 1.2, oz = z + (rnd() - 0.5) * 1.2;
      const kind = rnd();
      let top = h;
      if (kind < 0.12 && h > 10) {                 // round tower
        const g = prism(Math.min(w, dd) / 2, h, 10); g.translate(ox, h / 2, oz); geos.push(g);
      } else {
        const g = box(w, h, dd); g.translate(ox, h / 2, oz); geos.push(g);
        if (h > 14 && rnd() < 0.55) {               // setbacks
          const h2 = h * (0.2 + rnd() * 0.3); const g2 = box(w * 0.66, h2, dd * 0.66); g2.translate(ox, h + h2 / 2, oz); geos.push(g2); top = h + h2;
          if (rnd() < 0.4) { const h3 = h2 * 0.6; const g3 = box(w * 0.38, h3, dd * 0.38); g3.translate(ox, top + h3 / 2, oz); geos.push(g3); top += h3; }
        }
      }
      if (top > 18 && rnd() < 0.35) { const ah = 3 + rnd() * 8; const a = new THREE.CylinderGeometry(0.08, 0.14, ah, 4); a.translate(ox, top + ah / 2, oz); antennas.push(a); }
      roofs.push({ x: ox, z: oz, y: top });
    }
    scene.add(new THREE.Mesh(mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g)), codeMaterial(G, { level: 1, cells: 2 })));
    if (antennas.length) scene.add(new THREE.Mesh(mergeGeometries(antennas), glowMaterial(G, { intensity: 1.6 })));
    // sky bridges between nearby tall roofs
    for (let i = 0; i < roofs.length; i++) {
      const a = roofs[i]; if (a.y < 16 || rnd() > 0.08) continue;
      const b = roofs.find(r => r !== a && Math.abs(r.y - a.y) < 6 && Math.hypot(r.x - a.x, r.z - a.z) > 6 && Math.hypot(r.x - a.x, r.z - a.z) < 15);
      if (!b) continue;
      const y = Math.min(a.y, b.y) - 2.5, len = Math.hypot(b.x - a.x, b.z - a.z);
      const g = new THREE.BoxGeometry(len, 0.5, 1.1); g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x)); g.translate((a.x + b.x) / 2, y, (a.z + b.z) / 2); bridges.push(g);
    }
    if (bridges.length) scene.add(new THREE.Mesh(mergeGeometries(bridges), glowMaterial(G, { intensity: 0.45 })));
  }

  /* ---------------- data cables: light pulses running from the programs to the rooftops ---------------- */
  {
    const pos = [], tt = [];
    for (const k of DKEYS) {
      const d = DISTRICTS[k];
      for (let i = 0; i < 6; i++) {
        const r = roofs[(rnd() * roofs.length) | 0];
        const a = new THREE.Vector3(d.pos[0], d.top * 0.6, d.pos[1]), b = new THREE.Vector3(r.x, r.y, r.z);
        const mid = a.clone().lerp(b, 0.5); mid.y = Math.max(a.y, b.y) + 6 + rnd() * 10;
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        const ptsC = curve.getPoints(24); const off = rnd();
        for (let j = 0; j < ptsC.length - 1; j++) {
          pos.push(ptsC[j].x, ptsC[j].y, ptsC[j].z, ptsC[j + 1].x, ptsC[j + 1].y, ptsC[j + 1].z);
          tt.push(j / 24 + off, (j + 1) / 24 + off);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('t', new THREE.Float32BufferAttribute(tt, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: shared.time, reveal: shared.reveal, alarm: shared.alarm, color: { value: new THREE.Color(G) } },
      vertexShader: `attribute float t; varying float vT; varying float vY; void main(){ vT = t; vec4 wp = modelMatrix*vec4(position,1.); vY = wp.y; gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform float time; uniform float reveal; uniform float alarm; uniform vec3 color; varying float vT; varying float vY;
        void main(){ if (vY > reveal) discard; float p = fract(vT*2. - time*0.35); float a = 0.025 + pow(p, 30.)*1.2;
          vec3 c = mix(color, vec3(1.,.25,.3), alarm*0.8); gl_FragColor = vec4(c*a, a); }` });
    scene.add(new THREE.LineSegments(g, m));
  }

  return { anim, heroEdges, extra, roofs };
}
