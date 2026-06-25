"""Python Monte Carlo serverless function (Vercel). Same model as lib/sim.ts.
POST {"homeRating": float, "awayRating": float, "sims": int, "neutral": bool}
-> {"homeWinPct", "expectedMargin", "homeScore", "awayScore", "sims", "engine"}.
"""
import json
import random
import math
from http.server import BaseHTTPRequestHandler

HOME_COURT_ADV = 2.6
LEAGUE_AVG_PTS = 114
SIGMA = 12


def simulate(home_rating, away_rating, sims=10000, neutral=False):
    expected = home_rating - away_rating + (0 if neutral else HOME_COURT_ADV)
    home_wins = 0
    margin_sum = 0.0
    for _ in range(sims):
        m = random.gauss(expected, SIGMA)
        if m > 0:
            home_wins += 1
        margin_sum += m
    mean_margin = margin_sum / sims
    return {
        "homeWinPct": home_wins / sims,
        "expectedMargin": expected,
        "homeScore": round(LEAGUE_AVG_PTS + mean_margin / 2),
        "awayScore": round(LEAGUE_AVG_PTS - mean_margin / 2),
        "sims": sims,
        "engine": "python",
    }


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        body = json.loads(self.rfile.read(length) or "{}")
        sims = min(int(body.get("sims", 10000)), 50000)
        result = simulate(
            float(body.get("homeRating", 0)),
            float(body.get("awayRating", 0)),
            sims,
            bool(body.get("neutral", False)),
        )
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())


# ponytail: self-check — run `python api/py-predict.py`.
if __name__ == "__main__":
    a = simulate(10, 0, 20000)   # strong home team
    b = simulate(0, 10, 20000)   # strong away team
    assert a["homeWinPct"] > 0.7, a
    assert b["homeWinPct"] < 0.3, b
    assert a["homeScore"] > a["awayScore"]
    print("ok", a, b)
