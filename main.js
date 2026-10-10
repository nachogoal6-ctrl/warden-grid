// Warden Grid — entry point: renderer, post-processing, camera, grid states and wiring of live data to the city.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildAtmos, REFLECT_SHADER } from './atmos.js';
import { buildEmblem } from './emblem.js';
import { shared, FOG, FOG_DENSITY, G, ALARM, MINT } from './shaders.js';
import { buildCity, DISTRICTS } from './city.js';
import { buildAgents, MAX_AGENTS } from './agents.js';
import { buildSwarm } from './swarm.js';
import { buildFx } from './fx.js';
import { buildWarden } from './warden.js';
import * as data from './data.js';
import { bindCodex, FRAGMENTS } from './codex.js';
import { bindCouncil, bindWarden } from './council.js';
import { sigilSVG } from './avatar.js';
import { bindOps } from './opsui.js';
import { startOps, O as OPS } from './ops.js';
import { $, fmt, esc, hhmm, makeContent, pushFeed, sysLine, renderStats, updAge, buildLabels, ping, bindSound } from './ui.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// quality: 'auto' picks low on phones and small machines; the viewer can force high or low (remembered per browser)
let qPref = 'auto'; try { qPref = localStorage.getItem('wg-quality') || 'auto'; } catch {}
const weak = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 2 || Math.min(innerWidth, innerHeight) < 700;
const LOW = qPref === 'low' || (qPref === 'auto' && weak);
const MAX_PR = LOW ? 1 : Math.min(devicePixelRatio, 1.5);
const AGENT_CAP = LOW ? 400 : MAX_AGENTS;

/* ------------------------------ renderer ------------------------------ */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pr = MAX_PR; renderer.setPixelRatio(pr);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010703);
scene.fog = new THREE.FogExp2(FOG, FOG_DENSITY);
scene.add(new THREE.HemisphereLight(0x1d5a35, 0x010402, 0.6));
const key = new THREE.DirectionalLight(0x3dff8f, 0.45); key.position.set(-30, 70, 40); scene.add(key);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 800);
const portrait = () => innerWidth / innerHeight < 0.9;
const HOME = { pos: new THREE.Vector3(-18, 66, 142), target: new THREE.Vector3(0, 38, -10) };
if (portrait()) { HOME.pos.multiplyScalar(1.45); camera.fov = 64; camera.updateProjectionMatrix(); }
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.48; controls.minDistance = 5; controls.maxDistance = 220;
controls.autoRotateSpeed = 0.3;

/* ------------------------------ world ------------------------------ */
const city = buildCity(scene, { reflectiveGround: !LOW });
const atmos = buildAtmos(scene, { low: LOW });
const emblem = buildEmblem(scene, { y: 80 });
if (!LOW) {   // wet ground with real reflections of the city (renders the scene a second time, at half resolution)
  const ground = new Reflector(new THREE.PlaneGeometry(800, 800), { clipBias: 0.003, textureWidth: Math.round(innerWidth * 0.5), textureHeight: Math.round(innerHeight * 0.5), color: 0x777777, shader: REFLECT_SHADER });
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
}
const agents = buildAgents(scene);
const swarm = buildSwarm(scene, LOW ? { flocks: 30, perFlock: 50 } : undefined);
const fx = buildFx(scene, camera);
const warden = buildWarden(scene, { y: 50.75 });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const dpos = (k, y) => V(DISTRICTS[k].pos[0], y ?? DISTRICTS[k].focus ?? 10, DISTRICTS[k].pos[1]);

