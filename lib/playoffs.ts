// Playoff bracket Monte Carlo. Best-of-7 series (2-2-1-1-1 home pattern) built
// on the same single-game model as lib/sim.ts. Used by /api/playoffs.
import { flipGame } from "./sim";

export type Ratings = Record<string, number>;
export type Seed = { t: string; seed: number };

const HOME_PATTERN = [true, true, false, false, true, false, true]; // higher seed's home games

// Best-of-7; the higher seed gets home-court. Returns true if the higher seed wins.
export function seriesHiWins(hi: number, lo: number): boolean {
  let h = 0, l = 0;
  for (let g = 0; g < 7 && h < 4 && l < 4; g++) {
    const hiWon = HOME_PATTERN[g] ? flipGame(hi, lo) : !flipGame(lo, hi);
    if (hiWon) h++; else l++;
  }
  return h === 4;
}

// 8 seeds in seed order -> conference champion, via the fixed NBA bracket (no reseeding).
function confChampion(seeds: Seed[], r: Ratings): Seed {
  let round = [0, 7, 3, 4, 2, 5, 1, 6].map((i) => seeds[i]); // 1,8,4,5,3,6,2,7
  while (round.length > 1) {
    const next: Seed[] = [];
    for (let i = 0; i < round.length; i += 2) {
      const [a, b] = [round[i], round[i + 1]];
      const hi = a.seed < b.seed ? a : b, lo = a.seed < b.seed ? b : a;
      next.push(seriesHiWins(r[hi.t], r[lo.t]) ? hi : lo);
    }
    round = next;
  }
  return round[0];
}

// One full playoff realization -> champion + both conference winners.
export function simPlayoffs(east: Seed[], west: Seed[], r: Ratings) {
  const ec = confChampion(east, r), wc = confChampion(west, r);
  const hi = r[ec.t] >= r[wc.t] ? ec : wc, lo = hi === ec ? wc : ec; // Finals home-court by rating
  const champ = seriesHiWins(r[hi.t], r[lo.t]) ? hi.t : lo.t;
  return { champ, eastChamp: ec.t, westChamp: wc.t };
}

export type PlayoffOdds = { tricode: string; conf: "East" | "West"; champPct: number; finalsPct: number }[];

// N playoff sims over fixed seeds -> championship / finals odds per team.
export function runPlayoffOdds(east: Seed[], west: Seed[], r: Ratings, sims: number): PlayoffOdds {
  const champ: Record<string, number> = {}, finals: Record<string, number> = {};
  for (let s = 0; s < sims; s++) {
    const { champ: c, eastChamp, westChamp } = simPlayoffs(east, west, r);
    champ[c] = (champ[c] ?? 0) + 1;
    finals[eastChamp] = (finals[eastChamp] ?? 0) + 1;
    finals[westChamp] = (finals[westChamp] ?? 0) + 1;
  }
  const out: PlayoffOdds = [];
  for (const s of [...east, ...west]) {
    out.push({
      tricode: s.t,
      conf: east.includes(s) ? "East" : "West",
      champPct: +(((champ[s.t] ?? 0) / sims) * 100).toFixed(1),
      finalsPct: +(((finals[s.t] ?? 0) / sims) * 100).toFixed(1),
    });
  }
  return out.sort((a, b) => b.champPct - a.champPct);
}

// ponytail: self-check — `node --experimental-strip-types lib/playoffs.ts`
if (process.argv[1] && process.argv[1].endsWith("playoffs.ts")) {
  const r: Ratings = { A: 12, B: 1, C: 0, D: -2, E: -5, F: -8, G: -10, H: -12, I: 8, J: 6, K: 4, L: 2, M: 1, N: -1, O: -3, P: -6 };
  const east: Seed[] = ["A", "B", "C", "D", "E", "F", "G", "H"].map((t, i) => ({ t, seed: i + 1 }));
  const west: Seed[] = ["I", "J", "K", "L", "M", "N", "O", "P"].map((t, i) => ({ t, seed: i + 1 }));
  const odds = runPlayoffOdds(east, west, r, 5000);
  console.assert(odds[0].tricode === "A", "top-rated team should have best title odds", odds[0]);
  console.assert(odds[0].champPct > 25, "dominant team should win >25%", odds[0]);
  console.log("ok", odds.slice(0, 3));
}
