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

const prompt = `You are an NBA front-office analyst projecting the 2026-27 season. For EACH team output a roster-context adjustment vs how they looked on last season's scoreboard.
Return STRICT JSON only (no markdown), shape: {"TRI": {"delta": number, "upside": number, "note": string}, ...}
- delta: expected change in team net rating vs last season, in points, range -12..12. Account for offseason additions/departures, stars returning from injury or rest, high draft picks, and explicit tanking.
- upside: outcome-variance multiplier 1.0..1.6. Higher for young rosters built around 1st/2nd-year players or a franchise rookie (real chance of a leap, also a floor risk).
- note: <= 12 words explaining the adjustment.
Anchors you know: Washington (WAS) added #1 overall pick AJ Dybantsa and gets back starters it benched/rested last season for lottery odds — a meaningful positive delta and high upside. Tanking/rebuilding teams get negative delta.
Teams (tricode: nickname): ${Object.entries(TEAMS).map(([t, n]) => `${t}=${n}`).join(", ")}.
Output ONLY the JSON object for all 30 tricodes.`;

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
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: "application/json" } }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const json = await res.json();
      let text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "{}";
      text = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(text);
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