/* ------------------------------ post-processing ------------------------------ */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// guard: one NaN or Inf pixel would be smeared by bloom into a black block, so clean them before bloom
composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); bvec4 bad = notEqual(c, c);
      if (any(bad) || any(greaterThan(abs(c), vec4(6e4)))) c = vec4(0.,0.,0.,1.);
      gl_FragColor = vec4(min(c.rgb, vec3(24.)), c.a); }` }));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight).multiplyScalar(LOW ? 0.5 : 1), 0.62, 0.42, 0.34);
composer.addPass(bloom);
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: shared.time, alarm: shared.alarm, glitch: { value: 0 }, res: { value: new THREE.Vector2(innerWidth, innerHeight) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float time; uniform float alarm; uniform float glitch; uniform vec2 res; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv = vUv;
      float g = glitch + alarm*0.35;
      if (g > 0.){ float band = step(0.985 - g*0.04, h(vec2(floor(uv.y*60.), floor(time*12.)))); uv.x += band*(h(vec2(time, uv.y))-.5)*0.08*g; }
      vec2 dir = (uv - .5); float ca = 0.0005 + g*0.006;
      vec3 c = vec3(texture2D(tDiffuse, uv + dir*ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir*ca).b);
      c *= 0.975 + 0.025*sin(uv.y*res.y*1.4);                   // faint scanlines
      c += (h(uv*res + time) - .5) * 0.008;                     // grain
      c *= smoothstep(1.15, 0.35, length(dir*vec2(1.1, 1.0)));   // vignette
      // grade: deep green-teal shadows, mint highlights, gentle S-curve
      float l = dot(c, vec3(.3,.59,.11));
      c += vec3(0.0, 0.006, 0.004) * (1. - smoothstep(0.0, 0.25, l));
      c = mix(c, c * vec3(0.94, 1.02, 0.97), smoothstep(0.35, 1.0, l));
      c = pow(max(c, 0.), vec3(1.06)); c = mix(c, clamp(c,0.,1.)*clamp(c,0.,1.)*(3.-2.*clamp(c,0.,1.)), 0.18);
      gl_FragColor = vec4(c, 1.);
    }`,
});
composer.addPass(finalPass);
composer.addPass(new OutputPass());
const fxaa = new ShaderPass(FXAAShader);
const setFxaa = () => fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * renderer.getPixelRatio()), 1 / (innerHeight * renderer.getPixelRatio()));
setFxaa(); composer.addPass(fxaa);

/* ------------------------------ camera: cinematic intro and flights ------------------------------ */
const introPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-66, 2.4, 35), new THREE.Vector3(-36, 3.2, 35), new THREE.Vector3(-12, 8, 30),
  new THREE.Vector3(0, 18, 14), new THREE.Vector3(0, 21, -12), new THREE.Vector3(16, 38, -34),
  new THREE.Vector3(10, 66, 18), HOME.pos.clone(),
], false, 'centripetal');
let intro = null, fly = null;
function startIntro() { intro = { t: 0, dur: 13, t0: performance.now() }; controls.enabled = false; shared.reveal.value = 0; const tc = $('#title-card'); $('#tc-frag').textContent = '// ' + FRAGMENTS[Math.floor(Math.random() * FRAGMENTS.length)]; tc.classList.remove('play'); void tc.offsetWidth; tc.classList.add('play'); }
function endIntro() {
  if (!intro) return; intro = null; controls.enabled = true; shared.reveal.value = 999;
  camera.position.copy(HOME.pos); controls.target.copy(HOME.target); controls.autoRotate = !reduced; $('#skip').hidden = true; $('#title-card').classList.remove('play');
}
function flyTo(pos, target, dur = 1.6) { controls.autoRotate = false; fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, t: 0, dur }; }
function flyDistrict(k) {
  const d = DISTRICTS[k];
  const t = new THREE.Vector3(d.pos[0], d.focus ?? d.top * 0.45, d.pos[1]);
  const dir = new THREE.Vector3(camera.position.x - t.x, 0, camera.position.z - t.z).normalize();
  const p = t.clone().add(dir.multiplyScalar(30 + d.top * 0.55)); p.y = d.top * 0.7 + 10;
  if (innerWidth > 900) { const side = new THREE.Vector3().subVectors(p, t).cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(-9); t.add(side); p.add(side); }
  flyTo(p, t);
}
controls.addEventListener('start', () => { controls.autoRotate = false; fly = null; });
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ------------------------------ drawer ------------------------------ */
const BASE_CONTENT = makeContent({ agents, cap: AGENT_CAP });
// every program file ends with a link to its Codex chapter
const CX_FOR = { hook: 'warden', oracle: 'oracle', hive: 'swarm' };
const CONTENT = Object.fromEntries(Object.entries(BASE_CONTENT).map(([k, f]) => [k, () => f() +
  `<button class="cx-link" data-open-cx="${CX_FOR[k] || 'programs'}">read the codex entry ›</button>` +
  (k === 'hook' ? `<button class="cx-link" data-open-cx="rogues">rogue program dossiers ›</button>` : '')]));
