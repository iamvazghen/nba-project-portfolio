"use client";
import { useEffect, useMemo, useState } from "react";
import { simulateGame } from "@/lib/sim";
import { simulateGameWasm } from "@/lib/wasm";

type Team = { tricode: string; name: string; conf: "East" | "West"; wins: number; losses: number; netRating: number };
type Game = { id: string; date: string; status: number; home: string; away: string; homeScore: number; awayScore: number };
type Result = { homeWinPct: number; expectedMargin: number; homeScore: number; awayScore: number; sims: number };
type Engine = "typescript" | "python" | "rust-wasm";
type Seeded = { seed: number; tricode: string; name: string; projWins: number; avgSeed: number; playoffPct: number; top6Pct: number };
const OFFSEASON_GAME = "https://www.82-0.com/";
const TABS = ["Single Game", "Season", "Offseason"] as const;

export default function Page() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Single Game");
  const [teams, setTeams] = useState<Team[]>([]);
  const [latest, setLatest] = useState<Game[]>([]);

  useEffect(() => {
    fetch("/api/schedule").then((r) => r.json()).then((d) => {
      setTeams(d.teams ?? []); setLatest(d.latest ?? []);
    }).catch(() => {});
  }, []);

  const top = useMemo(() => [...teams].sort((a, b) => b.netRating - a.netRating)[0], [teams]);

  return (
    <>
      <header className="masthead">
        <div className="wrap bar">
          <div className="brand"><span className="dot" /> Hardwood</div>
          <div className="live">{teams.length ? `${teams.length} teams · live model` : "loading…"}</div>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <div className="kicker">NBA Prediction Machine</div>
          <h1>Run the season <em>before</em> it happens.</h1>
          <p className="lede">
            Monte Carlo predictions for any matchup and the whole season — three engines (TypeScript, Python,
            Rust→WASM), live NBA schedule, seeding, bracketology, and the live betting market side by side.
          </p>
          <div className="statline">
            <div className="stat"><div className="n accent tnum">10,000</div><div className="l">sims / run</div></div>
            <div className="stat"><div className="n tnum">3</div><div className="l">engines</div></div>
            <div className="stat"><div className="n tnum">{teams.length || "—"}</div><div className="l">teams modeled</div></div>
            <div className="stat"><div className="n">{top ? top.tricode : "—"}</div><div className="l">top power rating</div></div>
          </div>
        </section>

        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={"tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>

        {tab === "Single Game" && <SingleGame teams={teams} latest={latest} />}
        {tab === "Season" && <Season teams={teams} />}
        {tab === "Offseason" && <Offseason />}
      </main>

      <footer className="wrap site">
        <span>Data: NBA public schedule CDN · model: net-rating Monte Carlo</span>
        <span>Portfolio build · not affiliated with the NBA</span>
      </footer>
    </>
  );
}

const tmap = (teams: Team[]) => Object.fromEntries(teams.map((t) => [t.tricode, t]));

