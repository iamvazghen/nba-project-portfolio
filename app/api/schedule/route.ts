import { getLeague } from "@/lib/nba";

export const dynamic = "force-dynamic"; // fetch the live schedule per request, not at build

export async function GET() {
  const { teams, games } = await getLeague();
  const sorted = [...games].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const upcoming = sorted.filter((g) => g.status !== 3).reverse().slice(0, 12);
  const recent = sorted.filter((g) => g.status === 3).slice(0, 12);
  const latest = (upcoming.length ? upcoming : recent).slice(0, 12);

  // Regular-season games only (NBA gameId prefix 002) for season simulation;
  // fall back to all games if the feed has no regular-season entries.
  let reg = games.filter((g) => g.id.startsWith("002"));
  if (reg.length === 0) reg = games;
  const schedule = { home: reg.map((g) => g.home), away: reg.map((g) => g.away) };

  return Response.json({
    teams: Object.values(teams).sort((a, b) => a.name.localeCompare(b.name)),
    latest,
    schedule,
  });
}
