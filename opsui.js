// Warden Grid — ops.exe window: tabs over the views in ops.js, network switch, cycle clock, autopilot controls.
import { $, esc } from './ui.js';
import { mountLive } from './livevault.js';
import { O, NETS, views, onOps, runCycle, setNet, setCfg, stopAll, resetBook, closePos, startOps, equity, usd } from './ops.js';

const TABS = [['matrix', 'Agents'], ['radar', 'Radar'], ['market', 'Market'], ['tape', 'Large trades'], ['intel', 'Intel'], ['auto', 'Autopilot'], ['live', 'Live vault']];

export function bindOps({ onEvent } = {}) {
  const box = $('#ops'), body = $('#ops-body'), tabs = $('#ops-tabs'), net = $('#ops-net'), clock = $('#ops-clock');
  let tab = 'matrix'; try { tab = localStorage.getItem('wg-ops-tab') || 'matrix'; } catch {}
  tabs.innerHTML = TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('');
  net.innerHTML = Object.entries(NETS).map(([k, n]) => `<option value="${k}">${esc(n.name)}</option>`).join(''); net.value = O.net;
  const typing = () => box.contains(document.activeElement) && document.activeElement.matches('input');
  function render(force) {
    if (box.hidden) return; if (!force && tab === 'auto' && typing()) return;
    if (tab === 'live') { if (!force) return; tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', String(b.dataset.tab === tab))); body.innerHTML = '<div id="lv-root"></div>'; mountLive(body.firstChild); return; }
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
    const y = body.scrollTop; body.innerHTML = views[tab](); body.scrollTop = y;
  }
  let pend = 0; const soon = () => { clearTimeout(pend); pend = setTimeout(render, 250); };
  onOps((ev, x) => {
    if (ev === 'agent' && tab === 'matrix') soon();
    else if (ev === 'intel' && (tab === 'intel' || tab === 'matrix')) soon();
    else if (['cycle', 'market', 'book', 'trade'].includes(ev)) soon();
    rail(); onEvent?.(ev, x);
  });
  function rail() {
    const r = $('#r-ops'); if (!r) return;
    const n = [...O.cands.values()].filter(c => c.s && !c.blocked?.length && c.s.total >= O.cfg.minScore).length;
    r.innerHTML = `ops <b>${O.cands.size}</b> tracked · <b>${n}</b> over ${O.cfg.minScore} · autopilot <b>${O.cfg.on ? 'paper ' + usd(equity()) : 'off'}</b>`;
  }
  setInterval(() => { if (!box.hidden) clock.textContent = O.running ? 'cycle running…' : O.nextAt ? `next cycle ${Math.max(0, Math.round((O.nextAt - Date.now()) / 1000))}s` : 'starting…'; }, 1000);
  tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; try { localStorage.setItem('wg-ops-tab', tab); } catch {} render(true); });
  net.addEventListener('change', () => setNet(net.value));
  $('#ops-run').addEventListener('click', () => runCycle());
  body.addEventListener('click', e => {
    const ap = e.target.closest('[data-ap]');
    if (ap) {
      const a = ap.dataset.ap;
      if (a === 'toggle') { setCfg({ on: !O.cfg.on }); if (O.cfg.on) runCycle(); }
      if (a === 'stop') stopAll();
      if (a === 'reset') resetBook();
      render(true); return;
    }
    const c = e.target.closest('[data-close]'); if (c) { const p = O.book.pos.find(x => x.id === c.dataset.close); if (p) closePos(p, 'closed by hand'); render(true); return; }
  });
  body.addEventListener('submit', e => {
    if (e.target.id !== 'ap-cfg') return; e.preventDefault();
    const f = new FormData(e.target); const patch = {};
    for (const [k, v] of f) { const n = Number(v); if (isFinite(n) && n > 0) patch[k] = n; }
    setCfg(patch); document.activeElement?.blur(); render(true);
  });
  box.querySelector('.cx-x').addEventListener('click', close);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  function open(t) { startOps(); if (t) tab = t; box.hidden = false; void box.offsetWidth; box.classList.add('open'); document.body.classList.add('codex-open'); render(true); }
  function close() { box.classList.remove('open'); document.body.classList.remove('codex-open'); setTimeout(() => { box.hidden = true; }, 250); }
  rail();
  return { open, close, isOpen: () => !box.hidden };
}
