// The single simulation engine: Rust compiled to WASM, run client-side.
// Everything probability-related goes through here. No TS/Python fallback.
// Loaded lazily on the client so the wasm-bindgen glue never runs during SSR.
let wasm: any;
let ready: Promise<void> | null = null;
function ensure() {
  if (!ready)
    ready = (async () => {
      const mod = await import("./wasm-sim/nba_sim.js");
      await mod.default();
      wasm = mod;
    })();
  return ready;
}

export type GameResult = { homeWinPct: number; expectedMargin: number; homeScore: number; awayScore: number; sims: number };
export type SeasonRow = { idx: number; projWins: number; playoffPct: number; top6Pct: number; avgSeed: number };
export type TitleRow = { idx: number; projWins: number; finalsPct: number; champPct: number };
export type SeedOdds = { idx: number; champPct: number; finalsPct: number };

const f64 = (a: number[]) => Float64Array.from(a);
const u32 = (a: number[]) => Uint32Array.from(a);

export async function simGame(homeRating: number, awayRating: number, sims = 10000): Promise<GameResult> {
  await ensure();
  const r = wasm.simulate_game(homeRating, awayRating, sims);
  return { homeWinPct: r[0], expectedMargin: r[1], homeScore: Math.round(r[2]), awayScore: Math.round(r[3]), sims };
}

export async function simSeason(ratings: number[], conf: number[], home: number[], away: number[], sims = 10000): Promise<SeasonRow[]> {
  await ensure();
  const out = wasm.simulate_season(f64(ratings), u32(conf), u32(home), u32(away), sims);
  return ratings.map((_, i) => ({
    idx: i, projWins: +out[i * 4].toFixed(1), playoffPct: +out[i * 4 + 1].toFixed(1),
    top6Pct: +out[i * 4 + 2].toFixed(1), avgSeed: +out[i * 4 + 3].toFixed(2),
  }));
}

export async function simPlayoffsFull(ratings: number[], conf: number[], home: number[], away: number[], sims = 10000): Promise<TitleRow[]> {
  await ensure();
  const out = wasm.simulate_playoffs_full(f64(ratings), u32(conf), u32(home), u32(away), sims);
  return ratings.map((_, i) => ({
    idx: i, projWins: +out[i * 3].toFixed(1), finalsPct: +out[i * 3 + 1].toFixed(1), champPct: +out[i * 3 + 2].toFixed(1),
  }));
}

// east/west: 8 team indices in seed order. Returns 16 rows (east then west).
export async function simPlayoffsFromSeeds(east: number[], west: number[], ratings: number[], sims = 10000): Promise<SeedOdds[]> {
  await ensure();
  const out = wasm.simulate_playoffs_from_seeds(u32(east), u32(west), f64(ratings), sims);
  return [...east, ...west].map((idx, k) => ({ idx, champPct: +out[k * 2].toFixed(1), finalsPct: +out[k * 2 + 1].toFixed(1) }));
}