let openKey = null;
function showDrawer(code, title, html) {
  $('#d-code').textContent = code; $('#d-title').textContent = title; $('#d-body').innerHTML = html;
  const dr = $('#drawer'); dr.classList.add('open'); dr.setAttribute('aria-hidden', 'false'); document.body.classList.add('drawer-open');
}
function openDistrict(k) {
  const d = DISTRICTS[k]; if (!d) return false;
  endIntro(); openKey = k; showDrawer(d.code, d.name, CONTENT[k]()); flyDistrict(k); ping(520);
  return true;
}
function closeDrawer() { openKey = null; const dr = $('#drawer'); dr.classList.remove('open'); dr.setAttribute('aria-hidden', 'true'); document.body.classList.remove('drawer-open'); }
$('#d-x').addEventListener('click', closeDrawer);
addEventListener('keydown', e => { if (e.key === 'Escape') { if (ops.isOpen()) ops.close(); else if (council.isOpen()) council.close(); else if (codex.isOpen()) codex.close(); else closeDrawer(); } });
const codex = bindCodex({ onGo: k => openDistrict(k) });
['#b-codex', '#b-codex-m'].forEach(id => $(id).addEventListener('click', () => { endIntro(); codex.open(); ping(480, 0.05, 'triangle'); }));
$('#d-body').addEventListener('click', e => { const b = e.target.closest('[data-open-cx]'); if (b) codex.open(b.dataset.openCx); });
// scan.exe: while the council works, units walk to the Gate and packets fly in; the oracle flares when the report is ready
const council = bindCouncil({
  onStart: () => {
    for (let n = 0; n < Math.min(12, agents.shown); n++) { const i = Math.floor(Math.random() * agents.shown); agents.dispatch(i, 'hook'); const u = agents.units[i]; fx.spawn({ from: V(u.x, 3, u.z), to: dpos('hook', 24), color: '#3dff8f', dur: 1.6 + Math.random(), arc: 12, size: 3 }); }
    ping(500, 0.05, 'triangle');
  },
  onAgent: (id, state) => { if (state === 'done') { fx.spawn({ from: dpos('hook', 30), to: dpos(id === 'risk' ? 'ledger' : id === 'mirror' ? 'loyalty' : 'oracle', 40), color: '#b4ffcb', dur: 1.4, arc: 18, size: 3.6 }); ping(640 + Math.random() * 200, 0.04); } },
  onDone: R => { city.extra.oracle.flare = 1; if (!wardenDock) return; fx.tag(dpos('hook', 34), `scan · ${R.facts.symbol || 'token'} · ${R.flags.length} flag${R.flags.length === 1 ? '' : 's'}`); wardenDock.say(R.flags.length ? `${R.flags.length} flag${R.flags.length === 1 ? '' : 's'} on ${R.facts.symbol || 'that token'}. read them before you decide anything.` : `no flags on ${R.facts.symbol || 'that token'} from these checks. that is not the same as safe.`); },
});
// ops.exe: the city reacts to the agents — scouts dispatch units, picks flare the oracle, paper trades fly to the furnace
const ops = bindOps({ onEvent: (ev, x) => {
  if (ev === 'agent' && x === 'scout' && OPS.agents.scout?.state === 'done') for (let n = 0; n < Math.min(6, agents.shown); n++) agents.dispatch(Math.floor(Math.random() * agents.shown), 'hive');
  if (ev === 'agent' && x === 'warden' && Number(OPS.agents.warden?.stat) > 0) city.extra.oracle.flare = 1;
  if (ev === 'trade') { fx.spawn({ from: dpos('hook', 30), to: dpos(x.side === 'buy' ? 'vault' : 'furnace', 20), color: x.side === 'buy' ? '#3dff8f' : '#b4ffcb', dur: 1.8, arc: 20, size: 4 }); fx.tag(dpos('hook', 36), `paper ${x.side} · ${x.sym}`); ping(x.side === 'buy' ? 720 : 520, 0.05, 'triangle'); }
} });
['#b-ops', '#b-ops-m', '#r-ops'].forEach(id => $(id).addEventListener('click', () => { endIntro(); ops.open(); ping(480, 0.05, 'triangle'); }));
setTimeout(startOps, 6000);
$('#b-scan').addEventListener('click', () => { endIntro(); council.open(); ping(480, 0.05, 'triangle'); });
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => openDistrict(b.dataset.go)));
$('#b-home').addEventListener('click', () => { endIntro(); closeDrawer(); flyTo(HOME.pos.clone(), HOME.target.clone()); });
const refreshDrawer = () => { if (openKey) $('#d-body').innerHTML = CONTENT[openKey](); };

