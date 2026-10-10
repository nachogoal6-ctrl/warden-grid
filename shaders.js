// Warden Grid — shared materials.
// The "code" material: facades made of columns of falling glyphs, with a bright head and a fading trail.
// It also handles the build-up reveal (the city "compiles" from the ground up) and the Breach tint.
import * as THREE from 'three';

export const FOG = new THREE.Color(0x010803);
export const FOG_DENSITY = 0.0098;
export const G = '#3dff8f', HOT = '#b4ffcb', MINT = '#21e070', ALARM = '#ff4f5e';

export const shared = {
  time:   { value: 0 },
  reveal: { value: 999 },     // world height the city has compiled up to
  alarm:  { value: 0 },       // 0..1 red Breach tint
  wave:   { value: -1 },      // radius of the block wave (world units), -1 = none
  waveOrigin: { value: new THREE.Vector2(6, -40) },
};

// 8x8 atlas = four sets of 16 glyphs (row pairs): 0 hex, 1 operators, 2 box-drawing, 3 drawn "runes" of the Grid.
// Each district picks a set, so the facades don't all speak the same code.
function glyphAtlas() {
  const N = 1024, C = N / 8;
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const sets = ['0123456789ABCDEF', '$#<>/=+*%&?:!^~|', '\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255d\u255c\u255b\u2510\u2514\u2534\u252c'];
  const cell = i => [(i % 8) * C + C / 2, Math.floor(i / 8) * C + C / 2];
  for (let s = 0; s < 3; s++) for (let k = 0; k < 16; k++) {
    const [x, y] = cell(s * 16 + k);
    g.save(); g.translate(x, y + 2); if (s === 0 && k % 3 === 0) g.scale(-1, 1);
    g.font = `700 ${s === 2 ? 104 : 92}px "Share Tech Mono", "IBM Plex Mono", monospace`;
    g.fillText(sets[s][k], 0, 0); g.restore();
  }
  // set 3: runes built from strokes on a 3x4 lattice, seeded so they are always the same
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.lineWidth = 9; g.lineCap = 'square';
  for (let k = 0; k < 16; k++) {
    const [x, y] = cell(48 + k); const px = i => x - 30 + (i % 3) * 30, py = i => y - 44 + Math.floor(i / 3) * 29;
    g.beginPath(); g.moveTo(px(1), py(0)); g.lineTo(px(1), py(9)); // spine
    for (let n = 0; n < 3; n++) { const a = Math.floor(rnd() * 12), b = Math.floor(rnd() * 12); g.moveTo(px(a), py(a)); g.lineTo(px(b), py(b)); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4; return t;
}
export const atlas = glyphAtlas();

const CODE_VS = /* glsl */`
  varying vec2 vUv; varying float vDepth; varying vec3 vWorld; varying vec3 vNormalW;
  void main(){
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.);
    #ifdef USE_INSTANCING
      wp = modelMatrix * instanceMatrix * vec4(position, 1.);
    #endif
    vWorld = wp.xyz; vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * wp; vDepth = -mv.z; gl_Position = projectionMatrix * mv;
  }`;

const CODE_FS = /* glsl */`
  uniform sampler2D atlas; uniform float time; uniform vec3 tint; uniform vec3 base; uniform float level;
  uniform float cells; uniform vec3 fogColor; uniform float fogDensity; uniform float alarm;
  uniform float reveal; uniform float wave; uniform vec2 waveOrigin; uniform float speed;
  uniform float gset; uniform float windows;
  varying vec2 vUv; varying float vDepth; varying vec3 vWorld; varying vec3 vNormalW;
  float h(float n){ return fract(sin(n*127.1)*43758.5453); }
  float h2(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5453); }
  vec2 glyphUV(float idx, vec2 g){
    idx += gset*16.;
    return (vec2(mod(idx, 8.), 7. - floor(idx/8.)) + clamp(g, 0.02, 0.98)) / 8.;
  }
  void main(){
    if (vWorld.y > reveal + 0.5) discard;
    vec3 col = base;
    vec3 n = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    bool roof = vUv.x < 0.0015 && vUv.y > 0.998;
    if (!roof){
      // ---- structure: floors, piers and windows (in facade units) ----
      vec2 fu = vUv * vec2(cells*2., cells*2.6);           // one cell = one window bay
      vec2 bay = floor(fu), f = fract(fu);
      float mull = max(step(0.86, f.y), step(0.9, f.x));    // dark mullions / floor slabs
      float ledge = smoothstep(0.86, 0.875, f.y) - smoothstep(0.885, 0.9, f.y);
      float pier = step(0.0, -mod(bay.x, 4.)) * step(0.9, 1. - abs(f.x - 0.5)*2.);   // every 4th bay is a pier
      float lit = step(0.72, h2(bay + floor(vWorld.xz*0.07)*13.));
      float flick = 0.65 + 0.35*sin(time*(0.4 + h2(bay)*1.7) + h2(bay*3.1)*6.28);
      vec2 wq = abs(f - vec2(0.45, 0.43));
      float pane = (1. - mull) * smoothstep(0.46, 0.38, max(wq.x, wq.y));
      col *= 1. - mull*0.55;
      col += tint * windows * (ledge*0.04 + pane*lit*flick*0.035 + pier*0.008) * level;
      col += tint * windows * pane * 0.003 * level;
      // ---- falling code on top ----
      vec2 cell = vUv * vec2(cells, cells*1.6);
      float cx = floor(cell.x);
      float sp = (1.2 + h(cx)*3.0) * speed;
      float y = cell.y + time*sp;
      float row = floor(y);
      float idx = floor(h2(vec2(cx, row + floor(time*(0.5+h(cx+3.)*2.)))) * 16.);
      vec2 g = fract(vec2(cell.x, y)); g = (g - .5)*1.15 + .5;
      float glyph = texture2D(atlas, glyphUV(idx, g)).r;
      float trail = fract(-y*0.045 + h(cx+7.));
      float head = smoothstep(0.985, 1.0, trail);
      float b = glyph * (0.05 + pow(trail, 5.)*1.25) * level;
      vec3 c = mix(tint, vec3(0.75, 1.0, 0.8), head*0.85);
      col += c * b * (1.0 + head*2.5);
      // ---- shading: street-level occlusion, moonlit side, rim ----
      col *= mix(0.45, 1.0, smoothstep(0.0, 0.35, vUv.y));
      col *= 0.82 + 0.3*max(dot(n, normalize(vec3(-0.5, 0.2, 0.6))), 0.);
      col += tint * pow(1. - abs(dot(n, V)), 4.) * 0.05 * level;
    } else {
      // roofs: plates, vents and slow beacons, in world space
      vec2 rp = vWorld.xz * 0.5;
      vec2 rf = abs(fract(rp) - 0.5);
      col += tint * 0.02 * level;
      col += tint * 0.03 * step(0.46, max(rf.x, rf.y)) * level;
      vec2 rc = floor(rp);
      float vent = step(0.93, h2(rc)) * step(max(rf.x, rf.y), 0.3);
      col += tint * vent * (0.25 + 0.25*sin(time*2. + h2(rc)*30.)) * level;
      float bea = step(0.985, h2(rc*1.7 + 3.)) * step(length(fract(rp) - 0.5), 0.14);
      col += vec3(0.75, 1., 0.8) * bea * pow(0.5 + 0.5*sin(time*1.3 + h2(rc)*20.), 6.) * 1.6;
    }
    // block wave: a ring of light sweeping across the city
    if (wave > 0.){
      float d = length(vWorld.xz - waveOrigin);
      float ring = exp(-pow((d - wave)*0.35, 2.));
      col += tint * ring * 1.4;
    }
    // compile scanline at the reveal front
    float front = exp(-pow((vWorld.y - reveal)*1.2, 2.));
    col += vec3(0.7, 1.0, 0.8) * front * 2.0 * step(reveal, 900.);
    col = mix(col, vec3(dot(col, vec3(.3,.6,.1))*2.4 + 0.03, col.g*0.1, col.g*0.14), alarm);
    float fo = 1. - exp(-fogDensity*fogDensity*vDepth*vDepth);
    gl_FragColor = vec4(mix(col, fogColor, clamp(fo, 0., 1.)), 1.);
  }`;

const mats = [];
export function codeMaterial(tint = G, { level = 1, cells = 2, base = 0x020a05, fog = true, speed = 1, gset = 0, windows = 1 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      atlas: { value: atlas }, time: shared.time, reveal: shared.reveal, alarm: shared.alarm,
      wave: shared.wave, waveOrigin: shared.waveOrigin,
      tint: { value: new THREE.Color(tint) }, base: { value: new THREE.Color(base) },
      level: { value: level }, cells: { value: cells }, speed: { value: speed },
      gset: { value: gset }, windows: { value: windows },
      fogColor: { value: FOG }, fogDensity: { value: fog ? FOG_DENSITY : 0 },
    },
    vertexShader: CODE_VS, fragmentShader: CODE_FS,
  });
  mats.push(m); return m;
}

