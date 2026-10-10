// Warden Grid — atmosphere: sky dome with a glowing horizon, a far skyline in silhouette, light beams from the
// programs, sweeping searchlights at the Gate and drifting data motes. Purely visual.
import * as THREE from 'three';
import { shared, FOG } from './shaders.js';
import { DISTRICTS, rnd } from './city.js';

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const SKY_FS = /* glsl */`
  uniform float time; uniform float alarm; varying vec3 vDir;
  float h2(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+1.), f.x), f.y); }
  void main(){
    float y = vDir.y;
    vec3 top = vec3(0.002, 0.008, 0.004), mid = vec3(0.006, 0.03, 0.016), hor = vec3(0.02, 0.11, 0.055);
    vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, y)); c = mix(c, top, smoothstep(0.18, 0.7, y));
    c += hor * 0.9 * exp(-((y * 9.)*(y * 9.)));                                   // bright band on the horizon
    // slow aurora curtains of light high above the city
    float a = atan(vDir.z, vDir.x);
    float cur = vn(vec2(a * 3.0, time * 0.05)) * vn(vec2(a * 9.0 + time * 0.03, y * 3.));
    c += vec3(0.04, 0.25, 0.12) * pow(cur, 3.) * smoothstep(0.15, 0.45, y) * (1. - smoothstep(0.55, 0.9, y));
    c = mix(c, vec3(dot(c, vec3(.3,.6,.1)) * 2.2, c.g * 0.12, c.g * 0.15), alarm);
    gl_FragColor = vec4(c, 1.);
  }`;

export function buildAtmos(scene, { low = false } = {}) {
  const anim = [];

  /* sky dome */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(360, 48, 24), new THREE.ShaderMaterial({
    uniforms: { time: shared.time, alarm: shared.alarm }, vertexShader: SKY_VS, fragmentShader: SKY_FS,
    side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -3; scene.add(sky);

  /* far skyline: dark towers against the glowing horizon, a few lit windows */
  {
    const N = low ? 160 : 420; const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: shared.time, alarm: shared.alarm },
      vertexShader: `varying vec3 vL; varying vec3 vW; varying float vSeed;
        void main(){ vL = position; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.); vW = w.xyz;
          vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`uniform float time; uniform float alarm; varying vec3 vL; varying vec3 vW; varying float vSeed;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5453); }
        void main(){
          vec3 c = vec3(0.004, 0.016, 0.009) * (0.6 + vSeed);
          vec2 cell = floor(vec2(vW.x + vW.z, vW.y) * vec2(0.9, 0.8));
          float lit = step(0.93, h2(cell + vSeed * 31.)) * (0.6 + 0.4 * sin(time * 0.7 + h2(cell) * 20.));
          c += vec3(0.12, 0.5, 0.25) * lit * 0.45;
          c += vec3(0.02, 0.12, 0.06) * smoothstep(0.96, 1.0, vL.y);              // rim light on the roofline
          float haze = smoothstep(0.0, 0.6, 1. - vL.y) * 0.5;                        // bases melt into the horizon glow
          c = mix(c, vec3(0.02, 0.1, 0.05), haze);
          c = mix(c, vec3(dot(c, vec3(.3,.6,.1)) * 2.2, c.g * 0.12, c.g * 0.15), alarm);
          gl_FragColor = vec4(c, 1.);
        }`, fog: false });
    const im = new THREE.InstancedMesh(geo, mat, N); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + rnd() * 0.04, r = 175 + rnd() * 140;
      const h = 14 + Math.pow(rnd(), 1.6) * 95 * (r < 230 ? 1 : 1.3), w = 4 + rnd() * 10;
      p.set(Math.cos(a) * r, 0, Math.sin(a) * r); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a); s.set(w, h, 4 + rnd() * 9);
      im.setMatrixAt(i, m.compose(p, q, s));
    }
    im.frustumCulled = false; scene.add(im);
  }

  /* light beams: one soft column of light above each program */
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { time: shared.time, alarm: shared.alarm, color: { value: new THREE.Color(0x3dff8f) } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalMatrix * normal; vN = vN / max(length(vN), 1e-4);
      vec4 mv = modelViewMatrix * vec4(position, 1.); vV = -mv.xyz / max(length(mv.xyz), 1e-4); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float time; uniform float alarm; uniform vec3 color; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(clamp(1. - abs(dot(normalize(vN + 1e-6), normalize(vV + 1e-6))), 0., 1.), 1.5); float fall = pow(clamp(1. - vUv.y, 0., 1.), 1.6);
        float ripple = 0.75 + 0.25 * sin(vUv.y * 40. - time * 3.);
        vec3 c = mix(color, vec3(1., 0.3, 0.35), alarm * 0.8);
        gl_FragColor = vec4(c * (0.25 + edge) * fall * ripple * 0.32, 1.); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (const [k, d] of Object.entries(DISTRICTS)) {
    const top = d.top ?? 30, h = 170 - top;
    const g = new THREE.CylinderGeometry(k === 'hook' ? 5 : 3.2, k === 'hook' ? 1.6 : 1.1, h, 24, 1, true); g.translate(0, h / 2, 0);
    const b = new THREE.Mesh(g, beamMat); b.position.set(d.pos[0], top, d.pos[1]); b.renderOrder = 5; scene.add(b);
  }

  /* searchlights sweeping from the Gate */
  if (!low) {
    const coneMat = beamMat.clone(); coneMat.uniforms = { time: shared.time, alarm: shared.alarm, color: { value: new THREE.Color(0xb4ffcb) } };
    const lights = [];
    for (let i = 0; i < 2; i++) {
      const g = new THREE.ConeGeometry(14, 190, 32, 1, true); g.translate(0, -95, 0); g.rotateX(Math.PI);  // apex at the origin, opening upwards
      const c = new THREE.Mesh(g, coneMat); c.position.set(i ? 6 : -6, 51, 0); c.renderOrder = 5; scene.add(c); lights.push(c);
    }
    anim.push(t => lights.forEach((c, i) => { c.rotation.set(0.42 + 0.12 * Math.sin(t * 0.21 + i), t * 0.13 * (i ? -1 : 1) + i * Math.PI, 0, 'YXZ'); }));
  }

  /* data motes drifting through the streets */
  {
    const N = low ? 600 : 2200, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (rnd() - 0.5) * 300; pos[i * 3 + 1] = rnd() * 95; pos[i * 3 + 2] = (rnd() - 0.5) * 300; seed[i] = rnd(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: shared.time, alarm: shared.alarm, pixel: { value: Math.min(devicePixelRatio, 1.5) } },
      vertexShader: `uniform float time; uniform float pixel; attribute float seed; varying float vA; varying float vD;
        void main(){ vec3 p = position; p.y = mod(p.y + time * (0.6 + seed * 1.8), 95.);
          p.x += sin(time * 0.3 + seed * 30.) * 2.5; p.z += cos(time * 0.25 + seed * 17.) * 2.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.); vD = -mv.z;
          vA = (0.35 + 0.65 * pow(clamp(0.5 + 0.5 * sin(time * (1. + seed * 3.) + seed * 50.), 0., 1.), 3.)) * smoothstep(0., 8., p.y) * (1. - smoothstep(70., 95., p.y));
          gl_PointSize = clamp((0.6 + seed * 1.4) * pixel * 120. / max(vD, 0.1), 1., 6.); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float alarm; varying float vA; varying float vD;
        void main(){ vec2 c = gl_PointCoord - .5; float d = length(c); if (d > .5) discard;
          float fall = exp(-vD * 0.006);
          vec3 col = mix(vec3(0.5, 1., 0.7), vec3(1., 0.4, 0.45), alarm);
          gl_FragColor = vec4(col * (1. - d * 2.) * vA * fall * 0.9, 1.); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  }

  return { update(t) { for (const f of anim) f(t); } };
}

