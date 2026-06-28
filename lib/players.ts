// Server-side: turns the Gemini-grounded rosters into per-team features used by
// the matchup engine. (data/team-rosters.json is editable; npm run gen:rosters.)
import rosters from "@/data/team-rosters.json";
import type { Feat } from "./matchup";

export type Player = { name: string; role: "S" | "B"; impact: number; min: number; exp: number };
const R = (rosters as any).teams as Record<string, Player[]>;

export function rosterOf(tri: string): Player[] {
  return R[tri] ?? [];
}

export function featuresFor(tri: string): Feat {
  const p = rosterOf(tri);
  if (!p.length) return { starPower: 0, benchDepth: 0, experience: 0, starterStrength: 0, top3: 0 };
  const starters = p.filter((x) => x.role === "S");
  const bench = p.filter((x) => x.role === "B");
  const wavg = (arr: Player[], f: (x: Player) => number) => {
    const s = arr.reduce((a, x) => a + x.min, 0) || 1;
    return arr.reduce((a, x) => a + x.min * f(x), 0) / s;
  };
  const impacts = p.map((x) => x.impact).sort((a, b) => b - a);
  return {
    starPower: impacts[0] ?? 0,
    top3: impacts.slice(0, 3).reduce((a, b) => a + b, 0),
    starterStrength: +wavg(starters, (x) => x.impact).toFixed(2),
    benchDepth: +bench.reduce((a, x) => a + Math.max(0, x.impact) * (x.min / 48), 0).toFixed(2),
    experience: +wavg(p, (x) => x.exp).toFixed(1),
  };
}

export function topPlayers(tri: string, n = 6): Player[] {
  return [...rosterOf(tri)].sort((a, b) => b.impact - a.impact).slice(0, n);
}
