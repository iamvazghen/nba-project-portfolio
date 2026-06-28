import { getLeague } from "@/lib/nba";
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

  // Apply the editable roster-context layer: effective rating = SRS base + delta;
  // upside is the variance multiplier fed to the engine.
  const out = Object.values(teams).map((t) => {
    const c = CTX[t.tricode] ?? { delta: 0, upside: 1, note: "" };
    return {
      ...t,
      base: +t.netRating.toFixed(1),
      rating: +(t.netRating + (c.delta ?? 0)).toFixed(1),
      ctxDelta: c.delta ?? 0,
      upside: c.upside ?? 1,
      ctxNote: c.note ?? "",
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return Response.json({ teams: out, latest, schedule, contextAt: (context as any).generatedAt });
}
