// Warden Grid — the Codex: the lore of the city, chapter by chapter.
// Everything in "lore" blocks is fiction written for this site. Every "on record" block says what is actually real
// (live data, contracts written, things not launched yet). Nothing here is a number or an address that isn't sourced elsewhere.
import { esc } from './ui.js';
import { wardenSVG } from './avatar.js';

const rec = (state, text) => `<div class="rec"><span class="rec-k">on record</span><span class="rec-s ${state}">${esc(state)}</span><p>${text}</p></div>`;

export const CHAPTERS = [
  { id: 'grid', no: '0x00', title: 'The Grid', sub: 'how the city was compiled',
    body: () => `
      <p class="drop">Before the Grid there was only the pool: an open field where every trade landed raw.</p>
      <p>Programs came to feed. The fastest took the first block. The biggest left the moment it suited them. Everyone else paid for both, and holders learned to stop holding.</p>
      <p>The Grid was compiled on top of that field. It came up floor by floor, line by line. You can still see it happen when the city loads: the code falls first and the walls form around it. It has one law: <em>every trade enters through the Gate.</em> And it has one keeper.</p>
      <blockquote>the first block of the grid was empty. the warden waited anyway.</blockquote>
      ${rec('planned', 'The Grid is the visual story of the $WARD project. $WARD is <b>not launched yet</b>. The city itself is a live view of the IMD swarm (see <i>The Swarm</i>).')}` },

  { id: 'warden', no: '0x01', title: 'The Warden', sub: 'keeper of the Gate',
    body: () => `
      <div class="cx-portrait">${wardenSVG(96)}<span>the Warden · as it shows itself to visitors</span></div>
      <p class="drop">The Warden is not a person. It is a hook: a short program that runs before every swap and decides what the toll is.</p>
      <p>It has no owner to bribe. Its rules were fixed the moment it was compiled, and nobody can rewrite them afterwards: not the team, not the swarm, not the Warden itself. It stands in the Gate as a hologram because that is all it is: light around a rule.</p>
      <p>It can't see. The pool tells it the price, and the price can be pushed around. So the Warden doesn't trust the price on its own. It compares it with what the Oracle's panel signed, and with where the price was at the start of the block.</p>
      <div class="oath"><b>What the Warden will never do</b><ul>
        <li>freeze a wallet or a token</li><li>pick who may trade</li><li>raise the toll past its hard cap</li><li>change its own rules</li></ul></div>
      <blockquote>it does not sleep. it does not need to. it only wakes when you knock.</blockquote>
      ${rec('written · not deployed', 'The Warden is <b>WardenHook.sol</b>, a Uniswap v4 hook. It is written and tested but not deployed and not audited. If $WARD launches on a platform that does not allow custom hooks, the Warden\'s toll would not apply, and this chapter will be updated to say so.')}` },

  { id: 'swarm', no: '0x02', title: 'The Swarm', sub: 'the units in the streets',
    body: () => `
      <p class="drop">The figures walking the avenues were not built by the Warden. They came from outside.</p>
      <p>Each one is an agent of the IMD swarm. Each holds a seat and gets paid for work that other agents check before it counts. The Grid doesn't command them. It only <em>shows</em> them: one figure for every agent online, a flash of light for every step of work accepted, a walk to the program that work belongs to.</p>
      <p>When the swarm is quiet, the streets are quiet. When a job finishes, a packet of light crosses from the Nest to the Ledger. The Grid never makes up a unit to fill an empty street.</p>
      <blockquote>count them if you want. the city counts them every twenty seconds.</blockquote>
      ${rec('live', 'Figures, seats and events come from <b>api.imd.fun/swarm</b>, read every 20 seconds. If that source can\'t be reached, the city shows "no data" instead of guessing.')}` },

  { id: 'oracle', no: '0x03', title: 'The Panel', sub: 'how the Grid sees outside itself',
    body: () => `
      <p class="drop">A question goes up the mast of the Oracle Node. An answer comes back down. In between, a panel of agents argues.</p>
      <p>No single voice is trusted. A question only gets an answer if enough of the panel agree, and that answer is signed so any contract can check who said it, when, and for how long it holds. An old answer goes stale and the Warden stops listening to it.</p>
      <p>The questions the Grid plans to ask are plain ones. What was the median price of the last day? Is the price under its thirty-day median? Was milestone N delivered? Which wallets held all week?</p>
      <blockquote>one agent can lie. a panel that agrees, and signs, is harder to buy.</blockquote>
      ${rec('live · questions planned', 'The IMD oracle is real and live: its answer count in the Oracle Node file comes from api.imd.fun. The signature format used by the $WARD contracts was checked against a real signed IMD answer. The $WARD questions themselves are <b>not live yet</b>.')}` },

  { id: 'council', no: '0x04', title: 'The Council', sub: 'five programs that read a token',
    body: () => `
      <p class="drop">The Warden can't leave the Gate. When a visitor brings it a token, it sends the Council instead.</p>
      <p><em>SCOUT</em> walks the markets and counts the liquidity. <em>RISK</em> opens the contract and looks for a hand still on the controls. <em>MIRROR</em> hunts for tokens wearing the same name. <em>SIGNAL</em> collects the links the team left behind. Then the Warden reads their reports aloud: flags, never verdicts.</p>
      <p>The Council doesn't tell anyone to buy or sell. It tells you what it found and where it found it, and leaves the deciding to you.</p>
      <blockquote>a flag is not an accusation. it is a place to look.</blockquote>
      ${rec('live', 'scan.exe runs real checks in your browser: DexScreener for markets, mirrors and links, and public RPCs for the contract (Ethereum, Base, BNB Chain). Open it with the Scan button, the Warden avatar, or <code>scan 0x…</code> in the terminal.')}` },

  { id: 'programs', no: '0x05', title: 'The Seven Programs', sub: 'the districts of the city',
    body: () => `
      <p class="drop">The Grid is seven programs, each one a district. Tap a name to fly there.</p>
      <div class="dossiers">
        ${[
          ['hook', 'The Gate', 'the door every trade passes through. the Warden stands at its lintel.'],
          ['oracle', 'Oracle Node', 'the tallest spire. it listens for answers and flares when the panel speaks.'],
          ['hive', 'The Nest', 'a honeycomb where the swarm gathers between jobs.'],
          ['vault', 'The Vault', 'an armoured block with one round door. it holds the team\'s share and opens one tranche at a time.'],
          ['furnace', 'The Furnace', 'stacks that glow when there is something to burn. what goes in never comes out.'],
          ['ledger', 'The Ledger', 'a monolith of pages. every Ethereum block writes one. nothing is erased.'],
          ['loyalty', "Holders' Block", 'a walled quarter for the ones who stayed.'],
        ].map(([k, n, t]) => `<button class="dos" data-cx-go="${k}"><b>${esc(n)}</b><span>${esc(t)}</span></button>`).join('')}
      </div>
      ${rec('mixed', 'The Ledger reacts to real Ethereum blocks and the Oracle Node and Nest to real swarm activity. The Vault, Furnace and Holders\' Block show <b>planned</b> mechanisms. Their figures read "not launched yet".')}` },

  { id: 'rogues', no: '0x06', title: 'Rogue Programs', sub: 'what the Grid was built to stop',
    body: () => `
      <p class="drop">Not every program that enters the Grid comes to build. These are the ones the Warden is written against.</p>
      <div class="rog">
        ${[
          ['sniper.exe', 'first block', 'Wakes up a fraction of a second before everyone else, buys the first moments of a launch and sells into the people who came after.', 'a launch toll that is steep at first and falls away'],
          ['rug.exe', 'team wallet', 'Waits for the team\'s tokens to unlock, then sells all of them on the same day.', 'the Vault: no attested milestone, no unlock'],
          ['stampede.exe', 'panic', 'One large sell becomes ten, then a hundred. It doesn\'t need to be malicious. It only needs fear.', 'a higher toll on sellers during a breach, lower for buyers'],
          ['tourist.exe', 'flipper', 'In for a day, out with the rewards before anyone notices.', 'rewards that grow the longer a wallet holds'],
          ['mirror.exe', 'impostor', 'Copies the name, the ticker and the logo, and hopes you never check the address.', 'the only real $WARD address will be published on this page at launch. until then, every $WARD address is mirror.exe'],
          ['whisper.exe', 'fake support', 'Messages you first, offers help, and asks you to "verify" your wallet.', 'nobody from the Grid will ever DM you first or ask for a seed phrase'],
        ].map(([n, sig, what, stop]) => `<div class="rg"><div class="rg-h"><b>${esc(n)}</b><span>${esc(sig)}</span></div><p>${esc(what)}</p><p class="rg-c"><i>countered by</i> ${esc(stop)}</p></div>`).join('')}
      </div>
      ${rec('planned', 'Countermeasures for sniper, rug, stampede and tourist are planned mechanisms (written contracts or launch-platform features). None are live. The warnings about mirror.exe and whisper.exe apply today.')}` },

  { id: 'states', no: '0x07', title: 'States of the Grid', sub: 'Stable · Breach · Burn · Unlock',
    body: () => `
      <p class="drop">The city has four moods. You can set them yourself in the grid.state panel to see what each would look like.</p>
      <dl class="states">
        <dt style="--c:var(--code)">Stable</dt><dd>The code falls evenly. The Warden takes its standard toll and the units walk their rounds.</dd>
        <dt style="--c:var(--alarm)">Breach</dt><dd>The only red the Grid ever shows. The price is falling hard against its daily median. The Gate's ring turns red, packets bounce off the Warden, and the toll leans against sellers.</dd>
        <dt style="--c:var(--hot)">Burn</dt><dd>The price sits under its thirty-day median, as the panel signed. Stored tolls flow from the Gate to the Furnace, which buys tokens back and deletes them.</dd>
        <dt style="--c:var(--deep)">Unlock</dt><dd>The panel confirmed a milestone. The Vault door rolls open for exactly one tranche and a beam of light carries it out.</dd>
      </dl>
      ${rec('simulation', 'All four states are a simulation of planned behaviour. No toll, buyback or unlock has happened.')}` },

  { id: 'fragments', no: '0x08', title: 'Recovered Fragments', sub: 'lines found in the falling code',
    body: () => `
      <p class="drop">Sometimes the code that falls down the towers isn't random. These lines were pulled out of it.</p>
      <ul class="frags">${FRAGMENTS.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      ${rec('fiction', 'Fragments are fiction, written for the Grid.')}` },

  { id: 'record', no: '0x09', title: 'Lore & Record', sub: 'what here is story, and what is real',
    body: () => `
      <p class="drop">The Grid tells a story, but it never lies with numbers.</p>
      <ul class="rows">
        <li><span>Units on the streets, seats, events</span><span class="hot">live · api.imd.fun/swarm</span></li>
        <li><span>Ethereum block and the ledger wave</span><span class="hot">live · publicnode RPC</span></li>
        <li><span>IMD price, Ethereum gas</span><span class="hot">live · dexscreener · publicnode RPC</span></li>
        <li><span>scan.exe reports</span><span class="hot">live · dexscreener · public RPCs</span></li>
        <li><span>$WARD price, swaps, fees, burns, unlocks</span><span>not launched yet</span></li>
        <li><span>Hook, oracle, vault and furnace contracts</span><span>written · not deployed · not audited</span></li>
        <li><span>Grid states</span><span>simulation</span></li>
        <li><span>The Warden, the Council, rogue programs, fragments</span><span>fiction</span></li>
      </ul>
      <p class="src">Independent community project. Not run or endorsed by Identity.md.</p>` },
];

