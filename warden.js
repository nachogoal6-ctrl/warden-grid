// Warden Grid — The Warden: an original masked guardian, rendered as a hologram of falling code,
// standing on the lintel of the Gate. Hooded head with a single visor line, broad shoulders, long cape.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { codeMaterial, glowMaterial, codeUV, G, HOT, ALARM } from './shaders.js';

const ni = g => (g.index ? g.toNonIndexed() : g);

export function buildWarden(scene, { x = 0, y = 47, z = 0, scale = 1.25 } = {}) {
  const root = new THREE.Group(); root.position.set(x, y, z); root.scale.setScalar(scale); scene.add(root);

  // hologram material: the code shader, additive and see-through
  const holo = codeMaterial(G, { level: 2.4, cells: 3, base: 0x020d06, speed: 1.4 });
  holo.transparent = true; holo.blending = THREE.AdditiveBlending; holo.depthWrite = false; holo.side = THREE.DoubleSide;
  const lines = glowMaterial(G, { intensity: 1.8, transparent: true, opacity: 0.85, additive: true });

  const part = (geo, px = 0, py = 0, pz = 0, parent = root) => {
    codeUV(geo, 0.5);
    const m = new THREE.Mesh(geo, holo); m.position.set(px, py, pz); parent.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), lines); e.position.copy(m.position); parent.add(e);
    return m;
  };

  // body (one merged silhouette: legs, torso, shoulders, arms folded at the sides)
  const body = mergeGeometries([
    (() => { const g = new THREE.CylinderGeometry(0.42, 0.3, 3.2, 7); g.translate(-0.55, 1.6, 0); return ni(g); })(),
    (() => { const g = new THREE.CylinderGeometry(0.42, 0.3, 3.2, 7); g.translate(0.55, 1.6, 0); return ni(g); })(),
    (() => { const g = new THREE.CylinderGeometry(1.25, 0.95, 3.4, 8); g.translate(0, 4.8, 0); return ni(g); })(),
    (() => { const g = new THREE.BoxGeometry(3.6, 0.7, 1.4); g.translate(0, 6.35, 0); return ni(g); })(),
    (() => { const g = new THREE.CylinderGeometry(0.34, 0.26, 3.1, 6); g.rotateZ(0.12); g.translate(-1.75, 4.7, 0.1); return ni(g); })(),
    (() => { const g = new THREE.CylinderGeometry(0.34, 0.26, 3.1, 6); g.rotateZ(-0.12); g.translate(1.75, 4.7, 0.1); return ni(g); })(),
  ]);
  part(body);

  // hooded head: a faceted hood with a peaked brow, and the visor line
  const head = new THREE.Group(); head.position.set(0, 7.4, 0); root.add(head);
  part(new THREE.SphereGeometry(0.95, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, 0.15, -0.05, head);
  part(new THREE.ConeGeometry(1.05, 1.6, 8, 1, true), 0, 0.85, -0.25, head).rotation.x = -0.35;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.1), glowMaterial(HOT, { intensity: 4 }));
  visor.position.set(0, 0.15, 0.85); head.add(visor);

  // cape: a curved sheet hanging from the shoulders, rippling in the wind (vertex animation on the CPU)
  const capeGeo = new THREE.CylinderGeometry(1.9, 2.9, 7.4, 18, 10, true, Math.PI * 0.55, Math.PI * 0.9);
  capeGeo.translate(0, -3.7, 0);
  const cape = new THREE.Mesh(codeUV(capeGeo, 0.5), holo); cape.position.set(0, 6.6, -0.35); root.add(cape);
  const capeEdges = new THREE.LineSegments(new THREE.WireframeGeometry(capeGeo), glowMaterial(G, { intensity: 0.7, transparent: true, opacity: 0.25, additive: true }));
  capeEdges.position.copy(cape.position); root.add(capeEdges);
  const rest = capeGeo.attributes.position.array.slice();

  // halo ring behind the head
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.06, 6, 90), glowMaterial(G, { intensity: 2.2, transparent: true, opacity: 0.8, additive: true }));
  halo.position.set(0, 7.6, -1.2); root.add(halo);

  // light column below his feet, as if projected by the Gate
  const beamMat = glowMaterial(G, { intensity: 1, transparent: true, opacity: 0.12, additive: true });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.6, 3.4, 24, 1, true), beamMat); beam.position.y = -1.6; root.add(beam);

  const red = new THREE.Color(ALARM), green = new THREE.Color(G);
  function update(t, dt, mode) {
    const pos = capeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const rx = rest[i * 3], ry = rest[i * 3 + 1], rz = rest[i * 3 + 2];
      const k = Math.min(1, -ry / 7.4);                       // 0 at the shoulders, 1 at the hem
      const w = Math.sin(t * 1.6 + ry * 0.7 + rx * 0.5) * 0.45 * k * k + Math.sin(t * 3.1 + rx) * 0.12 * k;
      pos.setXYZ(i, rx + w * 0.3, ry, rz - Math.abs(w) - k * 0.6);
    }
    pos.needsUpdate = true; capeEdges.geometry.dispose(); capeEdges.geometry = new THREE.WireframeGeometry(capeGeo);
    head.rotation.y = Math.sin(t * 0.25) * 0.35;
    halo.rotation.z += dt * 0.4;
    const flicker = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7);
    holo.uniforms.level.value = 2.4 * flicker;
    const c = mode === 'panic' ? red : green;
    lines.uniforms.color.value.copy(c); holo.uniforms.tint.value.copy(c); halo.material.uniforms.color.value.copy(c);
    beamMat.uniforms.opacity.value = 0.1 + 0.05 * Math.sin(t * 2);
  }
  return { root, update };
}