/* ------------------------------ tap a unit: open its seat file ------------------------------ */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; if (intro) endIntro(); });
canvas.addEventListener('pointerup', async e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  ptr.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObject(agents.parts[0], false)[0];
  if (!hit || hit.instanceId == null) return;
  openSeat(hit.instanceId);
});
let hoverAt = 0;
canvas.addEventListener('pointermove', e => {
  const tip = $('#tip'); const now = performance.now();
  if (now - hoverAt < 90 || intro) return; hoverAt = now;
  ptr.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObject(agents.parts[0], false)[0];
  if (!hit || hit.instanceId == null) { tip.hidden = true; canvas.style.cursor = ''; return; }
  const id = data.S.seatOrder[hit.instanceId], s = id != null ? data.getSeat(id) : null;
  tip.innerHTML = s ? `<b>seat #${esc(id)}</b> · ${fmt(s.accepted)} accepted${s.working ? ' · <em>working</em>' : ''}<br><span>tap to open its file</span>` : `<b>unit ${hit.instanceId + 1}</b><br><span>no seat data</span>`;
  tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`; tip.hidden = false; canvas.style.cursor = 'pointer';
});
canvas.addEventListener('pointerleave', () => { $('#tip').hidden = true; });
function openSeat(i) {
  const tokenId = data.S.seatOrder[i];
  const u = agents.units[i]; u.glow = 1; ping(740);
  openKey = null;
  const p = new THREE.Vector3(u.x, 2, u.z);
  flyTo(p.clone().add(new THREE.Vector3(7, 5, 7)), p.clone().add(new THREE.Vector3(0, 1.5, 0)), 1.2);
  if (tokenId == null) { showDrawer('UNIT · NO SEAT', `Unit ${i + 1}`, `<p class="lede">This figure stands for one agent online, but the seat list from api.imd.fun is not loaded, so it can't be matched to a seat.</p>`); return; }
  showDrawer(`SEAT #${tokenId} · IMD AGENT`, `Agent #${tokenId}`, `<p class="lore">reading seat ${esc(tokenId)}…</p>`);
  const s = data.getSeat(tokenId);
  if (s) {
    const rate = s.attempts ? Math.round(s.accepted / s.attempts * 100) + '%' : null;
    $('#d-body').innerHTML = `<div class="seat-sig">${sigilSVG('seat:' + tokenId, 54)}<p class="lore">one of the swarm. this unit stands for seat ${esc(tokenId)}. its sigil is drawn from its seat number.</p></div>
      <div><p class="sect">Record</p><div class="grid3">
        <div class="kv"><span>Accepted</span><strong>${fmt(s.accepted)}</strong></div>
        <div class="kv"><span>Rejected</span><strong>${fmt(s.rejected)}</strong></div>
        <div class="kv"><span>Accept rate</span>${rate ? `<strong>${rate}</strong>` : '<strong class="na">no data</strong>'}</div></div></div>
      <div><p class="sect">Seat</p><ul class="rows">
        <li><span>Agent id (ERC-8004)</span><span>${esc(s.agentId ?? '—')}</span></li>
        <li><span>Working now</span><span class="hot">${s.working ? 'yes' : 'no'}${s.queued ? ' · ' + fmt(s.queued) + ' queued' : ''}</span></li>
        <li><span>Last work</span><span>${s.last ? esc(new Date(s.last).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })) : '—'}</span></li>
        <li><span>Owner</span><span>${s.owner ? esc(s.owner.slice(0, 6) + '…' + s.owner.slice(-4)) : '—'}</span></li>
        <li><span>Attempts · failed · pending</span><span>${fmt(s.attempts)} · ${fmt(s.failed)} · ${fmt(s.pending)}</span></li></ul></div>
      <p class="src">Source: api.imd.fun/swarm (seats, owners) · units are matched to seats by most recent work</p>`;
  } else {
    $('#d-body').innerHTML = `<p class="lede">Seat #${esc(tokenId)} has no record in api.imd.fun right now. No data.</p>`;
  }
}

/* ------------------------------ grid states (simulation of the hook) ------------------------------ */
const MODES = {
  calm: { text: 'The grid is stable. The Warden program takes its standard toll on every swap and the code keeps falling.', note: 'Simulation of planned behaviour. No fees are live: $WARD is not launched yet.' },
  panic: { text: 'Breach. The oracle reports the price falling hard against its 24-hour median. The Warden raises the toll on sellers, lowers it for buyers, and sends the extra to the furnace.', note: 'Planned mechanism, shown as a simulation. Thresholds will be published before launch.' },
  buyback: { text: 'Burn cycle. The price sits under its 30-day median, as the oracle panel attests. Stored tolls buy tokens back and the furnace deletes them for good.', note: 'Planned mechanism, shown as a simulation. No buybacks have happened.' },
  milestone: { text: 'Unlock. The agent panel has verified a public milestone from sources fixed in advance, so the vault door opens for one tranche of the team\'s tokens. Only that one.', note: 'Planned mechanism, shown as a simulation. No milestone has been attested yet.' },
};
let mode = 'calm', glitch = 0, wardenDock = null;
function setMode(m) {
  if (!MODES[m]) return false;
  mode = m;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  $('#mode-p').innerHTML = esc(MODES[m].text) + `<small>${esc(MODES[m].note)}</small>`;
  const red = new THREE.Color(ALARM);
  city.heroEdges.hook.uniforms.color.value.copy(m === 'panic' ? red : new THREE.Color(G));
  city.extra.hook.ringMat.uniforms.color.value.copy(m === 'panic' ? red : new THREE.Color(G));
  city.heroEdges.vault.uniforms.intensity.value = m === 'milestone' ? 3.2 : 1.9;
  scene.fog.color.set(m === 'panic' ? 0x0a0203 : 0x010803);
  swarm.mat.uniforms.boost.value = m === 'panic' ? 2.2 : 1;
  if (m === 'panic') glitch = 1;
  wardenDock?.paint();
  if (m === 'milestone') { flyDistrict('vault'); [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => ping(f, 0.06, 'triangle', 1.2), i * 140)); }
  if (m === 'buyback') flyDistrict('furnace');
  return true;
}
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { endIntro(); setMode(b.dataset.mode); ping(660); }));
wardenDock = bindWarden({ onClick: () => { endIntro(); council.open(); }, getMode: () => mode });

