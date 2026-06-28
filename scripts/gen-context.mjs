// Generates data/team-context.json with Gemini (news-grounded): a per-team
// FUTURE-VARIABILITY + scouting profile. The team rating itself is objective
// (last-season SRS + the betting market); this layer only sets in-season variance
// and the narrative — youth, cap space / apron status, contracts, trade outlook.
//   upside = in-season variance multiplier (1.0..1.6): high when young OR cap-flexible
//            with movable contracts (deadline upside); low when frozen at the 2nd apron
//   apron  = 'room' | 'under' | '1st' | '2nd' | 'hard-capped'
//   note   = short scouting line: key injury/return, cap/apron, biggest bad contract, trade outlook
// Run: `npm run gen:context`. Everything is editable.
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

const prompt = `Use Google Search for each NBA team's 2026-27 outlook — injuries, salary cap, first/second apron status, contracts, and trade-deadline posture. Base every answer on what you find, not older memory. Do an end-to-end review of all 30 teams one by one.
Output ONLY this JSON (no markdown, all 30 tricodes): {"TRI": {"upside": number, "apron": string, "note": string}, ...}
- upside: in-season VARIANCE multiplier 1.0..1.6. Higher (1.3-1.6) when the team is YOUNG (likely to improve or swing) OR has cap flexibility plus movable/expiring contracts to make a trade-deadline upgrade. Lower (1.0-1.1) when capped-out and frozen/hard-capped at the second apron (roster can't change).
- apron: one of "room", "under", "1st", "2nd", "hard-capped" — the team's 2026-27 cap/apron status.
- note: <= 18 words. Cover the key factor(s): notable injury/return, cap/apron situation, biggest bad contract or top trade chip, and deadline outlook (buyer / seller / stand-pat).
Honor these dated facts: Indiana (IND) — Tyrese Haliburton tore his Achilles in the 2025 Finals, missed 2025-26, returns healthy for 2026-27. Boston (BOS) — Jayson Tatum returns from his 2025 Achilles tear for 2026-27. San Antonio (SAS) — deep young core on cheap rookie-scale deals with real cap flexibility (high upside). Lakers (LAL) — Luka Doncic era (Anthony Davis is in Dallas). Washington (WAS) — #1 pick AJ Dybantsa.
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
  const APRONS = ["room", "under", "1st", "2nd", "hard-capped"];
  for (const t of Object.keys(TEAMS)) out.teams[t] = { upside: 1.0, apron: "", note: "" };

  if (k) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${k}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }], // ground in live NBA news
          generationConfig: { temperature: 0.3, maxOutputTokens: 16384 },
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "{}";
      const parsed = extractJson(text);
      for (const [t, v] of Object.entries(parsed)) {
        if (!TEAMS[t]) continue;
        out.teams[t] = {
          upside: clamp(v.upside || 1, 1, 1.6),
          apron: APRONS.includes(v.apron) ? v.apron : "",
          note: String(v.note || "").slice(0, 130),
        };
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
