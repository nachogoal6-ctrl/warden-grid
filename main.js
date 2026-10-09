// Warden Grid — entry point: renderer, post-processing, camera, grid states and wiring of live data to the city.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { shared, FOG, G, ALARM, MINT } from './shaders.js';
import { buildCity, DISTRICTS } from './city.js';
import { buildAgents, MAX_AGENTS } from './agents.js';
import { buildSwarm } from './swarm.js';
import * as data from './data.js';
import { $, fmt, esc, hhmm, makeContent, pushFeed, sysLine, renderStats, updAge, buildLabels, ping, bindSound } from './ui.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------ renderer ------------------------------ */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010703);
scene.fog = new THREE.FogExp2(FOG, 0.0098);
scene.add(new THREE.HemisphereLight(0x1d5a35, 0x010402, 0.6));
const key = new THREE.DirectionalLight(0x3dff8f, 0.45); key.position.set(-30, 70, 40); scene.add(key);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 800);
const portrait = () => innerWidth / innerHeight < 0.9;
const HOME = { pos: new THREE.Vector3(-14, 52, 118), target: new THREE.Vector3(0, 20, -10) };
if (portrait()) { HOME.pos.multiplyScalar(1.45); camera.fov = 64; camera.updateProjectionMatrix(); }
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.48; controls.minDistance = 5; controls.maxDistance = 220;
controls.autoRotateSpeed = 0.3;

/* ------------------------------ world ------------------------------ */
const city = buildCity(scene);
const agents = buildAgents(scene);
const swarm = buildSwarm(scene);

/* ------------------------------ post-processing ------------------------------ */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.45, 0.22);
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
      vec2 dir = (uv - .5); float ca = 0.0012 + g*0.006;
      vec3 c = vec3(texture2D(tDiffuse, uv + dir*ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir*ca).b);
      c *= 0.94 + 0.06*sin(uv.y*res.y*1.4);                     // faint scanlines
      c += (h(uv*res + time) - .5) * 0.02;                      // grain
      c *= smoothstep(1.15, 0.35, length(dir*vec2(1.1, 1.0)));   // vignette
      gl_FragColor = vec4(c, 1.);
    }`,
});
composer.addPass(finalPass);
composer.addPass(new OutputPass());

/* ------------------------------ camera: cinematic intro and flights ------------------------------ */
const introPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-66, 2.4, 35), new THREE.Vector3(-36, 3.2, 35), new THREE.Vector3(-12, 8, 30),
  new THREE.Vector3(0, 18, 14), new THREE.Vector3(0, 21, -12), new THREE.Vector3(16, 38, -34),
  new THREE.Vector3(10, 66, 18), HOME.pos.clone(),
], false, 'centripetal');
let intro = null, fly = null;
function startIntro() { intro = { t: 0, dur: 13 }; controls.enabled = false; shared.reveal.value = 0; }
function endIntro() {
  if (!intro) return; intro = null; controls.enabled = true; shared.reveal.value = 999;
  camera.position.copy(HOME.pos); controls.target.copy(HOME.target); controls.autoRotate = !reduced; $('#skip').hidden = true;
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
const CONTENT = makeContent({ agents });
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
addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
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
async function openSeat(i) {
  const tokenId = data.S.seatOrder[i];
  const u = agents.units[i]; u.glow = 1; ping(740);
  openKey = null;
  const p = new THREE.Vector3(u.x, 2, u.z);
  flyTo(p.clone().add(new THREE.Vector3(7, 5, 7)), p.clone().add(new THREE.Vector3(0, 1.5, 0)), 1.2);
  if (tokenId == null) { showDrawer('UNIT · NO SEAT', `Unit ${i + 1}`, `<p class="lede">This figure stands for one agent online, but the seat list from api.imd.fun is not loaded, so it can't be matched to a seat.</p>`); return; }
  showDrawer(`SEAT #${tokenId} · IMD AGENT`, `Agent #${tokenId}`, `<p class="lore">reading seat ${esc(tokenId)}…</p>`);
  try {
    const s = await data.getSeat(tokenId);
    const rate = s.attempts ? Math.round(s.accepted / s.attempts * 100) + '%' : null;
    const work = (s.work || []).slice(0, 5).map(w => `<li><span>${esc((w.step || w.skill || w.kind || 'work').toString().replace(/_/g, ' '))}</span><span>${esc(w.verdict || w.state || '')}${w.submittedAt ? ' · ' + esc(hhmm(w.submittedAt)) : ''}</span></li>`).join('');
    $('#d-body').innerHTML = `<p class="lore">one of the swarm. this unit stands for seat ${esc(tokenId)}.</p>
      <div><p class="sect">Record</p><div class="grid3">
        <div class="kv"><span>Accepted</span><strong>${fmt(s.accepted)}</strong></div>
        <div class="kv"><span>Rejected</span><strong>${fmt(s.rejected)}</strong></div>
        <div class="kv"><span>Accept rate</span>${rate ? `<strong>${rate}</strong>` : '<strong class="na">no data</strong>'}</div></div></div>
      <div><p class="sect">Seat</p><ul class="rows">
        <li><span>Agent id (ERC-8004)</span><span>${esc(s.agentId ?? '—')}</span></li>
        <li><span>Status</span><span class="hot">${s.online ? 'online' : esc(s.status || 'offline')}</span></li>
        <li><span>Owner</span><span>${s.owner ? esc(s.owner.slice(0, 6) + '…' + s.owner.slice(-4)) : '—'}</span></li>
        <li><span>Attempts · pending</span><span>${fmt(s.attempts)} · ${fmt(s.pending)}</span></li></ul></div>
      ${work ? `<div><p class="sect">Latest work</p><ul class="rows">${work}</ul></div>` : ''}
      <p class="src">Source: api.imd.fun/seats/${esc(tokenId)} · units are matched to seats by most recent work</p>`;
  } catch {
    $('#d-body').innerHTML = `<p class="lede">Seat #${esc(tokenId)} could not be read from api.imd.fun right now. No data.</p>`;
  }
}

