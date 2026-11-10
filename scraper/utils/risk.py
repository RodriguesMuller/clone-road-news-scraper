"""Espelho em Python da régua de risco de public/risk.js (Baixo/Médio/Alto/Crítico).

Mantenha as duas implementações iguais: ambas são validadas pelo mesmo conjunto de
exemplos em docs/domain/risk_golden.json (tests/test_risk.py e tests/test_risk.js).
A explicação de cada nível está no cabeçalho de public/risk.js.
"""

from __future__ import annotations

import re
import unicodedata

LEVELS = {
    "critical": {"rank": 4, "label": "Crítico", "ascii": "Critico"},
    "high": {"rank": 3, "label": "Alto", "ascii": "Alto"},
    "medium": {"rank": 2, "label": "Médio", "ascii": "Medio"},
    "low": {"rank": 1, "label": "Baixo", "ascii": "Baixo"},
}


def normalize(value) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return re.sub(r"\s+", " ", text)


UF = "br|ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to|ers|rsc|mgc|amg|prc|spa|spi"
UF_STATES = "|".join(UF.split("|")[1:28])
ROAD_CODE = rf"\b(?:{UF})-?\s?\d{{2,4}}\b"
STATE_NAMES = (
    "acre|alagoas|amapa|amazonas|bahia|ceara|distrito federal|espirito santo|goias|maranhao|mato grosso|minas gerais|"
    "paraiba|parana|pernambuco|piaui|rio de janeiro|rio grande do norte|rio grande do sul|rondonia|roraima|"
    "santa catarina|sao paulo|sergipe|tocantins"
)
NAMED_HIGHWAYS = (
    "dutra|raposo tavares|castell?o branco|fernao dias|regis bittencourt|anhanguera|bandeirantes|"
    "washington luis|imigrantes|anchieta|tamoios|carvalho pinto|ayrton senna|dom pedro|rio-santos|"
    "rodoanel|ponte rio-niteroi|transamazonica|belem-brasilia"
)

BLOCK_ROAD_CONTEXT = re.compile(
    rf"{ROAD_CODE}|rodovi|estrada|pista|ponte|viaduto|trecho|\bkm\s*\d|\bvia\b|serra|\balca\b|marginal|{NAMED_HIGHWAYS}"
)
BLOCK_RELEASED = re.compile(
    r"\b(?:liberad[ao]s?|desbloquead[ao]s?|reabert[ao]s?|normalizad[ao]s?|retomad[ao]s?)\b|transito normal|fluxo normal|libera(?:cao)? total"
)
BLOCK_STILL_ACTIVE = re.compile(r"(?:segue|continua|permanece) (?:totalmente )?(?:bloquead|interditad|fechad)|sem previsao de liberacao")
BLOCK_PARTIAL = re.compile(
    r"interdicao parcial|bloqueio parcial|parcialmente (?:bloquead|interditad|fechad)|meia pista|pare[- ]?e[- ]?siga|"
    r"faixas? (?:interditada|bloqueada)|(?:interdicao|bloqueio) de faixa|(?:bloqueia|interdita|ocupa)m? (?:a |as )?(?:uma|duas|tres|\d) faixas?|"
    r"uma (?:das )?faixas?|uma pista"
)
BLOCK_TOTAL = re.compile(
    r"bloqueio total|interdicao total|totalmente (?:bloquead|interditad|fechad)|\bbloquead[ao]s?\b|\binterditad[ao]s?\b|"
    r"\binterditam?\b|\bbloqueiam?\b|\bbloqueio\b|\binterdicao\b|\bbloquear\b|\binterditar\b|\bfechad[ao]s?\b|"
    r"\bfecha(?:m)? (?:a |o )?(?:ponte|pista|rodovia|br|trecho|via|estrada)|desabamento de ponte|ponte (?:cai|caiu|desaba)"
)

