import { fetchFutures } from "@/lib/odds";

export const revalidate = 300;

// Futures across sportsbooks + Kalshi + Polymarket.
// ?awards=championship,mvp,dpoy (default all).
export async function GET(req: Request) {
  const awards = (new URL(req.url).searchParams.get("awards") || "championship,eastConf,westConf,mvp,dpoy,roy").split(",").map((s) => s.trim()).filter(Boolean);
  const markets = await fetchFutures(process.env.ODDS_API_KEY, awards);
  return Response.json({ markets });
}
