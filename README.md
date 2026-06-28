# NBA Project Portfolio — Hardwood Prediction Machine

Monte Carlo NBA predictions with a **single Rust→WASM engine**, a **smart layered rating model**, live NBA schedule, season simulation with seeding + bracketology, and a **multi-source odds aggregator** (sportsbooks + Kalshi + Polymarket). Offseason mode redirects to the viral [82-0](https://www.82-0.com/) game.

Live: https://nba-project-portfolio.vercel.app

## Commands

```bash
npm install        # dependencies
npm run dev        # http://localhost:3000
npm run deploy     # vercel --prod
npm run build:wasm # recompile the Rust engine (needs `cargo install wasm-pack`)
npm run gen:data   # refresh the NBA schedule snapshot
npm run gen:context# regenerate the team roster-context via Gemini (news-grounded)
npm run gen:rosters# regenerate per-player rotations via Gemini (news-grounded)
```

## Modes

| Mode | What it does |
|------|--------------|
| **Single Game** | Any matchup (prefilled with the latest games), 10,000 sims → win%, projected score, the team context applied, an optional Gemini take, and that matchup's betting lines. |
| **Season** | Three sub-modes: **full season + playoffs** (10k), **playoffs from your own seeds** (10k), and **regular season then play the bracket yourself**. Plus the futures market (champion / MVP / DPOY). |
| **Offseason** | Button → the 82-0 game. |

## The engine (Rust → WASM, the only simulator)

`rust-sim/` compiles to `lib/wasm-sim/` and runs **in the browser**. It exposes `simulate_game`, `simulate_season`, `simulate_playoffs_full`, and `simulate_playoffs_from_seeds`. A game is `margin ~ Normal(homeRating − awayRating + 2.6, σ)`, where σ widens with each team's **variance multiplier**. Series are best-of-7 (2-2-1-1-1, higher seed hosts). There is no TypeScript or Python simulator — those exist nowhere in the sim path.

## The rating model — objective by design

The power rating uses **no hand-tuned guesses for the mean**. Each team's rating is a blend of two market-grade signals:

```
rating = 0.35 × last-season SRS   +   0.65 × betting-market title odds
```

1. **SRS base** (`lib/nba.ts`) — Simple Rating System: average margin **adjusted for strength of schedule** and recency (45-day half-life). Real results, objective.
2. **Market anchor** (`data/market-snapshot.json`, from Polymarket — keyless) — the live 2026-27 championship odds, log-transformed and mapped to a net-rating scale. The market is the **objective consensus**: it already prices injuries (Haliburton/Tatum returning), trades, cap space and the aprons, so the ranking matches reality (e.g. Spurs near the top, a post-injury Celtics mid-pack) without anyone tuning a number.

The **variance** each team carries is a separate, news-grounded layer:

3. **Future variability** (`data/team-context.json`, Gemini-grounded, editable) — `upside` is an in-season variance multiplier from **youth + cap/apron flexibility**: a young, cap-flexible team (e.g. SAS, ×1.6) can swing up via a leap or a deadline upgrade; a team frozen at the **second apron** (e.g. OKC, ×1.0) is locked in. Each team also carries a scouting `note` and `apron` status (injury/return, biggest contract, buyer/seller outlook).
4. **Matchup layer** (`data/team-rosters.json` + `lib/players.ts` + `lib/matchup.ts`) — news-grounded rotations give **star power / bench depth / experience**; for a specific game these become a pairwise adjustment (reweighted for the playoffs) used in Single Game and the best-of-7 **series** simulator.

Regenerate any layer: `npm run gen:market` · `gen:context` · `gen:rosters`. Everything is editable JSON.

**Not yet modeled:** lineup-level coverages/on-off and rest/travel (need a player-tracking feed); sportsbook **season win totals** will sharpen the middle of the board once books post them (the market anchor is title-odds-only in the offseason).

## Automation

`.github/workflows/refresh.yml` re-grounds the market snapshot, rosters, and cap/injury context from live sources daily and pushes the updated JSON. To enable: add a repo secret `GEMINI_API_KEY`, and connect the repo to the Vercel project (Vercel → Settings → Git) so each push auto-deploys. Run it on demand from the Actions tab.

## Odds (multi-source, context-aware)

- **Single Game** → that matchup's moneyline/spread/total (else the next game day) via the-odds-api.
- **Season** → futures across **sportsbooks + Kalshi + Polymarket**: **Champion · Eastern/Western Conference winner · MVP · DPOY · Rookie of the Year**, with your simulated/picked champion spotlighted. Each market is **liquidity-gated** (event volume ≥ 5k and no untraded placeholder outcomes), so only real prices show; the rest read "tracked · live in-season" and populate automatically once they trade. No keys needed for Kalshi/Polymarket.

## Environment (optional — graceful fallback)

| Var | Enables |
|-----|---------|
| `ODDS_API_KEY` | sportsbook lines + champion futures ([the-odds-api.com](https://the-odds-api.com)) |
| `GEMINI_API_KEY` | the AI take + `gen:context` |

Keys are read only server-side and never shipped to the client.

## Stack

Next.js 16 · React 19 · TypeScript · Rust + wasm-pack · deployed on Vercel.
