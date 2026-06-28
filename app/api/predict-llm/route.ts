import { getLeague } from "@/lib/nba";

// AI single-game take via Gemini. Graceful: returns {available:false} with no key.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ available: false });

  const { home, away } = await req.json();
  const { teams } = await getLeague();
  const h = teams[home], a = teams[away];
  if (!h || !a) return Response.json({ error: "unknown team" }, { status: 400 });

  const prompt = `You are an NBA analyst. In 2-3 sentences predict ${h.name} (home, net rating ${h.netRating.toFixed(1)}, ${h.wins}-${h.losses}) vs ${a.name} (away, net rating ${a.netRating.toFixed(1)}, ${a.wins}-${a.losses}). Name a likely winner and the key factor. Be concise.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    if (!res.ok) return Response.json({ available: false, error: await res.text() });
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    return Response.json({ available: !!text, text });
  } catch (e) {
    return Response.json({ available: false, error: String(e) });
  }
}
