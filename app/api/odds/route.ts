// Bets aggregator across main US books (moneyline/spread/total).
// Graceful: returns {available:false} when ODDS_API_KEY is unset.
export const revalidate = 300;

export async function GET() {
  const key = process.env.ODDS_API_KEY;
  if (!key) return Response.json({ available: false });

  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?regions=us&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${key}`;
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return Response.json({ available: false, error: await res.text() });
    const games = await res.json();
    // Flatten to: matchup + each book's h2h/spread/total.
    const out = (games as any[]).map((g) => ({
      home: g.home_team, away: g.away_team, start: g.commence_time,
      books: (g.bookmakers ?? []).map((b: any) => ({
        book: b.title,
        markets: Object.fromEntries((b.markets ?? []).map((m: any) => [m.key, m.outcomes])),
      })),
    }));
    return Response.json({ available: true, games: out });
  } catch (e) {
    return Response.json({ available: false, error: String(e) });
  }
}