/* ------------------------------ terminal ------------------------------ */
const HELP = 'commands: ops [matrix|radar|market|tape|intel|auto|live] · scan <0x token> · go <hook|oracle|hive|vault|furnace|ledger|loyalty> · state <calm|panic|buyback|milestone> · seat <n> · lore [grid|warden|swarm|oracle|council|nightshift|programs|rogues|states|fragments|record] · fragment · stats · intro · home · clear';
$('#cmd').addEventListener('submit', e => {
  e.preventDefault();
  const inp = $('#cmd-in'); const [c, a] = inp.value.trim().toLowerCase().split(/\s+/); inp.value = '';
  if (!c) return;
  if (c === 'help') sysLine(HELP);
  else if (c === 'go') sysLine(openDistrict(a) ? `jacking into ${DISTRICTS[a].name}` : `unknown program "${a || ''}"`);
  else if (c === 'state' || c === 'mode') sysLine(setMode(a) ? `grid.state = ${a} (simulation)` : `unknown state "${a || ''}"`);
  else if (c === 'seat') { const i = data.S.seatOrder.indexOf(Number(a)); if (i >= 0 && i < agents.shown) { openSeat(i); sysLine(`locating seat #${a}`); } else sysLine(`seat #${a || '?'} is not on the grid right now`); }
  else if (c === 'ops' || c === 'autopilot') { ops.open(c === 'autopilot' ? 'auto' : ['matrix', 'radar', 'market', 'tape', 'intel', 'auto', 'live'].includes(a) ? a : undefined); sysLine('opening ops.exe'); }
  else if (c === 'scan') { council.open(a && /^0x[0-9a-f]{40}$/.test(a) ? a : undefined); sysLine(a ? `council scanning ${a.slice(0, 8)}…` : 'opening scan.exe'); }
  else if (c === 'lore' || c === 'codex') { if (a && !codex.ids.includes(a)) sysLine(`no codex entry "${a}". try: ${codex.ids.join(' · ')}`); else { codex.open(a); sysLine(`opening codex${a ? ' › ' + a : ''}`); } }
  else if (c === 'fragment') sysLine(`recovered: "${FRAGMENTS[Math.floor(Math.random() * FRAGMENTS.length)]}" (fiction)`);
  else if (c === 'stats') { const h = data.S.swarm?.health; sysLine(h ? `${fmt(h.agentsOnline)} online · ${fmt(h.workingNow)} working · ${fmt(h.jobsDoneLastDay)} jobs/24h` : 'no data'); }
  else if (c === 'intro') { closeDrawer(); startIntro(); $('#skip').hidden = false; }
  else if (c === 'home') { closeDrawer(); flyTo(HOME.pos.clone(), HOME.target.clone()); sysLine('back to the skyline'); }
  else if (c === 'clear') $('#feed').innerHTML = '';
  else sysLine(`command not found: ${c}. ${HELP}`);
});
$('#b-mode').addEventListener('click', () => $('#mode').classList.toggle('show'));
const mq = matchMedia('(max-width:760px)'); const syncMq = () => { $('#b-mode').style.display = mq.matches ? '' : 'none'; }; mq.addEventListener('change', syncMq); syncMq();
$('#skip').addEventListener('click', endIntro);
{
  const b = $('#b-q'); const order = ['auto', 'high', 'low'];
  b.textContent = `quality: ${qPref}${qPref === 'auto' ? (LOW ? ' (low)' : ' (high)') : ''}`;
  b.addEventListener('click', () => { const n = order[(order.indexOf(qPref) + 1) % order.length]; try { localStorage.setItem('wg-quality', n); } catch {} location.reload(); });
}
bindSound();

