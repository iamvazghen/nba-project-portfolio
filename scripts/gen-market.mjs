// Snapshots the live betting-market championship odds (Polymarket — objective,
// keyless) to data/market-snapshot.json: { championship: { TRI: prob } }.
// This is the objective forward-looking signal the power rating is anchored to.
// Refreshed by the daily Action. Run: `npm run gen:market`.
import { writeFileSync, mkdirSync } from "node:fs";

const NAMES = {
  ATL: ["Atlanta", "Hawks"], BOS: ["Boston", "Celtics"], BKN: ["Brooklyn", "Nets"],
  CHA: ["Charlotte", "Hornets"], CHI: ["Chicago", "Bulls"], CLE: ["Cleveland", "Cavaliers"],
  DET: ["Detroit", "Pistons"], IND: ["Indiana", "Pacers"], MIA: ["Miami", "Heat"],
  MIL: ["Milwaukee", "Bucks"], NYK: ["New York", "Knicks"], ORL: ["Orlando", "Magic"],
  PHI: ["Philadelphia", "76ers"], TOR: ["Toronto", "Raptors"], WAS: ["Washington", "Wizards"],
  DAL: ["Dallas", "Mavericks"], DEN: ["Denver", "Nuggets"], GSW: ["Golden State", "Warriors"],
  HOU: ["Houston", "Rockets"], LAC: ["Clippers", "Clippers"], LAL: ["Lakers", "Lakers"],
  MEM: ["Memphis", "Grizzlies"], MIN: ["Minnesota", "Timberwolves"], NOP: ["New Orleans", "Pelicans"],
  OKC: ["Oklahoma City", "Thunder"], PHX: ["Phoenix", "Suns"], POR: ["Portland", "Trail Blazers"],
  SAC: ["Sacramento", "Kings"], SAS: ["San Antonio", "Spurs"], UTA: ["Utah", "Jazz"],
};
function matchTeam(text) {
  const s = (text || "").toLowerCase();
  for (const [tri, [city, nick]] of Object.entries(NAMES))
    if (s.includes(nick.toLowerCase()) || s.includes(city.toLowerCase())) return tri;
  return undefined;
}

const championship = {};
try {
  const d = await (await fetch("https://gamma-api.polymarket.com/public-search?q=NBA+Champion&limit_per_type=12")).json();
  const evs = (d.events ?? []).filter(
    (e) => !e.closed && /champion/i.test(e.title || "") && !/conference|east|west|division/i.test(e.title || ""),
  );
  evs.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  const ev = evs[0];
  if (ev) {
    for (const m of ev.markets ?? []) {
      if (m.closed) continue;
      let outs = [], prices = [];
      try { outs = JSON.parse(m.outcomes || "[]"); prices = JSON.parse(m.outcomePrices || "[]"); } catch {}
      const yi = outs.findIndex((o) => /yes/i.test(o));
      const prob = yi >= 0 ? parseFloat(prices[yi]) : NaN;
      const tri = matchTeam(m.groupItemTitle || m.question || "");
      if (tri && prob > 0) championship[tri] = +(Math.max(championship[tri] ?? 0, prob)).toFixed(4);
    }
  }
} catch (e) {
  console.warn("market fetch failed:", String(e).slice(0, 160));
}

mkdirSync("data", { recursive: true });
writeFileSync("data/market-snapshot.json", JSON.stringify({ at: new Date().toISOString().slice(0, 10), source: "polymarket", championship }, null, 2));
console.log(`Wrote data/market-snapshot.json — ${Object.keys(championship).length} teams priced`);
