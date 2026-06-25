import { getLeague, CONFERENCE } from "@/lib/nba";
import { flipGame } from "@/lib/sim";
import { runPlayoffOdds, simPlayoffs, type Ratings, type Seed } from "@/lib/playoffs";

export const dynamic = "force-dynamic";

// POST { mode: "full" | "fromSeeds", sims?, east?: string[], west?: string[] }
//  - fromSeeds: user supplies 8 seeds per conference -> bracket odds only.
//  - full: simulate the regular season each iteration -> seeds -> playoffs.
export async function POST(req: Request) {
  const body = await req.json();
  const sims = Math.min(Number(body.sims) || 10000, 20000);
  const { teams, games } = await getLeague();
  const r: Ratings = Object.fromEntries(Object.values(teams).map((t) => [t.tricode, t.netRating]));

  if (body.mode === "fromSeeds") {
    const mk = (arr: string[]): Seed[] => arr.slice(0, 8).map((t, i) => ({ t, seed: i + 1 }));
    const east = mk(body.east ?? []), west = mk(body.west ?? []);
    if (east.length !== 8 || west.length !== 8) return Response.json({ error: "need 8 seeds per conference" }, { status: 400 });
    return Response.json({ mode: "fromSeeds", sims, odds: runPlayoffOdds(east, west, r, sims) });
  }

  // full: regular season + playoffs together.
  const schedule = games.filter((g) => teams[g.home] && teams[g.away]);
  const champ: Record<string, number> = {}, finals: Record<string, number> = {}, winSum: Record<string, number> = {};
  for (const t of Object.keys(teams)) { champ[t] = 0; finals[t] = 0; winSum[t] = 0; }

  for (let s = 0; s < sims; s++) {
    const wins: Record<string, number> = {};
    for (const t of Object.keys(teams)) wins[t] = 0;
    for (const g of schedule) {
      if (flipGame(r[g.home], r[g.away])) wins[g.home]++; else wins[g.away]++;
    }
    const seedsOf = (conf: "East" | "West"): Seed[] =>
      Object.keys(teams).filter((t) => CONFERENCE[t] === conf)
        .sort((a, b) => wins[b] - wins[a] + (Math.random() - 0.5) * 0.01)
        .slice(0, 8).map((t, i) => ({ t, seed: i + 1 }));
    for (const t of Object.keys(teams)) winSum[t] += wins[t];
    const { champ: c, eastChamp, westChamp } = simPlayoffs(seedsOf("East"), seedsOf("West"), r);
    champ[c]++; finals[eastChamp]++; finals[westChamp]++;
  }

  const odds = Object.values(teams).map((t) => ({
    tricode: t.tricode, conf: t.conf, name: t.name,
    projWins: +(winSum[t.tricode] / sims).toFixed(1),
    champPct: +((champ[t.tricode] / sims) * 100).toFixed(1),
    finalsPct: +((finals[t.tricode] / sims) * 100).toFixed(1),
  })).sort((a, b) => b.champPct - a.champPct);

  return Response.json({ mode: "full", sims, odds });
}