/* ----------------------------- Single Game ----------------------------- */
function SingleGame({ teams, latest }: { teams: Team[]; latest: Game[] }) {
  const [home, setHome] = useState(""); const [away, setAway] = useState("");
  const [engine, setEngine] = useState<Engine>("typescript");
  const [result, setResult] = useState<Result | null>(null);
  const [usedEngine, setUsedEngine] = useState("");
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<string | null>(null); const [aiBusy, setAiBusy] = useState(false);
  const tm = tmap(teams);

  useEffect(() => {
    if (teams.length && !home) {
      if (latest[0]) { setHome(latest[0].home); setAway(latest[0].away); }
      else { setHome(teams[0].tricode); setAway(teams[1].tricode); }
    }
  }, [teams, latest, home]);

  async function run() {
    if (!home || !away || home === away) return;
    setBusy(true); setAi(null);
    const h = tm[home], a = tm[away];
    try {
      if (engine === "typescript") {
        const res = await fetch("/api/predict", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ home, away }) }).then((r) => r.json());
        setResult(res.result); setUsedEngine("TypeScript · serverless");
      } else if (engine === "python") {
        const res = await fetch("/api/py-predict", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ homeRating: h.netRating, awayRating: a.netRating, sims: 10000 }) }).then((r) => r.json());
        if (!res || res.homeWinPct == null) throw new Error("py unavailable");
        setResult(res); setUsedEngine("Python · serverless");
      } else {
        const { result, engine: eng } = await simulateGameWasm(h.netRating, a.netRating, 10000);
        setResult(result); setUsedEngine(eng === "rust-wasm" ? "Rust → WASM · client" : "TypeScript · WASM not built, fell back");
      }
    } catch {
      setResult(simulateGame(h.netRating, a.netRating, 10000)); setUsedEngine("TypeScript · client fallback");
    } finally { setBusy(false); }
  }
  async function getAI() {
    setAiBusy(true);
    try {
      const r = await fetch("/api/predict-llm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ home, away }) }).then((r) => r.json());
      setAi(r.available ? r.text : "AI take unavailable — set ANTHROPIC_API_KEY to enable it.");
    } finally { setAiBusy(false); }
  }

  const h = tm[home], a = tm[away];
  const hPct = result ? Math.round(result.homeWinPct * 100) : 0;

  return (
    <>
      {latest.length > 0 && (
        <div className="panel">
          <div className="eyebrow">Latest games — tap to load</div>
          {latest.slice(0, 5).map((g) => (
            <div key={g.id} className="matchcard" onClick={() => { setHome(g.home); setAway(g.away); setResult(null); }}>
              <span><b>{g.away}</b> <span className="muted">@</span> <b>{g.home}</b></span>
              <span className="muted tnum">{g.status === 3 ? `Final ${g.awayScore}-${g.homeScore}` : new Date(g.date).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="row">
          <div><label className="lbl">Away</label>
            <select value={away} onChange={(e) => { setAway(e.target.value); setResult(null); }}>
              {teams.map((t) => <option key={t.tricode} value={t.tricode}>{t.name}</option>)}
            </select>
          </div>
          <div><label className="lbl">Home</label>
            <select value={home} onChange={(e) => { setHome(e.target.value); setResult(null); }}>
              {teams.map((t) => <option key={t.tricode} value={t.tricode}>{t.name}</option>)}
            </select>
          </div>
          <div><label className="lbl">Engine</label>
            <div className="seg">
              {(["typescript", "python", "rust-wasm"] as Engine[]).map((e) => (
                <button key={e} className={engine === e ? "on" : ""} onClick={() => setEngine(e)}>{e === "typescript" ? "TS" : e === "python" ? "Python" : "Rust"}</button>
              ))}
            </div>
          </div>
          <button className="btn" onClick={run} disabled={busy || !home || home === away}>{busy ? <><span className="spin" /> Simulating</> : "Run 10,000 sims"}</button>
        </div>

        {result && h && a && (
          <div>
            <div className="winbar">
              <div className="h tnum" style={{ width: `${hPct}%` }}>{h.tricode} {hPct}%</div>
              <div className="a tnum" style={{ width: `${100 - hPct}%` }}>{100 - hPct}% {a.tricode}</div>
            </div>
            <div className="scoreline">
              <div className="team"><div className="muted">{a.name}</div><div className="score tnum">{result.awayScore}</div></div>
              <div className="mid">projected<br />final</div>
              <div className="team" style={{ textAlign: "right" }}><div className="muted">{h.name} <span className="tag">home</span></div><div className="score tnum">{result.homeScore}</div></div>
            </div>
            <p className="muted" style={{ marginTop: "var(--space-3)" }}>
              Expected margin {result.expectedMargin >= 0 ? "+" : ""}{result.expectedMargin.toFixed(1)} {h.tricode} · {result.sims.toLocaleString()} sims · <span className="tag">{usedEngine}</span>
            </p>
            <button className="btn ghost" onClick={getAI} disabled={aiBusy}>{aiBusy ? <><span className="spin" /> Thinking</> : "🤖 AI take"}</button>
            {ai && <div className="ai">{ai}</div>}
          </div>
        )}
      </div>

      <OddsPanel title="Live betting market" />
    </>
  );
}

/* ----------------------------- Season ----------------------------- */
type SeasonMode = "full" | "fromSeeds" | "playBracket";
function Season({ teams }: { teams: Team[] }) {
  const [mode, setMode] = useState<SeasonMode>("full");
  const [seeds, setSeeds] = useState<{ east: Seeded[]; west: Seeded[] } | null>(null);

  // default projected seeds (shared by fromSeeds + playBracket); fetched once.
  useEffect(() => {
    if (!seeds) fetch("/api/season?sims=4000").then((r) => r.json()).then((d) => setSeeds({ east: d.east, west: d.west })).catch(() => {});
  }, [seeds]);

  return (
    <>
      <div className="panel">
        <div className="panel-h">
          <div>
            <h2>Season Mode</h2>
            <p>Three ways to play out a season — simulate everything, simulate only the regular season, or seed the bracket yourself.</p>
          </div>
        </div>
        <div className="seg" role="tablist">
          <button className={mode === "full" ? "on" : ""} onClick={() => setMode("full")}>Reg. season + Playoffs</button>
          <button className={mode === "fromSeeds" ? "on" : ""} onClick={() => setMode("fromSeeds")}>Playoffs from my seeds</button>
          <button className={mode === "playBracket" ? "on" : ""} onClick={() => setMode("playBracket")}>Reg. season → I play the bracket</button>
        </div>
        <div style={{ marginTop: "var(--space-5)" }}>
          {mode === "full" && <FullSeason />}
          {mode === "fromSeeds" && <FromSeeds teams={teams} seeds={seeds} />}
          {mode === "playBracket" && <PlayBracket teams={teams} seeds={seeds} />}
        </div>
      </div>
      <OddsPanel title="Betting market — current board" />
    </>
  );
}

function FullSeason() {
  const [data, setData] = useState<any>(null); const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try { setData(await fetch("/api/playoffs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "full", sims: 10000 }) }).then((r) => r.json())); }
    finally { setBusy(false); }
  }
  return (
    <div>
      <p className="muted">10,000 full seasons simulated end to end — regular season decides seeding, then every playoff series is simulated to a champion.</p>
      <button className="btn" onClick={run} disabled={busy} style={{ marginTop: "var(--space-3)" }}>{busy ? <><span className="spin" /> Simulating 10k seasons</> : "Run full simulation"}</button>
      {data?.odds && (
        <>
          <div className="eyebrow" style={{ marginTop: "var(--space-6)" }}>Championship odds</div>
          <ChampTable rows={data.odds} />
        </>
      )}
    </div>
  );
}

function ChampTable({ rows }: { rows: any[] }) {
  const max = Math.max(...rows.map((r) => r.champPct), 1);
  return (
    <table>
      <thead><tr><th>Team</th><th>Conf</th><th className="num">Proj W</th><th className="num">Finals%</th><th className="num">Title%</th></tr></thead>
      <tbody>
        {rows.filter((r) => r.champPct > 0 || r.finalsPct > 1).slice(0, 16).map((r) => (
          <tr key={r.tricode}>
            <td><b>{r.name ?? r.tricode}</b></td>
            <td className="muted">{r.conf}</td>
            <td className="num tnum">{r.projWins ?? "—"}</td>
            <td className="num tnum">{r.finalsPct}%</td>
            <td className="num bar-cell"><span className="fill" style={{ width: `${(r.champPct / max) * 100}%` }} /><span className="tnum">{r.champPct}%</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FromSeeds({ teams, seeds }: { teams: Team[]; seeds: { east: Seeded[]; west: Seeded[] } | null }) {
  const [east, setEast] = useState<string[]>([]); const [west, setWest] = useState<string[]>([]);
  const [data, setData] = useState<any>(null); const [busy, setBusy] = useState(false);
  const byConf = (c: "East" | "West") => teams.filter((t) => t.conf === c);

  useEffect(() => {
    if (seeds && east.length === 0) { setEast(seeds.east.slice(0, 8).map((s) => s.tricode)); setWest(seeds.west.slice(0, 8).map((s) => s.tricode)); }
  }, [seeds, east.length]);

  async function run() {
    setBusy(true);
    try { setData(await fetch("/api/playoffs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "fromSeeds", east, west, sims: 10000 }) }).then((r) => r.json())); }
    finally { setBusy(false); }
  }
  const SeedCol = ({ label, val, set, pool }: { label: string; val: string[]; set: (v: string[]) => void; pool: Team[] }) => (
    <div>
      <div className="eyebrow">{label} — set seeds 1–8</div>
      {val.map((tri, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
          <span className="muted tnum" style={{ width: 18 }}>{i + 1}</span>
          <select value={tri} onChange={(e) => { const n = [...val]; n[i] = e.target.value; set(n); }} style={{ minWidth: 0, flex: 1 }}>
            {pool.map((t) => <option key={t.tricode} value={t.tricode}>{t.name}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
  return (
    <div>
      <p className="muted">Seed each conference yourself (prefilled with the model's projection), then run 10,000 playoff brackets off your seeds.</p>
      <div className="grid2" style={{ marginTop: "var(--space-4)" }}>
        <SeedCol label="East" val={east} set={setEast} pool={byConf("East")} />
        <SeedCol label="West" val={west} set={setWest} pool={byConf("West")} />
      </div>
      <button className="btn" onClick={run} disabled={busy || east.length !== 8} style={{ marginTop: "var(--space-4)" }}>{busy ? <><span className="spin" /> Simulating brackets</> : "Run 10,000 brackets"}</button>
      {data?.odds && (<><div className="eyebrow" style={{ marginTop: "var(--space-6)" }}>Championship odds from your seeds</div><ChampTable rows={data.odds} /></>)}
    </div>
  );
}

/* ----------------------------- Play the bracket yourself ----------------------------- */
type S = { t: string; seed: number };
function PlayBracket({ teams, seeds }: { teams: Team[]; seeds: { east: Seeded[]; west: Seeded[] } | null }) {
  const tm = tmap(teams);
  const name = (t: string) => tm[t]?.name ?? t;
  if (!seeds) return <p className="muted">Loading projected seeds…</p>;
  const eSeeds: S[] = seeds.east.slice(0, 8).map((s) => ({ t: s.tricode, seed: s.seed }));
  const wSeeds: S[] = seeds.west.slice(0, 8).map((s) => ({ t: s.tricode, seed: s.seed }));
  return <PlayBracketInner key={eSeeds.map((s) => s.t).join() + wSeeds.map((s) => s.t).join()} eSeeds={eSeeds} wSeeds={wSeeds} name={name} />;
}

function PlayBracketInner({ eSeeds, wSeeds, name }: { eSeeds: S[]; wSeeds: S[]; name: (t: string) => string }) {
  const [eChamp, setEChamp] = useState<S | null>(null);
  const [wChamp, setWChamp] = useState<S | null>(null);
  const [champ, setChamp] = useState<S | null>(null);

  return (
    <div>
      <p className="muted">Seeding is the model's regular-season projection. You decide every series. Click a team to advance it.</p>
      <div className="grid2" style={{ marginTop: "var(--space-4)" }}>
        <ConfBracket title="East" seeds={eSeeds} name={name} onChamp={(c) => { setEChamp(c); setChamp(null); }} />
        <ConfBracket title="West" seeds={wSeeds} name={name} onChamp={(c) => { setWChamp(c); setChamp(null); }} />
      </div>
      {eChamp && wChamp && (
        <div style={{ marginTop: "var(--space-5)" }}>
          <div className="eyebrow">NBA Finals</div>
          <div className="series">
            <button className={"side" + (champ?.t === eChamp.t ? " win" : "")} onClick={() => setChamp(eChamp)}><span className="sd">E</span>{name(eChamp.t)}</button>
            <span className="muted">vs</span>
            <button className={"side" + (champ?.t === wChamp.t ? " win" : "")} onClick={() => setChamp(wChamp)}>{name(wChamp.t)}<span className="sd">W</span></button>
          </div>
          {champ && <div className="champ-banner">🏆 Your champion<div className="big">{name(champ.t)}</div></div>}
        </div>
      )}
    </div>
  );
}

// Interactive single-conference bracket (8 → 1). Reports the champion via onChamp.
function ConfBracket({ title, seeds, name, onChamp }: { title: string; seeds: S[]; name: (t: string) => string; onChamp: (c: S) => void }) {
  const order = [0, 7, 3, 4, 2, 5, 1, 6].map((i) => seeds[i]); // 1,8,4,5,3,6,2,7
  // chosen[level][pairIndex] = winning seed (or undefined)
  const [chosen, setChosen] = useState<(S | undefined)[][]>([[], [], []]);

  const participants = (level: number, i: number): [S | undefined, S | undefined] =>
    level === 0 ? [order[2 * i], order[2 * i + 1]] : [chosen[level - 1][2 * i], chosen[level - 1][2 * i + 1]];

  function pick(level: number, i: number, who: S) {
    const next = chosen.map((r) => [...r]);
    next[level][i] = who;
    for (let l = level + 1; l < 3; l++) next[l] = []; // clear downstream
    setChosen(next);
    if (level === 2) onChamp(who);
  }

  const labels = ["First round", "Conf. semis", "Conf. final"];
  const counts = [4, 2, 1];
  return (
    <div>
      <div className="eyebrow">{title}</div>
      {labels.map((lab, level) => (
        <div key={level} style={{ marginBottom: "var(--space-3)" }}>
          <div className="muted" style={{ fontSize: "var(--text-xs)", margin: "var(--space-2) 0" }}>{lab}</div>
          <div className="bracket">
            {Array.from({ length: counts[level] }).map((_, i) => {
              const [a, b] = participants(level, i);
              const w = chosen[level][i];
              return (
                <div className="series" key={i}>
                  <button className={"side" + (w && a && w.t === a.t ? " win" : "")} disabled={!a || !b} onClick={() => a && pick(level, i, a)}>
                    {a ? <><span className="sd">{a.seed}</span>{name(a.t)}</> : <span className="muted">—</span>}
                  </button>
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>vs</span>
                  <button className={"side" + (w && b && w.t === b.t ? " win" : "")} disabled={!a || !b} onClick={() => b && pick(level, i, b)}>
                    {b ? <>{name(b.t)}<span className="sd">{b.seed}</span></> : <span className="muted">—</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- Odds (embedded, reusable) ----------------------------- */
function OddsPanel({ title }: { title: string }) {
  const [data, setData] = useState<any>(null); const [busy, setBusy] = useState(true);
  useEffect(() => { fetch("/api/odds").then((r) => r.json()).then(setData).catch(() => setData({ available: false })).finally(() => setBusy(false)); }, []);
  return (
    <div className="panel">
      <div className="eyebrow">{title}</div>
      {busy && <p className="muted"><span className="spin" /> Loading odds…</p>}
      {!busy && !data?.available && (
        <p className="muted">Moneyline, spread & total across major US books (DraftKings, FanDuel, BetMGM…). Set <span className="tag">ODDS_API_KEY</span> (free at the-odds-api.com) to go live.</p>
      )}
      {!busy && data?.available && data.games.length === 0 && <p className="muted">No NBA games on the board right now (offseason).</p>}
      {!busy && data?.available && data.games.slice(0, 6).map((g: any, i: number) => (
        <div key={i} style={{ marginBottom: "var(--space-4)" }}>
          <b>{g.away} @ {g.home}</b> <span className="muted tnum">{new Date(g.start).toLocaleString()}</span>
          <table>
            <thead><tr><th>Book</th><th>Moneyline</th><th>Spread</th><th>Total</th></tr></thead>
            <tbody>
              {g.books.slice(0, 6).map((b: any, j: number) => (
                <tr key={j}><td>{b.book}</td><td className="tnum">{fmt(b.markets.h2h)}</td><td className="tnum">{fmtP(b.markets.spreads)}</td><td className="tnum">{fmtT(b.markets.totals)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
const fmt = (o: any[]) => (o ? o.map((x) => `${x.name.split(" ").pop()} ${x.price > 0 ? "+" : ""}${x.price}`).join("  ") : "—");
const fmtP = (o: any[]) => (o ? o.map((x) => `${x.name.split(" ").pop()} ${x.point > 0 ? "+" : ""}${x.point}`).join("  ") : "—");
const fmtT = (o: any[]) => (o ? o.map((x) => `${x.name[0]} ${x.point}`).join("  ") : "—");

/* ----------------------------- Offseason ----------------------------- */
function Offseason() {
  return (
    <div className="panel offseason">
      <div className="kicker" style={{ color: "var(--color-accent)" }}>Offseason Mode</div>
      <h2 style={{ fontSize: "var(--text-display)", marginBottom: "var(--space-4)" }}>No games to predict?</h2>
      <p className="muted" style={{ maxWidth: "52ch", margin: "0 auto var(--space-6)" }}>
        Build an all-time roster and see if it can run the table in the viral pick-’em game everyone’s playing — 82-0.
      </p>
      <a className="big-link" href={OFFSEASON_GAME} target="_blank" rel="noopener noreferrer">Play 82-0 →</a>
    </div>
  );
}
