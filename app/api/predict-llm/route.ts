import { getLeague } from "@/lib/nba";

// AI single-game take. Graceful: returns {available:false} with no key set.
export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ available: false });

  const { home, away } = await req.json();
  const { teams } = await getLeague();
  const h = teams[home], a = teams[away];
  if (!h || !a) return Response.json({ error: "unknown team" }, { status: 400 });

  const prompt = `You are an NBA analyst. Give a 2-3 sentence prediction for ${h.name} (home, net rating ${h.netRating.toFixed(1)}, ${h.wins}-${h.losses}) vs ${a.name} (away, net rating ${a.netRating.toFixed(1)}, ${a.wins}-${a.losses}). Name a likely winner and the key factor. Be concise.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return Response.json({ available: false, error: await res.text() });
    const json = await res.json();
    return Response.json({ available: true, text: json.content?.[0]?.text ?? "" });
  } catch (e) {
    return Response.json({ available: false, error: String(e) });
  }
}