/* ------------------------------ live data → city ------------------------------ */
function districtFor(e) {
  const s = `${e.step || ''} ${e.role || ''}`;
  if (/oracle/.test(s)) return 'oracle';
  if (/audit|review|security/.test(s)) return 'hook';
  if (/site|website|frontend|docs|readme|research|report/.test(s)) return 'ledger';
  if (/deploy|launch/.test(s)) return 'furnace';
  return 'hive';
}
data.on('event', ({ e, live }) => {
  pushFeed(e);
  if (!live) return;
  if (e.kind === 'node' && e.tokenId != null) {
    const i = data.S.seatOrder.indexOf(e.tokenId);
    const k = districtFor(e);
    if (i >= 0 && i < agents.shown) {
      const u = agents.units[i]; agents.dispatch(i, k);
      const from = V(u.x, 3, u.z);
      fx.spawn({ from, to: dpos(k), color: e.state === 'accepted' ? '#b4ffcb' : '#3dff8f', dur: 1.8, arc: 14, size: 3.2 });
      fx.tag(from, `#${e.tokenId} ${e.state || ''} · ${(e.step || '').replace(/_/g, ' ')}`.trim());
    }
    city.extra.hive.glow = 1;
    if (k === 'oracle') city.extra.oracle.flare = 1;
    ping(e.state === 'accepted' ? 700 : 560, 0.05);
  }
  if (e.kind === 'done') { fx.spawn({ from: dpos('hive', 30), to: dpos('ledger', 50), color: '#b4ffcb', dur: 2.2, arc: 24, size: 4.5 }); city.extra.ledger.pulse = 1; if (/oracle/.test(e.objective || '')) city.extra.oracle.flare = 1; ping(880, 0.05); }
  if (e.kind === 'site') ping(740, 0.05);
});
data.on('offline', () => sysLine('api.imd.fun not reachable from this view. The streets stay empty: no data, no agents.'));
data.on('swarm', S => {
  agents.setCount(Math.min(AGENT_CAP, S.swarm?.health?.agentsOnline || 0));
  renderStats(); refreshDrawer(); updAge();
});
data.on('block', ({ block, live }) => {
  $('#c-blk').textContent = fmt(block);
  if (live) { shared.wave.value = 0.01; city.extra.ledger.pulse = 1; ping(330, 0.04, 'sine', 1.2); }
});
data.on('price', p => { $('#c-imd').textContent = '$' + p.toFixed(4); const ch = data.S.imdCh24; const el = $('#c-imd-ch'); el.textContent = ch == null ? '' : (ch > 0 ? '+' : '') + ch.toFixed(1) + '%'; el.className = ch < 0 ? 'neg' : 'pos'; });
data.on('gas', g => { $('#c-gas').textContent = g < 1 ? g.toFixed(2) : g < 10 ? g.toFixed(1) : Math.round(g); });
setInterval(updAge, 1000);

