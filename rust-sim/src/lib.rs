// The ONLY simulation engine. Compiled to WASM, run client-side. Covers single
// game, season seeding, full season+playoffs, and playoffs-from-seeds.
// Teams are referenced by index; the JS side owns the index<->tricode map and
// builds the rating + per-team variance inputs from the smart rating pipeline.
use wasm_bindgen::prelude::*;

const HCA: f64 = 2.6; // home-court advantage, points
const LEAGUE_AVG: f64 = 114.0; // for projecting a plausible final score
const SIGMA: f64 = 12.0; // base stdev of a single game's margin vs expectation

struct Rng(u64);
impl Rng {
    fn new() -> Rng {
        Rng(((js_sys::Math::random() * u64::MAX as f64) as u64) | 1)
    }
    fn unit(&mut self) -> f64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        (x >> 11) as f64 / (1u64 << 53) as f64
    }
    fn gauss(&mut self) -> f64 {
        let mut u = self.unit();
        while u <= 0.0 {
            u = self.unit();
        }
        let v = self.unit();
        (-2.0 * u.ln()).sqrt() * (2.0 * std::f64::consts::PI * v).cos()
    }
}

// Per-game margin. `vh`/`va` are the teams' variance multipliers (1.0 = normal;
// >1 widens outcomes — young/high-upside rosters are more boom-or-bust).
#[inline]
fn margin(rng: &mut Rng, home: f64, away: f64, vh: f64, va: f64) -> f64 {
    let sig = SIGMA * ((vh * vh + va * va) / 2.0).sqrt();
    home - away + HCA + sig * rng.gauss()
}

/// Single game. Returns [homeWinPct, expectedMargin, homeScore, awayScore].
#[wasm_bindgen]
pub fn simulate_game(home_rating: f64, away_rating: f64, sims: u32, home_var: f64, away_var: f64) -> Vec<f64> {
    let mut rng = Rng::new();
    let expected = home_rating - away_rating + HCA;
    let (mut hw, mut msum) = (0u32, 0.0);
    let n = sims.max(1);
    for _ in 0..n {
        let m = margin(&mut rng, home_rating, away_rating, home_var, away_var);
        if m > 0.0 {
            hw += 1;
        }
        msum += m;
    }
    let nf = n as f64;
    let mean = msum / nf;
    vec![hw as f64 / nf, expected, LEAGUE_AVG + mean / 2.0, LEAGUE_AVG - mean / 2.0]
}

// Best-of-7, 2-2-1-1-1, higher seed has home court. True if higher seed wins.
fn series_hi_wins(rng: &mut Rng, hi: f64, lo: f64, vhi: f64, vlo: f64) -> bool {
    const HOME: [bool; 7] = [true, true, false, false, true, false, true];
    let (mut h, mut l) = (0u8, 0u8);
    let mut g = 0;
    while h < 4 && l < 4 && g < 7 {
        let hi_won = if HOME[g] {
            margin(rng, hi, lo, vhi, vlo) > 0.0
        } else {
            margin(rng, lo, hi, vlo, vhi) < 0.0
        };
        if hi_won { h += 1; } else { l += 1; }
        g += 1;
    }
    h == 4
}

// One conference: 8 team indices in seed order. Returns champion index.
fn conf_champion(rng: &mut Rng, seeds: &[usize], ratings: &[f64], var: &[f64]) -> usize {
    let order = [0usize, 7, 3, 4, 2, 5, 1, 6];
    let mut round: Vec<(usize, usize)> = order.iter().map(|&p| (seeds[p], p)).collect();
    while round.len() > 1 {
        let mut next = Vec::with_capacity(round.len() / 2);
        let mut i = 0;
        while i < round.len() {
            let (a, b) = (round[i], round[i + 1]);
            let (hi, lo) = if a.1 < b.1 { (a, b) } else { (b, a) };
            next.push(if series_hi_wins(rng, ratings[hi.0], ratings[lo.0], var[hi.0], var[lo.0]) { hi } else { lo });
            i += 2;
        }
        round = next;
    }
    round[0].0
}

fn play_regular_season(rng: &mut Rng, ratings: &[f64], var: &[f64], home: &[u32], away: &[u32], wins: &mut [i32]) {
    for w in wins.iter_mut() { *w = 0; }
    for k in 0..home.len() {
        let (h, a) = (home[k] as usize, away[k] as usize);
        if margin(rng, ratings[h], ratings[a], var[h], var[a]) > 0.0 { wins[h] += 1; } else { wins[a] += 1; }
    }
}

fn seed_conf(rng: &mut Rng, n: usize, conf: &[u32], wins: &[i32], c: u32) -> Vec<usize> {
    let mut idx: Vec<usize> = (0..n).filter(|&i| conf[i] == c).collect();
    let key: Vec<f64> = (0..n).map(|i| wins[i] as f64 + rng.unit() * 0.01).collect();
    idx.sort_by(|&a, &b| key[b].partial_cmp(&key[a]).unwrap());
    idx
}

