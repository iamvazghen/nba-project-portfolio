// Loads the Rust->WASM engine if it's been built (npm run build:wasm), and
// falls back to the TS engine otherwise — so the site always works.
import { simulateGame, type GameResult } from "./sim";

let wasm: any | undefined;
let tried = false;

export async function simulateGameWasm(
  homeRating: number,
  awayRating: number,
  sims = 10000,
): Promise<{ result: GameResult; engine: "rust-wasm" | "typescript" }> {
  if (!tried) {
    tried = true;
    try {
      // @ts-expect-error - generated only after `npm run build:wasm`
      const mod = await import("./wasm-sim/nba_sim.js");
      await mod.default();
      wasm = mod;
    } catch {
      wasm = undefined; // not built — use TS
    }
  }
  if (wasm?.simulate_game) {
    const r = wasm.simulate_game(homeRating, awayRating, sims) as Float64Array;
    return {
      engine: "rust-wasm",
      result: {
        homeWinPct: r[0],
        expectedMargin: r[1],
        homeScore: Math.round(r[2]),
        awayScore: Math.round(r[3]),
        sims,
      },
    };
  }
  return { engine: "typescript", result: simulateGame(homeRating, awayRating, sims) };
}
