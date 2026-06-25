"use client";
import { useEffect, useState } from "react";
import { simulateGame } from "@/lib/sim";
import { simulateGameWasm } from "@/lib/wasm";

type Team = { tricode: string; name: string; conf: string; wins: number; losses: number; netRating: number };
type Game = { id: string; date: string; status: number; statusText: string; home: string; away: string; homeScore: number; awayScore: number };
type Result = { homeWinPct: number; expectedMargin: number; homeScore: number; awayScore: number; sims: number };
type Engine = "typescript" | "python" | "rust-wasm";
const OFFSEASON_GAME = "https://www.82-0.com/";
const TABS = ["Single Game", "Season", "Bets", "Offseason"] as const;

export default function Page() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Single Game");
  const [teams, setTeams] = useState<Team[]>([]);
  const [latest, setLatest] = useState<Game[]>([]);

  useEffect(() => {
    fetch("/api/schedule").then((r) => r.json()).then((d) => {
      setTeams(d.teams ?? []);
      setLatest(d.latest ?? []);
    }).catch(() => {});
  }, []);

  return (
    <div className="wrap">
      <h1>NBA <span>Prediction Machine</span></h1>
      <p className="sub">Monte Carlo game & season sims in TypeScript / Python / Rust-WASM · live schedule from the NBA · seeding, bracketology & bets.</p>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === "Single Game" && <SingleGame teams={teams} latest={latest} />}
      {tab === "Season" && <Season />}
      {tab === "Bets" && <Bets />}
      {tab === "Offseason" && <Offseason />}
    </div>
  );
}

function teamMap(teams: Team[]) { return Object.fromEntries(teams.map((t) => [t.tricode, t])); }

