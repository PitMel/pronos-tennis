"""Maquette 1 : « Filet » — mobile. Chaque match est un terrain vu de dessus :
le filet = 50/50, la distance au filet = la confiance (6 près du filet, 10 sur la ligne de fond)."""
from common import *

NET, W, H = 165, 380, 330
LEFT_ALLEY, SING_L, SING_R, RIGHT_ALLEY = 20, 62, 318, 360


def zone_y(side, stake):
    off = 15 + 30 * (stake - 6)
    return NET - off if side == "a" else NET + off


def xs_for(n):
    return {1: [190], 2: [126, 254], 3: [100, 190, 280], 4: [84, 163, 217, 296]}[n]


def dot(x, y, letter, me=False, ghost=False, done=False, wait=False):
    if ghost:
        return (
            f'<g transform="translate({x},{y})"><circle r="14" fill="#D8E64C" fill-opacity=".95" stroke="#17324B" stroke-width="1.5" stroke-dasharray="4 3"/>'
            f'<text y="5" text-anchor="middle" font-size="13" font-weight="800" fill="#10303A">{letter}</text></g>'
        )
    if done or wait:
        badge = (
            '<circle cx="11" cy="-11" r="7" fill="#F4F7F2"/><path d="M7.5 -11 l2.5 2.6 l4.2 -5" fill="none" stroke="#1B7F44" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
            if done else
            '<circle cx="11" cy="-11" r="7" fill="#F4F7F2"/><circle cx="11" cy="-11" r="3.6" fill="none" stroke="#7A8A84" stroke-width="1.6"/><path d="M11 -13 v2.4 l1.6 1" fill="none" stroke="#7A8A84" stroke-width="1.4" stroke-linecap="round"/>'
        )
        return (
            f'<g transform="translate({x},{y})"><circle r="14" fill="{"#16345F" if wait else "#1E437A"}" stroke="#F4F7F2" stroke-opacity="{.35 if wait else .7}" stroke-width="2" stroke-dasharray="4 3"/>'
            f'<text y="5" text-anchor="middle" font-size="13" font-weight="800" fill="#F4F7F2" fill-opacity="{.55 if wait else 1}">{letter}</text>{badge}</g>'
        )
    ring = '<circle r="19" fill="none" stroke="#F4F7F2" stroke-width="2.5"/>' if me else ""
    return (
        f'<g transform="translate({x},{y})">{ring}<circle r="14" fill="#D8E64C" stroke="#17324B" stroke-width="1.5"/>'
        '<path d="M-11 -6 Q-8 0 -11 6" fill="none" stroke="#fff" stroke-width="1.6" stroke-opacity=".9"/>'
        '<path d="M11 -6 Q8 0 11 6" fill="none" stroke="#fff" stroke-width="1.6" stroke-opacity=".9"/>'
        f'<text y="5" text-anchor="middle" font-size="13" font-weight="800" fill="#10303A">{letter}</text></g>'
    )


