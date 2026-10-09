// Warden Grid — the swarm on foot. One faceless unit per IMD agent online (count from api.imd.fun).
// Each unit is six instanced parts (body, visor, two legs, two arms) posed every frame, so they really walk.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, ALARM } from './shaders.js';
import { DISTRICTS, DKEYS, rnd } from './city.js';

export const MAX_AGENTS = 1000;
const ni = g => (g.index ? g.toNonIndexed() : g);

export function buildAgents(scene) {
  const bodyGeo = mergeGeometries([
    (() => { const g = new THREE.CylinderGeometry(0.3, 0.36, 0.95, 8); g.translate(0, 1.18, 0); return ni(g); })(),   // torso
    (() => { const g = new THREE.CylinderGeometry(0.36, 0.33, 0.28, 8); g.translate(0, 0.62, 0); return ni(g); })(),  // hips
    (() => { const g = new THREE.SphereGeometry(0.24, 12, 8); g.translate(0, 1.92, 0); return ni(g); })(),            // head
    (() => { const g = new THREE.CylinderGeometry(0.09, 0.1, 0.16, 6); g.translate(0, 1.7, 0); return ni(g); })(),     // neck
  ]);
  const legGeo = (() => { const g = new THREE.CylinderGeometry(0.11, 0.08, 0.62, 6); g.translate(0, -0.31, 0); return g; })();
  const armGeo = (() => { const g = new THREE.CylinderGeometry(0.08, 0.065, 0.78, 6); g.translate(0, -0.39, 0); return g; })();
  const visorGeo = (() => { const g = new THREE.BoxGeometry(0.4, 0.055, 0.1); g.translate(0, 1.95, 0.2); return g; })();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x031a0b, roughness: 0.35, metalness: 0.7, emissive: 0x0b3d1d, emissiveIntensity: 0.8 });
  const visorMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, MAX_AGENTS); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
  const body = mk(bodyGeo, bodyMat), visor = mk(visorGeo, visorMat);
  const legL = mk(legGeo, bodyMat), legR = mk(legGeo, bodyMat), armL = mk(armGeo, bodyMat), armR = mk(armGeo, bodyMat);
  const parts = [body, visor, legL, legR, armL, armR];
  // per-instance visor colour so a unit can light up when its seat does work
  visor.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_AGENTS * 3).fill(1), 3);

  const units = [];
  for (let i = 0; i < MAX_AGENTS; i++) {
    if (rnd() < 0.4) {
      const k = DKEYS[i % DKEYS.length], d = DISTRICTS[k];
      const ring = 13 + (i % 3) * 1.7, a = rnd() * Math.PI * 2;
      units.push({ mode: 'guard', home: k, x: d.pos[0] + Math.cos(a) * ring, z: d.pos[1] + Math.sin(a) * ring, rot: Math.atan2(Math.cos(a), Math.sin(a)), ph: rnd() * 6, spd: 0, glow: 0, tokenId: null });
    } else {
      const alongX = rnd() < 0.5, k = Math.round((rnd() - 0.5) * 8);
      const lane = (alongX ? k * 35 : k * 28) + (rnd() < 0.5 ? -2.4 : 2.4) + (rnd() - 0.5) * 1.2;
      const t = (rnd() - 0.5) * 230, v = (rnd() < 0.5 ? -1 : 1) * (1.6 + rnd() * 1.1);
      units.push({ mode: 'walk', alongX, lane, t, v, x: alongX ? t : lane, z: alongX ? lane : t, rot: 0, ph: rnd() * 6, spd: Math.abs(v), glow: 0, tokenId: null });
    }
  }

  const M = new THREE.Matrix4(), L = new THREE.Matrix4(), T = new THREE.Matrix4(), R = new THREE.Matrix4();
  const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1.5, 1.5, 1.5);
  const cGreen = new THREE.Color(G).multiplyScalar(3), cHot = new THREE.Color('#ffffff').multiplyScalar(4), cRed = new THREE.Color(ALARM).multiplyScalar(3), tmpC = new THREE.Color();
  let shown = 0;

  function setCount(n) { shown = Math.min(MAX_AGENTS, n); for (const m of parts) m.count = shown; }

  // send a unit to a district (used when its seat accepts work)
  function dispatch(i, key) {
    const u = units[i]; if (!u) return;
    const d = DISTRICTS[key]; const a = Math.random() * Math.PI * 2, ring = 12 + Math.random() * 3;
    u.mode = 'go'; u.tx = d.pos[0] + Math.cos(a) * ring; u.tz = d.pos[1] + Math.sin(a) * ring; u.home = key; u.glow = 1;
    u.x = u.x ?? 0; u.z = u.z ?? 0;
  }

  function update(t, dt, mode) {
    const panic = mode === 'panic';
    const base = panic ? cRed : cGreen;
    for (let i = 0; i < shown; i++) {
      const u = units[i];
      let speed = 0;
      if (u.mode === 'walk') {
        u.t += u.v * dt * (panic ? 2.4 : 1); if (u.t > 124) u.t = -124; if (u.t < -124) u.t = 124;
        u.x = u.alongX ? u.t : u.lane; u.z = u.alongX ? u.lane : u.t;
        u.rot = u.alongX ? (u.v > 0 ? Math.PI / 2 : -Math.PI / 2) : (u.v > 0 ? 0 : Math.PI);
        speed = Math.abs(u.v) * (panic ? 2.4 : 1);
      } else if (u.mode === 'go') {
        const dx = u.tx - u.x, dz = u.tz - u.z, dist = Math.hypot(dx, dz);
        const v = Math.min(dist, 9 * dt);
        if (dist < 0.3) { u.mode = 'guard'; u.rot = Math.atan2(u.x - DISTRICTS[u.home].pos[0], u.z - DISTRICTS[u.home].pos[1]); }
        else { u.x += dx / dist * v; u.z += dz / dist * v; u.rot = Math.atan2(dx, dz); speed = 9; }
      } else {
        u.rot += Math.sin(t * 0.4 + u.ph) * 0.002;
      }
      u.ph += dt * speed * 2.6;
      const swing = speed > 0 ? Math.sin(u.ph) * Math.min(0.75, 0.25 + speed * 0.06) : Math.sin(t * 1.5 + u.ph) * 0.03;
      const bob = speed > 0 ? Math.abs(Math.cos(u.ph)) * 0.07 : 0;

      e.set(0, u.rot, 0); q.setFromEuler(e); p.set(u.x, bob, u.z);
      M.compose(p, q, s);
      body.setMatrixAt(i, M); visor.setMatrixAt(i, M);
      // limbs: M * translate(pivot) * rotateX(swing)
      const limb = (mesh, px, py, ang) => { T.makeTranslation(px, py, 0); R.makeRotationX(ang); L.multiplyMatrices(M, T).multiply(R); mesh.setMatrixAt(i, L); };
      limb(legL, -0.15, 0.62, swing); limb(legR, 0.15, 0.62, -swing);
      limb(armL, -0.4, 1.58, -swing * 0.8); limb(armR, 0.4, 1.58, swing * 0.8);

      u.glow = Math.max(0, u.glow - dt * 0.25);
      tmpC.copy(base).lerp(cHot, u.glow); visor.setColorAt(i, tmpC);
    }
    if (shown) { for (const m of parts) m.instanceMatrix.needsUpdate = true; visor.instanceColor.needsUpdate = true; }
  }

  return { units, setCount, update, dispatch, parts, get shown() { return shown; } };
}