// Glowing line / solid material that also respects the reveal and the alarm tint.
export function glowMaterial(color, { intensity = 2, transparent = false, opacity = 1, additive = false } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: intensity }, reveal: shared.reveal,
      alarm: shared.alarm, opacity: { value: opacity }, fogColor: { value: FOG }, fogDensity: { value: FOG_DENSITY } },
    vertexShader: /* glsl */`
      varying float vY; varying float vDepth;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.);
        #ifdef USE_INSTANCING
          wp = modelMatrix * instanceMatrix * vec4(position,1.);
        #endif
        vY = wp.y; vec4 mv = viewMatrix*wp; vDepth = -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float intensity; uniform float reveal; uniform float alarm; uniform float opacity;
      uniform vec3 fogColor; uniform float fogDensity; varying float vY; varying float vDepth;
      void main(){ if (vY > reveal + 0.5) discard;
        vec3 c = color*intensity; c = mix(c, vec3(dot(c, vec3(.3,.6,.1))*1.6, c.g*0.15, c.g*0.2), alarm*0.8);
        float f = 1. - exp(-fogDensity*fogDensity*vDepth*vDepth); c = mix(c, fogColor, clamp(f,0.,1.)*0.85);
        gl_FragColor = vec4(c, opacity); }`,
    transparent, depthWrite: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return m;
}