P = {
    "foreign": re.compile(
        r"\b(?:bulgaria|estados unidos|argentina|chile|paraguai|uruguai|bolivia|colombia|venezuela|mexico|canada|china|india|"
        r"japao|coreia|russia|ucrania|franca|alemanha|italia|espanha|portugal|reino unido|inglaterra|turquia|israel|egito|"
        r"africa do sul|australia|nova zelandia)\b"
    ),
    "intl_corridor": re.compile(r"ormuz|hormuz|suez|mar vermelho|red sea|bab el.mandeb|canal do panama|panama canal"),
    "aftermath": re.compile(
        r"\b(?:denunciad|condenad|julgament|indenizac|processad[ao]|inquerito|velorio|sepultad|enterro|luto|homenage|relembra|superfaturamento)"
        r"|identificad[ao]s? (?:as )?(?:\w+ )?vitimas|morre aos \d+ anos|\b(?:checagem|boato|fake news|desmente|negam)\b|e antig[ao]\b|fora de contexto"
    ),
    "simulation": re.compile(r"\bsimulado\b|\bexercicio simulado\b"),
    "planned": re.compile(
        r"\b(?:tera|terao)\b|\bvai (?:ter|bloquear|interditar|fechar)|\bsera (?:totalmente |parcialmente )?(?:bloquead|interditad|fechad)"
        r"|\bprogramad[ao]|\bagendad[ao]|previst[ao] (?:para|nest[ae]|no |na )|esta previst|para (?:reparos|obras|manutencao|desmonte)"
        r"|a partir de (?:amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|\d)"
    ),
    "grande_perigo": re.compile(r"grande perigo"),
    "perigo_potencial": re.compile(r"perigo potencial"),
    "perigo": re.compile(r"\bperigo\b"),
    "strike": re.compile(r"\bgreve\b|paralisac|manifestac|protesto"),
    "strike_relevant": re.compile(r"caminhoneir|transportador|rodovi|estrada|porto d[eo]s?\b|portuari|\bpista\b|\bbr-?\s?\d"),
    "strike_over": re.compile(
        r"\bnegativa\b|\bnega(?:m)?\b|descarta|nao (?:ha|haver) indicac|sem indicac|encerrad[ao]|\bretoma(?:m|da)?\b"
        r"|fim da (?:greve|paralisacao)|suspend(?:e|em|ida)|cancelad[ao]|desmobiliz"
    ),
    "cargo_theft": re.compile(
        r"roubo de carga|furto de carga|roubo.{0,25}(?:caminh|carreta|carga)|assalt.{0,30}(?:caminh|motorista|carga|carreta)"
        r"|\bsaque|saquead|quadrilha.{0,40}(?:carga|caminh)"
    ),
    "police": re.compile(
        r"\bprend(?:e|em|eu|eram)\b|\bpres[oa]s?\b(?! (?:as|nas) ferragens)|\bprisao\b|\brecuperad[ao]s?\b|\brecupera\b|apreend|desarticul|operacao policial"
    ),
    "structural": re.compile(r"queda de barreira|deslizamento|cratera|erosao|afundamento|desaba|(?:acostamento|pista|aterro) ced|rompimento"),
    "heavy": re.compile(r"caminh(?:ao|oes)|carreta|bitrem|rodotrem|treminhao|cegonha|\bonibus\b|caminhao-tanque|\bpesado"),
    "accident": re.compile(
        r"acidente|colis|batid|\bbate(?:u|m)?\b|engavet|tomb|capot|choque|sai(?:u)? da pista|perde(?:u)? (?:o )?controle|atropel|ribanceira"
    ),
    "heavy_dramatic": re.compile(r"tomb|capot|engavet|pega(?:m)? fogo|incendi|em chamas|ribanceira"),
    "small_fire": re.compile(r"principio de incendio|incendio (?:atinge|em) pneus"),
    "fire": re.compile(r"pega(?:m)? fogo|incendio|em chamas"),
    "hazmat": re.compile(
        r"produtos? perigosos?|inflamave|combustivel|toxic|quimic|explosiv|derramamento de (?:oleo|combustivel|produto)|vazamento|caminhao-tanque|\bgas\b"
    ),
    "fatality": re.compile(
        r"\bmort[eoa]s?\b|\bmorr(?:e|eu|em|eram|endo)\b|\bmat(?:a|ou|aram|ando)\b|\bfatal\b|\bobito\b|perde a vida|perdeu a vida"
    ),
    "no_casualties": re.compile(r"sem feridos?\b|sem vitimas?\b|sem mortos?\b|nenhuma vitima|nao houve (?:ferido|morte|vitima)"),
    "big_jam": re.compile(r"\b(?:[5-9]|\d{2,})\s*km de (?:fila|congestionamento|lentidao)"),
    "traffic": re.compile(r"congestion|lentid|\bfila\b|transito (?:parado|lento|complicad)|complica (?:o )?transito|afeta (?:o )?transito|atrasos?\b"),
    "weather_severe": re.compile(r"tempestade|temporal|alagamento|alagad|enchente|inundac|granizo|vendaval|ciclone"),
    "visibility": re.compile(r"neblina|nevoeiro|baixa visibilidade|fumaca"),
    "minor": re.compile(r"\bobras?\b|manutencao|recapeamento|sinalizacao|chuva|fiscalizac|\bbalanca\b|radar|restric|proib"),
    "location": re.compile(
        rf"{ROAD_CODE}|rodovi|estrada|\bkm\s*\d|\bvia\b|serra|ponte|viaduto|marginal|{NAMED_HIGHWAYS}|\b(?:{STATE_NAMES})\b|(?:\bem|\bno|\bna|,|\()\s?(?:{UF_STATES})\b"
    ),
}


