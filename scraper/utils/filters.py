import html
import re
import unicodedata

STATE_ARTICLES = {
    "Acre": "do",
    "Amapa": "do",
    "Amap\u00e1": "do",
    "Amazonas": "do",
    "Ceara": "do",
    "Cear\u00e1": "do",
    "Maranhao": "do",
    "Maranh\u00e3o": "do",
    "Para": "do",
    "Par\u00e1": "do",
    "Parana": "do",
    "Paran\u00e1": "do",
    "Piaui": "do",
    "Piau\u00ed": "do",
    "Rio de Janeiro": "do",
    "Rio Grande do Norte": "do",
    "Rio Grande do Sul": "do",
    "Tocantins": "do",
    "Bahia": "da",
    "Paraiba": "da",
    "Para\u00edba": "da",
    "Rondonia": "de",
    "Rond\u00f4nia": "de",
    "Santa Catarina": "de",
    "Sao Paulo": "de",
    "S\u00e3o Paulo": "de",
}

STATE_NAMES = {
    "acre": "Acre",
    "alagoas": "Alagoas",
    "amapa": "Amap\u00e1",
    "amazonas": "Amazonas",
    "bahia": "Bahia",
    "ceara": "Cear\u00e1",
    "distrito federal": "Distrito Federal",
    "espirito santo": "Esp\u00edrito Santo",
    "goias": "Goi\u00e1s",
    "maranhao": "Maranh\u00e3o",
    "mato grosso": "Mato Grosso",
    "mato grosso do sul": "Mato Grosso do Sul",
    "minas gerais": "Minas Gerais",
    "para": "Par\u00e1",
    "paraiba": "Para\u00edba",
    "parana": "Paran\u00e1",
    "pernambuco": "Pernambuco",
    "piaui": "Piau\u00ed",
    "rio de janeiro": "Rio de Janeiro",
    "rio grande do norte": "Rio Grande do Norte",
    "rio grande do sul": "Rio Grande do Sul",
    "rondonia": "Rond\u00f4nia",
    "roraima": "Roraima",
    "santa catarina": "Santa Catarina",
    "sao paulo": "S\u00e3o Paulo",
    "sergipe": "Sergipe",
    "tocantins": "Tocantins",
}

# Conectivos ignorados ao casar keywords de varias palavras.
_STOPWORDS = {
    "de", "da", "do", "das", "dos", "e", "em", "a", "o", "as", "os",
    "na", "no", "nas", "nos", "com", "para", "por", "ao", "\u00e0", "um", "uma",
}


def _normalize(value: str) -> str:
    value = clean_text(value).lower()
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", value).strip()


def matches_keywords(text: str, keywords: list) -> bool:
    """Retorna True quando o texto contem ao menos uma keyword relevante."""
    if not text or not keywords:
        return False

    for kw in keywords:
        if not kw:
            continue
        kw = kw.strip()
        if not kw:
            continue

        if re.match(r"^[\w\s]+$", kw, re.UNICODE):
            words = [p for p in kw.split() if p.lower() not in _STOPWORDS]
            if not words:
                words = kw.split()
            if all(
                re.search(rf"(?<!\w){re.escape(word)}(?!\w)", text, flags=re.IGNORECASE)
                for word in words
            ):
                return True
        elif kw.lower() in text.lower():
            return True

    return False


