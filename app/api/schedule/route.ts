import { getLeague } from "@/lib/nba";
import { featuresFor, topPlayers } from "@/lib/players";
import context from "@/data/team-context.json";
import market from "@/data/market-snapshot.json";

export const dynamic = "force-dynamic"; // fetch the live schedule per request, not at build

const CTX = (context as any).teams ?? {};
const CHAMP: Record<string, number> = (market as any).championship ?? {};

export async function GET() {
  const { teams, games } = await getLeague();
  const sorted = [...games].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const upcoming = sorted.filter((g) => g.status !== 3).reverse().slice(0, 12);
  const recent = sorted.filter((g) => g.status === 3).slice(0, 12);
  const latest = (upcoming.length ? upcoming : recent).slice(0, 12);

  let reg = games.filter((g) => g.id.startsWith("002"));
  if (reg.length === 0) reg = games;
  const schedule = { home: reg.map((g) => g.home), away: reg.map((g) => g.away) };

  // Objective power rating = blend of two market-grade signals, no subjective
  // estimates: (1) last season's SRS (real results, SOS + recency adjusted) and
  // (2) the live betting market's title odds (the forward-looking consensus, which
  // already prices injuries, trades and returns). The market is weighted higher
  // because it is a projection; SRS differentiates teams the market sees alike.
  const arr = Object.values(teams);
  const n = arr.length;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / n;
  const std = (xs: number[], m: number) => Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / n) || 1;

  const srs = arr.map((t) => t.netRating);
  const priced = Object.values(CHAMP).filter((x) => x > 0);
  const floor = (priced.length ? Math.min(...priced) : 0.005) / 2;
  const logOdds = arr.map((t) => Math.log(CHAMP[t.tricode] || floor)); // ln(title %)
  const lMean = mean(logOdds);
  const mScale = std(srs, mean(srs)) / std(logOdds, lMean); // put market on a net-rating scale
  const marketNet = logOdds.map((s) => (s - lMean) * mScale);

  const out = arr.map((t, i) => {
    const mkt = +marketNet[i].toFixed(1); // market-implied net rating
    const rating = +(0.35 * t.netRating + 0.65 * mkt).toFixed(1);
    const c = CTX[t.tricode] ?? { upside: 1, note: "", apron: "" };
    return {
      ...t,
      base: +t.netRating.toFixed(1), // last season (SRS)
      market: mkt, // betting-market-implied (title odds)
      rating, // blended objective rating
      ctxDelta: +(rating - t.netRating).toFixed(1),
      upside: c.upside ?? 1,
      apron: c.apron ?? "",
      ctxNote: c.note ?? "",
      feat: featuresFor(t.tricode),
      players: topPlayers(t.tricode),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return Response.json({ teams: out, latest, schedule, contextAt: (context as any).generatedAt });
}
