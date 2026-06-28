import { getLeague } from "@/lib/nba";
import { featuresFor, topPlayers, playerRatingRaw } from "@/lib/players";
import context from "@/data/team-context.json";

export const dynamic = "force-dynamic"; // fetch the live schedule per request, not at build

const CTX = (context as any).teams ?? {};

export async function GET() {
  const { teams, games } = await getLeague();
  const sorted = [...games].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const upcoming = sorted.filter((g) => g.status !== 3).reverse().slice(0, 12);
  const recent = sorted.filter((g) => g.status === 3).slice(0, 12);
  const latest = (upcoming.length ? upcoming : recent).slice(0, 12);

  let reg = games.filter((g) => g.id.startsWith("002"));
  if (reg.length === 0) reg = games;
  const schedule = { home: reg.map((g) => g.home), away: reg.map((g) => g.away) };

  // Effective rating blends last season's SRS (how they actually played) with a
  // bottom-up CURRENT-roster rating (talent on hand now), so a team coming off a
  // down/injury year but stacked with stars isn't underrated.
  const arr = Object.values(teams);
  const n = arr.length;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / n;
  const std = (xs: number[], m: number) => Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / n) || 1;

  const srs = arr.map((t) => t.netRating);
  const praw = arr.map((t) => playerRatingRaw(t.tricode));
  const pMean = mean(praw);
  const pCent = praw.map((x) => x - pMean);
  const scale = std(srs, mean(srs)) / std(pCent, 0); // match player-rating spread to SRS

  const out = arr.map((t, i) => {
    const player = +(pCent[i] * scale).toFixed(1); // current-roster rating, centered & scaled
    const rating = +(0.4 * t.netRating + 0.6 * player).toFixed(1);
    const c = CTX[t.tricode] ?? { upside: 1, note: "" };
    return {
      ...t,
      base: +t.netRating.toFixed(1), // last season (SRS, SOS + recency)
      player, // current roster (bottom-up from rotations)
      rating, // blended
      ctxDelta: +(rating - t.netRating).toFixed(1), // net shift vs last season
      upside: c.upside ?? 1,
      ctxNote: c.note ?? "",
      feat: featuresFor(t.tricode),
      players: topPlayers(t.tricode),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return Response.json({ teams: out, latest, schedule, contextAt: (context as any).generatedAt });
}
