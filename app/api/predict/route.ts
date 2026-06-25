import { getLeague } from "@/lib/nba";
import { simulateGame } from "@/lib/sim";

export async function POST(req: Request) {
  const { home, away, sims = 10000, neutral = false } = await req.json();
  const { teams } = await getLeague();
  const h = teams[home], a = teams[away];
  if (!h || !a) return Response.json({ error: "unknown team" }, { status: 400 });
  const result = simulateGame(h.netRating, a.netRating, Math.min(sims, 50000), neutral);
  return Response.json({ engine: "typescript", home: h, away: a, result });
}
