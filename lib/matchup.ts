// Pure, client-safe matchup math. Given each team's roster features, computes a
// pairwise adjustment (points) capturing structural edges the single team-rating
// number can't see: star concentration, bench depth, and experience — reweighted
// for the playoffs (stars & poise matter more; depth matters less).
export type Feat = { starPower: number; benchDepth: number; experience: number; starterStrength: number; top3: number };
export type Edge = { label: string; value: number };

export function matchupDelta(home: Feat, away: Feat, playoff: boolean): { total: number; edges: Edge[] } {
  const star = (home.starPower - away.starPower) * (playoff ? 0.45 : 0.15);
  const depth = (home.benchDepth - away.benchDepth) * (playoff ? 0.1 : 0.3);
  const exp = (home.experience - away.experience) * (playoff ? 0.2 : 0.06);
  const cap = playoff ? 7 : 4;
  const total = Math.max(-cap, Math.min(cap, star + depth + exp));
  return { total, edges: [
    { label: "Star power", value: star },
    { label: "Bench depth", value: depth },
    { label: "Experience", value: exp },
  ] };
}

// ponytail: self-check — `node --experimental-strip-types lib/matchup.ts`
// @ts-ignore
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("matchup.ts")) {
  const a: Feat = { starPower: 9, benchDepth: 2, experience: 8, starterStrength: 4, top3: 18 };
  const b: Feat = { starPower: 5, benchDepth: 2, experience: 6, starterStrength: 3, top3: 12 };
  const reg = matchupDelta(a, b, false).total, pl = matchupDelta(a, b, true).total;
  console.assert(pl > reg && reg > 0, "playoffs should amplify a star/experience edge");
  console.log("ok reg", reg.toFixed(2), "playoff", pl.toFixed(2));
}
