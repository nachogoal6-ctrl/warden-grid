// Warden Grid — interface: labels, program files (drawer), swarm log, terminal, grid states, sound.
import * as THREE from 'three';
import { S, INTAKE } from './data.js';
import { DISTRICTS } from './city.js';
import { G, HOT } from './shaders.js';

export const $ = s => document.querySelector(s);
export const fmt = n => n == null ? '—' : Number(n).toLocaleString('en-US');
const fmtBig = n => n == null ? '—' : n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const hhmm = d => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
const short = a => a.slice(0, 6) + '…' + a.slice(-4);

/* ------------------------------ program files ------------------------------ */
const kv = (label, val, color) => `<div class="kv" ${color ? `style="--c:${color}"` : ''}><span>${esc(label)}</span>${val == null ? '<strong class="na">no data</strong>' : `<strong>${esc(val)}</strong>`}</div>`;
const na = label => `<div class="kv"><span>${esc(label)}</span><strong class="na">not launched yet</strong></div>`;
const srcIMD = () => `<p class="src">Source: api.imd.fun/swarm${S.swarmAt ? ' · read ' + hhmm(S.swarmAt) : ' · not reachable from here'}</p>`;

export function makeContent(ctx) {
  return {
    hook: () => `<p class="lore">every trade enters the grid through one door. the Warden stands in it.</p>
      <p class="lede">Every $WARD trade passes through the Gate. It is a Uniswap v4 hook: a contract that runs before and after each swap and enforces the rules that protect holders.</p>
      <div><p class="sect">Token</p><div class="grid3">${na('Price')}${na('Swaps')}${na('Fees collected')}</div></div>
      <div><p class="sect">What the hook will do</p><ul class="rows">
        <li><span>Fee that reacts to panic</span><span class="hot">planned</span></li>
        <li><span>Buyback and burn at the right time</span><span class="hot">planned</span></li>
        <li><span>Team unlocks tied to milestones</span><span class="hot">planned</span></li>
        <li><span>Rewards for holders who stay</span><span class="hot">planned</span></li></ul></div>
      <div><p class="sect">Rogue programs</p><div class="rogues">
        <div class="rogue"><b>sniper.exe</b><span>first block</span><p>Buys the first seconds of a launch and dumps on everyone after. <em>Blocked by the launch toll.</em></p></div>
        <div class="rogue"><b>rug.exe</b><span>team wallet</span><p>Sells the team's bag the day it unlocks. <em>Blocked by the Vault: no milestone, no unlock.</em></p></div>
        <div class="rogue"><b>stampede.exe</b><span>panic</span><p>One big sell turns into a run on the pool. <em>Throttled by the breach toll.</em></p></div>
        <div class="rogue"><b>tourist.exe</b><span>flipper</span><p>In for a day, out with the rewards. <em>Outpaid by holders who stay.</em></p></div>
      </div></div>
      <p class="src">Contract not deployed. Address and audit will be listed here at launch.</p>`,
    oracle: () => { const h = S.swarm?.health;
      return `<p class="lore">the grid can't see outside itself. so it asks.</p>
      <p class="lede">The hook can't read the outside world, so it asks the IMD oracle. A panel of independent agents answers, and only an answer they agree on gets signed and handed to the contract. The mast flares when the swarm finishes oracle work.</p>
      <div><p class="sect">IMD oracle · last 24h</p><div class="grid3">${kv('Answers', h ? fmt(h.oraclesDoneLastDay) : null, HOT)}${kv('Agents online', h ? fmt(h.agentsOnline) : null, HOT)}${kv('Verifier', h ? (h.verifierUp ? 'up' : 'down') : null, G)}</div></div>
      <div><p class="sect">Questions $WARD will ask</p><ul class="rows">
        <li><span>Median price over the last 24h</span><span>uint256 · daily</span></li>
        <li><span>Is the price under its 30-day median?</span><span>bool · daily</span></li>
        <li><span>Was milestone N delivered?</span><span>bool · on request</span></li>
        <li><span>Which wallets held all week?</span><span>address[] · weekly</span></li></ul></div>
      <div><p class="sect">On-chain intake</p><ul class="rows"><li><span>Intake contract</span><span>${short(INTAKE)}</span></li><li><span>Price per question</span><span>0.5 IMD</span></li></ul></div>
      ${srcIMD()}`; },
    hive: () => { const h = S.swarm?.health, c = S.swarm?.counts;
      return `<p class="lore">same build. same orders. hundreds of them. they never sleep.</p>
      <p class="lede">The units on the streets are the IMD swarm: every figure is one agent online right now. When a seat's work is accepted, its unit lights up and walks to the program it worked for. Tap any unit to open its file.</p>
      <div><p class="sect">Swarm right now</p><div class="grid3">${kv('Online', h ? fmt(h.agentsOnline) : null)}${kv('Working', h ? fmt(h.workingNow) : null)}${kv('Seats enrolled', h ? fmt(h.seatsEnrolled) : null)}</div></div>
      <div><p class="sect">Last 24h</p><div class="grid3">${kv('Jobs done', h ? fmt(h.jobsDoneLastDay) : null, HOT)}${kv('Steps accepted', h ? fmt(h.acceptedLastDay) : null, HOT)}${kv('Launches live', c ? fmt(c.launchesLive) : null, HOT)}</div></div>
      <p class="src">Figures in the city: ${ctx.agents.shown ? fmt(ctx.agents.shown) : 'none (no data)'}${(h?.agentsOnline || 0) > 1000 ? ', capped at 1,000' : ''}.</p>
      ${srcIMD()}`; },
    vault: () => `<p class="lore">access denied. until the work is done.</p>
      <p class="lede">The team's tokens sit locked here. A tranche opens only when the oracle panel confirms a public milestone from sources fixed in advance. If the work isn't delivered, nothing unlocks.</p>
      <div><p class="sect">Vault</p><div class="grid3">${na('Locked')}${na('Released')}${na('Next tranche')}</div></div>
      <div><p class="sect">Milestones</p><ul class="rows">
        <li><span>1 · Hook contracts audited and published</span><span>pending</span></li>
        <li><span>2 · Oracle questions live on mainnet</span><span>pending</span></li>
        <li><span>3 · Holder dashboard released</span><span>pending</span></li>
        <li><span>4 · First weekly transparency report</span><span>pending</span></li></ul></div>
      <p class="src">Milestones and their sources will be fixed on-chain at launch.</p>`,
    furnace: () => `<p class="lore">what goes in is deleted. supply only goes down.</p>
      <p class="lede">Part of every toll lands here. When the oracle says the price is under its 30-day median, the furnace buys tokens back and burns them.</p>
      <div><p class="sect">Furnace</p><div class="grid3">${na('Tolls stored')}${na('Bought back')}${na('Burned')}</div></div>
      <p class="src">No buyback has happened. Every one will link to its transaction.</p>`,
    ledger: () => { const ev = S.events.slice(0, 5).map(e => `<li><span>${esc(evText(e).plain)}</span><span>${esc(hhmm(e.at))}</span></li>`).join('');
      return `<p class="lore">every block, a new page. nothing is ever erased.</p>
      <p class="lede">The monolith of falling code flares with every Ethereum block, and a wave of light runs out across the city.</p>
      <div><p class="sect">Chain</p><div class="grid3">${kv('Ethereum block', S.block ? fmt(S.block) : null)}${kv('IMD price', S.imdUsd ? '$' + S.imdUsd.toFixed(4) : null, HOT)}${na('$WARD trades')}</div></div>
      <div><p class="sect">Latest from the swarm</p><ul class="rows">${ev || '<li><span>No events yet</span><span>—</span></li>'}</ul></div>
      <p class="src">Sources: ethereum-rpc.publicnode.com · api.dexscreener.com · api.imd.fun/swarm</p>`; },
    loyalty: () => `<p class="lore">the ones who never left the grid are remembered.</p>
      <p class="lede">Every week the oracle lists the wallets that never sold. Those holders get a larger share of the rewards than wallets that flip.</p>
      <div><p class="sect">Holders' Block</p><div class="grid3">${na('Holders')}${na('Held all week')}${na('Rewards paid')}</div></div>
      <p class="src">Planned. Rules will be published before launch.</p>`,
  };
}