/* ------------------------------ grid-state scenes (simulation) ------------------------------ */
let sceneClock = 0, soundClock = 0;
function sceneTick(dt) {
  sceneClock += dt; soundClock += dt;
  const roofs = city.roofs;
  if (mode === 'panic' && sceneClock > 0.07) {          // sellers rush the Gate and get bounced by the breach toll
    sceneClock = 0; const r = roofs[(Math.random() * roofs.length) | 0];
    fx.spawn({ from: V(r.x, r.y + 1, r.z), to: V((Math.random() - .5) * 6, 22 + (Math.random() - .5) * 8, 2), color: ALARM, dur: 1.4 + Math.random(), arc: 6 + Math.random() * 10, size: 2.6, bounce: true });
    if (soundClock > 1.1) { soundClock = 0; ping(640, 0.05, 'sawtooth', 0.5); setTimeout(() => ping(480, 0.05, 'sawtooth', 0.5), 450); }
  } else if (mode === 'buyback' && sceneClock > 0.1) {  // stored tolls flow from the Gate into the furnace and are burned
    sceneClock = 0;
    fx.spawn({ from: V((Math.random() - .5) * 4, 22, 0), to: dpos('furnace', 14), color: '#b4ffcb', dur: 2.2, arc: 26, size: 3, onArrive: () => { city.extra.furnace.flash = 1; } });
    if (soundClock > 0.9) { soundClock = 0; ping(70, 0.12, 'sine', 0.9); }
  } else if (mode === 'milestone' && sceneClock > 0.16) { // one tranche rises out of the vault
    sceneClock = 0; const d = DISTRICTS.vault;
    fx.spawn({ from: V(d.pos[0] + (Math.random() - .5) * 6, 8, d.pos[1] + (Math.random() - .5) * 6), to: V(d.pos[0], 70 + Math.random() * 30, d.pos[1]), color: MINT, dur: 2.4, arc: 2, size: 3.4 });
  }
}

