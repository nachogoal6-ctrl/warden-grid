// Warden Grid — effects: light packets that fly along arcs (events and grid-state scenes) and floating tags over units.
import * as THREE from 'three';
import { shared } from './shaders.js';

export function buildFx(scene, camera) {
  const MAX = 600;
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), size = new Float32Array(MAX);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { pixel: { value: Math.min(devicePixelRatio, 1.5) } },
    vertexShader: `attribute vec3 color; attribute float size; uniform float pixel; varying vec3 vC;
      void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = clamp(size*pixel*320./-mv.z, 2., 48.); }`,
    fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord-.5); if (d>.5) discard; float a = smoothstep(.5,0.,d); gl_FragColor = vec4(vC*a*(1.+smoothstep(.2,0.,d)*2.), a); }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);

  const live = [];
  const c = new THREE.Color();
  // trail: each packet draws itself plus a few echoes behind it
  const ECHO = 4;
  function spawn({ from, to, color = '#3dff8f', dur = 1.6, arc = 10, size: s = 3, bounce = false, onArrive }) {
    if (live.length * (ECHO + 1) >= MAX - ECHO - 1) return;
    live.push({ a: from.clone(), b: to.clone(), color: new THREE.Color(color), t: 0, dur, arc, s, bounce, onArrive, phase: 0 });
  }
  const p = new THREE.Vector3();
  function at(k, t, out) {
    out.lerpVectors(k.a, k.b, t); out.y += Math.sin(Math.PI * t) * k.arc; return out;
  }
  function update(dt) {
    let n = 0;
    for (let i = live.length - 1; i >= 0; i--) {
      const k = live[i]; k.t += dt / k.dur;
      if (k.t >= 1) {
        if (k.bounce && k.phase === 0) { k.phase = 1; k.t = 0; const tmp = k.a; k.a = k.b; k.b = tmp.clone().lerp(k.b, 0.55); k.b.y += 6; k.dur *= 0.6; k.arc *= 0.4; }
        else { k.onArrive?.(); live.splice(i, 1); continue; }
      }
    }
    for (const k of live) {
      for (let e = 0; e <= ECHO; e++) {
        const tt = Math.max(0, k.t - e * 0.025);
        at(k, tt, p); pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
        const fade = (1 - e / (ECHO + 1)) * (k.phase === 1 ? 1 - k.t : 1);
        c.copy(k.color).multiplyScalar(1.6 * fade); col[n * 3] = c.r; col[n * 3 + 1] = c.g; col[n * 3 + 2] = c.b;
        size[n] = k.s * (1 - e * 0.15); n++;
      }
    }
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }

  // floating tags over units ("accepted", "joined"...)
  const tags = [];
  const box = document.getElementById('tags');
  function tag(worldPos, text) {
    if (!box) return;
    const el = document.createElement('div'); el.className = 'tag3d'; el.textContent = text; box.appendChild(el);
    tags.push({ el, p: worldPos.clone(), t: 0 });
    while (tags.length > 8) { tags.shift().el.remove(); }
  }
  const v = new THREE.Vector3();
  function placeTags(dt) {
    for (let i = tags.length - 1; i >= 0; i--) {
      const k = tags[i]; k.t += dt;
      if (k.t > 2.6) { k.el.remove(); tags.splice(i, 1); continue; }
      v.copy(k.p); v.y += 3 + k.t * 1.2; v.project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      k.el.style.display = vis ? '' : 'none';
      if (vis) { k.el.style.transform = `translate(${((v.x * .5 + .5) * innerWidth).toFixed(1)}px, ${((-v.y * .5 + .5) * innerHeight).toFixed(1)}px) translate(-50%, -100%)`; k.el.style.opacity = String(Math.min(1, (2.6 - k.t) * 1.5)); }
    }
  }

  return { spawn, update, tag, placeTags, get count() { return live.length; } };
}