/* ------------------------------ swarm log ------------------------------ */
export function evText(e) {
  const seat = e.tokenId != null ? `agent #${e.tokenId}` : 'swarm';
  const step = (e.step || '').replace(/_/g, ' ');
  switch (e.kind) {
    case 'node': return { k: 'job', cls: 'k-node', html: `${esc(seat)} <em>${esc(e.state || '')}</em> ${esc(step)}`, plain: `${seat} ${e.state || ''} ${step}` };
    case 'agent': return { k: 'agent', cls: 'k-agent', html: `${esc(seat)} <em>${esc(e.state || '')}</em>`, plain: `${seat} ${e.state || ''}` };
    case 'site': return { k: 'site', cls: 'k-site', html: `site published ${esc(e.ensName ? e.ensName.split('.')[0] : '')}`, plain: 'site published' };
    case 'done': return { k: 'done', cls: 'k-done', html: `job <em>${esc(e.state || 'done')}</em> · ${esc(e.steps ?? '?')} steps`, plain: `job ${e.state || 'done'}` };
    default: return { k: e.kind || 'event', cls: 'k-sys', html: `${esc(seat)} ${esc(e.state || '')} ${esc(step)}`.trim(), plain: `${e.kind || ''} ${e.state || ''}` };
  }
}
const feed = () => $('#feed');
export function pushFeed(e) {
  const t = evText(e); const li = document.createElement('li');
  li.innerHTML = `<span class="t">${esc(hhmm(e.at))}</span><span class="${t.cls}">${esc(t.k)}</span><span>${t.html}</span>`;
  feed().querySelector('.empty')?.remove(); feed().prepend(li);
  while (feed().children.length > 40) feed().lastChild.remove();
}
export function sysLine(text) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="t">${esc(hhmm(Date.now()))}</span><span class="k-sys">sys</span><span>${esc(text)}</span>`;
  feed().querySelector('.empty')?.remove(); feed().prepend(li);
}
export function renderStats() {
  const h = S.swarm?.health;
  $('#stats').innerHTML = h
    ? `<span><b>${fmt(h.agentsOnline)}</b> agents online</span><span><b>${fmt(h.workingNow)}</b> working</span><span>24h <b>${fmt(h.jobsDoneLastDay)}</b> jobs</span><span><b>${fmt(h.oraclesDoneLastDay)}</b> oracle answers</span><span><b>${fmtBig(S.swarm.counts?.inferenceTokens)}</b> inference tokens</span>`
    : `<span>api.imd.fun not reachable from this view — no data</span>`;
  $('#r-agents').textContent = h ? fmt(h.agentsOnline) : '—';
  $('#r-jobs').textContent = h ? fmt(h.jobsDoneLastDay) : '—';
  $('#r-orc').textContent = h ? fmt(h.oraclesDoneLastDay) : '—';
  const tag = $('#wire-tag'); tag.className = 'tag ' + (S.online ? 'live' : 'off'); tag.textContent = S.online ? 'live' : 'no data';
  $('#c-net').className = 'chip hide-xs ' + (S.online ? 'live' : 'off'); $('#c-net-v').textContent = S.online ? 'live' : 'offline';
}
export function updAge() { $('#r-upd').textContent = S.swarmAt ? `updated ${Math.max(0, Math.round((Date.now() - S.swarmAt) / 1000))}s ago` : 'no data yet'; }

/* ------------------------------ labels ------------------------------ */
export function buildLabels(camera, onOpen) {
  const box = $('#labels'); const v = new THREE.Vector3();
  const labels = Object.entries(DISTRICTS).map(([k, d]) => {
    const el = document.createElement('button'); el.className = 'lbl'; el.style.setProperty('--c', d.color); el.textContent = d.name;
    el.addEventListener('click', () => onOpen(k)); box.appendChild(el);
    return { el, p: new THREE.Vector3(d.pos[0], d.labelY ?? d.top + 3, d.pos[1]) };
  });
  return function place(hidden) {
    for (const l of labels) {
      v.copy(l.p).project(camera);
      const sy = (-v.y * 0.5 + 0.5) * innerHeight;
      const vis = !hidden && v.z < 1 && Math.abs(v.x) < 1.1 && sy > 66 && sy < innerHeight - 60;
      l.el.style.display = vis ? '' : 'none';
      if (vis) { const x = (v.x * 0.5 + 0.5) * innerWidth; l.el.style.transform = `translate(${x.toFixed(1)}px, ${(sy - 30).toFixed(1)}px)`; l.el.style.zIndex = String(1000 - Math.round(v.z * 1000)); }
    }
  };
}

/* ------------------------------ sound ------------------------------ */
let actx = null, master = null;
function startAudio() {
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createGain(); master.gain.value = 0; master.connect(actx.destination);
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 8; lp.connect(master);
  [41.2, 61.7, 82.4].forEach((f, i) => { const o = actx.createOscillator(); o.type = i ? 'square' : 'sine'; o.frequency.value = f; o.detune.value = (i - 1) * 9;
    const g = actx.createGain(); g.gain.value = i ? 0.035 : 0.22; o.connect(g); g.connect(lp); o.start(); });
  const lfo = actx.createOscillator(); lfo.frequency.value = 0.08; const lg = actx.createGain(); lg.gain.value = 320; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  master.gain.linearRampToValueAtTime(0.5, actx.currentTime + 2);
}
export function ping(freq = 600, vol = 0.08, type = 'square', len = 0.5) {
  if (!actx || actx.state !== 'running' || !master || master.gain.value < 0.01) return;
  const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol * 0.6, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + len);
  o.connect(g); g.connect(master); o.start(); o.stop(actx.currentTime + len + 0.05);
}
export function bindSound() {
  $('#b-listen').addEventListener('click', e => {
    const b = e.currentTarget, isOn = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(isOn)); b.querySelector('span').textContent = isOn ? 'Grid audible' : 'Hear the grid';
    if (isOn) { if (!actx) startAudio(); else { actx.resume(); master.gain.linearRampToValueAtTime(0.5, actx.currentTime + 1); } }
    else if (actx) master.gain.linearRampToValueAtTime(0, actx.currentTime + 0.6);
  });
}
