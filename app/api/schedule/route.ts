import { getLeague } from "@/lib/nba";

export const dynamic = "force-dynamic"; // fetch the live schedule per request, not at build

export async function GET() {
  const { teams, games } = await getLeague();
  // Latest games: most recent finals + nearest upcoming, by date.
  const sorted = [...games].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const upcoming = sorted.filter((g) => g.status !== 3).reverse().slice(0, 12);
  const recent = sorted.filter((g) => g.status === 3).slice(0, 12);
  const latest = (upcoming.length ? upcoming : recent).slice(0, 12);
  return Response.json({
    teams: Object.values(teams).sort((a, b) => a.name.localeCompare(b.name)),
    latest,
  });
}