// Code facades need UVs in world units: u along the face, v up the height. Horizontal faces get the "roof" marker.
export function codeUV(geo, unit = 2) {
  geo.computeBoundingBox();
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    if (Math.abs(ny) > 0.85) { uv.setXY(i, 0.001, 0.999); continue; }
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // project onto the face's horizontal tangent
    const tx = -nz, tz = nx; const len = Math.hypot(tx, tz) || 1;
    const u = (x * tx + z * tz) / len;
    uv.setXY(i, u / (unit * 2), (y - geo.boundingBox.min.y) / (unit * 4));
  }
  uv.needsUpdate = true;
  return geo;
}
export const box = (w, h, d, unit) => codeUV(new THREE.BoxGeometry(w, h, d), unit);

// Wet ground: dark asphalt plates, avenues, and puddles that catch streaks of the falling code above them.
// District positions are passed in so the plazas get a lit floor.
export function groundMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: shared.time, alarm: shared.alarm, wave: shared.wave, waveOrigin: shared.waveOrigin,
      tint: { value: new THREE.Color(G) }, fogColor: { value: FOG }, fogDensity: { value: FOG_DENSITY } },
    vertexShader: /* glsl */`
      varying vec3 vWorld; varying float vDepth;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.); vWorld = wp.xyz; vec4 mv = viewMatrix*wp; vDepth = -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */`
      uniform float time; uniform float alarm; uniform float wave; uniform vec2 waveOrigin; uniform vec3 tint;
      uniform vec3 fogColor; uniform float fogDensity; varying vec3 vWorld; varying float vDepth;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+1.), f.x), f.y); }
      void main(){
        vec2 p = vWorld.xz;
        vec3 col = vec3(0.004, 0.018, 0.009);
        // asphalt plates with seams, slightly different tone per plate
        vec2 pl = p / 4.; vec2 pf = abs(fract(pl) - 0.5);
        col *= 0.75 + 0.5*h2(floor(pl));
        col += tint * 0.012 * step(0.485, max(pf.x, pf.y));
        // fine grit
        col *= 0.85 + 0.3*vn(p*3.1);
        // puddles: they mirror vertical streaks of code running down unseen towers
        float pud = smoothstep(0.58, 0.66, vn(p*0.09) * 0.7 + vn(p*0.31) * 0.3);
        float cx = floor(p.x * 1.6);
        float sp = 0.6 + h2(vec2(cx, 1.))*1.4;
        float streak = pow(fract(p.y*0.07 + time*sp*0.1 + h2(vec2(cx, 9.))), 14.);
        float colmask = step(0.55, h2(vec2(cx, 4.)));
        float ripple = 0.85 + 0.15*sin(length(fract(p*0.25) - 0.5)*40. - time*3.);
        col = mix(col, col*0.4, pud);
        col += tint * pud * (streak*colmask*0.5*ripple + 0.012);
        // block wave travels over the ground too
        if (wave > 0.){ float d = length(p - waveOrigin); col += tint * exp(-pow((d - wave)*0.3, 2.)) * (0.18 + pud*0.6); }
        col = mix(col, vec3(dot(col, vec3(.3,.6,.1))*2.2, col.g*0.1, col.g*0.14), alarm);
        float fo = 1. - exp(-fogDensity*fogDensity*vDepth*vDepth);
        gl_FragColor = vec4(mix(col, fogColor, clamp(fo, 0., 1.)), 1.);
      }`,
  });
}
