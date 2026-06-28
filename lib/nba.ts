// NBA data: pulls the official public schedule CDN (no API key needed) and
// derives team power ratings from completed games. Used by every mode.

export const SCHEDULE_URL =
  "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json";

export const HOME_COURT_ADV = 2.6; // points, league-historical
export const LEAGUE_AVG_PTS = 114; // for projecting a plausible final score

// tricode -> conference. The CDN schedule doesn't carry conference, and there
// are exactly 30 teams, so a static map is less code than scraping standings.
export const CONFERENCE: Record<string, "East" | "West"> = {
  ATL: "East", BOS: "East", BKN: "East", CHA: "East", CHI: "East",
  CLE: "East", DET: "East", IND: "East", MIA: "East", MIL: "East",
  NYK: "East", ORL: "East", PHI: "East", TOR: "East", WAS: "East",
  DAL: "West", DEN: "West", GSW: "West", HOU: "West", LAC: "West",
  LAL: "West", MEM: "West", MIN: "West", NOP: "West", OKC: "West",
  PHX: "West", POR: "West", SAC: "West", SAS: "West", UTA: "West",
};

export type Team = {
  tricode: string;
  name: string;
  conf: "East" | "West";
  wins: number;
  losses: number;
  netRating: number; // avg point differential per completed game
};

export type Game = {
  id: string;
  date: string; // ISO
  status: number; // 1 scheduled, 2 live, 3 final
  statusText: string;
  home: string; // tricode
  away: string;
  homeScore: number;
  awayScore: number;
};

type Rec = { name: string; w: number; l: number; plays: { opp: string; margin: number; t: number }[] };

let cache: { at: number; data: { teams: Record<string, Team>; games: Game[] } } | null = null;

export async function getLeague() {
  if (cache && Date.now() - cache.at < 60 * 60 * 1000) return cache.data;

  const res = await fetch(SCHEDULE_URL, {
    next: { revalidate: 3600 },
    headers: {
      // cdn.nba.com 403s requests without a browser-like UA/Referer.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Referer: "https://www.nba.com/",
      Origin: "https://www.nba.com",
    },
  });
  if (!res.ok) throw new Error(`NBA schedule fetch failed: ${res.status}`);
  const json = await res.json();

  const rec: Record<string, Rec> = {};
  const games: Game[] = [];
  const dates: any[] = json?.leagueSchedule?.gameDates ?? [];

  for (const d of dates) {
    for (const g of d.games ?? []) {
      const h = g.homeTeam, a = g.awayTeam;
      if (!h?.teamTricode || !a?.teamTricode) continue;
      if (!CONFERENCE[h.teamTricode] || !CONFERENCE[a.teamTricode]) continue; // skip All-Star / intl
      const hs = h.score ?? 0, as = a.score ?? 0;
      games.push({
        id: g.gameId,
        date: g.gameDateEst ?? d.gameDate,
        status: g.gameStatus ?? 1,
        statusText: g.gameStatusText ?? "",
        home: h.teamTricode, away: a.teamTricode,
        homeScore: hs, awayScore: as,
      });
      const t = +new Date(g.gameDateEst ?? d.gameDate);
      for (const [tm, opp, sf, sa, won, nm] of [
        [h.teamTricode, a.teamTricode, hs, as, hs > as, h.teamName],
        [a.teamTricode, h.teamTricode, as, hs, as > hs, a.teamName],
      ] as const) {
        rec[tm] ??= { name: nm, w: 0, l: 0, plays: [] };
        if (g.gameStatus === 3 && (sf > 0 || sa > 0)) {
          if (won) rec[tm].w++; else rec[tm].l++;
          rec[tm].plays.push({ opp, margin: sf - sa, t });
        }
      }
    }
  }

  // Base rating = Simple Rating System (margin adjusted for strength of schedule),
  // with recency weighting so a team's recent form counts more than October's.
  const tris = Object.keys(CONFERENCE);
  const times = Object.values(rec).flatMap((r) => r.plays.map((p) => p.t));
  const maxT = times.length ? Math.max(...times) : Date.now();
  const HALFLIFE = 45 * 86400000; // games ~45 days older count half as much
  const wOf = (t: number) => Math.pow(0.5, (maxT - t) / HALFLIFE);

  const M: Record<string, number> = {}, sumW: Record<string, number> = {};
  for (const tri of tris) {
    let sw = 0, swm = 0;
    for (const p of rec[tri]?.plays ?? []) { const w = wOf(p.t); sw += w; swm += w * p.margin; }
    sumW[tri] = sw; M[tri] = sw > 0 ? swm / sw : 0;
  }
  // Iterate rating = weightedMargin + weighted average opponent rating (SRS).
  let rating: Record<string, number> = Object.fromEntries(tris.map((t) => [t, M[t]]));
  for (let it = 0; it < 25; it++) {
    const next: Record<string, number> = {};
    for (const tri of tris) {
      if (!sumW[tri]) { next[tri] = 0; continue; }
      let s = 0;
      for (const p of rec[tri].plays) s += wOf(p.t) * (rating[p.opp] ?? 0);
      next[tri] = M[tri] + s / sumW[tri];
    }
    const mean = tris.reduce((a, t) => a + next[t], 0) / tris.length;
    for (const tri of tris) next[tri] -= mean; // center to ~0
    rating = next;
  }

  const teams: Record<string, Team> = {};
  for (const tri of tris) {
    const r = rec[tri];
    const gp = r?.plays.length ?? 0;
    // light shrink toward 0 for tiny samples
    const net = (rating[tri] ?? 0) * (gp / (gp + 3));
    teams[tri] = { tricode: tri, name: r?.name ?? tri, conf: CONFERENCE[tri], wins: r?.w ?? 0, losses: r?.l ?? 0, netRating: net };
  }

  cache = { at: Date.now(), data: { teams, games } };
  return cache.data;
}
