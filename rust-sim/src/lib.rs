// NBA single-game Monte Carlo, compiled to WASM. Same model as lib/sim.ts and
// api/py-predict.py. Own xorshift+Box-Muller RNG so the only deps are bindgen.
use wasm_bindgen::prelude::*;

const HCA: f64 = 2.6;
const LEAGUE_AVG: f64 = 114.0;
const SIGMA: f64 = 12.0;

struct Rng(u64);
impl Rng {
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

/// Returns [homeWinPct, expectedMargin, homeScore, awayScore] as a Float64Array.
#[wasm_bindgen]
pub fn simulate_game(home_rating: f64, away_rating: f64, sims: u32) -> Vec<f64> {
    let expected = home_rating - away_rating + HCA;
    let seed = (js_sys::Math::random() * u64::MAX as f64) as u64 | 1;
    let mut rng = Rng(seed);
    let mut home_wins = 0u32;
    let mut margin_sum = 0.0;
    for _ in 0..sims.max(1) {
        let m = expected + SIGMA * rng.gauss();
        if m > 0.0 {
            home_wins += 1;
        }
        margin_sum += m;
    }
    let n = sims.max(1) as f64;
    let mean = margin_sum / n;
    vec![
        home_wins as f64 / n,
        expected,
        LEAGUE_AVG + mean / 2.0,
        LEAGUE_AVG - mean / 2.0,
    ]
}