def court(m):
    s = m["state"]
    parts = []
    parts.append(f'<rect x="{LEFT_ALLEY}" y="15" width="{RIGHT_ALLEY-LEFT_ALLEY}" height="300" rx="3" fill="#2F6CC2"/>')
    parts.append(f'<rect x="{LEFT_ALLEY}" y="15" width="{SING_L-LEFT_ALLEY}" height="300" fill="#000" fill-opacity=".07"/>')
    parts.append(f'<rect x="{SING_R}" y="15" width="{RIGHT_ALLEY-SING_R}" height="300" fill="#000" fill-opacity=".07"/>')
    # teintes selon le résultat
    if s == "finished":
        win, lose = m["winner"], ("a" if m["winner"] == "b" else "b")
        ytop = lambda side: 15 if side == "a" else NET
        parts.append(f'<rect x="{LEFT_ALLEY}" y="{ytop(win)}" width="{RIGHT_ALLEY-LEFT_ALLEY}" height="150" fill="#fff" fill-opacity=".13"/>')
        parts.append(f'<rect x="{LEFT_ALLEY}" y="{ytop(lose)}" width="{RIGHT_ALLEY-LEFT_ALLEY}" height="150" fill="#0B2347" fill-opacity=".38"/>')
    if s == "open":
        parts.append(f'<rect x="{SING_L}" y="15" width="{SING_R-SING_L}" height="150" fill="#D8E64C" fill-opacity=".10" stroke="#D8E64C" stroke-width="2" stroke-dasharray="7 5"/>')
        parts.append(f'<rect x="{SING_L}" y="{zone_y("a",8)-15}" width="{SING_R-SING_L}" height="30" fill="#fff" fill-opacity=".17"/>')
    # lignes
    ln = 'stroke="#F4F7F2" stroke-width="2.2" fill="none" stroke-linecap="square"'
    parts.append(f'<rect x="{LEFT_ALLEY}" y="15" width="{RIGHT_ALLEY-LEFT_ALLEY}" height="300" {ln}/>')
    parts.append(f'<line x1="{SING_L}" y1="15" x2="{SING_L}" y2="315" {ln}/><line x1="{SING_R}" y1="15" x2="{SING_R}" y2="315" {ln}/>')
    for y in (NET - 84, NET + 84):
        parts.append(f'<line x1="{SING_L}" y1="{y}" x2="{SING_R}" y2="{y}" {ln}/>')
    parts.append(f'<line x1="190" y1="{NET-84}" x2="190" y2="{NET+84}" {ln}/>')
    parts.append(f'<line x1="190" y1="15" x2="190" y2="23" {ln}/><line x1="190" y1="307" x2="190" y2="315" {ln}/>')
    # séparations de zones + échelle de confiance dans les couloirs
    for side in "ab":
        for i in range(5):
            if i:
                y = NET - 30 * i if side == "a" else NET + 30 * i
                parts.append(f'<line x1="{SING_L}" y1="{y}" x2="{SING_R}" y2="{y}" stroke="#fff" stroke-opacity=".16" stroke-dasharray="3 5"/>')
            parts.append(f'<text x="41" y="{zone_y(side,6+i)+4}" text-anchor="middle" font-size="11" font-weight="600" fill="#fff" fill-opacity=".62">{6+i}</text>')
    # filet
    parts.append(f'<line x1="4" y1="{NET}" x2="376" y2="{NET}" stroke="#0B2347" stroke-opacity=".55" stroke-width="7"/>')
    parts.append(f'<line x1="4" y1="{NET}" x2="376" y2="{NET}" stroke="#F4F7F2" stroke-width="3" stroke-dasharray="2 3"/>')
    parts.append(f'<circle cx="4" cy="{NET}" r="4.5" fill="#F4F7F2"/><circle cx="376" cy="{NET}" r="4.5" fill="#F4F7F2"/>')

    # annotations de barème sur la moitié choisie (match à parier)
    if s == "open":
        for i in range(5):
            st = 6 + i
            g, l = BAREME[st]
            gy = zone_y("a", st) + 4
            gtxt, ltxt = fmt(g * MULT, True), fmt(l * MULT, True)
            lcol = "#FFB8A8" if l < 0 else "#F4F7F2"
            parts.append(
                f'<text x="312" y="{gy}" text-anchor="end" font-size="12.5" font-weight="700" fill="#F4F7F2">{gtxt}'
                f'<tspan fill="#fff" fill-opacity=".5" font-weight="500"> / </tspan><tspan fill="{lcol}">{ltxt}</tspan></text>'
            )

    # balles
    if s in ("finished", "live"):
        for side in "ab":
            who = [p for p, (pk, st) in m["bets"].items() if pk == side]
            xs = xs_for(len(who)) if who else []
            for p, x in zip(who, xs):
                st = m["bets"][p][1]
                parts.append(dot(x, zone_y(side, st), INITIAL[p], me=(p == "Pierre")))
    elif s == "waiting":
        pk, st = m["bets"]["Pierre"]
        parts.append(dot(190, zone_y(pk, st), "P", me=True))
        parts.append(dot(112, NET, "L", done=True))
        parts.append(dot(190, NET, "M", done=True))
        parts.append(dot(268, NET, "T", wait=True))
    elif s == "open":
        parts.append(dot(190, zone_y("a", 8), "P", ghost=True))
        parts.append(dot(96, NET, "L", done=True))
        parts.append(dot(146, NET, "M", wait=True))
        parts.append(dot(196, NET, "T", wait=True))
        # poignée
        parts.append(f'<g transform="translate(190,{zone_y("a",8)})"><circle r="23" fill="none" stroke="#D8E64C" stroke-width="2" stroke-opacity=".85"/></g>')
    return f'<svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="Terrain du match">{"".join(parts)}</svg>'