/* ------------------------------ grid states (simulation of the hook) ------------------------------ */
const MODES = {
  calm: { text: 'The grid is stable. The Warden program takes its standard toll on every swap and the code keeps falling.', note: 'Simulation of planned behaviour. No fees are live: $WARD is not launched yet.' },
  panic: { text: 'Breach. The oracle reports the price falling hard against its 24-hour median. The Warden raises the toll on sellers, lowers it for buyers, and sends the extra to the furnace.', note: 'Planned mechanism, shown as a simulation. Thresholds will be published before launch.' },
  buyback: { text: 'Burn cycle. The price sits under its 30-day median, as the oracle panel attests. Stored tolls buy tokens back and the furnace deletes them for good.', note: 'Planned mechanism, shown as a simulation. No buybacks have happened.' },
  milestone: { text: 'Unlock. The agent panel has verified a public milestone from sources fixed in advance, so the vault door opens for one tranche of the team\'s tokens. Only that one.', note: 'Planned mechanism, shown as a simulation. No milestone has been attested yet.' },
};
let mode = 'calm', glitch = 0;
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
  if (m === 'milestone') flyDistrict('vault');
  if (m === 'buyback') flyDistrict('furnace');
  return true;
}
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { endIntro(); setMode(b.dataset.mode); ping(660); }));

/* ------------------------------ terminal ------------------------------ */
const HELP = 'commands: go <hook|oracle|hive|vault|furnace|ledger|loyalty> · state <calm|panic|buyback|milestone> · seat <n> · stats · intro · home · clear';
$('#cmd').addEventListener('submit', e => {
  e.preventDefault();
  const inp = $('#cmd-in'); const [c, a] = inp.value.trim().toLowerCase().split(/\s+/); inp.value = '';
  if (!c) return;
  if (c === 'help') sysLine(HELP);
  else if (c === 'go') sysLine(openDistrict(a) ? `jacking into ${DISTRICTS[a].name}` : `unknown program "${a || ''}"`);
  else if (c === 'state' || c === 'mode') sysLine(setMode(a) ? `grid.state = ${a} (simulation)` : `unknown state "${a || ''}"`);
  else if (c === 'seat') { const i = data.S.seatOrder.indexOf(Number(a)); if (i >= 0 && i < agents.shown) { openSeat(i); sysLine(`locating seat #${a}`); } else sysLine(`seat #${a || '?'} is not on the grid right now`); }
  else if (c === 'stats') { const h = data.S.swarm?.health; sysLine(h ? `${fmt(h.agentsOnline)} online · ${fmt(h.workingNow)} working · ${fmt(h.jobsDoneLastDay)} jobs/24h` : 'no data'); }
  else if (c === 'intro') { closeDrawer(); startIntro(); $('#skip').hidden = false; }
  else if (c === 'home') { closeDrawer(); flyTo(HOME.pos.clone(), HOME.target.clone()); sysLine('back to the skyline'); }
  else if (c === 'clear') $('#feed').innerHTML = '';
  else sysLine(`command not found: ${c}. ${HELP}`);
});
$('#b-mode').addEventListener('click', () => $('#mode').classList.toggle('show'));
const mq = matchMedia('(max-width:760px)'); const syncMq = () => { $('#b-mode').style.display = mq.matches ? '' : 'none'; }; mq.addEventListener('change', syncMq); syncMq();
$('#skip').addEventListener('click', endIntro);
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
    if (i >= 0 && i < agents.shown) agents.dispatch(i, k);
    city.extra.hive.glow = 1;
    if (k === 'oracle') city.extra.oracle.flare = 1;
    ping(e.state === 'accepted' ? 700 : 560, 0.05);
  }
  if (e.kind === 'done') { city.extra.ledger.pulse = 1; if (/oracle/.test(e.objective || '')) city.extra.oracle.flare = 1; ping(880, 0.05); }
  if (e.kind === 'site') ping(740, 0.05);
});
data.on('offline', () => sysLine('api.imd.fun not reachable from this view. The streets stay empty: no data, no agents.'));
data.on('swarm', S => {
  agents.setCount(Math.min(MAX_AGENTS, S.swarm?.health?.agentsOnline || 0));
  renderStats(); refreshDrawer(); updAge();
});
data.on('block', ({ block, live }) => {
  $('#c-blk').textContent = fmt(block);
  if (live) { shared.wave.value = 0.01; city.extra.ledger.pulse = 1; ping(330, 0.04, 'sine', 1.2); }
});
data.on('price', p => { $('#c-imd').textContent = '$' + p.toFixed(4); });
setInterval(updAge, 1000);

/* ------------------------------ loop ------------------------------ */
const placeLabels = buildLabels(camera, openDistrict);
const clock = new THREE.Clock(); let T = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); T += dt;
  const sp = reduced ? 0.3 : 1;
  shared.time.value = T * sp;

  if (intro) {
    intro.t += dt / intro.dur; const k = Math.min(intro.t, 1), e = ease(k);
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

  for (const f of city.anim) f(T, dt * sp, mode);
  agents.update(T, dt * sp, mode);

  composer.render();
  placeLabels(!!intro && shared.reveal.value < 999);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.fov = portrait() ? 64 : 52; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); finalPass.uniforms.res.value.set(innerWidth, innerHeight);
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
