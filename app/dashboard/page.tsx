"use client";
import { useEffect, useMemo, useState } from "react";
import { simGame, simSeason, simPlayoffsFull, simPlayoffsFromSeeds } from "@/lib/wasm";
import { matchupDelta, type Feat, type Edge } from "@/lib/matchup";

type Player = { name: string; role: "S" | "B"; impact: number; min: number; exp: number };
type Team = { tricode: string; name: string; conf: "East" | "West"; wins: number; losses: number; netRating: number; base: number; rating: number; upside: number; ctxDelta: number; ctxNote: string; feat: Feat; players: Player[] };
type Game = { id: string; date: string; status: number; home: string; away: string; homeScore: number; awayScore: number };
type Model = { teams: Team[]; ratings: number[]; variance: number[]; conf: number[]; homeIdx: number[]; awayIdx: number[]; idx: Record<string, number> };
type Result = { homeWinPct: number; expectedMargin: number; homeScore: number; awayScore: number; sims: number };
type Seeded = { tricode: string; name: string; seed: number; avgSeed: number };
const OFFSEASON_GAME = "https://www.82-0.com/";
const TABS = ["Single Game", "Season", "Offseason"] as const;
const yield_ = () => new Promise((r) => setTimeout(r, 16)); // let a spinner paint before a blocking wasm call

export default function Page() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Single Game");
  const [model, setModel] = useState<Model | null>(null);
  const [latest, setLatest] = useState<Game[]>([]);

  useEffect(() => {
    fetch("/api/schedule").then((r) => r.json()).then((d) => {
      const teams: Team[] = d.teams ?? [];
      const idx = Object.fromEntries(teams.map((t, i) => [t.tricode, i]));
      const homeIdx: number[] = [], awayIdx: number[] = [];
      for (let k = 0; k < (d.schedule?.home?.length ?? 0); k++) {
        const h = idx[d.schedule.home[k]], a = idx[d.schedule.away[k]];
        if (h != null && a != null) { homeIdx.push(h); awayIdx.push(a); }
      }
      setModel({
        teams, idx,
        ratings: teams.map((t) => t.rating), // effective = SRS base + roster-context delta
        variance: teams.map((t) => t.upside),
        conf: teams.map((t) => (t.conf === "East" ? 0 : 1)),
        homeIdx, awayIdx,
      });
      setLatest(d.latest ?? []);
    }).catch(() => {});
  }, []);

  const top = useMemo(() => (model ? [...model.teams].sort((a, b) => b.rating - a.rating)[0] : null), [model]);

  useEffect(() => {
    const sync = () => {
      const t = new URLSearchParams(window.location.search).get("tab") ?? "Single Game";
      if ((TABS as readonly string[]).includes(t)) setTab(t as (typeof TABS)[number]);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function selectTab(t: (typeof TABS)[number]) {
    setTab(t);
    window.history.pushState({ tab: t }, "", t === "Single Game" ? "/dashboard" : `/dashboard?tab=${encodeURIComponent(t)}`);
  }

  return (
    <>
      <header className="masthead">
        <div className="wrap bar">
          <a className="brand" href="/"><span className="dot" /> Hardwood</a>
          <div className="live">{model ? `${model.teams.length} teams · Rust/WASM` : "loading…"}</div>
        </div>
      </header>

      <main className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">Dashboard</div>
            <h1 className="dash-title">Simulation modes</h1>
          </div>
          <div className="dash-stats">
            <div className="stat"><div className="n accent tnum">10K</div><div className="l">sims / run</div></div>
            <div className="stat"><div className="n tnum">{model?.teams.length || "—"}</div><div className="l">teams</div></div>
            <div className="stat"><div className="n">{top ? top.tricode : "—"}</div><div className="l">top rating</div></div>
          </div>
        </div>

        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={"tab" + (tab === t ? " active" : "")} onClick={() => selectTab(t)}>{t}</button>
          ))}
        </nav>

        {!model && tab !== "Offseason" && <div className="panel muted"><span className="spin" /> Loading live NBA data…</div>}
        {model && tab === "Single Game" && <SingleGame model={model} latest={latest} />}
        {model && tab === "Season" && <Season model={model} />}
        {tab === "Offseason" && <Offseason />}
      </main>

      <footer className="wrap site">
        <span>Data: NBA public schedule CDN · engine: Rust → WASM net-rating Monte Carlo</span>
        <span>Portfolio build · not affiliated with the NBA</span>
      </footer>
    </>
  );
}