CSS = """
*{box-sizing:border-box;margin:0;padding:0}
:root{--green:#1F4D43;--green2:#2A5F53;--court:#2F6CC2;--line:#F4F7F2;--ball:#D8E64C;--ink:#0F2A26;--mute:#5E726C;--gain:#1B7F44;--loss:#D13B28}
body{width:430px;background:var(--green);color:#EAF2EC;font-family:'Bricolage Grotesque',sans-serif;font-size:15px;line-height:1.35;padding:0 14px 0}
.top{display:flex;justify-content:space-between;align-items:center;padding:18px 2px 8px}
.brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:26px;letter-spacing:-.02em;color:#fff}
.me{display:flex;align-items:center;gap:8px;font-size:13px;color:#BFD2C9}
.av{width:32px;height:32px;border-radius:50%;background:var(--ball);color:#10303A;font-weight:800;display:grid;place-items:center;border:2px solid #fff}
h1{font-size:40px;line-height:1.02;font-weight:800;letter-spacing:-.03em;color:#fff;margin-top:14px}
.sub{color:#BFD2C9;font-size:14px;margin-top:6px}
.steps{display:flex;list-style:none;margin:20px 0 6px;position:relative}
.steps:before{content:"";position:absolute;left:8%;right:8%;top:13px;height:2px;background:#F4F7F2;opacity:.28}
.steps li{flex:1;text-align:center;position:relative;font-size:12.5px;color:#BFD2C9}
.steps b{display:block;color:#fff;font-weight:700;font-size:13.5px;margin-top:6px}
.steps i{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;margin:0 auto;font-style:normal;background:var(--green);border:2px solid rgba(244,247,242,.35)}
.steps .done i{background:#F4F7F2;border-color:#F4F7F2}
.steps .now i{background:var(--ball);border-color:var(--ball);width:34px;height:34px;margin-top:-3px;box-shadow:0 0 0 5px rgba(216,230,76,.22)}
.steps .now b{color:var(--ball)}
.panel{background:var(--line);color:var(--ink);border-radius:20px;padding:16px}
.panel h2{font-size:19px;font-weight:700;letter-spacing:-.01em}
.panel .hd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
.hd small{color:var(--mute);font-size:12.5px}
.rank{display:grid;grid-template-columns:26px 1fr 58px 62px;gap:10px;align-items:center;padding:7px 0}
.rank .n{font-weight:800;font-size:20px;text-align:center}
.rank .nm{font-weight:600;font-size:15px}
.rank .bar{height:8px;border-radius:5px;background:#D5DED6;margin-top:5px;overflow:hidden}
.rank .bar i{display:block;height:100%;background:var(--court);border-radius:5px}
.rank .pt{font-weight:800;font-size:19px;font-variant-numeric:tabular-nums;text-align:right}
.rank .dl{font-size:13px;font-weight:700;text-align:right;display:flex;align-items:center;justify-content:flex-end;gap:3px}
.pos{color:var(--gain)}.neg{color:var(--loss)}
.note{font-size:12.5px;color:var(--mute);margin-top:8px}
.bar6{margin-top:16px;background:#1A453C;border-radius:20px;padding:15px 14px}
.bar6 h3{font-size:16px;font-weight:700;color:#fff}
.bar6 p{font-size:12.5px;color:#BFD2C9;margin:2px 0 10px}
.grid5{display:grid;grid-template-columns:62px repeat(5,1fr);gap:4px;align-items:center;text-align:center}
.grid5 .rl{text-align:left;font-size:12.5px;color:#BFD2C9}
.grid5 .c{background:var(--ball);color:#10303A;border-radius:50%;width:28px;height:28px;display:grid;place-items:center;font-weight:800;margin:0 auto}
.grid5 .v{font-weight:700;font-size:13.5px;font-variant-numeric:tabular-nums;padding:4px 0}
.grid5 .g{color:#8EF0B3}.grid5 .l{color:#FFB8A8}.grid5 .l.ok{color:#F4F7F2}
.sec{display:flex;justify-content:space-between;align-items:baseline;margin:30px 2px 12px}
.sec h2{font-size:26px;font-weight:800;letter-spacing:-.02em;color:#fff}
.sec span{font-size:13px;color:#BFD2C9}
.card{background:var(--green2);border-radius:26px;padding:14px 12px 12px;margin-bottom:16px;border:1px solid rgba(244,247,242,.10)}
.ch{display:flex;justify-content:space-between;align-items:center;padding:0 4px 8px}
.ch time{font-weight:700;font-size:15px;color:#fff}
.chip{font-size:12.5px;font-weight:700;padding:4px 10px;border-radius:99px;display:inline-flex;align-items:center;gap:6px}
.chip.fin{background:#F4F7F2;color:var(--ink)}
.chip.live{background:#FFE3DC;color:#B3261E}
.chip.live:before{content:"";width:8px;height:8px;border-radius:50%;background:#E5483A;box-shadow:0 0 0 3px rgba(229,72,58,.25)}
.chip.wait{background:#2F6CC2;color:#fff}
.chip.open{background:var(--ball);color:#10303A}
.pl{display:flex;justify-content:space-between;align-items:baseline;padding:2px 6px 6px}
.pl.bot{padding:6px 6px 2px}
.pl b{font-size:25px;font-weight:800;letter-spacing:-.02em;color:#fff}
.pl span{font-size:13px;color:#BFD2C9}
.pl .win{background:var(--ball);color:#10303A;font-weight:700;border-radius:99px;padding:2px 9px;font-size:12.5px;margin-left:8px}
.pl.lose b{color:#9FB7AE;font-weight:700}
.under{background:var(--line);color:var(--ink);border-radius:18px;padding:13px 13px 14px;margin-top:10px}
.under .t{font-weight:700;font-size:16.5px;letter-spacing:-.01em}
.under .t small{font-weight:500;color:var(--mute);font-size:13.5px}
.four{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
.four div{text-align:center;padding:6px 2px 7px;border-radius:12px;background:#E5ECE5}
.four .isme{background:#fff;box-shadow:inset 0 0 0 2px var(--ink)}
.four u{display:block;text-decoration:none;font-size:12.5px;font-weight:700}
.four s{display:block;text-decoration:none;font-size:12px;color:var(--mute);margin:1px 0 3px}
.four strong{display:block;font-size:19px;font-weight:800;font-variant-numeric:tabular-nums}
.scn{width:100%;border-collapse:collapse;margin-top:10px;font-size:13.5px}
.scn th{font-weight:700;font-size:12.5px;color:var(--mute);padding:3px 0;text-align:center}
.scn td{padding:7px 0;text-align:center;font-weight:800;font-size:16px;border-top:1px solid #D5DED6;font-variant-numeric:tabular-nums}
.scn td:first-child{text-align:left;font-weight:600;font-size:13.5px;color:var(--ink)}
.mine{display:flex;gap:8px;margin-top:9px;flex-wrap:wrap}
.pill{border-radius:99px;padding:5px 11px;font-weight:800;font-size:14px;background:#E5ECE5}
.pill.pos{background:#D7F0DF}.pill.neg{background:#FBE0DA}
.btn{display:block;width:100%;text-align:center;font-family:inherit;font-weight:800;font-size:16.5px;border-radius:14px;padding:12px;margin-top:12px}
.btn.main{background:var(--ball);color:#10303A;border:0}
.btn.alt{background:transparent;color:var(--ink);border:2px solid var(--ink)}
.small{font-size:12.5px;color:var(--mute);margin-top:9px;line-height:1.4}
.fold{display:flex;justify-content:space-between;align-items:center;background:#1A453C;border-radius:18px;padding:15px 16px;margin-bottom:16px;font-weight:600}
.fold small{color:#BFD2C9;font-weight:500;font-size:13px}
.fold b{color:#8EF0B3;font-size:16px}
.trow{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:center;padding:9px 0;border-top:1px solid #D5DED6}
.trow:first-of-type{border-top:0}
.trow .av{width:30px;height:30px;font-size:13px;border:0;background:#CFE0D6;color:var(--ink)}
.trow .av.me{background:var(--ball);border:2px solid var(--ink)}
.picks{display:flex;gap:7px;flex-wrap:wrap}
.pk{font-size:13.5px;font-weight:700;border-radius:99px;padding:3px 10px;background:#D7F0DF;color:#14562F;white-space:nowrap}
.pk i{font-style:normal;font-weight:500;opacity:.75}
.pk.out{background:#ECEFEA;color:#8B9A94;text-decoration:line-through;text-decoration-thickness:1.5px}
.tab{display:grid;grid-template-columns:repeat(4,1fr);background:#F4F7F2;margin:20px -14px 0;padding:10px 6px 16px;border-radius:24px 24px 0 0;color:var(--mute);font-size:12px;font-weight:600;text-align:center}
.tab div{display:flex;flex-direction:column;align-items:center;gap:3px}
.tab .on{color:var(--ink)}
.tab .on svg{fill:var(--ball);stroke:var(--ink)}
.foot{font-size:11.5px;color:#9FB7AE;text-align:center;padding:12px 0 4px}
"""


