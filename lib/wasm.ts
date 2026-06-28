// The single simulation engine: Rust compiled to WASM, run client-side.
// `var` arrays are per-team variance multipliers (1.0 = normal; >1 = wider,
// higher-ceiling outcomes for young/high-upside rosters).
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

export async function simGame(homeRating: number, awayRating: number, sims = 10000, homeVar = 1, awayVar = 1): Promise<GameResult> {
  await ensure();
  const r = wasm.simulate_game(homeRating, awayRating, sims, homeVar, awayVar);
  return { homeWinPct: r[0], expectedMargin: r[1], homeScore: Math.round(r[2]), awayScore: Math.round(r[3]), sims };
}

export async function simSeason(ratings: number[], variance: number[], conf: number[], home: number[], away: number[], sims = 10000): Promise<SeasonRow[]> {
  await ensure();
  const out = wasm.simulate_season(f64(ratings), f64(variance), u32(conf), u32(home), u32(away), sims);
  return ratings.map((_, i) => ({
    idx: i, projWins: +out[i * 4].toFixed(1), playoffPct: +out[i * 4 + 1].toFixed(1),
    top6Pct: +out[i * 4 + 2].toFixed(1), avgSeed: +out[i * 4 + 3].toFixed(2),
  }));
}

export async function simPlayoffsFull(ratings: number[], variance: number[], conf: number[], home: number[], away: number[], sims = 10000): Promise<TitleRow[]> {
  await ensure();
  const out = wasm.simulate_playoffs_full(f64(ratings), f64(variance), u32(conf), u32(home), u32(away), sims);
  return ratings.map((_, i) => ({
    idx: i, projWins: +out[i * 3].toFixed(1), finalsPct: +out[i * 3 + 1].toFixed(1), champPct: +out[i * 3 + 2].toFixed(1),
  }));
}

export async function simPlayoffsFromSeeds(east: number[], west: number[], ratings: number[], variance: number[], sims = 10000): Promise<SeedOdds[]> {
  await ensure();
  const out = wasm.simulate_playoffs_from_seeds(u32(east), u32(west), f64(ratings), f64(variance), sims);
  return [...east, ...west].map((idx, k) => ({ idx, champPct: +out[k * 2].toFixed(1), finalsPct: +out[k * 2 + 1].toFixed(1) }));
}