// Wet ground with real planar reflections (high quality only). Shader for three's Reflector: the reflection is
// blurred a little, broken up by ripples, strong in puddles and faint on dry asphalt, and stronger at grazing angles.
export const REFLECT_SHADER = {
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    time: shared.time, alarm: shared.alarm, wave: shared.wave, waveOrigin: shared.waveOrigin,
    fogColor: { value: FOG }, fogDensity: { value: 0.0084 } },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld; varying float vDepth;
    void main(){ vUv = textureMatrix * vec4(position, 1.); vec4 w = modelMatrix * vec4(position, 1.); vWorld = w.xyz;
      vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: /* glsl */`
    uniform vec3 color; uniform sampler2D tDiffuse; uniform float time; uniform float alarm; uniform float wave; uniform vec2 waveOrigin;
    uniform vec3 fogColor; uniform float fogDensity; varying vec4 vUv; varying vec3 vWorld; varying float vDepth;
    float h2(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+1.), f.x), f.y); }
    void main(){
      vec2 p = vWorld.xz;
      float pud = smoothstep(0.55, 0.66, vn(p*0.09) * 0.7 + vn(p*0.31) * 0.3);
      // ripples bend the reflection
      vec2 rip = vec2(vn(p * 1.3 + time * 0.4) - .5, vn(p * 1.3 - time * 0.35 + 7.) - .5) * mix(0.6, 0.2, pud);
      vec4 uv = vUv; uv.xy += rip * 0.012 * uv.w;
      float r = mix(0.006, 0.0025, pud) * uv.w; vec3 refl = vec3(0.);
      refl += texture2DProj(tDiffuse, uv).rgb * 0.36;
      refl += texture2DProj(tDiffuse, uv + vec4( r, 0., 0., 0.)).rgb * 0.16;
      refl += texture2DProj(tDiffuse, uv + vec4(-r, 0., 0., 0.)).rgb * 0.16;
      refl += texture2DProj(tDiffuse, uv + vec4(0.,  r * 1.8, 0., 0.)).rgb * 0.16;
      refl += texture2DProj(tDiffuse, uv + vec4(0., -r * 1.8, 0., 0.)).rgb * 0.16;
      // asphalt plates, seams and grit underneath
      vec2 pl = p / 4.; vec2 pf = abs(fract(pl) - 0.5);
      vec3 base = vec3(0.004, 0.016, 0.009) * (0.75 + 0.5*h2(floor(pl))) * (0.85 + 0.3*vn(p*3.1));
      base += vec3(0.02, 0.09, 0.05) * 0.14 * step(0.485, max(pf.x, pf.y));
      vec3 V = normalize(cameraPosition - vWorld + 1e-5); float fres = 0.55 + 0.45 * pow(clamp(1. - V.y, 0., 1.), 3.);
      vec3 col = base * (1. - pud * 0.6) + refl * mix(0.8, 1.8, pud) * fres;
      if (wave > 0.){ float d = length(p - waveOrigin); col += vec3(0.24, 1., 0.56) * exp(-(((d - wave)*0.3)*((d - wave)*0.3))) * (0.18 + pud*0.6); }
      col = mix(col, vec3(dot(col, vec3(.3,.6,.1))*2.2, col.g*0.1, col.g*0.14), alarm * 0.6);
      float fo = 1. - exp(-fogDensity*fogDensity*vDepth*vDepth);
      gl_FragColor = vec4(mix(col, fogColor, clamp(fo, 0., 1.)), 1.);
    }`,
};
