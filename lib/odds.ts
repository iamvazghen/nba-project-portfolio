// Multi-source odds: sportsbooks (the-odds-api) + prediction markets (Kalshi,
// Polymarket). Context-aware — game odds for a matchup, futures for awards.
// Every source is best-effort and degrades gracefully when empty/unreachable.

// tricode -> [city, nickname], for matching free-text team names across sources.
const TEAM_NAMES: Record<string, [string, string]> = {
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

export function matchTeam(text: string): string | undefined {
  const s = (text || "").toLowerCase();
  for (const [tri, [city, nick]] of Object.entries(TEAM_NAMES)) {
    if (s.includes(nick.toLowerCase()) || s.includes(city.toLowerCase())) return tri;
  }
  return undefined;
}
const nameOf = (tri: string) => TEAM_NAMES[tri][1];
const americanToProb = (a: number) => (a > 0 ? 100 / (a + 100) : -a / (-a + 100));

const J = async (url: string, opts: RequestInit = {}) => {
  const res = await fetch(url, { next: { revalidate: 300 }, ...opts });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

export type Outcome = { name: string; tricode?: string; prob: number; source: string };

/* ----------------------------- game odds ----------------------------- */
export async function fetchGameOdds(key: string | undefined, filter?: { home?: string; away?: string }) {
  if (!key) return { available: false as const, games: [] };
  try {
    const games = await J(`https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?regions=us&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${key}`);
    let out = (games as any[]).map((g) => ({
      home: g.home_team, away: g.away_team, start: g.commence_time,
      homeTri: matchTeam(g.home_team), awayTri: matchTeam(g.away_team),
      books: (g.bookmakers ?? []).map((b: any) => ({ book: b.title, markets: Object.fromEntries((b.markets ?? []).map((m: any) => [m.key, m.outcomes])) })),
    }));
    if (filter?.home && filter?.away) {
      const m = out.filter((g) => (g.homeTri === filter.home && g.awayTri === filter.away) || (g.homeTri === filter.away && g.awayTri === filter.home));
      if (m.length) return { available: true as const, games: m, scope: "matchup" as const };
    }
    // default: the next game day (earliest upcoming date) only.
    out.sort((a, b) => +new Date(a.start) - +new Date(b.start));
    const day = out[0] ? new Date(out[0].start).toDateString() : null;
    const nextDay = day ? out.filter((g) => new Date(g.start).toDateString() === day) : out;
    return { available: true as const, games: nextDay, scope: "nextDay" as const };
  } catch {
    return { available: true as const, games: [] };
  }
}

/* ----------------------------- futures sources ----------------------------- */
async function kalshi(series: string, isTeam: boolean): Promise<Outcome[]> {
  try {
    const d = await J(`https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=${series}&status=open&limit=120`);
    const out: Outcome[] = [];
    for (const m of d.markets ?? []) {
      const sub = m.yes_sub_title || m.subtitle || m.title || "";
      const prob = m.last_price != null ? m.last_price / 100 : m.yes_bid != null && m.yes_ask != null ? (m.yes_bid + m.yes_ask) / 200 : null;
      if (prob == null || prob <= 0) continue;
      const tri = isTeam ? matchTeam(sub) : undefined;
      out.push({ name: isTeam && tri ? nameOf(tri) : sub, tricode: tri, prob, source: "Kalshi" });
    }
    return out;
  } catch { return []; }
}

async function polymarket(query: string, isTeam: boolean, titleRe: RegExp, exclude: RegExp): Promise<Outcome[]> {
  try {
    const d = await J(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(query)}&limit_per_type=12`);
    const now = Date.now();
    // Candidate events: right award, not closed/expired, NBA. Pick the single most-traded one
    // so we don't mix "win championship" with "make the finals".
    const events = (d.events ?? []).filter((ev: any) =>
      !ev.closed && /nba|basketball/i.test(ev.title || "") && titleRe.test(ev.title || "") &&
      !exclude.test(ev.title || "") && (!ev.endDate || +new Date(ev.endDate) > now));
    if (!events.length) return [];
    events.sort((a: any, b: any) => (b.volume ?? b.liquidity ?? 0) - (a.volume ?? a.liquidity ?? 0));
    const ev = events[0];

    const out: Outcome[] = [];
    for (const m of ev.markets ?? []) {
      if (m.closed) continue;
      let outcomes: string[] = [], prices: string[] = [];
      try { outcomes = JSON.parse(m.outcomes || "[]"); prices = JSON.parse(m.outcomePrices || "[]"); } catch {}
      const push = (label: string, prob: number) => {
        if (!(prob > 0)) return;
        const tri = isTeam ? matchTeam(label) : undefined;
        if (isTeam && !tri) return;
        out.push({ name: isTeam ? nameOf(tri!) : label, tricode: tri, prob, source: "Polymarket" });
      };
      if (outcomes.length > 2) {
        outcomes.forEach((o, i) => push(o, parseFloat(prices[i]))); // multi-outcome market
      } else {
        const yes = outcomes.findIndex((o) => /yes/i.test(o)); // binary per-team market
        push(m.groupItemTitle || m.question || "", yes >= 0 ? parseFloat(prices[yes]) : NaN);
      }
    }
    return out;
  } catch { return []; }
}

async function sportsbookChampion(key: string | undefined): Promise<Outcome[]> {
  if (!key) return [];
  try {
    const d = await J(`https://api.the-odds-api.com/v4/sports/basketball_nba_championship_winner/odds/?regions=us&oddsFormat=american&apiKey=${key}`);
    const acc: Record<string, { sum: number; n: number }> = {};
    for (const ev of d as any[]) for (const b of ev.bookmakers ?? []) for (const mk of b.markets ?? []) for (const o of mk.outcomes ?? []) {
      const tri = matchTeam(o.name); if (!tri) continue;
      (acc[tri] ??= { sum: 0, n: 0 }); acc[tri].sum += americanToProb(o.price); acc[tri].n++;
    }
    return Object.entries(acc).map(([tri, v]) => ({ name: nameOf(tri), tricode: tri, prob: v.sum / v.n, source: "Sportsbook" }));
  } catch { return []; }
}

// Merge outcomes from multiple sources by key (tricode for teams, name for players).
function merge(rows: Outcome[]) {
  const by: Record<string, { name: string; tricode?: string; sources: Record<string, number> }> = {};
  for (const r of rows) {
    const k = r.tricode ?? r.name.toLowerCase();
    (by[k] ??= { name: r.name, tricode: r.tricode, sources: {} });
    by[k].sources[r.source] = r.prob;
  }
  return Object.values(by)
    .map((g) => { const v = Object.values(g.sources); return { ...g, consensus: v.reduce((a, b) => a + b, 0) / v.length }; })
    .sort((a, b) => b.consensus - a.consensus);
}

export type FuturesMarket = { key: string; title: string; rows: ReturnType<typeof merge>; sources: string[] };

export async function fetchFutures(oddsKey: string | undefined, awards: string[]) {
  const jobs: Record<string, Promise<Outcome[]>[]> = {
    championship: [kalshi("KXNBA", true), polymarket("NBA Champion", true, /champion/i, /conference|division|mvp|make|reach|east|west/i), sportsbookChampion(oddsKey)],
    mvp: [kalshi("KXNBAMVP", false), polymarket("NBA MVP", false, /mvp|most valuable/i, /finals|cup|all-star/i)],
    dpoy: [kalshi("KXNBADPOY", false), polymarket("NBA Defensive Player of the Year", false, /defensive player|dpoy/i, /team/i)],
  };
  const titles: Record<string, string> = { championship: "NBA Champion", mvp: "Most Valuable Player", dpoy: "Defensive Player of the Year" };
  const markets: FuturesMarket[] = [];
  for (const a of awards) {
    if (!jobs[a]) continue;
    const settled = await Promise.allSettled(jobs[a]);
    const rows = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
    markets.push({ key: a, title: titles[a], rows: merge(rows), sources: [...new Set(rows.map((r) => r.source))] });
  }
  return markets;
}