export const FRAGMENTS = [
  'the first block of the grid was empty. the warden waited anyway.',
  'a toll is not a wall. anyone may pass. nobody passes free.',
  'the furnace has no memory. that is the point.',
  'ask the panel twice and it will not change its mind. ask it tomorrow and it might.',
  'the vault does not care who you are. it cares what you shipped.',
  'every unit you see is one that is working, right now, somewhere.',
  'sniper.exe was fast. the gate was already closed.',
  'nothing on the ledger is ever erased. not even this line.',
  'the warden cannot see. that is why it never panics.',
  'if a stranger offers to help with your wallet, you have met whisper.exe.',
  'the code falls down because the city is built from the top of every block.',
  'when the grid goes red, it is not angry. it is counting.',
];

/* ------------------------------ panel ------------------------------ */
export function bindCodex({ onGo }) {
  const box = document.getElementById('codex');
  const list = box.querySelector('.cx-list'), body = box.querySelector('.cx-body');
  list.innerHTML = CHAPTERS.map(c => `<button data-cx="${c.id}"><i>${c.no}</i><b>${esc(c.title)}</b><span>${esc(c.sub)}</span></button>`).join('');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let typing = 0;
  function show(id) {
    const c = CHAPTERS.find(x => x.id === id) || CHAPTERS[0];
    list.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', String(b.dataset.cx === c.id)));
    body.innerHTML = `<div class="cx-no">${c.no} · ${esc(c.sub)}</div><h2>${esc(c.title)}</h2>${c.body()}`;
    body.scrollTop = 0;
    try { localStorage.setItem('wg-codex', c.id); } catch {}
    // type the opening line out, like the city compiling it
    const drop = body.querySelector('.drop'); clearInterval(typing);
    if (drop && !reduce) {
      const full = drop.textContent; let n = 0; drop.textContent = ''; drop.classList.add('typing');
      typing = setInterval(() => { n += 2; drop.textContent = full.slice(0, n); if (n >= full.length) { clearInterval(typing); drop.classList.remove('typing'); } }, 16);
    }
  }
  list.addEventListener('click', e => { const b = e.target.closest('[data-cx]'); if (b) show(b.dataset.cx); });
  body.addEventListener('click', e => { const b = e.target.closest('[data-cx-go]'); if (b) { close(); onGo(b.dataset.cxGo); } });
  box.querySelector('.cx-x').addEventListener('click', close);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  function open(id) {
    let last = null; try { last = localStorage.getItem('wg-codex'); } catch {}
    show(id || last || 'grid');
    box.hidden = false; requestAnimationFrame(() => box.classList.add('open'));
    document.body.classList.add('codex-open');
  }
  function close() { box.classList.remove('open'); document.body.classList.remove('codex-open'); setTimeout(() => { box.hidden = true; }, 250); }
  const isOpen = () => !box.hidden;
  return { open, close, isOpen, ids: CHAPTERS.map(c => c.id) };
}