/// Full-season seeding sim. Returns per team [projWins, playoffPct, top6Pct, avgSeed] (n*4 flat).
#[wasm_bindgen]
pub fn simulate_season(ratings: Vec<f64>, var: Vec<f64>, conf: Vec<u32>, home: Vec<u32>, away: Vec<u32>, sims: u32) -> Vec<f64> {
    let n = ratings.len();
    let (mut win_sum, mut seed_sum, mut playoff, mut top6) = (vec![0f64; n], vec![0f64; n], vec![0f64; n], vec![0f64; n]);
    let mut wins = vec![0i32; n];
    let mut rng = Rng::new();
    let s = sims.max(1);
    for _ in 0..s {
        play_regular_season(&mut rng, &ratings, &var, &home, &away, &mut wins);
        for c in 0..2u32 {
            let ranked = seed_conf(&mut rng, n, &conf, &wins, c);
            for (rank, &i) in ranked.iter().enumerate() {
                let seed = rank + 1;
                win_sum[i] += wins[i] as f64;
                seed_sum[i] += seed as f64;
                if seed <= 10 { playoff[i] += 1.0; }
                if seed <= 6 { top6[i] += 1.0; }
            }
        }
    }
    let sf = s as f64;
    let mut out = Vec::with_capacity(n * 4);
    for i in 0..n {
        out.push(win_sum[i] / sf);
        out.push(playoff[i] / sf * 100.0);
        out.push(top6[i] / sf * 100.0);
        out.push(seed_sum[i] / sf);
    }
    out
}

/// Full season + playoffs. Returns per team [projWins, finalsPct, champPct] (n*3 flat).
#[wasm_bindgen]
pub fn simulate_playoffs_full(ratings: Vec<f64>, var: Vec<f64>, conf: Vec<u32>, home: Vec<u32>, away: Vec<u32>, sims: u32) -> Vec<f64> {
    let n = ratings.len();
    let (mut win_sum, mut finals, mut champ) = (vec![0f64; n], vec![0f64; n], vec![0f64; n]);
    let mut wins = vec![0i32; n];
    let mut rng = Rng::new();
    let s = sims.max(1);
    for _ in 0..s {
        play_regular_season(&mut rng, &ratings, &var, &home, &away, &mut wins);
        for i in 0..n { win_sum[i] += wins[i] as f64; }
        let east: Vec<usize> = seed_conf(&mut rng, n, &conf, &wins, 0).into_iter().take(8).collect();
        let west: Vec<usize> = seed_conf(&mut rng, n, &conf, &wins, 1).into_iter().take(8).collect();
        let (ec, wc) = (conf_champion(&mut rng, &east, &ratings, &var), conf_champion(&mut rng, &west, &ratings, &var));
        finals[ec] += 1.0;
        finals[wc] += 1.0;
        let (hi, lo) = if ratings[ec] >= ratings[wc] { (ec, wc) } else { (wc, ec) };
        champ[if series_hi_wins(&mut rng, ratings[hi], ratings[lo], var[hi], var[lo]) { hi } else { lo }] += 1.0;
    }
    let sf = s as f64;
    let mut out = Vec::with_capacity(n * 3);
    for i in 0..n {
        out.push(win_sum[i] / sf);
        out.push(finals[i] / sf * 100.0);
        out.push(champ[i] / sf * 100.0);
    }
    out
}

/// Playoffs from fixed seeds. `east`/`west` are 8 team indices in seed order.
/// Returns for each of the 16 seeds (east then west) [champPct, finalsPct] (16*2 flat).
#[wasm_bindgen]
pub fn simulate_playoffs_from_seeds(east: Vec<u32>, west: Vec<u32>, ratings: Vec<f64>, var: Vec<f64>, sims: u32) -> Vec<f64> {
    let e: Vec<usize> = east.iter().map(|&x| x as usize).collect();
    let w: Vec<usize> = west.iter().map(|&x| x as usize).collect();
    let n = ratings.len();
    let (mut finals, mut champ) = (vec![0f64; n], vec![0f64; n]);
    let mut rng = Rng::new();
    let s = sims.max(1);
    for _ in 0..s {
        let (ec, wc) = (conf_champion(&mut rng, &e, &ratings, &var), conf_champion(&mut rng, &w, &ratings, &var));
        finals[ec] += 1.0;
        finals[wc] += 1.0;
        let (hi, lo) = if ratings[ec] >= ratings[wc] { (ec, wc) } else { (wc, ec) };
        champ[if series_hi_wins(&mut rng, ratings[hi], ratings[lo], var[hi], var[lo]) { hi } else { lo }] += 1.0;
    }
    let sf = s as f64;
    let mut out = Vec::with_capacity(16 * 2);
    for &i in e.iter().chain(w.iter()) {
        out.push(champ[i] / sf * 100.0);
        out.push(finals[i] / sf * 100.0);
    }
    out
}