def pts_html(v, sign=True):
    cls = "pos" if v >= 0 else "neg"
    return f'<span class="{cls}">{fmt(v, sign)}</span>'


def ball_svg(size=30):
    return (
        f'<svg width="{size}" height="{size}" viewBox="-16 -16 32 32"><circle r="14" fill="#D8E64C" stroke="#fff" stroke-width="2"/>'
        '<path d="M-10 -6 Q-2 0 -10 6" fill="none" stroke="#fff" stroke-width="2"/><path d="M10 -6 Q2 0 10 6" fill="none" stroke="#fff" stroke-width="2"/></svg>'
    )


def card(m):
    a, b, s = m["a"], m["b"], m["state"]
    chip = {
        "finished": '<span class="chip fin"><svg width="13" height="13" viewBox="0 0 14 14"><path d="M2.5 7.5l3 3 6-7" fill="none" stroke="#1B7F44" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Terminé</span>',
        "live": '<span class="chip live">En cours</span>',
        "waiting": '<span class="chip wait">Pari posé, en attente de Thomas</span>',
        "open": '<span class="chip open">À toi de parier</span>',
    }[s]
    wa = wb = ""
    cls_a = cls_b = ""
    if s == "finished":
        if m["winner"] == "a":
            wa = '<span class="win">vainqueur</span>'; cls_b = "lose"
        else:
            wb = '<span class="win">vainqueur</span>'; cls_a = "lose"
    html = f'<article class="card"><div class="ch"><time>{m["time"]}</time>{chip}</div>'
    html += f'<div class="pl {cls_a}"><div><b>{a["short"]}</b>{wa}</div><span>n°{NB}{a["rank"]}</span></div>'
    html += court(m)
    html += f'<div class="pl bot {cls_b}"><div><b>{b["short"]}</b>{wb}</div><span>n°{NB}{b["rank"]}</span></div>'
    # bas de carte
    if s == "finished":
        w = m[m["winner"]]["short"]; l = m["a" if m["winner"] == "b" else "b"]["short"]
        html += f'<div class="under"><div class="t">{w} bat {l} <small>{m["score"]}</small></div><div class="four">'
        for p in PLAYERS:
            pk, st = m["bets"][p]
            v = bet_points(pk, st, m["winner"])
            me = "isme" if p == "Pierre" else ""
            html += f'<div class="{me}"><u>{p}</u><s>{m[pk]["short"]}{NB}{st}</s><strong>{pts_html(v)}</strong></div>'
        html += '</div></div>'
    elif s == "live":
        sc = scenarios(m)
        html += '<div class="under"><div class="t">Paris ouverts <small>le score reste masqué jusqu\'à la fin</small></div>'
        html += '<table class="scn"><tr><th></th>' + "".join(f"<th>{INITIAL[p]}</th>" for p in PLAYERS) + "</tr>"
        for side in ("a", "b"):
            html += f'<tr><td>Si {m[side]["short"]} gagne</td>' + "".join(f"<td>{pts_html(sc[side][p])}</td>" for p in PLAYERS) + "</tr>"
        html += '</table><p class="small">Chaque pastille de couleur sur le terrain est un pari. Plus elle est loin du filet, plus la confiance est haute.</p></div>'
    elif s == "waiting":
        pk, st = m["bets"]["Pierre"]
        g, l = BAREME[st]
        html += f'<div class="under"><div class="t">Ton pari : {m[pk]["short"]}, confiance {st}</div><div class="mine"><span class="pill pos">gagné {fmt(g*MULT, True)}</span><span class="pill {"neg" if l<0 else "pos"}">perdu {fmt(l*MULT, True)}</span></div>'
        html += '<div class="btn alt">Modifier mon pari</div>'
        html += '<p class="small">Léa et Marc ont parié, Thomas pas encore. Les paris des autres s\'ouvrent quand tout le monde a parié. Tu peux modifier le tien jusqu\'à 19:00 ou jusqu\'à ce que Thomas ait parié.</p></div>'
    else:
        html += f'<div class="under"><div class="t">Musetti, confiance 8 <small>glisse la balle pour changer</small></div><div class="mine"><span class="pill pos">gagné +12</span><span class="pill neg">perdu {MINUS}1,5</span></div>'
        html += '<div class="btn main">Valider mon pari</div>'
        html += '<p class="small">Léa a parié, Marc et Thomas pas encore. Les paris des autres s\'ouvrent quand tout le monde a parié. Modifiable jusqu\'à 20:30 ou jusqu\'à ce que tout le monde ait parié.</p></div>'
    return html + "</article>"


