// Monte Carlo engine (TypeScript). Mirrored 1:1 in api/py-predict.py and
// rust-sim/src/lib.rs so the same model runs in three languages.
import { HOME_COURT_ADV, LEAGUE_AVG_PTS } from "./nba";

const SIGMA = 12; // stdev of a single NBA game margin vs expectation

// Box-Muller standard normal.
function gauss(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export type GameResult = {
  homeWinPct: number;
  expectedMargin: number; // + = home favored
  homeScore: number;
  awayScore: number;
  sims: number;
};

// Single game: home/away are net ratings (point diff vs avg opponent).
export function simulateGame(
  homeRating: number,
  awayRating: number,
  sims = 10000,
  neutral = false,
): GameResult {
  const expected = homeRating - awayRating + (neutral ? 0 : HOME_COURT_ADV);
  let homeWins = 0, marginSum = 0;
  for (let i = 0; i < sims; i++) {
    const m = expected + SIGMA * gauss();
    if (m > 0) homeWins++;
    marginSum += m;
  }
  const meanMargin = marginSum / sims;
  return {
    homeWinPct: homeWins / sims,
    expectedMargin: expected,
    homeScore: Math.round(LEAGUE_AVG_PTS + meanMargin / 2),
    awayScore: Math.round(LEAGUE_AVG_PTS - meanMargin / 2),
    sims,
  };
}

// One game outcome -> true if home wins (used by season sim).
export function flipGame(homeRating: number, awayRating: number, neutral = false): boolean {
  return homeRating - awayRating + (neutral ? 0 : HOME_COURT_ADV) + SIGMA * gauss() > 0;
}
