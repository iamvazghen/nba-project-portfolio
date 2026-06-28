// Fetches the NBA schedule from cdn.nba.com (works from a residential IP) and
// writes data/schedule-snapshot.json. The app falls back to this snapshot when
// the live CDN blocks the server (cdn.nba.com 403s some datacenter IPs, e.g.
// Vercel). Refresh in-season with `npm run gen:data`.
import { writeFileSync, mkdirSync } from "node:fs";

const URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json";
const CONF = new Set([
  "ATL","BOS","BKN","CHA","CHI","CLE","DET","IND","MIA","MIL","NYK","ORL","PHI","TOR","WAS",
  "DAL","DEN","GSW","HOU","LAC","LAL","MEM","MIN","NOP","OKC","PHX","POR","SAC","SAS","UTA",
]);

const res = await fetch(URL, {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Referer: "https://www.nba.com/",
  },
});
if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
const json = await res.json();

const games = [];
const names = {};
for (const d of json?.leagueSchedule?.gameDates ?? []) {
  for (const g of d.games ?? []) {
    const h = g.homeTeam, a = g.awayTeam;
    if (!h?.teamTricode || !a?.teamTricode || !CONF.has(h.teamTricode) || !CONF.has(a.teamTricode)) continue;
    names[h.teamTricode] = h.teamName ?? h.teamTricode;
    names[a.teamTricode] = a.teamName ?? a.teamTricode;
    games.push({
      id: g.gameId, date: g.gameDateEst ?? d.gameDate, status: g.gameStatus ?? 1,
      statusText: g.gameStatusText ?? "", home: h.teamTricode, away: a.teamTricode,
      homeScore: h.score ?? 0, awayScore: a.score ?? 0,
    });
  }
}
mkdirSync("data", { recursive: true });
writeFileSync("data/schedule-snapshot.json", JSON.stringify({ at: new Date().toISOString().slice(0, 10), games, names }));
console.log(`Wrote data/schedule-snapshot.json — ${games.length} games, ${Object.keys(names).length} teams`);
