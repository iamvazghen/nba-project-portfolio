import { getLeague, CONFERENCE, type Team } from "@/lib/nba";
import { flipGame } from "@/lib/sim";

export const dynamic = "force-dynamic";

// 10k full-season Monte Carlo from current power ratings -> seeding + playoff
// odds + a projected first-round bracket per conference.
export async function GET(req: Request) {
  const sims = Math.min(Number(new URL(req.url).searchParams.get("sims")) || 10000, 20000);
  const { teams, games } = await getLeague();
  const schedule = games.filter((g) => teams[g.home] && teams[g.away]);

  const tally: Record<string, { winSum: number; seedSum: number; playoff: number; top6: number }> = {};
  for (const t of Object.keys(teams)) tally[t] = { winSum: 0, seedSum: 0, playoff: 0, top6: 0 };

  for (let s = 0; s < sims; s++) {
    const wins: Record<string, number> = {};
    for (const t of Object.keys(teams)) wins[t] = 0;
    for (const g of schedule) {
      if (flipGame(teams[g.home].netRating, teams[g.away].netRating)) wins[g.home]++;
      else wins[g.away]++;
    }
    for (const conf of ["East", "West"] as const) {
      const ranked = Object.keys(teams)
        .filter((t) => CONFERENCE[t] === conf)
        .sort((a, b) => wins[b] - wins[a] + (Math.random() - 0.5) * 0.01); // jitter ties
      ranked.forEach((t, i) => {
        const seed = i + 1;
        tally[t].winSum += wins[t];
        tally[t].seedSum += seed;
        if (seed <= 10) tally[t].playoff++;
        if (seed <= 6) tally[t].top6++;
      });
    }
  }

  const standings = (conf: "East" | "West") =>
    Object.values(teams)
      .filter((t: Team) => t.conf === conf)
      .map((t) => ({
        tricode: t.tricode, name: t.name,
        projWins: +(tally[t.tricode].winSum / sims).toFixed(1),
        avgSeed: +(tally[t.tricode].seedSum / sims).toFixed(2),
        playoffPct: +((tally[t.tricode].playoff / sims) * 100).toFixed(1),
        top6Pct: +((tally[t.tricode].top6 / sims) * 100).toFixed(1),
      }))
      .sort((a, b) => a.avgSeed - b.avgSeed)
      .map((t, i) => ({ seed: i + 1, ...t }));

  const east = standings("East"), west = standings("West");
  const bracket = (s: ReturnType<typeof standings>) =>
    [[1, 8], [4, 5], [3, 6], [2, 7]].map(([a, b]) => ({ hi: s[a - 1], lo: s[b - 1] }));

  return Response.json({
    sims,
    east, west,
    bracketEast: bracket(east), bracketWest: bracket(west),
  });
}
