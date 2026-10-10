// Warden Grid — agent service settings and risk profiles (project configuration, not market data).
// SERVICE.keeper: the project's keeper address (the 24/7 bot that trades users' agents). null until announced —
// until then users paste a keeper address themselves (their own warden-keeper, for example).
export const SERVICE = { keeper: null, feeBps: 30 };   // feeBps: suggested service fee per keeper buy (0.30 %), max 1 % on-chain

// Risk profiles fill the agent's limits and strategy. Every value can be edited before signing.
export const PROFILES = {
  1: { key: 'prudent', label: 'Prudent', blurb: 'Few, small trades. Only the highest scores. Tight stops.',
       limits: { mpt: 0.02, cap: 0.06, pos: 3, loss: 20 }, strat: { minScore: 92, stopPct: 10, takePct: 25, trailPct: 8, maxHoldH: 12, slippageBps: 200 } },
  2: { key: 'balanced', label: 'Balanced', blurb: 'The Warden default: score 85 or more, medium size.',
       limits: { mpt: 0.05, cap: 0.2, pos: 5, loss: 30 }, strat: { minScore: 85, stopPct: 15, takePct: 40, trailPct: 12, maxHoldH: 24, slippageBps: 300 } },
  3: { key: 'aggressive', label: 'Aggressive', blurb: 'More positions, lower threshold, wider stops. More risk.',
       limits: { mpt: 0.1, cap: 0.5, pos: 8, loss: 45 }, strat: { minScore: 75, stopPct: 25, takePct: 80, trailPct: 18, maxHoldH: 48, slippageBps: 500 } },
};
