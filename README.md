# NBA Project Portfolio — Hardwood Prediction Machine

Monte Carlo NBA predictions with a **single Rust→WASM engine**, a **smart layered rating model**, live NBA schedule, season simulation with seeding + bracketology, and a **multi-source odds aggregator** (sportsbooks + Kalshi + Polymarket). Offseason mode redirects to the viral [82-0](https://www.82-0.com/) game.

Live: https://nba-project-portfolio.vercel.app

## Commands

```bash
npm install        # dependencies
npm run dev        # http://localhost:3000
npm run deploy     # vercel --prod
npm run build:wasm # recompile the Rust engine (needs `cargo install wasm-pack`)
npm run gen:context# regenerate the roster-context layer via Gemini
```

## Modes

| Mode | What it does |
|------|--------------|
| **Single Game** | Any matchup (prefilled with the latest games), 10,000 sims → win%, projected score, the team context applied, an optional Gemini take, and that matchup's betting lines. |
| **Season** | Three sub-modes: **full season + playoffs** (10k), **playoffs from your own seeds** (10k), and **regular season then play the bracket yourself**. Plus the futures market (champion / MVP / DPOY). |
| **Offseason** | Button → the 82-0 game. |

## The engine (Rust → WASM, the only simulator)

`rust-sim/` compiles to `lib/wasm-sim/` and runs **in the browser**. It exposes `simulate_game`, `simulate_season`, `simulate_playoffs_full`, and `simulate_playoffs_from_seeds`. A game is `margin ~ Normal(homeRating − awayRating + 2.6, σ)`, where σ widens with each team's **variance multiplier**. Series are best-of-7 (2-2-1-1-1, higher seed hosts). There is no TypeScript or Python simulator — those exist nowhere in the sim path.

## The smart rating model (what's fed to the engine)

The engine is dumb on purpose; the intelligence is in the rating each team carries:

1. **SRS base** (`lib/nba.ts`) — Simple Rating System: average margin **adjusted for strength of schedule**, so a padded record vs weak teams doesn't inflate a team.
2. **Recency / form** — games are weighted by recency (45-day half-life), so how a team is *currently* playing counts more than October.
3. **Roster-context layer** (`data/team-context.json`, Gemini-drafted, **editable**) — `delta` shifts the rating for this season's reality (offseason moves, stars returning, top rookies, tanking); `upside` widens variance. Example: Washington is `−12.3` on last year's scoreboard but `+7 delta / 1.5 upside` for adding #1 pick AJ Dybantsa and getting its benched starters back → an effective `−5.3` and real boom/bust range, instead of an automatic blowout loss.
4. **Young-player upside** — the `upside` multiplier gives 1st/2nd-year-led rosters wider outcomes: a genuine (if unlikely) chance to play like contenders, plus floor risk.

Regenerate the context table any time with `npm run gen:context` (Gemini), or hand-edit `data/team-context.json` — every number is visible and overridable.

**Not yet modeled (next phase):** player/lineup-level matchups (bench-unit edges, coverages), rest/travel, and playoff-round-specific coaching/experience effects — these need a player-tracking data source.

## Odds (multi-source, context-aware)

- **Single Game** → that matchup's moneyline/spread/total (else the next game day) via the-odds-api.
- **Season** → futures: **Champion / MVP / DPOY** merged across **sportsbooks + Kalshi + Polymarket**, with your simulated/picked champion spotlighted. (Markets are thin in the offseason and fill in as the season nears.)

## Environment (optional — graceful fallback)

| Var | Enables |
|-----|---------|
| `ODDS_API_KEY` | sportsbook lines + champion futures ([the-odds-api.com](https://the-odds-api.com)) |
| `GEMINI_API_KEY` | the AI take + `gen:context` |

Keys are read only server-side and never shipped to the client.

## Stack

Next.js 16 · React 19 · TypeScript · Rust + wasm-pack · deployed on Vercel.
