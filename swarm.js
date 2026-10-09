// Warden Grid — data traffic: flocks of light flying between the programs, computed entirely on the GPU.
// Decorative: it shows the shape of the network, not a count of anything.
import * as THREE from 'three';
import { shared, G } from './shaders.js';
import { DISTRICTS, DKEYS, rnd } from './city.js';

export function buildSwarm(scene, { flocks = 70, perFlock = 70 } = {}) {
  const N = flocks * perFlock;
  const from = new Float32Array(N * 3), to = new Float32Array(N * 3), off = new Float32Array(N * 3), sd = new Float32Array(N * 4);
  for (let f = 0; f < flocks; f++) {
    const n = DKEYS.length, ia = (rnd() * n) | 0, ib = (ia + 1 + ((rnd() * (n - 1)) | 0)) % n;
    const a = DISTRICTS[DKEYS[ia]], b = DISTRICTS[DKEYS[ib]];
    const speed = 0.025 + rnd() * 0.04, phase = rnd(), height = 18 + rnd() * 34, spread = 1.5 + rnd() * 3;
    for (let i = 0; i < perFlock; i++) {
      const j = f * perFlock + i;
      from.set([a.pos[0], (a.top || 30) * 0.7, a.pos[1]], j * 3);
      to.set([b.pos[0], (b.top || 30) * 0.7, b.pos[1]], j * 3);
      const r = Math.pow(rnd(), 0.6) * spread, th = rnd() * Math.PI * 2, ph = (rnd() - 0.5) * Math.PI;
      off.set([Math.cos(th) * Math.cos(ph) * r, Math.sin(ph) * r, Math.sin(th) * Math.cos(ph) * r], j * 3);
      sd.set([speed, phase - i * 0.0009, height, rnd()], j * 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aFrom', new THREE.BufferAttribute(from, 3));
  g.setAttribute('aTo', new THREE.BufferAttribute(to, 3));
  g.setAttribute('aOff', new THREE.BufferAttribute(off, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 30, 0), 400);

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: shared.time, alarm: shared.alarm, reveal: shared.reveal, color: { value: new THREE.Color(G) }, pixel: { value: Math.min(devicePixelRatio, 1.5) }, boost: { value: 1 } },
    vertexShader: /* glsl */`
      attribute vec3 aFrom; attribute vec3 aTo; attribute vec3 aOff; attribute vec4 aSeed;
      uniform float time; uniform float pixel; uniform float boost; varying float vA;
      void main(){
        float t = fract(time*aSeed.x*boost + aSeed.y);
        vec3 p = mix(aFrom, aTo, t);
        p.y += sin(3.14159*t) * aSeed.z;
        float sw = time*0.9 + aSeed.w*6.28;
        vec3 o = aOff; o.xz = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * o.xz;
        p += o * (0.6 + sin(3.14159*t));
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + aSeed.w*2.5) * pixel * 60. / -mv.z;
        vA = smoothstep(0., .08, t) * smoothstep(1., .9, t) * (0.5 + aSeed.w*0.5);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float alarm; uniform float reveal; varying float vA;
      void main(){ if (reveal < 900.) discard; vec2 c = gl_PointCoord - .5; float d = length(c); if (d > .5) discard;
        float a = vA * smoothstep(.5, 0., d);
        vec3 col = mix(mix(color, vec3(.85,1.,.9), smoothstep(.25,0.,d)), vec3(1.,.3,.35), alarm*.85);
        gl_FragColor = vec4(col*a*1.6, a); }`,
  });
  const pts = new THREE.Points(g, mat); scene.add(pts);
  return { mat, pts };
}
