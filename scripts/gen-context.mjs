// Generates data/team-context.json with Gemini: a per-team, EDITABLE adjustment
// reflecting THIS season's roster reality the prior-year scoreboard can't see.
//   delta  = expected net-rating change vs last season (points, -12..12)
//   upside = outcome-variance multiplier (1.0..1.6; higher for young/high-ceiling rosters)
//   note   = short human explanation
// Run: `npm run gen:context`. The numbers are a starting point — edit the JSON freely.
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
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number(x) || 0));

const prompt = `Use Google Search to find the LATEST NBA news (rosters, trades, free agency, draft, injuries) for the 2026-27 season as of today. Base every answer on what you find, NOT on older memory.
You are an NBA front-office analyst. For EACH team output a roster-context adjustment vs how they looked on last season's scoreboard.
Shape (output ONLY this JSON object, no markdown, all 30 tricodes): {"TRI": {"delta": number, "upside": number, "note": string}, ...}
- delta: expected change in team net rating vs last season, points, range -12..12 (offseason additions/departures, stars returning, high draft picks, tanking).
- upside: outcome-variance multiplier 1.0..1.6 (higher for young rosters built around 1st/2nd-year players or a franchise rookie).
- note: <= 12 words, must reflect the CURRENT roster you found via search.
Known current facts to honor: Washington (WAS) drafted #1 pick AJ Dybantsa and gets back starters it sat for lottery odds (positive delta, high upside). The Lakers (LAL) are in the LUKA DONCIC era — Doncic was traded to LA in Feb 2025 and Anthony Davis went to Dallas in that deal (do NOT call it post-LeBron or pair AD with LA); reflect LeBron's actual current status from the news.
Teams (tricode: nickname): ${Object.entries(TEAMS).map(([t, n]) => `${t}=${n}`).join(", ")}.`;

// Pull the JSON object out of a possibly prose/grounded response.
function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, "");
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(a, b + 1));
}

async function main() {
  const k = key();
  const out = { generatedAt: new Date().toISOString().slice(0, 10), model: MODEL, teams: {} };
  // safe default: neutral everywhere, plus the WAS anchor the user gave us.
  for (const t of Object.keys(TEAMS)) out.teams[t] = { delta: 0, upside: 1.0, note: "" };
  out.teams.WAS = { delta: 6, upside: 1.4, note: "Dybantsa (#1) + starters back from a tank season" };

  if (k) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${k}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }], // ground in live NBA news
          generationConfig: { temperature: 0.3 },
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "{}";
      const parsed = extractJson(text);
      for (const [t, v] of Object.entries(parsed)) {
        if (!TEAMS[t]) continue;
        out.teams[t] = { delta: clamp(v.delta, -12, 12), upside: clamp(v.upside || 1, 1, 1.6), note: String(v.note || "").slice(0, 80) };
      }
      console.log("Gemini context generated for", Object.keys(parsed).length, "teams");
    } catch (e) {
      console.warn("Gemini failed, writing default context:", String(e).slice(0, 200));
    }
  } else {
    console.warn("No GEMINI_API_KEY — writing default (neutral) context.");
  }

  mkdirSync("data", { recursive: true });
  writeFileSync("data/team-context.json", JSON.stringify(out, null, 2));
  console.log("Wrote data/team-context.json");
}
main();