def _text_of(item: dict) -> str:
    return normalize(f"{item.get('title') or ''} {item.get('summary') or ''}")


def road_block_level(item: dict) -> str:
    if isinstance(item.get("block_level"), str):
        return item["block_level"]
    text = _text_of(item)
    if not BLOCK_ROAD_CONTEXT.search(text):
        return ""
    if BLOCK_RELEASED.search(text) and not BLOCK_STILL_ACTIVE.search(text):
        return ""
    if BLOCK_PARTIAL.search(text):
        return "partial"
    if BLOCK_TOTAL.search(text):
        return "total"
    return ""


# Tipo de ocorrência (usado pelo resumo semanal para agrupar e sugerir ação). Igual ao JS.
KIND_BY_REASON = [
    ("Corredor logístico internacional", "intl"), ("Ocorrência fora do Brasil", "foreign"), ("Desdobramento", "aftermath"),
    ("Aviso INMET de Grande Perigo", "inmet_red"), ("Aviso INMET de Perigo Potencial", "inmet_yellow"), ("Aviso INMET de Perigo", "inmet_orange"),
    ("Aviso meteorológico", "inmet"), ("Trecho liberado", "released"), ("Simulado", "simulation"),
    ("Bloqueio total programado", "block_planned"), ("Manifestação bloqueando", "strike_block"), ("Rodovia totalmente bloqueada", "block_total"),
    ("Paralisação negada", "strike_over"), ("Paralisação ou manifestação", "strike"), ("Ação policial", "cargo_theft_police"),
    ("Roubo de carga", "cargo_theft"), ("Dano estrutural", "structural"), ("Acidente com produto perigoso", "hazmat"),
    ("Princípio de incêndio", "small_fire"), ("Veículo pesado", "heavy_vehicle"), ("Acidente com interdição parcial", "accident_partial"),
    ("Acidente com congestionamento", "accident_jam"), ("Acidente com vítima fatal", "fatal_accident"), ("Acidente sem sinal", "accident"),
    ("Interdição parcial programada", "block_partial_planned"), ("Bloqueio parcial", "block_partial"), ("Congestionamento extenso", "jam"),
    ("Clima severo", "weather"), ("Baixa visibilidade", "visibility"), ("Incêndio próximo", "fire"), ("Lentidão, obra", "traffic"),
]


def _result(level: str, reason: str) -> dict:
    kind = next((k for prefix, k in KIND_BY_REASON if reason.startswith(prefix)), "none")
    return {"level": level, **LEVELS[level], "reason": reason, "kind": kind}


def _is_inmet(item: dict) -> bool:
    return item.get("type") == "INMET" or "inmet" in str(item.get("source") or "").lower()


