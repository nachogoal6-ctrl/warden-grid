// Warden Grid — the Council panel (scan.exe UI) and the Warden avatar dock.
// The Warden's lines are built from live state (or say "no data"); fragments are marked as fiction in the Codex.
import { $, esc, fmt } from './ui.js';
import { S } from './data.js';
import { wardenSVG, sigilSVG } from './avatar.js';
import { AGENTS, runScan, scanHeader } from './scan.js';
import { FRAGMENTS } from './codex.js';

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const STATE_TXT = { queued: 'queued', working: 'working…', done: 'done', nodata: 'no data' };

export function bindCouncil({ onStart, onAgent, onDone } = {}) {
  const box = $('#council'); const form = $('#scan-form'), inp = $('#scan-in'), out = $('#scan-out'), roster = $('#roster');
  const draw = (st = {}) => roster.innerHTML = AGENTS.map(a => `<li class="ag s-${st[a.id]?.state || 'idle'}">${sigilSVG('council:' + a.id, 30)}<div><b>${a.name}</b><span>${a.job}</span></div><em>${st[a.id] ? STATE_TXT[st[a.id].state] : 'idle'}</em></li>`).join('');
  draw();
  let busy = false;
  async function scan(addr) {
    if (busy) return; if (!ADDR.test(addr)) { out.innerHTML = '<p class="serr">That is not an EVM address (0x followed by 40 hex characters). Solana and other formats aren\'t supported yet.</p>'; return; }
    busy = true; form.querySelector('button').disabled = true; inp.value = addr;
    const st = {}; AGENTS.forEach(a => st[a.id] = { state: 'queued' }); draw(st);
    out.innerHTML = `<div class="sh">${sigilSVG(addr.toLowerCase(), 46)}<div><b>scanning…</b><code>${esc(addr.toLowerCase())}</code></div></div>` + AGENTS.map(a => `<section class="sec" data-sec="${a.id}"><h4>${a.name}<i>${a.job}</i></h4><div class="sb"><p class="wait">queued</p></div></section>`).join('');
    onStart?.(addr);
    try {
      const R = await runScan(addr, { onStep: (id, state, html, R) => {
        st[id] = { state }; draw(st); onAgent?.(id, state);
        const sec = out.querySelector(`[data-sec="${id}"]`);
        if (sec) { sec.className = 'sec s-' + state; sec.querySelector('.sb').innerHTML = html || `<p class="wait">${STATE_TXT[state]}</p>`; }
      } });
      out.querySelector('.sh').outerHTML = scanHeader(R);
      onDone?.(R);
    } finally { busy = false; form.querySelector('button').disabled = false; }
  }
  form.addEventListener('submit', e => { e.preventDefault(); scan(inp.value.trim()); });
  box.querySelector('.cx-x').addEventListener('click', close);
  box.addEventListener('click', e => { if (e.target === box) close(); const b = e.target.closest('[data-scan]'); if (b) scan(b.dataset.scan); });
  function open(addr) { box.hidden = false; void box.offsetWidth; box.classList.add("open"); document.body.classList.add('codex-open'); if (addr) scan(addr); else setTimeout(() => inp.focus(), 50); }
  function close() { box.classList.remove('open'); document.body.classList.remove('codex-open'); setTimeout(() => { box.hidden = true; }, 250); }
  return { open, close, isOpen: () => !box.hidden, scan };
}

/* ------------------------------ the Warden avatar ------------------------------ */
export function bindWarden({ onClick, getMode }) {
  const dock = $('#warden-dock'), face = dock.querySelector('.wd-face'), bubble = dock.querySelector('.wd-say');
  let alarm = null;
  const paint = () => { const a = getMode() === 'panic'; if (a !== alarm) { alarm = a; face.innerHTML = wardenSVG(52, { alarm: a, cls: 'wd-svg' }); } };
  paint();
  let i = 0, hideT = 0;
  function lines() {
    const h = S.swarm?.health; const L = [];
    if (getMode() === 'panic') L.push('breach drill. the toll leans against sellers. this is a simulation.');
    if (h) { L.push(`${fmt(h.agentsOnline)} units on the grid. ${fmt(h.workingNow)} working right now.`); L.push(`${fmt(h.oraclesDoneLastDay)} oracle answers signed in the last day.`); L.push(`${fmt(h.jobsDoneLastDay)} jobs finished by the swarm in 24h.`); }
    else L.push('api.imd.fun is not reachable from here. I won\'t guess.');
    if (S.block) L.push(`block ${fmt(S.block)} is on the ledger.`);
    L.push('$WARD is not launched. any $WARD trading today is mirror.exe.');
    L.push('give me a token address. the council will scan it.');
    L.push(FRAGMENTS[Math.floor(Math.random() * FRAGMENTS.length)]);
    return L;
  }
  function say(text, ms = 7000) { bubble.textContent = text; dock.classList.add('talk'); clearTimeout(hideT); hideT = setTimeout(() => dock.classList.remove('talk'), ms); }
  function tick() { paint(); const L = lines(); say(L[i++ % L.length]); }
  setTimeout(tick, 16000); setInterval(tick, 26000);
  dock.querySelector('.wd-btn').addEventListener('click', () => onClick?.());
  return { say, paint };
}
