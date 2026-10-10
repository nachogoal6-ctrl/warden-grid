// Warden Grid — the brand mark as a hologram floating over the Gate: the shield rim, the hooded sentinel and its
// visor, extruded from the same paths as brand/mark.svg, with glowing edges, scanlines and a slow turn.
import * as THREE from 'three';
import { shared } from './shaders.js';

const K = 0.36;                                        // 64 svg units → ~23 world units
const P = (x, y) => [(x - 32) * K, (32 - y) * K];
function shape(cmds) {                                 // tiny path builder: ['M',x,y], ['L',x,y], ['C',x1,y1,x2,y2,x,y]
  const s = new THREE.Path();
  for (const c of cmds) {
    if (c[0] === 'M') s.moveTo(...P(c[1], c[2]));
    else if (c[0] === 'L') s.lineTo(...P(c[1], c[2]));
    else if (c[0] === 'C') s.bezierCurveTo(...P(c[1], c[2]), ...P(c[3], c[4]), ...P(c[5], c[6]));
  }
  return s;
}
const OUTER = [['M', 32, 2.5], ['L', 58, 12.2], ['L', 58, 32.2], ['C', 58, 47, 47.2, 56.8, 32, 62.2], ['C', 16.8, 56.8, 6, 47, 6, 32.2], ['L', 6, 12.2], ['L', 32, 2.5]];
const INNER = [['M', 32, 6.2], ['L', 54.4, 14.6], ['L', 54.4, 32.2], ['C', 54.4, 44.6, 44.4, 53.2, 32, 58], ['C', 19.6, 53.2, 9.6, 44.6, 9.6, 32.2], ['L', 9.6, 14.6], ['L', 32, 6.2]];
const HOOD = [['M', 32, 10.5], ['L', 44, 25], ['L', 44, 34.4], ['L', 51.4, 41.8], ['L', 51.4, 45.4], ['C', 46.4, 51, 39.8, 54.8, 32, 57.3], ['C', 24.2, 54.8, 17.6, 51, 12.6, 45.4], ['L', 12.6, 41.8], ['L', 20, 34.4], ['L', 20, 25], ['L', 32, 10.5]];
const FACE = [['M', 23.6, 25.8], ['L', 40.4, 25.8], ['L', 40.4, 34.2], ['L', 36.2, 38.4], ['L', 27.8, 38.4], ['L', 23.6, 34.2], ['L', 23.6, 25.8]];

const HOLO_VS = `varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main(){ vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz;
    vec4 mv = viewMatrix * w; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const HOLO_FS = /* glsl */`uniform vec3 color; uniform float time; uniform float alarm; uniform float strength; varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main(){
    float fres = pow(clamp(1. - abs(dot(normalize(vN), normalize(vV))), 0., 1.), 2.);
    float scan = 0.65 + 0.35 * step(0.5, fract(vW.y * 2.2 - time * 1.4));
    float sweep = exp(-((fract(vW.y * 0.06 - time * 0.25) - 0.5) * (fract(vW.y * 0.06 - time * 0.25) - 0.5)) * 220.);
    vec3 c = mix(color, vec3(1., 0.3, 0.35), alarm * 0.85);
    gl_FragColor = vec4(c * (0.18 + fres * 1.1 + sweep * 0.9) * scan * strength, 1.);
  }`;
const holo = (color, strength) => new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(color) }, time: shared.time, alarm: shared.alarm, strength: { value: strength } },
  vertexShader: HOLO_VS, fragmentShader: HOLO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const lineMat = (color, o) => new THREE.LineBasicMaterial({ color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });

export function buildEmblem(scene, { y = 88 } = {}) {
  const g = new THREE.Group(); g.position.set(0, y, 0); scene.add(g);
  const ext = (sh, depth) => { const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.2, bevelSegments: 1, curveSegments: 18 }); geo.translate(0, 0, -depth / 2); return geo; };

  // shield rim (outer minus inner)
  const rim = new THREE.Shape(shape(OUTER).getPoints(24)); rim.holes.push(shape(INNER));
  const rimGeo = ext(rim, 1.6);
  g.add(new THREE.Mesh(rimGeo, holo(0x7dffb4, 1.0)));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(rimGeo, 25), lineMat(0xb4ffcb, 0.9)));

  // the sentinel (hood with the face cut out), set slightly forward
  const hood = new THREE.Shape(shape(HOOD).getPoints(24)); hood.holes.push(shape(FACE));
  const hoodGeo = ext(hood, 2.2);
  const hoodMesh = new THREE.Mesh(hoodGeo, holo(0x3dff8f, 0.85)); hoodMesh.position.z = 0.6; g.add(hoodMesh);
  const hoodEdges = new THREE.LineSegments(new THREE.EdgesGeometry(hoodGeo, 25), lineMat(0x3dff8f, 0.85)); hoodEdges.position.z = 0.6; g.add(hoodEdges);

  // visor: the brightest thing in the sky
  const [vx, vy] = P(32, 30.9);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(13.6 * K, 3 * K, 0.6), new THREE.MeshBasicMaterial({ color: 0xeafff2 }));
  visor.position.set(vx, vy, 1.2); g.add(visor);
  const visorGlow = new THREE.Mesh(new THREE.PlaneGeometry(13.6 * K * 2.4, 3 * K * 5), holo(0x3dff8f, 1.4)); visorGlow.position.set(vx, vy, 1.3); g.add(visorGlow);

  // halo ring and a cone of light down to the Warden
  const halo = new THREE.Mesh(new THREE.TorusGeometry(15, 0.09, 6, 120), holo(0xb4ffcb, 1.2)); halo.rotation.x = Math.PI / 2; halo.position.y = -13; g.add(halo);
  const coneGeo = new THREE.CylinderGeometry(1.2, 9, 26, 32, 1, true); coneGeo.translate(0, -26, 0);
  g.add(new THREE.Mesh(coneGeo, holo(0x3dff8f, 0.35)));

  return {
    group: g,
    update(t) {
      g.rotation.y = Math.sin(t * 0.25) * 0.55;          // turns to look over the city, never shows its thin side
      g.position.y = y + Math.sin(t * 0.8) * 0.6;
      halo.scale.setScalar(1 + Math.sin(t * 1.6) * 0.03);
      visor.material.color.setHSL(0.39, 1, 0.9 + Math.sin(t * 3.1) * 0.05);
    },
  };
}