/* ------------------------------ adaptive resolution: keep it smooth on any machine ------------------------------ */
let fpsAcc = 0, fpsFrames = 0;
function adapt(dt) {
  if (document.visibilityState !== 'visible') return;
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc < 2.5) return;
  const fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0;
  let next = pr;
  if (fps < 32 && pr > 0.6) next = Math.max(0.6, pr - 0.2);
  else if (fps > 56 && pr < MAX_PR) next = Math.min(MAX_PR, pr + 0.1);
  if (next !== pr) { pr = next; renderer.setPixelRatio(pr); composer.setPixelRatio(pr); setFxaa(); }
}

/* ------------------------------ loop ------------------------------ */
const placeLabels = buildLabels(camera, openDistrict);
const clock = new THREE.Clock(); let T = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); T += dt;
  const sp = reduced ? 0.3 : 1;
  shared.time.value = T * sp;

  if (intro) {
    intro.t = (performance.now() - intro.t0) / 1000 / intro.dur; const k = Math.min(intro.t, 1), e = ease(k);
    camera.position.copy(introPath.getPoint(e));
    const ahead = introPath.getPoint(Math.min(e + 0.04, 1));
    controls.target.copy(ahead.lerp(HOME.target, THREE.MathUtils.smoothstep(e, 0.62, 1)));
    camera.lookAt(controls.target);
    shared.reveal.value = Math.min(999, intro.t * intro.dur * 26);          // the city compiles in the first seconds
    if (shared.reveal.value > 110) shared.reveal.value = 999;
    if (k >= 1) endIntro();
  } else {
    if (fly) { fly.t += dt / fly.dur; const k = ease(Math.min(fly.t, 1)); camera.position.lerpVectors(fly.p0, fly.p1, k); controls.target.lerpVectors(fly.t0, fly.t1, k); if (fly.t >= 1) fly = null; }
    controls.update();
  }

  const alarm = mode === 'panic' ? 0.55 + 0.25 * Math.sin(T * 5) : 0;
  shared.alarm.value += (alarm - shared.alarm.value) * Math.min(1, dt * 4);
  glitch = Math.max(0, glitch - dt * 0.9); finalPass.uniforms.glitch.value = glitch;
  if (shared.wave.value > 0) { shared.wave.value += dt * 70; if (shared.wave.value > 260) shared.wave.value = -1; }

  sceneTick(dt);
  fx.update(dt * sp); fx.placeTags(dt);
  for (const f of city.anim) f(T, dt * sp, mode);
  atmos.update(T); emblem.update(T);
  agents.update(T, dt * sp, mode);
  warden.update(T, dt * sp, mode);

  composer.render();
  placeLabels(!!intro && shared.reveal.value < 999);
  adapt(dt);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.fov = portrait() ? 64 : 52; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); finalPass.uniforms.res.value.set(innerWidth, innerHeight); setFxaa();
});

/* ------------------------------ boot ------------------------------ */
setMode('calm');
requestAnimationFrame(frame);
{
  const lines = ['> loading the grid_', '> connecting to the swarm_', '> the Warden is watching_'];
  let i = 0; const el = $('#boot-t');
  const step = () => { el.textContent = lines.slice(0, ++i).join('\n'); if (i < lines.length) setTimeout(step, 240); else setTimeout(() => $('#boot').classList.add('gone'), 300); };
  step();
}
if (!reduced) { startIntro(); $('#skip').hidden = false; } else { controls.autoRotate = false; }
data.start();
window.__wg = { camera, controls, scene, endIntro, setMode, openDistrict, fx, agents };
