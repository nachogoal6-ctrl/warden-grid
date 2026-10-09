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

function glyphAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#fff'; g.font = '700 92px "Share Tech Mono", "IBM Plex Mono", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = '0123456789ABCDEF$#<>/=+*%&?:'.split('');
  for (let i = 0; i < 16; i++) {
    const x = (i % 4) * 128 + 64, y = Math.floor(i / 4) * 128 + 66;
    g.save(); g.translate(x, y); if (i % 3 === 0) g.scale(-1, 1); g.fillText(chars[i % chars.length], 0, 0); g.restore();
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
  varying vec2 vUv; varying float vDepth; varying vec3 vWorld; varying vec3 vNormalW;
  float h(float n){ return fract(sin(n*127.1)*43758.5453); }
  float h2(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5453); }
  void main(){
    if (vWorld.y > reveal + 0.5) discard;
    vec3 col = base;
    bool roof = vUv.x < 0.0015 && vUv.y > 0.998;
    // a faint panel grid so the volumes read even between glyph trails
    vec2 pg = abs(fract(vUv * vec2(cells, cells*0.5)) - 0.5);
    col += tint * 0.014 * step(0.47, max(pg.x, pg.y)) * level;
    if (!roof){
      vec2 cell = vUv * vec2(cells, cells*1.6);
      float cx = floor(cell.x);
      float sp = (1.2 + h(cx)*3.0) * speed;
      float y = cell.y + time*sp;
      float row = floor(y);
      float idx = floor(h2(vec2(cx, row + floor(time*(0.5+h(cx+3.)*2.)))) * 16.);
      vec2 g = fract(vec2(cell.x, y)); g = (g - .5)*1.15 + .5;
      vec2 auv = (vec2(mod(idx,4.), 3. - floor(idx/4.)) + clamp(g, 0., 1.)) / 4.;
      float glyph = texture2D(atlas, auv).r;
      float trail = fract(-y*0.045 + h(cx+7.));
      float head = smoothstep(0.985, 1.0, trail);
      float b = glyph * (0.05 + pow(trail, 5.)*1.25) * level;
      vec3 c = mix(tint, vec3(0.75, 1.0, 0.8), head*0.85);
      col += c * b * (1.0 + head*2.5);
    } else {
      col += tint * 0.02 * level;
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
    col = mix(col, vec3(dot(col, vec3(.3,.6,.1))*1.9 + 0.02, col.g*0.18, col.g*0.22), alarm);
    float f = 1. - exp(-fogDensity*fogDensity*vDepth*vDepth);
    gl_FragColor = vec4(mix(col, fogColor, clamp(f, 0., 1.)), 1.);
  }`;

const mats = [];
export function codeMaterial(tint = G, { level = 1, cells = 2, base = 0x020a05, fog = true, speed = 1 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      atlas: { value: atlas }, time: shared.time, reveal: shared.reveal, alarm: shared.alarm,
      wave: shared.wave, waveOrigin: shared.waveOrigin,
      tint: { value: new THREE.Color(tint) }, base: { value: new THREE.Color(base) },
      level: { value: level }, cells: { value: cells }, speed: { value: speed },
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
