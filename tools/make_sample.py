"""Generates data.js with SAMPLE data. Delete/replace once real data exists."""
import json, random

random.seed(7)
WEEKS = ["2026-11-19", "2026-12-03", "2026-12-10", "2026-12-17", "2027-01-07", "2027-01-14", "2027-01-21"]
PLAYED_WEEKS = 3  # sample: first 3 weeks have results

FIRST = ["Alex", "Brian", "Chris", "Daniel", "Eric", "Frank", "George", "Henry", "Ian", "Jason",
         "Kevin", "Leo", "Mike", "Nick", "Oscar", "Paul", "Quinn", "Ryan", "Sam", "Tom",
         "Victor", "Will", "Yuri", "Zack", "Andy", "Ben", "Cody", "Dave", "Ed", "Finn",
         "Gary", "Hank", "Jin", "Kai", "Luke", "Max"]
LAST = ["Kim", "Lee", "Park", "Nguyen", "Garcia", "Smith", "Lopez", "Chen", "Patel", "Brown",
        "Davis", "Wilson", "Torres", "Reyes", "Cruz", "Diaz", "Lin", "Wang", "Choi", "Jones"]


def make_players(n, lo, hi):
    names = set()
    while len(names) < n:
        names.add(f"{random.choice(FIRST)} {random.choice(LAST)}")
    names = list(names)
    return [{"name": nm, "rating": random.randint(lo, hi)} for nm in names]


def build_division(code, cap, ra, rb):
    teams = []
    pool_a = make_players(8, *ra)
    pool_b = make_players(8, *rb)
    for i in range(8):
        a, b = pool_a[i], pool_b[i]
        if a["rating"] < b["rating"]:
            a, b = b, a
        if a["rating"] + b["rating"] >= cap:  # keep under cap
            a["rating"] -= (a["rating"] + b["rating"] - cap) + 20
        teams.append({"id": f"{code}-{i+1}", "A": a, "B": b})
    for t in teams:
        t["name"] = f'{t["A"]["name"].split()[1]} / {t["B"]["name"].split()[1]}'

    # circle method round robin, 8 teams -> 7 rounds
    ids = list(range(8))
    rounds = []
    for r in range(7):
        pairs = [(ids[i], ids[7 - i]) for i in range(4)]
        rounds.append(pairs)
        ids = [ids[0]] + [ids[-1]] + ids[1:-1]

    matches = []
    for w, pairs in enumerate(rounds):
        for k, (x, y) in enumerate(pairs):
            if (w + k) % 2:
                x, y = y, x
            m = {"id": f"{code}-W{w+1}-{k+1}", "week": w + 1, "date": WEEKS[w],
                 "time": ["6:00 PM", "6:00 PM", "7:30 PM", "7:30 PM"][k],
                 "table": k + 1 if code == "U3600" else k + 5,
                 "red": teams[x]["id"], "blue": teams[y]["id"], "games": None}
            if w < PLAYED_WEEKS:
                m["games"] = play(teams[x], teams[y])
            matches.append(m)
    return {"cap": cap, "teams": teams, "matches": matches}


def game_score(p_red):
    """returns best-of-5 game scores (red, blue) until someone has 3 wins is NOT used;
    here one table-tennis game = best of 5 to 11 -> we record sets list."""
    sets, rw, bw = [], 0, 0
    while rw < 3 and bw < 3:
        if random.random() < p_red:
            rw += 1
            sets.append([11, random.randint(2, 9)] if random.random() < 0.8 else [random.randint(12, 14), 0])
        else:
            bw += 1
            sets.append([random.randint(2, 9), 11] if random.random() < 0.8 else [0, random.randint(12, 14)])
        if sets[-1][0] > 11:
            sets[-1] = [sets[-1][0], sets[-1][0] - 2]
        elif sets[-1][1] > 11:
            sets[-1] = [sets[-1][1] - 2, sets[-1][1]]
    return {"sets": sets}


def play(red, blue):
    def p(a, b):
        d = (a - b) / 400
        return min(0.85, max(0.15, 0.5 + d))
    ra, rb = red["A"]["rating"], red["B"]["rating"]
    ba, bb = blue["A"]["rating"], blue["B"]["rating"]
    defs = [
        ("Red A vs Blue B", p(ra, bb)),
        ("Blue A vs Red B", 1 - p(ba, rb)),
        ("Doubles", p(ra + rb, ba + bb) if False else p((ra + rb) / 2, (ba + bb) / 2)),
        ("Red A vs Blue A", p(ra, ba)),
        ("Red B vs Blue B", p(rb, bb)),
    ]
    out = []
    for label, pr in defs:
        g = game_score(pr)
        g["label"] = label
        out.append(g)
    return out


data = {
    "club": "San Antonio Table Tennis Club",
    "short": "SATTC",
    "season": "Season 1",
    "sample": True,
    "dates": {"weeks": WEEKS, "holidays": ["2026-11-26", "2026-12-24", "2026-12-31"],
              "makeupDeadline": "2027-01-25", "finals": "2027-01-28"},
    "divisions": {
        "U3600": build_division("U3600", 3600, (1500, 1900), (1100, 1700)),
        "U2800": build_division("U2800", 2800, (1200, 1500), (800, 1300)),
    },
}

with open("data.js", "w") as f:
    f.write("// SAMPLE DATA - replace with real league data\nwindow.LEAGUE = ")
    json.dump(data, f, indent=1)
    f.write(";\n")
print("ok")
