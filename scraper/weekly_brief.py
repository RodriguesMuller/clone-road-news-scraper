"""Resumo semanal para o gestor de frota: espelho em Python de api/_weekly_brief.js.

Usado pelo e-mail de segunda-feira (scraper/weekly_news.py). Mantenha igual ao JS: os dois
são validados pelo mesmo par tests/fixtures/weekly_items.json -> weekly_brief_expected.json.
Regex com re.ASCII para o \\b se comportar como no JavaScript.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from scraper.utils.risk import classify_risk, normalize
from scraper.utils.timezone import BRASILIA_TZ

DAY_MS = 24 * 60 * 60 * 1000
A = re.ASCII

UF_CODES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]
STATE_NAMES = [
    ("mato grosso do sul", "MS"), ("rio grande do norte", "RN"), ("rio grande do sul", "RS"), ("distrito federal", "DF"),
    ("espirito santo", "ES"), ("rio de janeiro", "RJ"), ("santa catarina", "SC"), ("minas gerais", "MG"), ("mato grosso", "MT"),
    ("pernambuco", "PE"), ("tocantins", "TO"), ("sao paulo", "SP"), ("maranhao", "MA"), ("rondonia", "RO"), ("amazonas", "AM"),
    ("alagoas", "AL"), ("paraiba", "PB"), ("roraima", "RR"), ("sergipe", "SE"), ("parana", "PR"), ("bahia", "BA"),
    ("ceara", "CE"), ("goias", "GO"), ("piaui", "PI"), ("amapa", "AP"), ("acre", "AC"),
]
NAMED_ROADS = [
    ("regis bittencourt", "Régis Bittencourt"), ("raposo tavares", "Raposo Tavares"), ("castello branco", "Castello Branco"),
    ("castelo branco", "Castello Branco"), ("fernao dias", "Fernão Dias"), ("washington luis", "Washington Luís"),
    ("carvalho pinto", "Carvalho Pinto"), ("ayrton senna", "Ayrton Senna"), ("anhanguera", "Anhanguera"),
    ("bandeirantes", "Bandeirantes"), ("imigrantes", "Imigrantes"), ("anchieta", "Anchieta"), ("tamoios", "Tamoios"),
    ("rio-santos", "Rio-Santos"), ("rodoanel", "Rodoanel"), ("dutra", "Via Dutra"), ("ponte rio-niteroi", "Ponte Rio-Niterói"),
]
STOPWORDS = {"para", "apos", "entre", "durante", "sobre", "deixa", "deixam", "nesta", "neste", "esta", "este", "rodovia", "pela", "pelo", "como", "mais", "fica", "ficam", "veja", "video", "foto", "fotos", "trecho", "regiao", "cidade"}

KIND = {
    "block_total": ("Bloqueio total", "Trecho indisponível: use desvio ou aguarde a liberação confirmada."),
    "strike_block": ("Manifestação com bloqueio", "Trecho indisponível: use desvio e confirme a liberação antes de passar."),
    "block_planned": ("Bloqueio programado", "Planeje o desvio ou ajuste o horário de saída para fora da janela informada."),
    "strike": ("Paralisação/manifestação", "Confirme a situação antes de despachar e tenha rota alternativa definida."),
    "cargo_theft": ("Roubo de carga", "Evite paradas no trecho, reforce rastreamento/escolta e prefira trafegar de dia."),
    "cargo_theft_police": ("Ação policial contra roubo de carga", "Trecho visado: mantenha protocolo de segurança reforçado."),
    "structural": ("Dano na pista", "Confirme condição da via e restrição de peso antes de programar a passagem."),
    "hazmat": ("Acidente com produto perigoso", "Interdição longa é provável: tenha rota alternativa definida."),
    "heavy_vehicle": ("Veículo pesado tombado/incendiado", "Interdições de faixa recorrentes: inclua margem de tempo na janela de entrega."),
    "fatal_accident": ("Acidente com vítima fatal", "A perícia interdita por horas: confirme a liberação antes de passar."),
    "accident_partial": ("Acidente com interdição parcial", "Fila e atraso prováveis: inclua margem de tempo."),
    "accident_jam": ("Acidente com congestionamento", "Fila extensa: ajuste o horário de saída."),
    "accident": ("Acidente", "Possível lentidão pontual."),
    "block_partial": ("Bloqueio parcial", "Fila e atraso prováveis: inclua margem de tempo."),
    "block_partial_planned": ("Interdição parcial programada", "Inclua margem de tempo na janela informada."),
    "jam": ("Congestionamento extenso", "Ajuste o horário de saída."),
    "weather": ("Clima severo", "Avalie adiar saídas nos horários de chuva forte."),
    "visibility": ("Neblina/baixa visibilidade", "Evite trafegar de madrugada e no início da manhã."),
    "fire": ("Incêndio próximo à via", "Possível fumaça e lentidão."),
    "small_fire": ("Princípio de incêndio", "Sem impacto prolongado esperado."),
    "traffic": ("Lentidão/obra", "Inclua margem de tempo."),
    "intl": ("Corredor internacional", "Acompanhe preço do diesel e do frete."),
    "inmet_red": ("Aviso INMET Grande Perigo", "Adie saídas na área do aviso."),
    "inmet_orange": ("Aviso INMET Perigo", "Avalie adiar saídas nos horários de tempestade."),
    "inmet_yellow": ("Aviso INMET Perigo Potencial", "Atenção a chuva e vento."),
    "inmet": ("Aviso INMET", "Atenção ao clima."),
}
WEIGHT = {4: 8, 3: 4, 2: 1, 1: 0}
NUMBER_LABELS = [
    ("block_total", "Bloqueios totais"),
    ("block_planned", "Bloqueios programados"),
    ("heavy", "Acidentes com veículo pesado"),
    ("fatal", "Acidentes com vítima fatal"),
    ("cargo", "Roubos de carga"),
    ("strike", "Paralisações/manifestações"),
    ("inmet", "Avisos INMET de Perigo"),
]
QUOTA = {"Bloqueio programado": 4, "Paralisação/manifestação": 2, "Pode seguir bloqueado": 3, "Aviso INMET": 2}

ROAD_RE = re.compile(r"\b((?:BR|ERS|RSC|MGC|AMG|PRC|SPA|SPI|AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO))[-\s]?(\d{2,4})\b", re.I | A)
CITY_UF_RE = re.compile(r"\b[A-ZÀ-Ý][\wÀ-ÿ.'-]+/([A-Z]{2})\b", A)
PARA_RE = re.compile(r"(?:^|[^\w])Pará(?!\w)")
ABBR_RE = re.compile(r"(?:,|\(|\s-\s|\bem |\bno |\bna |\bdo |\bda )\s?([A-Z]{2})\b", A)
OUTLET_RE = re.compile(r"\s[-–—|]\s[^-–—|]{2,60}$")


def _clean(value) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(value or ""))).strip()


def _is_inmet(item: dict) -> bool:
    return item.get("type") == "INMET" or "inmet" in str(item.get("source") or "").lower()


def _parse_time(value):
    if not value:
        return None
    text = str(value).strip()
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            dt = parsedate_to_datetime(text)
        except (TypeError, ValueError):
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(round(dt.timestamp() * 1000))


def _item_time(item: dict):
    for key in ("created_at", "published_at", "scraped_at"):
        t = _parse_time(item.get(key))
        if t is not None:
            return t
    return None


def _local(t: int) -> datetime:
    return datetime.fromtimestamp(t / 1000, BRASILIA_TZ)


def _day_month(t) -> str:
    return "" if t is None else _local(t).strftime("%d/%m")


def _ymd(t: int) -> tuple:
    d = _local(t)
    return (d.year, d.month, d.day)


def _scheduled_date(title: str, published_at):
    if published_at is None:
        return None
    norm = normalize(title)
    explicit = re.search(r"\b(\d{1,2})/(\d{1,2})\b", norm, A)
    if explicit:
        day = int(explicit.group(1))
    else:
        m = re.search(r"\((\d{1,2})\)", norm) or re.search(r"\bdia (\d{1,2})\b", norm, A)
        day = int(m.group(1)) if m else 0
    if not day or day > 31:
        return None
    year, month, pub_day = _ymd(published_at)
    if explicit:
        mm = int(explicit.group(2))
        if mm < 1 or mm > 12:
            return None
        if mm < month:
            year += 1
        month = mm
    elif day < pub_day - 3:
        month += 1
        if month > 12:
            month, year = 1, year + 1
    return (year, month, day)


def _road_of(raw: str, norm: str) -> str:
    code = ROAD_RE.search(raw)
    if code:
        return f"{code.group(1).upper()}-{code.group(2)}"
    return next((label for key, label in NAMED_ROADS if key in norm), "")


def _uf_of(raw: str, norm: str, road: str) -> str:
    city = CITY_UF_RE.search(raw)
    if city and city.group(1) in UF_CODES:
        return city.group(1)
    if PARA_RE.search(raw):
        return "PA"
    for name, uf in STATE_NAMES:
        if re.search(rf"\b{name}\b", norm, A):
            return uf
    for abbr in ABBR_RE.finditer(raw):
        if abbr.group(1) in UF_CODES:
            return abbr.group(1)
    prefix = re.match(r"^([A-Z]{2})-", road)
    if prefix and prefix.group(1) != "BR" and prefix.group(1) in UF_CODES:
        return prefix.group(1)
    return ""


def _tokens(norm: str) -> set:
    return {w for w in re.split(r"[^a-z0-9]+", norm) if len(w) >= 4 and w not in STOPWORDS}


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0
    inter = len(a & b)
    return inter / (len(a) + len(b) - inter)


def _enrich(item: dict) -> dict:
    inmet = _is_inmet(item)
    title = _clean(item.get("title"))
    if not inmet:
        title = OUTLET_RE.sub("", title).strip()
    summary = _clean(item.get("summary"))
    raw = f"{title} {summary}"
    norm = normalize(raw)
    risk = classify_risk({**item, "title": title, "summary": summary})
    road = "" if inmet else _road_of(raw, norm)
    return {
        "title": title,
        "url": _clean(item.get("url")),
        "source": _clean(item.get("source")),
        "inmet": inmet,
        "time": _item_time(item),
        "risk": risk,
        "road": road,
        "uf": _uf_of(raw, norm, road),
        "tokens": _tokens(normalize(title)),
    }


def _cluster_events(items: list) -> list:
    clusters = []
    ordered = sorted(items, key=lambda i: (i["time"] is None, i["time"] or 0, i["title"]))
    for item in ordered:
        key = item["road"] or (f"uf:{item['uf']}" if item["uf"] else "")
        match = None
        for cluster in clusters:
            if cluster["key"] != key:
                continue
            gap = abs((item["time"] or 0) - (cluster["last"] or 0))
            if item["uf"] and cluster["rep"]["uf"] and item["uf"] != cluster["rep"]["uf"]:
                continue
            if item["road"] and item["uf"] and item["uf"] == cluster["rep"]["uf"] and cluster["rep"]["risk"]["kind"] == item["risk"]["kind"] and gap <= DAY_MS:
                match = cluster
                break
            if gap <= 2 * DAY_MS and _jaccard(item["tokens"], cluster["tokens"]) >= 0.35:
                match = cluster
                break
        if match:
            match["items"].append(item)
            match["last"] = item["time"] if item["time"] is not None else match["last"]
            match["tokens"] |= item["tokens"]
            if item["risk"]["rank"] > match["rep"]["risk"]["rank"]:
                match["rep"] = item
            if item["risk"].get("fatal"):
                match["fatal"] = True
            if item["source"]:
                match["sources"].add(item["source"])
        else:
            clusters.append({
                "key": key, "rep": item, "items": [item], "last": item["time"], "tokens": set(item["tokens"]),
                "fatal": bool(item["risk"].get("fatal")), "sources": {item["source"]} if item["source"] else set(),
            })
    return clusters


def _count(clusters: list, inmet_items: list) -> dict:
    def kinds(values):
        return sum(1 for c in clusters if c["rep"]["risk"]["kind"] in values)
    return {
        "block_total": kinds({"block_total", "strike_block"}),
        "block_planned": kinds({"block_planned"}),
        "heavy": kinds({"heavy_vehicle", "hazmat"}),
        "fatal": sum(1 for c in clusters if c["fatal"]),
        "cargo": kinds({"cargo_theft"}),
        "strike": kinds({"strike", "strike_block"}),
        "inmet": sum(1 for i in inmet_items if i["risk"]["kind"] in {"inmet_orange", "inmet_red"}),
    }


def _short(text: str, limit: int = 120) -> str:
    if len(text) <= limit:
        return text
    return re.sub(r"\s+\S*$", "", text[: limit - 1]) + "…"


def _event_view(cluster: dict) -> dict:
    rep = cluster["rep"]
    kind_label, action = KIND.get(rep["risk"]["kind"], ("Ocorrência", "Monitore antes de passar."))
    return {
        "title": rep["title"],
        "road": rep["road"],
        "uf": rep["uf"],
        "date": _day_month(rep["time"]),
        "level": rep["risk"]["level"],
        "level_label": rep["risk"]["label"],
        "kind": rep["risk"]["kind"],
        "kind_label": kind_label,
        "action": action,
        "sources": len(cluster["sources"]),
        "url": rep["url"],
    }


def _rank_key(c: dict):
    return (-c["rep"]["risk"]["rank"], -len(c["sources"]), -(c["rep"]["time"] or 0), c["rep"]["title"])


def _most_common(values: list) -> str:
    counts = {}
    for v in values:
        if v:
            counts[v] = counts.get(v, 0) + 1
    if not counts:
        return ""
    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]


def _hotspots(clusters: list) -> list:
    by_road = {}
    for c in clusters:
        if c["rep"]["road"]:
            by_road.setdefault(c["rep"]["road"], []).append(c)
    spots = []
    for road, lst in by_road.items():
        score = sum(WEIGHT[c["rep"]["risk"]["rank"]] for c in lst)
        strong = [c for c in lst if c["rep"]["risk"]["rank"] >= 3]
        pool = strong or lst
        kind_counts = {}
        for c in pool:
            entry = kind_counts.setdefault(c["rep"]["risk"]["kind"], {"count": 0, "rank": 0})
            entry["count"] += 1
            entry["rank"] = max(entry["rank"], c["rep"]["risk"]["rank"])
        dominant = sorted(kind_counts.items(), key=lambda kv: (-kv[1]["count"], -kv[1]["rank"], kv[0]))[0][0]
        worst = sorted([c for c in pool if c["rep"]["risk"]["kind"] == dominant], key=_rank_key)[0]
        main_problem, action = KIND.get(dominant, ("Ocorrências", "Monitore antes de passar."))
        spots.append({
            "road": road,
            "uf": _most_common([c["rep"]["uf"] for c in lst]),
            "score": score,
            "events": len(lst),
            "critical_high": len(strong),
            "main_problem": main_problem,
            "action": action,
            "worst_title": worst["rep"]["title"],
            "worst_url": worst["rep"]["url"],
        })
    spots = [s for s in spots if s["score"] >= 4]
    spots.sort(key=lambda s: (-s["score"], -s["events"], s["road"]))
    return spots[:5]


def _weather_by_state(inmet_items: list) -> list:
    by_uf = {}
    for item in inmet_items:
        by_uf.setdefault(item["uf"] or "Área não informada", []).append(item)
    rows = []
    for uf, lst in by_uf.items():
        worst = sorted(lst, key=lambda i: -i["risk"]["rank"])[0]
        parts = worst["title"].split(" - ")
        level = (parts[1] if len(parts) > 1 and parts[1] else worst["risk"]["label"]).strip()
        phenomena = sorted({i["title"].split(" - ")[0].strip() for i in lst if i["title"].split(" - ")[0].strip()})
        rows.append({"uf": uf, "alerts": len(lst), "max_rank": worst["risk"]["rank"], "max_level": level, "phenomena": phenomena})
    rows.sort(key=lambda r: (-r["max_rank"], -r["alerts"], r["uf"]))
    out = []
    for r in rows[:6]:
        max_rank = r.pop("max_rank")
        r["action"] = "Avalie adiar saídas nos horários de tempestade na área do aviso." if max_rank >= 3 else "Atenção a chuva e vento; sem restrição de saída."
        out.append(r)
    return out


def build_weekly_brief(raw_items: list, now_ms: int | None = None) -> dict:
    if now_ms is None:
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    items = [_enrich(i) for i in raw_items]
    current_start = now_ms - 7 * DAY_MS
    previous_start = now_ms - 14 * DAY_MS
    current = [i for i in items if i["time"] is None or i["time"] >= current_start]
    previous = [i for i in items if i["time"] is not None and previous_start <= i["time"] < current_start]

    def relevant(lst):
        return [i for i in lst if not i["inmet"] and i["risk"]["rank"] >= 2]

    def inmet_of(lst):
        return [i for i in lst if i["inmet"]]

    current_clusters = _cluster_events(relevant(current))
    previous_clusters = _cluster_events(relevant(previous))
    current_inmet = inmet_of(current)
    now = _count(current_clusters, current_inmet)
    before = _count(previous_clusters, inmet_of(previous))
    numbers = [{"key": k, "label": label, "value": now[k], "previous": before[k], "delta": now[k] - before[k]} for k, label in NUMBER_LABELS]

    released = [i for i in current if i["risk"]["kind"] == "released"]
    today = _ymd(now_ms)
    watch = []

    def push_watch(kind_type, cluster, scheduled=None):
        watch.append({"type": kind_type, **_event_view(cluster), "scheduled": f"{scheduled[2]:02d}/{scheduled[1]:02d}" if scheduled else ""})

    for c in sorted([c for c in current_clusters if c["rep"]["risk"]["kind"] == "block_planned"], key=_rank_key):
        scheduled = _scheduled_date(c["rep"]["title"], c["rep"]["time"])
        if scheduled and scheduled < today:
            continue
        push_watch("Bloqueio programado", c, scheduled)
    for c in sorted([c for c in current_clusters if c["rep"]["risk"]["kind"] in {"strike", "strike_block"}], key=_rank_key):
        push_watch("Paralisação/manifestação", c)
    still = [
        c for c in current_clusters
        if c["rep"]["risk"]["kind"] == "block_total" and c["rep"]["time"] is not None and c["rep"]["time"] >= now_ms - 3 * DAY_MS
        and not any(i["road"] and i["road"] == c["rep"]["road"] and i["time"] is not None and i["time"] > c["rep"]["time"] for i in released)
    ]
    for c in sorted(still, key=_rank_key):
        push_watch("Pode seguir bloqueado", c)
        watch[-1]["action"] = "Sem notícia de liberação: confirme com a concessionária/PRF antes de liberar o veículo."
    recent_inmet = [i for i in current_inmet if i["risk"]["rank"] >= 3 and (i["time"] is None or i["time"] >= now_ms - 2 * DAY_MS)]
    for spot in _weather_by_state(recent_inmet):
        watch.append({
            "type": "Aviso INMET", "title": f"{', '.join(spot['phenomena'])} — {spot['max_level']}", "road": "", "uf": spot["uf"],
            "date": "", "level": "high", "level_label": "Alto", "kind": "inmet_orange", "kind_label": "Aviso INMET",
            "action": spot["action"], "sources": 1, "url": "", "scheduled": "",
        })
    used = {}
    watchlist = []
    for w in watch:
        used[w["type"]] = used.get(w["type"], 0) + 1
        if used[w["type"]] <= QUOTA[w["type"]]:
            watchlist.append(w)

    spots = _hotspots(current_clusters)
    cargo = [
        {**_event_view(c), "police": c["rep"]["risk"]["kind"] == "cargo_theft_police"}
        for c in sorted([c for c in current_clusters if c["rep"]["risk"]["kind"] in {"cargo_theft", "cargo_theft_police"}], key=_rank_key)[:5]
    ]
    weather = _weather_by_state(current_inmet)
    highlights = [_event_view(c) for c in sorted([c for c in current_clusters if c["rep"]["risk"]["rank"] >= 3], key=_rank_key)[:6]]

    actions = []
    for w in [w for w in watchlist if w["type"] == "Bloqueio programado"][:2]:
        actions.append(f"Planeje o desvio{' para ' + w['scheduled'] if w['scheduled'] else ''}: {_short(w['title'])}.")
    for w in [w for w in watchlist if w["type"] == "Paralisação/manifestação"][:1]:
        actions.append(f"Confirme antes de despachar: {_short(w['title'])}.")
    for w in [w for w in watchlist if w["type"] == "Pode seguir bloqueado"][:1]:
        actions.append(f"Confirme a liberação antes de passar: {_short(w['title'])}.")
    covered = {w["road"] for w in watchlist[:4] if w["road"]}
    for spot in [s for s in spots if s["road"] not in covered][:2]:
        actions.append(f"{spot['road']}{'/' + spot['uf'] if spot['uf'] else ''} ({spot['main_problem'].lower()}): {spot['action']}")
    theft_places = []
    for c in cargo:
        place = c["road"] or c["uf"]
        if not c["police"] and place and place not in theft_places:
            theft_places.append(place)
    if theft_places:
        actions.append(f"Segurança da carga em {', '.join(theft_places[:3])}: {KIND['cargo_theft'][1]}")
    danger_ufs = [w["uf"] for w in weather if w["action"].startswith("Avalie") and w["uf"] in UF_CODES][:4]
    if danger_ufs:
        actions.append(f"Clima: avisos de Perigo em {', '.join(danger_ufs)}: avalie adiar saídas nos horários de tempestade.")
    unique_actions = list(dict.fromkeys(actions))[:5]
    if not unique_actions:
        unique_actions = ["Sem restrição relevante na semana: mantenha a checagem padrão antes das saídas."]

    critical = sum(1 for c in current_clusters if c["rep"]["risk"]["rank"] == 4)
    high = sum(1 for c in current_clusters if c["rep"]["risk"]["rank"] == 3)
    strike_announced = any(w["type"] == "Paralisação/manifestação" for w in watchlist)
    level = "critical" if critical >= 3 or strike_announced else "high" if critical >= 1 or high >= 8 else "medium" if current_clusters else "low"
    verdict_label = {"critical": "Crítica", "high": "Atenção alta", "medium": "Atenção moderada", "low": "Tranquila"}[level]
    facts = [f"{n['value']} {n['label'].lower()}" for n in numbers if n["value"] > 0][:3]
    verdict_text = f"{', '.join(facts)}." if facts else "Nenhuma ocorrência com impacto operacional relevante."

    trend = sum(n["value"] for n in numbers[:5]) - sum(n["previous"] for n in numbers[:5])
    trend_text = (
        "mais ocorrências graves que na semana anterior" if trend > 0
        else "menos ocorrências graves que na semana anterior" if trend < 0
        else "volume de ocorrências graves igual ao da semana anterior"
    )
    parts = [f"Semana {verdict_label.lower()}: {verdict_text.rstrip('.')}, {trend_text}."]
    if spots:
        parts.append(f"Trechos mais críticos: {', '.join(s['road'] + ('/' + s['uf'] if s['uf'] else '') for s in spots[:3])}.")
    if watchlist:
        parts.append(f"{len(watchlist)} ponto(s) de atenção para os próximos dias.")

    return {
        "period": {"days": 7, "start": _day_month(current_start), "end": _day_month(now_ms)},
        "verdict": {"level": level, "label": verdict_label, "text": verdict_text},
        "headline": f"Semana {verdict_label.lower()}{': ' + ' e '.join(facts[:2]) if facts else ''}",
        "executive_summary": " ".join(parts),
        "numbers": numbers,
        "watchlist": watchlist,
        "hotspots": spots,
        "cargo_security": cargo,
        "weather": weather,
        "actions": unique_actions,
        "highlights": highlights,
        "coverage": {
            "analyzed": len(current),
            "relevant": len(relevant(current)) + len(current_inmet),
            "events": len(current_clusters),
            "discarded": sum(1 for i in current if not i["inmet"] and i["risk"]["rank"] < 2),
        },
    }
