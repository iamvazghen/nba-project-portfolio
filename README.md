# NBA Project Portfolio — Prediction Machine

Monte Carlo NBA predictions with **three interchangeable engines** (TypeScript, Python, Rust→WASM), live schedule data from the NBA, full-season simulation with seeding + bracketology, a sportsbook odds aggregator, and an offseason redirect to the viral [82-0](https://www.82-0.com/) game.

## Modes

| Mode | What it does |
|------|--------------|
| **Single Game** | Pick any matchup (prefilled with the latest games), run 10,000 Monte Carlo sims. Choose the **TS / Python / Rust-WASM** engine. Optional 🤖 AI take. |
| **Season** | 10,000 full-season simulations from current power ratings → projected wins, playoff %, top-6 %, conference seeding and a first-round bracket. |
| **Bets** | Moneyline / spread / total aggregated across major US books (via the-odds-api). |
| **Offseason** | Button → the 82-0 "can your all-time roster go undefeated?" game. |

## The model

Team **net rating** (avg point differential, regressed with a 5-game prior) is computed from completed games in the NBA's public schedule feed. A single game is `margin ~ Normal(homeNet − awayNet + 2.6, 12)`; win% and a projected score come from 10k samples. The **identical model** is implemented in `lib/sim.ts`, `api/py-predict.py`, and `rust-sim/src/lib.rs`.

Data: `https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json` (no API key).

## Run locally

```bash
npm install
npm run dev            # http://localhost:3000
python api/py-predict.py   # runs the model self-check
```

### Build the Rust engine (optional)

The site works without it (falls back to TS). To enable the real Rust→WASM engine:

```bash
cargo install wasm-pack   # one-time
npm run build:wasm        # outputs lib/wasm-sim/
```

## Environment (all optional — graceful fallback)

| Var | Enables |
|-----|---------|
| `ANTHROPIC_API_KEY` | AI single-game take (server-side only) |
| `ODDS_API_KEY` | Live odds in Bets mode ([the-odds-api.com](https://the-odds-api.com)) |

## Deploy

Vercel-native (Next.js). Push to a Git repo and import in Vercel, or `vercel --prod`. The Python function (`api/py-predict.py`) deploys as a serverless function automatically.

## Caveats / next steps

- Ratings reflect whatever season the NBA CDN currently serves; in the offseason that's the completed season.
- `npm run build:wasm` must be run (and `lib/wasm-sim` committed or built in CI) for the Rust engine to be live; otherwise the "Rust/WASM" button transparently uses TS.
