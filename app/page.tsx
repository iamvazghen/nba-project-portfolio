"use client";
import { useEffect, useState } from "react";

type Team = { tricode: string; name: string; conf: string; wins: number; losses: number; base: number; rating: number; ctxDelta: number; ctxNote: string; upside: number };

const MODES = [
  { tab: "Single Game", title: "Single Game", blurb: "Pick any matchup, run 10,000 sims for win probability, projected score, the roster context, an AI take, and that game's live odds.", art: ["LAL", "BOS"] },
  { tab: "Season", title: "Season", blurb: "Simulate the full season + playoffs, seed the bracket yourself, or play it out by hand — plus champion / MVP / DPOY futures.", art: ["W", "E"] },
  { tab: "Offseason", title: "Offseason", blurb: "No games on the board? Jump to the viral 82-0 roster game and try to build a team that goes undefeated.", art: ["82", "0"] },
];

export default function Landing() {
  const [teams, setTeams] = useState<Team[]>([]);
  useEffect(() => { fetch("/api/schedule").then((r) => r.json()).then((d) => setTeams(d.teams ?? [])).catch(() => {}); }, []);
  const power = [...teams].sort((a, b) => b.rating - a.rating).slice(0, 6);
  const maxR = power[0]?.rating || 1;
  const example = teams.find((t) => t.tricode === "WAS") ?? teams.find((t) => t.ctxDelta > 3);

  return (
    <>
      <header className="masthead">
        <div className="wrap bar">
          <div className="brand"><span className="dot" /> Hardwood</div>
          <nav className="nav-links">
            <a href="#model">The model</a>
            <a href="#modes">Modes</a>
            <a href="#odds">Odds</a>
            <a className="btn nav-btn" href="/dashboard">Open dashboard →</a>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="wrap lp-hero">
          <div className="lp-hero-copy">
            <div className="kicker">NBA Monte Carlo · Rust → WASM</div>
            <h1 className="lp-headline">Simulate the entire NBA. <em>Ten thousand</em> times.</h1>
            <p className="lede">
              A Rust-powered prediction engine that plays out every game, every series, and the whole season right
              in your browser — tuned to <b>this year&apos;s</b> rosters, not last year&apos;s box score.
            </p>
            <div className="lp-cta-row">
              <a className="btn btn-lg" href="/dashboard">Open the dashboard</a>
              <a className="btn btn-outline btn-lg" href="#model">How it works</a>
            </div>
            <div className="lp-trust">
              <span><b className="tnum">10,000</b> sims / run</span>
              <span><b>Rust</b> → WebAssembly</span>
              <span><b className="tnum">{teams.length || "30"}</b> teams modeled</span>
            </div>
          </div>

          <aside className="powerbox" aria-label="Live power index">
            <div className="powerbox-h"><span className="eyebrow">Live power index</span><span className="tag">net rtg</span></div>
            {power.length === 0 && <p className="muted"><span className="spin" /> loading model…</p>}
            {power.map((t, i) => (
              <div className="power-row" key={t.tricode}>
                <span className="pr-seed tnum">{i + 1}</span>
                <span className="pr-team">{t.name}</span>
                <span className="pr-bar"><span style={{ width: `${Math.max(6, (t.rating / maxR) * 100)}%` }} /></span>
                <span className="pr-val tnum">{t.rating > 0 ? "+" : ""}{t.rating.toFixed(1)}</span>
              </div>
            ))}
          </aside>
        </section>

        {/* MODES */}
        <section id="modes" className="wrap lp-section">
          <div className="lp-section-h"><span className="eyebrow">Three ways to play</span><h2>Everything lives in the dashboard</h2></div>
          <div className="mode-grid">
            {MODES.map((m) => (
              <a className="mode-card" key={m.tab} href={`/dashboard?tab=${encodeURIComponent(m.tab)}`}>
                <div className="mode-art">{m.art.map((x, i) => <span key={i}>{x}</span>)}</div>
                <h3>{m.title}</h3>
                <p>{m.blurb}</p>
                <span className="mode-go">Open {m.title} →</span>
              </a>
            ))}
          </div>
        </section>

        {/* MODEL */}
        <section id="model" className="wrap lp-section">
          <div className="lp-section-h"><span className="eyebrow">Not just last year&apos;s record</span><h2>A model that knows what changed</h2></div>
          <div className="model-grid">
            <ol className="process">
              <li><b>SRS base.</b> Strength-of-schedule-adjusted margin, so padding wins over weak teams doesn&apos;t fool it.</li>
              <li><b>Recency form.</b> Recent games count more (45-day half-life) — how a team is playing <i>now</i>.</li>
              <li><b>Roster context.</b> A live, news-grounded layer for this season&apos;s reality: trades, returning stars, rookies, tanking.</li>
              <li><b>Upside variance.</b> Young, high-ceiling rosters get wider outcomes — a real shot at a leap, and floor risk.</li>
              <li><b>Rust engine.</b> One WebAssembly Monte Carlo runs games, best-of-7 series, and full seasons client-side.</li>
            </ol>
            <div className="model-example">
              <div className="eyebrow">Worked example</div>
              {example ? (
                <>
                  <div className="me-team">{example.name}</div>
                  <div className="me-row"><span>Last season (SRS)</span><b className="tnum">{example.base > 0 ? "+" : ""}{example.base}</b></div>
                  <div className="me-row"><span>Roster context</span><b className="tnum" style={{ color: "var(--color-accent)" }}>{example.ctxDelta > 0 ? "+" : ""}{example.ctxDelta}</b></div>
                  <div className="me-row me-total"><span>This season</span><b className="tnum">{example.rating > 0 ? "+" : ""}{example.rating}</b></div>
                  <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-3)" }}>{example.ctxNote} · upside ×{example.upside}</p>
                </>
              ) : <p className="muted"><span className="spin" /> loading…</p>}
            </div>
          </div>
        </section>

        {/* ODDS */}
        <section id="odds" className="wrap lp-section">
          <div className="lp-section-h"><span className="eyebrow">Market, side by side</span><h2>Your sim vs the money</h2></div>
          <p className="lede" style={{ maxWidth: "60ch" }}>Single-game lines and season futures — champion, MVP, DPOY — aggregated across sportsbooks and prediction markets, with your simulated champion spotlighted.</p>
          <div className="sources">
            {["Sportsbooks", "Kalshi", "Polymarket"].map((s) => <span className="source-chip" key={s}>{s}</span>)}
          </div>
        </section>

        {/* CTA */}
        <section className="wrap">
          <div className="cta-band">
            <h2>Run your first simulation.</h2>
            <p className="muted">No signup. The engine runs in your browser.</p>
            <a className="btn btn-lg" href="/dashboard">Open the dashboard →</a>
          </div>
        </section>
      </main>

      <footer className="wrap site">
        <span>Data: NBA public schedule · engine: Rust → WASM net-rating Monte Carlo · context grounded in live news</span>
        <span>Portfolio build · not affiliated with the NBA</span>
      </footer>
    </>
  );
}