function SingleGame({ teams, latest }: { teams: Team[]; latest: Game[] }) {
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [engine, setEngine] = useState<Engine>("typescript");
  const [result, setResult] = useState<Result | null>(null);
  const [usedEngine, setUsedEngine] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const tm = teamMap(teams);

  useEffect(() => {
    if (teams.length && !home) {
      if (latest[0]) { setHome(latest[0].home); setAway(latest[0].away); }
      else { setHome(teams[0].tricode); setAway(teams[1].tricode); }
    }
  }, [teams, latest, home]);

  async function run() {
    if (!home || !away || home === away) return;
    setBusy(true); setAi(null);
    try {
      const h = tm[home], a = tm[away];
      if (engine === "typescript") {
        const res = await fetch("/api/predict", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ home, away }),
        }).then((r) => r.json());
        setResult(res.result); setUsedEngine("TypeScript (serverless)");
      } else if (engine === "python") {
        const res = await fetch("/api/py-predict", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ homeRating: h.netRating, awayRating: a.netRating, sims: 10000 }),
        }).then((r) => r.json());
        setResult(res); setUsedEngine("Python (serverless)");
      } else {
        const { result, engine: eng } = await simulateGameWasm(h.netRating, a.netRating, 10000);
        setResult(result);
        setUsedEngine(eng === "rust-wasm" ? "Rust → WASM (client)" : "TypeScript (WASM not built — fallback)");
      }
    } catch {
      // last-resort client fallback
      const h = tm[home], a = tm[away];
      setResult(simulateGame(h.netRating, a.netRating, 10000));
      setUsedEngine("TypeScript (client fallback)");
    } finally { setBusy(false); }
  }

  async function getAI() {
    setAiBusy(true);
    try {
      const r = await fetch("/api/predict-llm", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ home, away }),
      }).then((r) => r.json());
      setAi(r.available ? r.text : "AI take unavailable — set ANTHROPIC_API_KEY in the environment to enable it.");
    } finally { setAiBusy(false); }
  }

  const h = tm[home], a = tm[away];
  const hPct = result ? Math.round(result.homeWinPct * 100) : 0;

  return (
    <>
      {latest.length > 0 && (
        <div className="panel">
          <label>Latest games</label>
          {latest.slice(0, 5).map((g) => (
            <div key={g.id} className="matchcard" onClick={() => { setHome(g.home); setAway(g.away); }}>
              <span><b>{g.away}</b> @ <b>{g.home}</b></span>
              <span className="muted">{g.status === 3 ? `Final ${g.awayScore}-${g.homeScore}` : new Date(g.date).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
      <div className="panel">
        <div className="row">
          <div>
            <label>Away</label>
            <select value={away} onChange={(e) => setAway(e.target.value)}>
              {teams.map((t) => <option key={t.tricode} value={t.tricode}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ alignSelf: "flex-end", paddingBottom: 10 }} className="muted">@</div>
          <div>
            <label>Home</label>
            <select value={home} onChange={(e) => setHome(e.target.value)}>
              {teams.map((t) => <option key={t.tricode} value={t.tricode}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label>Engine</label>
            <div className="seg">
              {(["typescript", "python", "rust-wasm"] as Engine[]).map((e) => (
                <button key={e} className={engine === e ? "on" : ""} onClick={() => setEngine(e)}>
                  {e === "typescript" ? "TS" : e === "python" ? "Python" : "Rust/WASM"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <button className="btn" onClick={run} disabled={busy || !home || home === away}>
              {busy ? "Simulating…" : "Run 10,000 sims"}
            </button>
          </div>
        </div>

        {result && h && a && (
          <div style={{ marginTop: 18 }}>
            <div className="bar">
              <div className="h" style={{ width: `${hPct}%` }}>{h.tricode} {hPct}%</div>
              <div className="a" style={{ width: `${100 - hPct}%` }}>{100 - hPct}% {a.tricode}</div>
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
              <div>
                <div className="muted">{a.name}</div>
                <div className="score">{result.awayScore}</div>
              </div>
              <div style={{ textAlign: "center" }} className="muted">
                projected<br />final
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="muted">{h.name} <span className="tag">home</span></div>
                <div className="score">{result.homeScore}</div>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>
              Expected margin {result.expectedMargin >= 0 ? "+" : ""}{result.expectedMargin.toFixed(1)} for {h.tricode} ·
              {" "}{result.sims.toLocaleString()} sims · <span className="tag">{usedEngine}</span>
            </p>
            <button className="btn ghost" onClick={getAI} disabled={aiBusy} style={{ marginTop: 6 }}>
              {aiBusy ? "Thinking…" : "🤖 AI take"}
            </button>
            {ai && <div className="ai">{ai}</div>}
          </div>
        )}
      </div>
    </>
  );
}

function Season() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try { setData(await fetch("/api/season?sims=10000").then((r) => r.json())); }
    finally { setBusy(false); }
  }
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>Season Mode</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>10,000 full-season simulations from current power ratings → seeding, playoff odds & bracketology.</p>
        </div>
        <button className="btn" onClick={run} disabled={busy}>{busy ? "Simulating 10k seasons…" : "Run season sim"}</button>
      </div>
      {data && (
        <>
          <div className="grid2" style={{ marginTop: 18 }}>
            {(["east", "west"] as const).map((c) => (
              <div key={c}>
                <h3>{c === "east" ? "Eastern" : "Western"} Conference</h3>
                <table>
                  <thead><tr><th>#</th><th>Team</th><th className="num">Proj W</th><th className="num">Playoff%</th><th className="num">Top-6%</th></tr></thead>
                  <tbody>
                    {data[c].map((t: any) => (
                      <tr key={t.tricode} className={t.seed > 6 && t.seed <= 10 ? "playin" : ""}>
                        <td>{t.seed}</td><td>{t.name}</td>
                        <td className="num">{t.projWins}</td>
                        <td className="num">{t.playoffPct}%</td>
                        <td className="num">{t.top6Pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <h3 style={{ marginTop: 22 }}>Projected first-round bracket</h3>
          <div className="grid2">
            {(["bracketEast", "bracketWest"] as const).map((b) => (
              <div key={b}>
                <div className="muted" style={{ marginBottom: 6 }}>{b === "bracketEast" ? "East" : "West"}</div>
                {data[b].map((m: any, i: number) => (
                  <div key={i} className="bracketrow">
                    <span><span className="seedn">{m.hi.seed}</span><b>{m.hi.tricode}</b></span>
                    <span className="muted">vs</span>
                    <span><b>{m.lo.tricode}</b><span className="seedn" style={{ textAlign: "right" }}>{m.lo.seed}</span></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 10 }}>Seeds 7–10 (greyed) reach the play-in tournament.</p>
        </>
      )}
    </div>
  );
}

function Bets() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setBusy(true); fetch("/api/odds").then((r) => r.json()).then(setData).finally(() => setBusy(false)); }, []);
  if (busy) return <div className="panel">Loading odds…</div>;
  if (!data?.available) return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Bets Aggregator</h2>
      <p className="muted">Pulls moneyline, spread & total across major US sportsbooks (DraftKings, FanDuel, BetMGM, …).</p>
      <p>Set <span className="tag">ODDS_API_KEY</span> (free at the-odds-api.com) in the environment to enable live odds.</p>
    </div>
  );
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Bets Aggregator</h2>
      {data.games.length === 0 && <p className="muted">No NBA games on the board right now (offseason).</p>}
      {data.games.map((g: any, i: number) => (
        <div key={i} style={{ marginBottom: 18 }}>
          <b>{g.away} @ {g.home}</b> <span className="muted">{new Date(g.start).toLocaleString()}</span>
          <table>
            <thead><tr><th>Book</th><th>Moneyline</th><th>Spread</th><th>Total</th></tr></thead>
            <tbody>
              {g.books.map((b: any, j: number) => (
                <tr key={j}>
                  <td>{b.book}</td>
                  <td>{fmt(b.markets.h2h)}</td>
                  <td>{fmtSpread(b.markets.spreads)}</td>
                  <td>{fmtTotal(b.markets.totals)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
function fmt(o: any[]) { return o ? o.map((x) => `${x.name.split(" ").pop()} ${x.price > 0 ? "+" : ""}${x.price}`).join("  ") : "—"; }
function fmtSpread(o: any[]) { return o ? o.map((x) => `${x.name.split(" ").pop()} ${x.point > 0 ? "+" : ""}${x.point}`).join("  ") : "—"; }
function fmtTotal(o: any[]) { return o ? o.map((x) => `${x.name[0]} ${x.point}`).join("  ") : "—"; }

function Offseason() {
  return (
    <div className="panel" style={{ textAlign: "center", padding: "44px 20px" }}>
      <h2 style={{ marginTop: 0 }}>🏀 Offseason Mode</h2>
      <p className="muted" style={{ maxWidth: 520, margin: "0 auto 26px" }}>
        No games to predict? Go build an all-time roster and see if it can run the table in the viral
        pick-’em game everyone’s playing — <b>82-0</b>.
      </p>
      <a className="big-link" href={OFFSEASON_GAME} target="_blank" rel="noopener noreferrer">
        Play 82-0 → Can your roster go undefeated?
      </a>
    </div>
  );
}
