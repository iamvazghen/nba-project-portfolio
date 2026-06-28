// Snapshots live betting-market NBA odds (Polymarket — objective, keyless) to
// data/market-snapshot.json: championship + Eastern/Western conference winners.
// Championship + conference equity anchors the power rating (conference odds give
// the middle of the board real spread that title-odds-alone can't). Refreshed by
// the daily Action. Run: `npm run gen:market`.
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

// Find the most-traded open NBA event matching titleRe (not excludeRe) and return
// {TRI: prob}. Requires real liquidity (volume >= MIN_VOL) so untraded offseason
// markets sitting at placeholder prices don't pollute the rating.
const MIN_VOL = 25000;
async function pull(query, titleRe, excludeRe) {
  try {
    const d = await (await fetch(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(query)}&limit_per_type=12`)).json();
    const evs = (d.events ?? []).filter(
      (e) => !e.closed && (e.volume ?? 0) >= MIN_VOL && /nba|basketball/i.test(e.title || "") && titleRe.test(e.title || "") && !excludeRe.test(e.title || ""),
    );
    evs.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    const ev = evs[0];
    const out = {};
    for (const m of ev?.markets ?? []) {
      if (m.closed) continue;
      let outs = [], pr = [];
      try { outs = JSON.parse(m.outcomes || "[]"); pr = JSON.parse(m.outcomePrices || "[]"); } catch {}
      const yi = outs.findIndex((o) => /yes/i.test(o));
      const prob = yi >= 0 ? parseFloat(pr[yi]) : NaN;
      const tri = matchTeam(m.groupItemTitle || m.question || "");
      if (tri && prob > 0) out[tri] = +Math.max(out[tri] ?? 0, prob).toFixed(4);
    }
    return out;
  } catch (e) {
    console.warn(query, "failed:", String(e).slice(0, 120));
    return {};
  }
}

const championship = await pull("NBA Champion", /champion/i, /conference|eastern|western|division|rookie|mvp|defensive/i);
const eastConf = await pull("NBA Eastern Conference Champion", /eastern conference/i, /western/i);
const westConf = await pull("NBA Western Conference Champion", /western conference/i, /eastern/i);

mkdirSync("data", { recursive: true });
writeFileSync(
  "data/market-snapshot.json",
  JSON.stringify({ at: new Date().toISOString().slice(0, 10), source: "polymarket", championship, eastConf, westConf }, null, 2),
);
console.log(`Wrote data/market-snapshot.json — champ ${Object.keys(championship).length}, east ${Object.keys(eastConf).length}, west ${Object.keys(westConf).length}`);
