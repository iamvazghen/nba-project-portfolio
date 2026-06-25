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

type Acc = { gp: number; pf: number; pa: number; w: number; l: number; name: string };

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

  const acc: Record<string, Acc> = {};
  const games: Game[] = [];
  const dates: any[] = json?.leagueSchedule?.gameDates ?? [];

  for (const d of dates) {
    for (const g of d.games ?? []) {
      const h = g.homeTeam, a = g.awayTeam;
      if (!h?.teamTricode || !a?.teamTricode) continue;
      if (!CONFERENCE[h.teamTricode]) continue; // skip All-Star / intl exhibitions
      const hs = h.score ?? 0, as = a.score ?? 0;
      games.push({
        id: g.gameId,
        date: g.gameDateEst ?? d.gameDate,
        status: g.gameStatus ?? 1,
        statusText: g.gameStatusText ?? "",
        home: h.teamTricode, away: a.teamTricode,
        homeScore: hs, awayScore: as,
      });
      for (const [t, sf, sa, won, nm] of [
        [h.teamTricode, hs, as, hs > as, h.teamName],
        [a.teamTricode, as, hs, as > hs, a.teamName],
      ] as const) {
        acc[t] ??= { gp: 0, pf: 0, pa: 0, w: 0, l: 0, name: nm };
        if (g.gameStatus === 3 && (sf > 0 || sa > 0)) {
          acc[t].gp++; acc[t].pf += sf; acc[t].pa += sa;
          if (won) acc[t].w++; else acc[t].l++;
        }
      }
    }
  }

  const teams: Record<string, Team> = {};
  for (const tri of Object.keys(CONFERENCE)) {
    const a = acc[tri];
    // ponytail: regress net rating toward 0 with a 5-game prior so a 1-game
    // sample doesn't read as a +30 juggernaut.
    const raw = a && a.gp ? (a.pf - a.pa) / a.gp : 0;
    const net = a ? (raw * a.gp) / (a.gp + 5) : 0;
    teams[tri] = {
      tricode: tri,
      name: a?.name ?? tri,
      conf: CONFERENCE[tri],
      wins: a?.w ?? 0,
      losses: a?.l ?? 0,
      netRating: net,
    };
  }

  cache = { at: Date.now(), data: { teams, games } };
  return cache.data;
}