def clean_text(text: str) -> str:
    """Remove HTML, entidades e espacos duplicados."""
    if not text:
        return ""

    text = html.unescape(str(text))
    text = re.sub(r"&nbsp;?", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"&[a-zA-Z]+;?", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _state_from_text(text: str) -> str:
    raw_text = clean_text(text)
    if re.search(r"\bPar\u00e1\b", raw_text, flags=re.IGNORECASE):
        return "Par\u00e1"

    normalized = _normalize(text)
    for key, label in sorted(STATE_NAMES.items(), key=lambda item: len(item[0]), reverse=True):
        if key == "para":
            continue
        if re.search(rf"\b{re.escape(key)}\b", normalized):
            return label
    return ""


def _location_from_text(text: str) -> str:
    route = re.search(
        r"\b(?:BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF)[-\s]?\d{2,4}\b",
        text,
        re.IGNORECASE,
    )
    if route:
        return route.group(0).replace(" ", "-").upper()

    km = re.search(r"\bkm\s*\d+(?:[,.]\d+)?\b", text, re.IGNORECASE)
    if km:
        return km.group(0)

    state = _state_from_text(text)
    if state:
        return state

    city_state = re.search(
        r"\b(?:em|na|no|entre|proximo a|pr\u00f3ximo a|perto de)\s+([A-Z\u00c0-\u017F][\w\u00c0-\u017F' -]{2,80}(?:,\s*[A-Z]{2})?)",
        text,
    )
    if city_state:
        return city_state.group(1).strip(" -,.")

    return ""


def _location_prefix(location: str) -> str:
    if re.match(r"^(?:BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF)-?\d", location, re.IGNORECASE):
        return f"Na regi\u00e3o da {location}"
    if re.match(r"^km\b", location, re.IGNORECASE):
        return f"No trecho do {location}"
    article = STATE_ARTICLES.get(location, "de")
    return f"Na regi\u00e3o {article} {location}"


def _strip_bare_region_prefix(text: str) -> str:
    """Evita salvar resumo que seja apenas 'Na regiao de X,'."""
    return re.sub(
        r"^Na regi(?:\u00e3|a)o (?:de|do|da) [^,]{2,80},?\s*$",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()


def _strip_source_suffix(text: str) -> str:
    if not text:
        return ""
    return re.sub(
        r"(?:\s*[-–—]\s*|\s+)(?:G1|CNN Brasil|CNN|Globo|UOL|R7|Terra|Folha|Estad[ãa]o|Gazeta|Extra|O Globo|O Estado de S\.P\.aulo|Band)\s*$",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()


def _strip_summary_label(text: str) -> str:
    if not text:
        return ""
    return re.sub(
        r"^(?:Resumo(?: da not[ií]cia)?|Not[ií]cia|Reportagem|Fonte):?\s*",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()


def _strip_redundant_location_prefix(text: str, location: str) -> str:
    """Remove prefixos redundantes de localidade do resumo antes de adicionar o prefixo final."""
    if not text or not location:
        return text

    patterns = [
        rf"^Na regi(?:ão|ao) (?:da|do|de) {re.escape(location)}\s*,?\s*",
        rf"^No trecho do {re.escape(location)}\s*,?\s*",
        rf"^(?:Áreas afetadas?:\s*)?{re.escape(location)}\s*(?:[:\-–—]\s*|\s*,\s*|\s+)?",
    ]

    for pattern in patterns:
        new_text = re.sub(pattern, "", text, flags=re.IGNORECASE)
        if new_text != text:
            return new_text.strip()

    return text


def _strip_redundant_location_mention(text: str, location: str) -> str:
    if not text or not location:
        return text

    escaped = re.escape(location)
    patterns = [
        rf"\b(?:na|em|no|nos|nas|da|do|de|dos|das|por|entre|perto de|pr[oó]ximo a) {escaped}\b[.,;:]*\s*",
        rf"\b(?:cidade|região|regiao|estado|município|municipio|área|area|zona|bairro|per[íi]metro)\s+(?:de|do|da) {escaped}\b[.,;:]*\s*",
        rf"\b{escaped}\b[.,;:]*\s*",
    ]

    for pattern in patterns:
        text = re.sub(pattern, " ", text, flags=re.IGNORECASE)

    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\bÁreas afetadas\b[:;]?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\bquanto a\b", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\batigem a cidade\b", "atingem", text, flags=re.IGNORECASE)
    text = re.sub(r"\batigem a\b", "atingem", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*([,;:.])\s*", r"\1 ", text).strip()
    text = re.sub(r"^[,;:.\s]+|[,;:.\s]+$", "", text).strip()
    return text


def _strip_location_phrase(text: str, location: str) -> str:
    if not text or not location:
        return text

    escaped = re.escape(location)
    patterns = [
        rf"\b(?:na|em|no|nos|nas|da|do|de|dos|das|por|entre|perto de|pr[oó]ximo a) {escaped}\b",
        rf"\b{escaped}\b",
    ]
    for pattern in patterns:
        text = re.sub(pattern, " ", text, flags=re.IGNORECASE)

    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^[,;:.\s]+|[,;:.\s]+$", "", text).strip()
    return text


def _normalize_road_phrases(text: str) -> str:
    if not text:
        return text

    text = re.sub(r"\bacidente\s+interdita\s+trecho\b", "trecho interditado", text, flags=re.IGNORECASE)
    text = re.sub(r"\bacidente\s+trecho\b", "acidente no trecho", text, flags=re.IGNORECASE)
    text = re.sub(r"\bobras\s+trecho\b", "obras no trecho", text, flags=re.IGNORECASE)
    text = re.sub(r"\bobra\s+trecho\b", "obra no trecho", text, flags=re.IGNORECASE)
    text = re.sub(r"\bcongestionamento\s+trecho\b", "congestionamento no trecho", text, flags=re.IGNORECASE)
    return text


def _normalize_weather_phrases(text: str) -> str:
    if not text:
        return text

    text = re.sub(
        r"\bchuv(?:a|as) entre (\d+(?:[.,]\d+)?)\s*e\s*(\d+(?:[.,]\d+)?)\s*mm/h\b",
        r"chuvas intensas de \1 a \2 mm/h",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\bchuva intensa(?:s)? de (\d+(?:[.,]\d+)?)\s*mm/h\b",
        r"chuvas intensas de \1 mm/h",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\bventos fortes de (\d+(?:[.,]\d+)?)\s*km/h\b",
        r"ventos fortes de \1 km/h",
        text,
        flags=re.IGNORECASE,
    )
    return text


def _fallback_summary(title: str) -> str:
    clean_title = clean_text(title)
    weather = re.match(r"^([A-Za-z\u00c0-\u017F ]+)\s*-\s*([A-Za-z\u00c0-\u017F ]+)$", clean_title)
    if weather:
        event = weather.group(1).strip().lower()
        severity = weather.group(2).strip().lower()
        return f"h\u00e1 alerta de {event} com {severity}, conforme aviso meteorol\u00f3gico publicado pelo INMET."
    return clean_title[:1].lower() + clean_title[1:] if clean_title else ""


def _after_prefix(text: str) -> str:
    if len(text) > 1 and text[0].isupper() and not text[1].isupper():
        return text[:1].lower() + text[1:]
    return text


def _is_source_only_text(text: str) -> bool:
    if not text:
        return False
    return bool(re.fullmatch(
        r"(?i)(?:G1|CNN Brasil|CNN|Globo|UOL|R7|Terra|Folha|Estad[ãa]o|Gazeta|Extra|O Globo|O Estado de S\.P\.aulo)",
        text,
    ))


def build_summary(title: str, summary: str, limit: int = 500) -> str:
    """Monta resumo limpo: regiao entra como prefixo, nunca como substituto."""
    clean_title = _strip_summary_label(_strip_source_suffix(clean_text(title)))
    clean_summary = _strip_summary_label(_strip_source_suffix(clean_text(summary)))
    clean_summary = _strip_bare_region_prefix(clean_summary)

    if clean_summary.lower().startswith(clean_title.lower()):
        remainder = clean_summary[len(clean_title):].strip(" -\u2013\u2014:.")
        if not remainder or _is_source_only_text(remainder):
            clean_summary = ""
        else:
            clean_summary = remainder

    clean_summary = re.sub(
        r"\bINMET publica aviso iniciando em:\s*[^.]+\.?\s*",
        "",
        clean_summary,
        flags=re.IGNORECASE,
    )
    clean_summary = re.sub(r"\bBaixo risco de\b", "Risco de", clean_summary, flags=re.IGNORECASE)
    clean_summary = clean_summary.strip()

    if not clean_summary:
        location = _location_from_text(clean_title)
        if location:
            clean_summary = _strip_location_phrase(clean_title, location)
        else:
            clean_summary = _fallback_summary(clean_title)

    location = _location_from_text(f"{clean_title} {clean_summary}")
    if location:
        clean_summary = _strip_redundant_location_prefix(clean_summary, location)
        clean_summary = _strip_redundant_location_mention(clean_summary, location)
        clean_summary = _normalize_weather_phrases(clean_summary)
        clean_summary = _normalize_road_phrases(clean_summary)
        clean_summary = clean_summary.strip()
        if not clean_summary:
            clean_summary = _fallback_summary(clean_title)

        prefix = _location_prefix(location)
        if not clean_summary.lower().startswith(prefix.lower()):
            clean_summary = f"{prefix}, {_after_prefix(clean_summary)}"

    return clean_summary[:limit].rstrip(" ,")
