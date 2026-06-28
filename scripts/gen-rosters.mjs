// Generates data/team-rosters.json: each team's projected 2026-27 rotation,
// grounded in live NBA news via Gemini. Per player:
//   role   "S" starter | "B" bench
//   impact estimated on-court value, net points per 100 possessions (-4..9)
//   min    projected minutes per game
//   exp    NBA seasons of experience (rookies = 0)
// These feed lib/players.ts (bottom-up strength + matchup edges). Editable.
// Run: `npm run gen:rosters`.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
function key() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try { return readFileSync(".env.local", "utf8").match(/GEMINI_API_KEY=(.+)/)?.[1]?.trim(); } catch { return undefined; }
}
const TEAMS = {
  ATL: "Hawks", BOS: "Celtics", BKN: "Nets", CHA: "Hornets", CHI: "Bulls", CLE: "Cavaliers",
  DET: "Pistons", IND: "Pacers", MIA: "Heat", MIL: "Bucks", NYK: "Knicks", ORL: "Magic",
  PHI: "76ers", TOR: "Raptors", WAS: "Wizards", DAL: "Mavericks", DEN: "Nuggets", GSW: "Warriors",
  HOU: "Rockets", LAC: "Clippers", LAL: "Lakers", MEM: "Grizzlies", MIN: "Timberwolves",
  NOP: "Pelicans", OKC: "Thunder", PHX: "Suns", POR: "Trail Blazers", SAC: "Kings", SAS: "Spurs", UTA: "Jazz",
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number(x)));
function extractJson(text) {
  const c = text.replace(/```json|```/g, "");
  return JSON.parse(c.slice(c.indexOf("{"), c.lastIndexOf("}") + 1));
}

const prompt = `Use Google Search to find each NBA team's CURRENT projected rotation for the 2026-27 season (latest trades, free agency, draft, depth charts, INJURIES). Base everything on what you find. Be objective, realistic and conservative — match the sportsbook consensus, do not be optimistic.
Output ONLY JSON: {"TRI": [{"name": string, "role": "S"|"B", "impact": number, "min": number, "exp": number}, ...], ...}
For each team list its top 8-9 rotation players, most valuable first:
- role: "S" for the ~5 starters, "B" for bench.
- impact: estimated on-court value as net points per 100 possessions, -4..9 (MVP-level 7-9, All-Star 5-6, solid starter 2-4, role player -1..1, weak -4..-2).
- min: projected minutes per game (starters 28-38, bench 12-26).
- exp: NBA seasons of experience (a rookie is 0).
REALISM RULES (critical):
1. Only include players actually on the 2026-27 roster after this offseason's moves.
2. Injuries: a player recovering from a MAJOR injury (e.g. a torn Achilles) misses most/all of the season — omit them or set min very low (<=10) and impact near 0. Do not project injured stars as healthy.
3. Calibrate each team's overall strength to current sportsbook 2026-27 WIN TOTALS and TITLE ODDS — if the market doesn't see a team as a contender, its roster's aggregate impact must reflect that.
Known facts to honor (verify dates via search): Jayson Tatum (BOS) tore his Achilles in the 2025 playoffs and missed most of 2025-26, but is expected to RETURN and play in 2026-27 — project him as an active star (allow for some ramp-up). San Antonio (SAS) is DEEP, not thin — young stars (Wembanyama et al.) on rookie-scale contracts plus a real supporting cast, a legitimate 1-through-9 rotation. The Lakers are built around Luka Doncic (Anthony Davis is in Dallas). Washington features #1 pick AJ Dybantsa. Calibrate each team to current 2026-27 sportsbook title odds.
Teams (tricode=nickname): ${Object.entries(TEAMS).map(([t, n]) => `${t}=${n}`).join(", ")}.`;

async function main() {
  const k = key();
  const out = { generatedAt: new Date().toISOString().slice(0, 10), model: MODEL, teams: {} };
  for (const t of Object.keys(TEAMS)) out.teams[t] = [];

  if (k) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${k}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.3 } }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "{}";
      const parsed = extractJson(text);
      for (const [t, arr] of Object.entries(parsed)) {
        if (!TEAMS[t] || !Array.isArray(arr)) continue;
        out.teams[t] = arr.slice(0, 10).map((p) => ({
          name: String(p.name || "").slice(0, 40),
          role: p.role === "S" ? "S" : "B",
          impact: clamp(p.impact, -5, 10) || 0,
          min: clamp(p.min, 6, 40) || 18,
          exp: clamp(p.exp, 0, 22) || 0,
        })).filter((p) => p.name);
      }
      const filled = Object.values(out.teams).filter((a) => a.length).length;
      console.log(`Gemini rosters generated for ${filled} teams`);
      if (filled < 25) throw new Error(`only ${filled} teams filled`);
    } catch (e) {
      console.warn("Gemini rosters failed:", String(e).slice(0, 200));
      process.exitCode = 1;
    }
  } else {
    console.warn("No GEMINI_API_KEY — writing empty rosters.");
  }

  mkdirSync("data", { recursive: true });
  writeFileSync("data/team-rosters.json", JSON.stringify(out, null, 2));
  console.log("Wrote data/team-rosters.json");
}
main();
