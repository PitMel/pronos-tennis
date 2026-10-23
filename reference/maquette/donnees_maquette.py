"""Données fictives communes aux trois maquettes + utilitaires de rendu."""
from pathlib import Path

ROOT = Path(__file__).parent
FONTS = ROOT / "node_modules" / "@fontsource"

NB = " "      # espace insécable
NNB = " "     # espace fine insécable
MINUS = "−"


def font_face(family, folder, weights, style="normal"):
    out = []
    for w in weights:
        f = FONTS / folder / "files" / f"{folder}-latin-{w}-{style}.woff2"
        out.append(
            f"@font-face{{font-family:'{family}';font-weight:{w};font-style:{style};"
            f"src:url('file://{f}') format('woff2');}}"
        )
    return "\n".join(out)


# ---------------------------------------------------------------- données
PLAYERS = ["Pierre", "Léa", "Marc", "Thomas"]
INITIAL = {"Pierre": "P", "Léa": "L", "Marc": "M", "Thomas": "T"}

# barème de base : mise -> (si gagné, si perdu)
BAREME = {6: (6, 4), 7: (7, 2), 8: (8, -1), 9: (9, -6), 10: (10, -17)}
MULT = 1.5  # quarts de finale


def fmt(x, sign=False):
    """Format français : virgule décimale, vrai signe moins."""
    neg = x < 0
    a = abs(x)
    s = str(int(a)) if abs(a - round(a)) < 1e-9 else f"{a:.2f}".rstrip("0").rstrip(".").replace(".", ",")
    s = s.replace(".", ",")
    if neg:
        return MINUS + s
    return ("+" + s) if sign else s


def points(stake, won, mult=MULT):
    g, l = BAREME[stake]
    return (g if won else l) * mult


def bet_points(pick, stake, winner, mult=MULT):
    return points(stake, pick == winner, mult)


MATCHES = [
    dict(
        id="m1", time="12:00", state="finished",
        a=dict(name="Carlos Alcaraz", short="Alcaraz", rank=1),
        b=dict(name="Taylor Fritz", short="Fritz", rank=14),
        winner="b", score="7-6(4) 6-4",
        bets={"Pierre": ("a", 8), "Léa": ("a", 7), "Marc": ("a", 9), "Thomas": ("b", 6)},
    ),
    dict(
        id="m2", time="14:30", state="live",
        a=dict(name="Novak Djokovic", short="Djokovic", rank=4),
        b=dict(name="Daniil Medvedev", short="Medvedev", rank=5),
        winner=None, score=None,
        bets={"Pierre": ("a", 7), "Léa": ("b", 6), "Marc": ("a", 8), "Thomas": ("a", 9)},
    ),
    dict(
        id="m3", time="19:00", state="waiting",
        a=dict(name="Jannik Sinner", short="Sinner", rank=2),
        b=dict(name="Alexander Zverev", short="Zverev", rank=3),
        winner=None, score=None,
        bets={"Pierre": ("a", 9)},
        done=["Léa", "Marc"], pending=["Thomas"],
    ),
    dict(
        id="m4", time="20:30", state="open",
        a=dict(name="Lorenzo Musetti", short="Musetti", rank=8),
        b=dict(name="Alex de Minaur", short="de Minaur", rank=9),
        winner=None, score=None,
        bets={},
        done=["Léa"], pending=["Marc", "Thomas"],
    ),
]

# classement du tournoi avant bonus (après le match terminé)
STANDINGS = [
    dict(name="Léa", pts=47, prev_rank=2, delta=3),
    dict(name="Pierre", pts=43.5, prev_rank=1, delta=-1.5),
    dict(name="Thomas", pts=42, prev_rank=4, delta=9),
    dict(name="Marc", pts=30, prev_rank=3, delta=-9),
]

# pari tournoi : vainqueur, finaliste (True = encore en lice)
TOURNEY_BETS = {
    "Pierre": [("Sinner", True), ("Alcaraz", False)],
    "Léa": [("Alcaraz", False), ("Sinner", True)],
    "Marc": [("Djokovic", True), ("Alcaraz", False)],
    "Thomas": [("Sinner", True), ("Zverev", True)],
}

SEASON = [("Léa", 212), ("Pierre", 204.5), ("Thomas", 188), ("Marc", 171)]


def scenarios(m):
    """Points de chacun si a gagne / si b gagne (match en cours, paris révélés)."""
    out = {}
    for who in ("a", "b"):
        out[who] = {p: bet_points(pk, st, who) for p, (pk, st) in m["bets"].items()}
    return out


# ---------------------------------------------------------------- rendu
def render(html_path, png_path, width, scale=2):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        b = p.chromium.launch(args=["--allow-file-access-from-files"])
        pg = b.new_page(viewport={"width": width, "height": 900}, device_scale_factor=scale)
        pg.goto(f"file://{html_path}")
        pg.wait_for_timeout(600)
        pg.evaluate("document.fonts.ready")
        h = pg.evaluate("document.documentElement.scrollHeight")
        pg.set_viewport_size({"width": width, "height": h})
        pg.screenshot(path=str(png_path), full_page=True)
        b.close()
    return h


if __name__ == "__main__":
    for m in MATCHES:
        print(m["id"], m["state"], {p: fmt(bet_points(pk, st, m["winner"], MULT), True) for p, (pk, st) in m["bets"].items()} if m["winner"] else "")
    print(scenarios(MATCHES[1]))
    print([ (s["name"], s["pts"]) for s in STANDINGS], fmt(25.5), fmt(-1.5, True), fmt(10.5, True))