def _raw_classify(item: dict, text: str) -> dict:
    has_road = bool(re.search(ROAD_CODE, text))
    country = normalize(item.get("country"))

    if P["intl_corridor"].search(text):
        return _result("medium", "Corredor logístico internacional: impacto indireto em frete e combustível, não na via.")
    if (country and country != "brasil") or (P["foreign"].search(text) and not has_road):
        return _result("low", "Ocorrência fora do Brasil, sem efeito direto nas rotas.")
    if P["aftermath"].search(text):
        return _result("low", "Desdobramento de fato anterior (justiça, luto, homenagem ou boato), sem impacto atual na via.")

    if _is_inmet(item):
        if P["grande_perigo"].search(text):
            return _result("critical", "Aviso INMET de Grande Perigo: fenômeno excepcional, alta chance de interdições.")
        if P["perigo_potencial"].search(text):
            return _result("medium", "Aviso INMET de Perigo Potencial: atenção a chuva e vento, risco baixo de interdição.")
        if P["perigo"].search(text):
            return _result("high", "Aviso INMET de Perigo: risco de alagamento, queda de árvore e interdição pontual.")
        return _result("medium", "Aviso meteorológico do INMET.")

    block = road_block_level(item)
    planned = bool(P["planned"].search(text))
    released = bool(BLOCK_RELEASED.search(text) and not BLOCK_STILL_ACTIVE.search(text) and BLOCK_ROAD_CONTEXT.search(text))
    if released and not block:
        return _result("low", "Trecho liberado: a via volta a ser opção.")
    if P["simulation"].search(text) and not block:
        return _result("low", "Simulado, sem ocorrência real na via.")

    if block == "total":
        if planned or P["simulation"].search(text):
            return _result("high", "Bloqueio total programado: planeje o desvio para a data e horário informados.")
        if P["strike"].search(text):
            return _result("critical", "Manifestação bloqueando a rodovia.")
        return _result("critical", "Rodovia totalmente bloqueada: trecho indisponível até a liberação.")

    if P["strike"].search(text) and P["strike_relevant"].search(text):
        if P["strike_over"].search(text):
            return _result("low", "Paralisação negada, suspensa ou encerrada: sem bloqueio em curso.")
        return _result("high", "Paralisação ou manifestação ligada ao transporte: risco de bloqueio a qualquer momento.")

    if P["cargo_theft"].search(text):
        if P["police"].search(text):
            return _result("medium", "Ação policial contra roubo de carga: indica trecho visado, sem ameaça em curso.")
        return _result("high", "Roubo de carga: risco direto à carga e ao motorista no trecho.")

    if P["structural"].search(text) and BLOCK_ROAD_CONTEXT.search(text):
        return _result("high", "Dano estrutural na pista: risco de interdição e restrição de peso.")

    accident = bool(P["accident"].search(text))
    heavy = bool(P["heavy"].search(text))
    casualties_denied = bool(P["no_casualties"].search(text))
    if accident or (heavy and P["fire"].search(text)):
        if P["hazmat"].search(text):
            return _result("high", "Acidente com produto perigoso: interdição e contenção costumam ser longas.")
        if heavy and P["small_fire"].search(text):
            return _result("medium", "Princípio de incêndio em veículo pesado, controlado no local.")
        if heavy and P["heavy_dramatic"].search(text):
            return _result("high", "Veículo pesado tombado ou incendiado: interdição de faixas e remoção demorada.")
        if block == "partial":
            return _result("high", "Acidente com interdição parcial: fila e atraso no trecho.")
        if P["big_jam"].search(text):
            return _result("high", "Acidente com congestionamento extenso.")
        if P["fatality"].search(text) and not casualties_denied:
            return _result("high", "Acidente com vítima fatal: a perícia costuma interditar o trecho por horas.")
        return _result("medium", "Acidente sem sinal de interdição: possível lentidão pontual.")

    if block == "partial":
        return _result("medium", "Interdição parcial programada: inclua margem de tempo." if planned else "Bloqueio parcial: fila e atraso prováveis.")
    if P["big_jam"].search(text):
        return _result("high", "Congestionamento extenso no trecho.")
    if P["weather_severe"].search(text):
        return _result("high", "Clima severo na via: risco de alagamento e interdição.")
    if P["visibility"].search(text):
        return _result("medium", "Baixa visibilidade: risco de acidente, evite os horários críticos.")
    if P["fire"].search(text):
        return _result("medium", "Incêndio próximo à via: possível fumaça e lentidão.")
    if P["traffic"].search(text) or P["minor"].search(text):
        return _result("medium", "Lentidão, obra ou restrição: atraso provável.")
    return _result("low", "Sem impacto operacional identificado na notícia.")


def classify_risk(item: dict) -> dict:
    text = _text_of(item)
    base = _raw_classify(item, text)
    located = (
        P["location"].search(text)
        or item.get("highway") or item.get("city") or item.get("state") or item.get("region")
        or _is_inmet(item)
    )
    fatal = bool(P["fatality"].search(text) and not P["no_casualties"].search(text) and P["accident"].search(text))
    if not located and base["rank"] >= 3:
        capped = _result("medium", f"{base['reason']} Sem rodovia ou local identificado na notícia.")
        capped["kind"] = base["kind"]
        capped["fatal"] = fatal
        capped["needs_geo_review"] = True
        return capped
    return {**base, "fatal": fatal}
