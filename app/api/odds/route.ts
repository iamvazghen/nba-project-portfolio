import { fetchGameOdds } from "@/lib/odds";

export const revalidate = 300;

// Game odds. ?home=TRI&away=TRI filters to that matchup; otherwise the next game day.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const home = u.searchParams.get("home") ?? undefined;
  const away = u.searchParams.get("away") ?? undefined;
  return Response.json(await fetchGameOdds(process.env.ODDS_API_KEY, { home, away }));
}