/* ----------------------------- Single Game ----------------------------- */
function SingleGame({ model, latest }: { model: Model; latest: Game[] }) {
  const { teams, idx, ratings } = model;
  const [home, setHome] = useState(""); const [away, setAway] = useState("");
  const [series, setSeries] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [seriesRes, setSeriesRes] = useState<{ hi: Team; lo: Team; hiWin: number; lengths: number[] } | null>(null);
  const [md, setMd] = useState<{ total: number; edges: Edge[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<string | null>(null); const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    if (!home) {
      if (latest[0]) { setHome(latest[0].home); setAway(latest[0].away); }
      else { setHome(teams[0].tricode); setAway(teams[1].tricode); }
    }
  }, [teams, latest, home]);

  function reset() { setResult(null); setSeriesRes(null); setMd(null); setAi(null); }

  async function run() {
    if (!home || !away || home === away) return;
    setBusy(true); setAi(null); await yield_();
    const hI = idx[home], aI = idx[away];
    try {
      const delta = matchupDelta(teams[hI].feat, teams[aI].feat, series); // pairwise edge, points
      setMd(delta);
      if (!series) {
        setResult(await simGame(ratings[hI] + delta.total, ratings[aI], 10000, teams[hI].upside, teams[aI].upside));
        setSeriesRes(null);
      } else {
        // Best-of-7: the higher-rated team hosts (2-2-1-1-1). Series win% via the
        // engine's per-game home/away probabilities, Monte-Carlo'd over 20k series.
        const hostHome = ratings[hI] >= ratings[aI];
        const hiI = hostHome ? hI : aI, loI = hostHome ? aI : hI;
        const d = hostHome ? delta.total : -delta.total;
        const pHome = (await simGame(ratings[hiI] + d, ratings[loI], 6000, teams[hiI].upside, teams[loI].upside)).homeWinPct;
        const pAway = 1 - (await simGame(ratings[loI], ratings[hiI] + d, 6000, teams[loI].upside, teams[hiI].upside)).homeWinPct;
        const pattern = [true, true, false, false, true, false, true]; // hi-seed home games
        const lengths = [0, 0, 0, 0]; let hiWins = 0; const N = 20000;
        for (let s = 0; s < N; s++) {
          let h = 0, l = 0, g = 0;
          while (h < 4 && l < 4) { if (Math.random() < (pattern[g] ? pHome : pAway)) h++; else l++; g++; }
          if (h === 4) hiWins++;
          lengths[g - 4]++;
        }
        setSeriesRes({ hi: teams[hiI], lo: teams[loI], hiWin: hiWins / N, lengths: lengths.map((c) => c / N) });
        setResult(null);
      }
    } finally { setBusy(false); }
  }
  async function getAI() {
    setAiBusy(true);
    try {
      const r = await fetch("/api/predict-llm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ home, away }) }).then((r) => r.json());
      setAi(r.available ? r.text : "AI take unavailable — set GEMINI_API_KEY to enable it.");
    } finally { setAiBusy(false); }
  }

  const h = teams[idx[home]], a = teams[idx[away]];
  const hPct = result ? Math.round(result.homeWinPct * 100) : 0;
  const sPct = seriesRes ? Math.round(seriesRes.hiWin * 100) : 0;

  return (
    <>
      {latest.length > 0 && (
        <div className="panel">
          <div className="eyebrow">Latest games — tap to load</div>
          {latest.slice(0, 5).map((g) => (
            <div key={g.id} className="matchcard" onClick={() => { setHome(g.home); setAway(g.away); reset(); }}>
              <span><b>{g.away}</b> <span className="muted">@</span> <b>{g.home}</b></span>
              <span className="muted tnum">{g.status === 3 ? `Final ${g.awayScore}-${g.homeScore}` : new Date(g.date).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="row">
          <div><label className="lbl">Away</label>
            <select value={away} onChange={(e) => { setAway(e.target.value); reset(); }}>
              {teams.map((t) => <option key={t.tricode} value={t.tricode}>{t.name}</option>)}
            </select>
          </div>
          <div><label className="lbl">Home</label>
            <select value={home} onChange={(e) => { setHome(e.target.value); reset(); }}>
              {teams.map((t) => <option key={t.tricode} value={t.tricode}>{t.name}</option>)}
            </select>
          </div>
          <div><label className="lbl">Format</label>
            <div className="seg">
              <button className={!series ? "on" : ""} onClick={() => { setSeries(false); reset(); }}>Single game</button>
              <button className={series ? "on" : ""} onClick={() => { setSeries(true); reset(); }}>Best of 7</button>
            </div>
          </div>
          <button className="btn" onClick={run} disabled={busy || !home || home === away}>{busy ? <><span className="spin" /> Simulating</> : series ? "Simulate series" : "Run 10,000 sims"}</button>
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
              Expected margin {result.expectedMargin >= 0 ? "+" : ""}{result.expectedMargin.toFixed(1)} {h.tricode} · matchup-adjusted · {result.sims.toLocaleString()} sims · <span className="tag">Rust → WASM</span>
            </p>
            {[h, a].filter((tm) => tm.ctxDelta !== 0 || tm.upside > 1).map((tm) => (
              <p key={tm.tricode} className="muted" style={{ fontSize: "var(--text-xs)", margin: "3px 0" }}>
                <span className="tag" style={{ marginRight: 6 }}>{tm.tricode} {tm.ctxDelta > 0 ? "+" : ""}{tm.ctxDelta} rtg{tm.upside > 1 ? ` · upside ×${tm.upside}` : ""}</span>
                {tm.ctxNote}
              </p>
            ))}
          </div>
        )}

        {seriesRes && (
          <div>
            <div className="winbar">
              <div className="h tnum" style={{ width: `${sPct}%` }}>{seriesRes.hi.tricode} {sPct}%</div>
              <div className="a tnum" style={{ width: `${100 - sPct}%` }}>{100 - sPct}% {seriesRes.lo.tricode}</div>
            </div>
            <p className="muted" style={{ marginTop: "var(--space-3)" }}>
              <b>{seriesRes.hi.name}</b> win the series {sPct}% · home court {seriesRes.hi.tricode} · 20,000 series sims
            </p>
            <div className="series-len">
              {seriesRes.lengths.map((p, i) => (
                <div className="len" key={i}>
                  <span className="tnum len-pct">{(p * 100).toFixed(0)}%</span>
                  <span className="len-bar" style={{ height: `${Math.max(4, p * 110)}px` }} />
                  <span className="muted len-lab">{i + 4}g</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {md && h && a && <MatchupBreakdown h={h} a={a} md={md} series={series} />}

        {(result || seriesRes) && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <button className="btn ghost" onClick={getAI} disabled={aiBusy}>{aiBusy ? <><span className="spin" /> Thinking</> : "🤖 AI take"}</button>
            {ai && <div className="ai">{ai}</div>}
          </div>
        )}
      </div>

      <GameOdds home={home} away={away} />
    </>
  );
}

function MatchupBreakdown({ h, a, md, series }: { h: Team; a: Team; md: { total: number; edges: Edge[] }; series: boolean }) {
  const sign = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1);
  return (
    <div className="matchup">
      <div className="eyebrow">Matchup breakdown {series && <span className="tag">playoff weighting</span>}</div>
      <div className="mu-grid">
        <div className="mu-col">
          <div className="mu-team">{a.name}</div>
          {a.players.slice(0, 4).map((p) => (
            <div className="mu-p" key={p.name}><span className={"role " + (p.role === "S" ? "s" : "b")}>{p.role}</span><span className="mu-name">{p.name}</span><b className="tnum">{p.impact > 0 ? "+" : ""}{p.impact}</b></div>
          ))}
        </div>
        <div className="mu-mid">
          {md.edges.map((e) => (
            <div className="mu-edge" key={e.label}><span>{e.label}</span><span className={"tnum " + (e.value >= 0 ? "pos" : "neg")}>{sign(e.value)}</span></div>
          ))}
          <div className="mu-edge total"><span>Net edge</span><span className={"tnum " + (md.total >= 0 ? "pos" : "neg")}>{sign(md.total)} {h.tricode}</span></div>
        </div>
        <div className="mu-col rtl">
          <div className="mu-team">{h.name}</div>
          {h.players.slice(0, 4).map((p) => (
            <div className="mu-p" key={p.name}><b className="tnum">{p.impact > 0 ? "+" : ""}{p.impact}</b><span className="mu-name">{p.name}</span><span className={"role " + (p.role === "S" ? "s" : "b")}>{p.role}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Season ----------------------------- */
type SeasonMode = "full" | "fromSeeds" | "playBracket";
function Season({ model }: { model: Model }) {
  const [mode, setMode] = useState<SeasonMode>("full");
  const [seeds, setSeeds] = useState<{ east: Seeded[]; west: Seeded[] } | null>(null);
  const [focus, setFocus] = useState<string | null>(null); // team to spotlight in the futures market

  // Default projected seeds (shared by fromSeeds + playBracket), computed once via WASM.
  useEffect(() => {
    if (seeds) return;
    (async () => {
      const rows = await simSeason(model.ratings, model.variance, model.conf, model.homeIdx, model.awayIdx, 4000);
      const withTeam = rows.map((r) => ({ team: model.teams[r.idx], avgSeed: r.avgSeed }));
      const build = (c: "East" | "West") =>
        withTeam.filter((r) => r.team.conf === c).sort((a, b) => a.avgSeed - b.avgSeed)
          .map((r, i) => ({ tricode: r.team.tricode, name: r.team.name, seed: i + 1, avgSeed: r.avgSeed }));
      setSeeds({ east: build("East"), west: build("West") });
    })();
  }, [seeds, model]);

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
          {mode === "full" && <FullSeason model={model} onFocus={setFocus} />}
          {mode === "fromSeeds" && <FromSeeds model={model} seeds={seeds} onFocus={setFocus} />}
          {mode === "playBracket" && <PlayBracket model={model} seeds={seeds} onFocus={setFocus} />}
        </div>
      </div>
      <FuturesPanel highlight={focus} />
    </>
  );
}

function FullSeason({ model, onFocus }: { model: Model; onFocus: (t: string) => void }) {
  const [rows, setRows] = useState<any[] | null>(null); const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); await yield_();
    try {
      const r = await simPlayoffsFull(model.ratings, model.variance, model.conf, model.homeIdx, model.awayIdx, 10000);
      const mapped = r.map((x) => ({ ...x, tricode: model.teams[x.idx].tricode, name: model.teams[x.idx].name, conf: model.teams[x.idx].conf })).sort((a, b) => b.champPct - a.champPct);
      setRows(mapped); if (mapped[0]) onFocus(mapped[0].tricode);
    } finally { setBusy(false); }
  }
  return (
    <div>
      <p className="muted">10,000 full seasons simulated end to end — regular season decides seeding, then every playoff series is simulated to a champion.</p>
      <button className="btn" onClick={run} disabled={busy} style={{ marginTop: "var(--space-3)" }}>{busy ? <><span className="spin" /> Simulating 10k seasons</> : "Run full simulation"}</button>
      {rows && (<><div className="eyebrow" style={{ marginTop: "var(--space-6)" }}>Championship odds</div><ChampTable rows={rows} showWins /></>)}
    </div>
  );
}

function ChampTable({ rows, showWins }: { rows: any[]; showWins?: boolean }) {
  const max = Math.max(...rows.map((r) => r.champPct), 1);
  return (
    <table>
      <thead><tr><th>Team</th><th>Conf</th>{showWins && <th className="num">Proj W</th>}<th className="num">Finals%</th><th className="num">Title%</th></tr></thead>
      <tbody>
        {rows.filter((r) => r.champPct > 0 || r.finalsPct > 1).slice(0, 16).map((r) => (
          <tr key={r.idx}>
            <td><b>{r.name}</b></td><td className="muted">{r.conf}</td>
            {showWins && <td className="num tnum">{r.projWins}</td>}
            <td className="num tnum">{r.finalsPct}%</td>
            <td className="num bar-cell"><span className="fill" style={{ width: `${(r.champPct / max) * 100}%` }} /><span className="tnum">{r.champPct}%</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FromSeeds({ model, seeds, onFocus }: { model: Model; seeds: { east: Seeded[]; west: Seeded[] } | null; onFocus: (t: string) => void }) {
  const [east, setEast] = useState<string[]>([]); const [west, setWest] = useState<string[]>([]);
  const [rows, setRows] = useState<any[] | null>(null); const [busy, setBusy] = useState(false);
  const byConf = (c: "East" | "West") => model.teams.filter((t) => t.conf === c);

  useEffect(() => {
    if (seeds && east.length === 0) { setEast(seeds.east.slice(0, 8).map((s) => s.tricode)); setWest(seeds.west.slice(0, 8).map((s) => s.tricode)); }
  }, [seeds, east.length]);

  async function run() {
    setBusy(true); await yield_();
    try {
      const r = await simPlayoffsFromSeeds(east.map((t) => model.idx[t]), west.map((t) => model.idx[t]), model.ratings, model.variance, 10000);
      const mapped = r.map((x) => ({ ...x, tricode: model.teams[x.idx].tricode, name: model.teams[x.idx].name, conf: model.teams[x.idx].conf })).sort((a, b) => b.champPct - a.champPct);
      setRows(mapped); if (mapped[0]) onFocus(mapped[0].tricode);
    } finally { setBusy(false); }
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
      <button className="btn" onClick={run} disabled={busy || east.length !== 8 || west.length !== 8} style={{ marginTop: "var(--space-4)" }}>{busy ? <><span className="spin" /> Simulating brackets</> : "Run 10,000 brackets"}</button>
      {rows && (<><div className="eyebrow" style={{ marginTop: "var(--space-6)" }}>Championship odds from your seeds</div><ChampTable rows={rows} /></>)}
    </div>
  );
}

/* ----------------------------- Play the bracket yourself ----------------------------- */
type S = { t: string; seed: number };
function PlayBracket({ model, seeds, onFocus }: { model: Model; seeds: { east: Seeded[]; west: Seeded[] } | null; onFocus: (t: string) => void }) {
  const name = (t: string) => model.teams[model.idx[t]]?.name ?? t;
  if (!seeds) return <p className="muted"><span className="spin" /> Projecting seeds…</p>;
  const e: S[] = seeds.east.slice(0, 8).map((s) => ({ t: s.tricode, seed: s.seed }));
  const w: S[] = seeds.west.slice(0, 8).map((s) => ({ t: s.tricode, seed: s.seed }));
  return <PlayInner key={e.map((s) => s.t).join() + w.map((s) => s.t).join()} e={e} w={w} name={name} onFocus={onFocus} />;
}

function PlayInner({ e, w, name, onFocus }: { e: S[]; w: S[]; name: (t: string) => string; onFocus: (t: string) => void }) {
  const [eC, setEC] = useState<S | null>(null);
  const [wC, setWC] = useState<S | null>(null);
  const [champ, setChamp] = useState<S | null>(null);
  const crown = (c: S) => { setChamp(c); onFocus(c.t); };
  return (
    <div>
      <p className="muted">Seeding is the model's regular-season projection. You decide every series — click a team to advance it.</p>
      <div className="grid2" style={{ marginTop: "var(--space-4)" }}>
        <ConfBracket title="East" seeds={e} name={name} onChamp={(c) => { setEC(c); setChamp(null); }} />
        <ConfBracket title="West" seeds={w} name={name} onChamp={(c) => { setWC(c); setChamp(null); }} />
      </div>
      {eC && wC && (
        <div style={{ marginTop: "var(--space-5)" }}>
          <div className="eyebrow">NBA Finals</div>
          <div className="series">
            <button className={"side" + (champ?.t === eC.t ? " win" : "")} onClick={() => crown(eC)}><span className="sd">E</span>{name(eC.t)}</button>
            <span className="muted">vs</span>
            <button className={"side" + (champ?.t === wC.t ? " win" : "")} onClick={() => crown(wC)}>{name(wC.t)}<span className="sd">W</span></button>
          </div>
          {champ && <div className="champ-banner">🏆 Your champion<div className="big">{name(champ.t)}</div></div>}
        </div>
      )}
    </div>
  );
}

function ConfBracket({ title, seeds, name, onChamp }: { title: string; seeds: S[]; name: (t: string) => string; onChamp: (c: S) => void }) {
  const order = [0, 7, 3, 4, 2, 5, 1, 6].map((i) => seeds[i]); // 1,8,4,5,3,6,2,7
  const [chosen, setChosen] = useState<(S | undefined)[][]>([[], [], []]);
  const participants = (level: number, i: number): [S | undefined, S | undefined] =>
    level === 0 ? [order[2 * i], order[2 * i + 1]] : [chosen[level - 1][2 * i], chosen[level - 1][2 * i + 1]];
  function pick(level: number, i: number, who: S) {
    const next = chosen.map((r) => [...r]);
    next[level][i] = who;
    for (let l = level + 1; l < 3; l++) next[l] = [];
    setChosen(next);
    if (level === 2) onChamp(who);
  }
  const labels = ["First round", "Conf. semis", "Conf. final"], counts = [4, 2, 1];
  return (
    <div>
      <div className="eyebrow">{title}</div>
      {labels.map((lab, level) => (
        <div key={level} style={{ marginBottom: "var(--space-3)" }}>
          <div className="muted" style={{ fontSize: "var(--text-xs)", margin: "var(--space-2) 0" }}>{lab}</div>
          <div className="bracket">
            {Array.from({ length: counts[level] }).map((_, i) => {
              const [a, b] = participants(level, i); const won = chosen[level][i];
              return (
                <div className="series" key={i}>
                  <button className={"side" + (won && a && won.t === a.t ? " win" : "")} disabled={!a || !b} onClick={() => a && pick(level, i, a)}>
                    {a ? <><span className="sd">{a.seed}</span>{name(a.t)}</> : <span className="muted">—</span>}
                  </button>
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>vs</span>
                  <button className={"side" + (won && b && won.t === b.t ? " win" : "")} disabled={!a || !b} onClick={() => b && pick(level, i, b)}>
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

/* ----------------------------- Game odds (context-aware) ----------------------------- */
function GameOdds({ home, away }: { home: string; away: string }) {
  const [data, setData] = useState<any>(null); const [busy, setBusy] = useState(true);
  useEffect(() => {
    if (!home || !away) return;
    setBusy(true);
    fetch(`/api/odds?home=${home}&away=${away}`).then((r) => r.json()).then(setData).catch(() => setData({ available: false })).finally(() => setBusy(false));
  }, [home, away]);
  const matched = data?.scope === "matchup";
  return (
    <div className="panel">
      <div className="eyebrow">{matched ? `Betting market — ${away} @ ${home}` : "Betting market — next game day"}</div>
      {busy && <p className="muted"><span className="spin" /> Loading odds…</p>}
      {!busy && !data?.available && <p className="muted">Moneyline, spread & total across major US books (DraftKings, FanDuel, BetMGM…). Set <span className="tag">ODDS_API_KEY</span> to go live.</p>}
      {!busy && data?.available && data.games.length === 0 && <p className="muted">No NBA games on the board right now (offseason). This matchup’s lines will appear once the schedule opens.</p>}
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

/* ----------------------------- Futures (sportsbook + Kalshi + Polymarket) ----------------------------- */
function FuturesPanel({ highlight }: { highlight: string | null }) {
  const [markets, setMarkets] = useState<any[] | null>(null); const [busy, setBusy] = useState(true);
  useEffect(() => { fetch("/api/odds/futures").then((r) => r.json()).then((d) => setMarkets(d.markets)).catch(() => setMarkets([])).finally(() => setBusy(false)); }, []);
  return (
    <div className="panel">
      <div className="eyebrow">Futures market — sportsbooks · Kalshi · Polymarket</div>
      {busy && <p className="muted"><span className="spin" /> Loading futures…</p>}
      {!busy && markets?.map((m) => <FuturesMarket key={m.key} m={m} highlight={m.key === "championship" ? highlight : null} />)}
      {!busy && markets && markets.every((m) => m.rows.length === 0) && (
        <p className="muted">No live futures quotes posted yet (offseason). Champion, MVP and DPOY markets light up across sportsbooks, Kalshi and Polymarket once the season nears.</p>
      )}
    </div>
  );
}

function FuturesMarket({ m, highlight }: { m: any; highlight: string | null }) {
  if (!m.rows.length) return null;
  const rows = highlight ? [...m.rows].sort((a: any, b: any) => (b.tricode === highlight ? 1 : 0) - (a.tricode === highlight ? 1 : 0)) : m.rows;
  const max = Math.max(...m.rows.map((r: any) => r.consensus), 0.01);
  return (
    <div style={{ marginBottom: "var(--space-5)" }}>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "baseline", flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
        <b className="display" style={{ fontSize: "var(--text-lg)" }}>{m.title}</b>
        {m.sources.map((s: string) => <span key={s} className="tag">{s}</span>)}
      </div>
      <table>
        <thead><tr><th>{m.key === "championship" ? "Team" : "Player"}</th><th className="num">Implied</th><th>Sources</th></tr></thead>
        <tbody>
          {rows.slice(0, 10).map((r: any) => (
            <tr key={r.tricode ?? r.name} className={highlight && r.tricode === highlight ? "cut" : ""}>
              <td><b>{r.name}</b>{highlight && r.tricode === highlight ? <span className="tag" style={{ marginLeft: 6 }}>your pick</span> : null}</td>
              <td className="num bar-cell"><span className="fill" style={{ width: `${(r.consensus / max) * 100}%` }} /><span className="tnum">{(r.consensus * 100).toFixed(1)}%</span></td>
              <td className="muted tnum" style={{ fontSize: "var(--text-xs)" }}>{Object.entries(r.sources).map(([s, p]: any) => `${s} ${(p * 100).toFixed(0)}%`).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