def build():
    ff = font_face("Bricolage Grotesque", "bricolage-grotesque", [400, 500, 600, 700, 800])
    o = []
    o.append(f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=430"><title>Filet</title><style>{ff}{CSS}</style></head><body>')
    o.append(f'<header class="top"><div class="brand">{ball_svg(30)}Filet</div><div class="me">saison de test<span class="av">P</span></div></header>')
    o.append('<h1>Rolex Paris Masters</h1><p class="sub">Masters 1000 à Paris-Bercy, dur couvert</p>')
    check = '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2.5 7.5l3 3 6-7" fill="none" stroke="#1F4D43" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    o.append(
        '<ol class="steps">'
        f'<li class="done"><i>{check}</i><b>8es</b>×1</li>'
        f'<li class="now"><i>{ball_svg(22)}</i><b>Quarts</b>×1,5</li>'
        '<li><i></i><b>Demies</b>×2</li><li><i></i><b>Finale</b>×2</li></ol>'
    )
    # classement
    o.append('<section class="panel" style="margin-top:20px"><div class="hd"><h2>Classement du tournoi</h2><small>avant bonus</small></div>')
    for i, s in enumerate(STANDINGS, 1):
        prev = {p["name"]: p["prev_rank"] for p in STANDINGS}[s["name"]]
        arrow = ""
        if prev > i:
            arrow = '<svg width="11" height="11" viewBox="0 0 10 10"><path d="M5 1 L9.5 9 H0.5Z" fill="#1B7F44"/></svg>'
        elif prev < i:
            arrow = '<svg width="11" height="11" viewBox="0 0 10 10"><path d="M5 9 L9.5 1 H0.5Z" fill="#D13B28"/></svg>'
        me = " (toi)" if s["name"] == "Pierre" else ""
        o.append(
            f'<div class="rank"><div class="n">{i}</div><div><div class="nm">{s["name"]}{me}</div><div class="bar"><i style="width:{s["pts"]/50*100:.0f}%"></i></div></div>'
            f'<div class="pt">{fmt(s["pts"])}</div><div class="dl">{arrow}{pts_html(s["delta"])}</div></div>'
        )
    o.append(f'<p class="note">Bonus de fin de tournoi : 1er +12, 2e +5. Le chiffre coloré est le gain du dernier match.</p></section>')
    # barème
    o.append('<section class="bar6"><h3>Barème des quarts de finale</h3><p>Points du match multipliés par 1,5. Plus tu es confiant, plus la chute est lourde.</p><div class="grid5"><div class="rl">Confiance</div>' + "".join(f'<div class="c">{n}</div>' for n in range(6, 11)) + '<div class="rl">Gagné</div>')
    o.append("".join(f'<div class="v g">{fmt(BAREME[n][0]*MULT, True)}</div>' for n in range(6, 11)) + '<div class="rl">Perdu</div>')
    o.append("".join(f'<div class="v l {"" if BAREME[n][1]<0 else "ok"}">{fmt(BAREME[n][1]*MULT, True)}</div>' for n in range(6, 11)) + '</div></section>')
    o.append('<div class="sec"><h2>Quarts de finale</h2><span>vendredi, 4 matchs</span></div>')
    for m in MATCHES:
        o.append(card(m))
    o.append('<div class="fold"><div>8es de finale<br><small>8 matchs joués, multiplicateur ×1</small></div><b>Pierre +45</b></div>')
    # pari tournoi
    o.append('<div class="sec"><h2>Pari tournoi</h2><span>verrouillé depuis les 8es</span></div><section class="panel">')
    for p in PLAYERS:
        v, f = TOURNEY_BETS[p]
        me = " me" if p == "Pierre" else ""
        def chip(label, kind, alive):
            return f'<span class="pk{"" if alive else " out"}"><i>{kind}</i> {label}</span>'
        o.append(f'<div class="trow"><div class="av{me}">{INITIAL[p]}</div><div class="picks">{chip(v[0],"vainqueur",v[1])}{chip(f[0],"finaliste",f[1])}</div></div>')
    o.append('<p class="note">Bonus à la fin du tournoi : +4 pour chaque joueur choisi qui atteint la finale, +4 de plus pour le vainqueur trouvé. Les paris barrés sont éliminés.</p></section>')
    o.append('<div class="foot">Maquette, données fictives</div>')
    def icon(path): return f'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">{path}</svg>'
    o.append('<nav class="tab">'
             f'<div class="on">{icon("<circle cx=12 cy=12 r=8.5 />"+"<path d=\"M4.5 9c4 1 11 1 15 0M4.5 15c4-1 11-1 15 0\"/>")}Paris</div>'
             f'<div>{icon("<path d=\"M5 20V11M12 20V4M19 20v-6\"/>")}Classement</div>'
             f'<div>{icon("<path d=\"M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 20h8\"/>")}Tournois</div>'
             f'<div>{icon("<path d=\"M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11\"/>")}Règles</div></nav>')
    o.append('</body></html>')
    return "".join(o)


if __name__ == "__main__":
    out = ROOT / "m1.html"
    out.write_text(build(), encoding="utf-8")
    h = render(str(out), str(ROOT / "m1.png"), 430)
    print("hauteur", h)
