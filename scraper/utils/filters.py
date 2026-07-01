import html
import re
import unicodedata

UNKNOWN_REGION = "N\u00e3o identificado"

STATE_NAMES = {
    "acre": "AC",
    "alagoas": "AL",
    "amapa": "AP",
    "amazonas": "AM",
    "bahia": "BA",
    "ceara": "CE",
    "distrito federal": "DF",
    "espirito santo": "ES",
    "goias": "GO",
    "maranhao": "MA",
    "mato grosso": "MT",
    "mato grosso do sul": "MS",
    "minas gerais": "MG",
    "para": "PA",
    "paraiba": "PB",
    "parana": "PR",
    "pernambuco": "PE",
    "piaui": "PI",
    "rio de janeiro": "RJ",
    "rio grande do norte": "RN",
    "rio grande do sul": "RS",
    "rondonia": "RO",
    "roraima": "RR",
    "santa catarina": "SC",
    "sao paulo": "SP",
    "sergipe": "SE",
    "tocantins": "TO",
}

STATE_LABELS = {
    "AC": "Acre",
    "AL": "Alagoas",
    "AP": "Amap\u00e1",
    "AM": "Amazonas",
    "BA": "Bahia",
    "CE": "Cear\u00e1",
    "DF": "Distrito Federal",
    "ES": "Esp\u00edrito Santo",
    "GO": "Goi\u00e1s",
    "MA": "Maranh\u00e3o",
    "MT": "Mato Grosso",
    "MS": "Mato Grosso do Sul",
    "MG": "Minas Gerais",
    "PA": "Par\u00e1",
    "PB": "Para\u00edba",
    "PR": "Paran\u00e1",
    "PE": "Pernambuco",
    "PI": "Piau\u00ed",
    "RJ": "Rio de Janeiro",
    "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul",
    "RO": "Rond\u00f4nia",
    "RR": "Roraima",
    "SC": "Santa Catarina",
    "SP": "S\u00e3o Paulo",
    "SE": "Sergipe",
    "TO": "Tocantins",
}

KNOWN_CITIES = {
    "campinas": ("Campinas", "SP"),
    "cariacica": ("Cariacica", "ES"),
    "cuiaba": ("Cuiab\u00e1", "MT"),
    "feira de santana": ("Feira de Santana", "BA"),
    "juiz de fora": ("Juiz de Fora", "MG"),
    "paulinia": ("Paul\u00ednia", "SP"),
    "recife": ("Recife", "PE"),
    "sao paulo": ("S\u00e3o Paulo", "SP"),
    "serra talhada": ("Serra Talhada", "PE"),
    "viana": ("Viana", "ES"),
}

NAMED_ROADS = [
    ("rodovia anhanguera", "Rodovia Anhanguera"),
    ("anhanguera", "Rodovia Anhanguera"),
    ("rodovia dos bandeirantes", "Rodovia dos Bandeirantes"),
    ("rodovia bandeirantes", "Rodovia dos Bandeirantes"),
    ("bandeirantes", "Rodovia dos Bandeirantes"),
    ("castello branco", "Rodovia Castello Branco"),
    ("castelo branco", "Rodovia Castello Branco"),
    ("fernao dias", "Rodovia Fern\u00e3o Dias"),
    ("rodoanel", "Rodoanel"),
]

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


def _title_case_location(value: str) -> str:
    small_words = {"da", "de", "do", "das", "dos", "e"}
    words = []
    for word in clean_text(value).strip(" -,.").split():
        lower = word.lower()
        words.append(lower if lower in small_words else word[:1].upper() + word[1:].lower())
    return " ".join(words)


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


def _extract_route(text: str) -> str:
    route = re.search(
        r"\b(?:BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF)[-\s]?\d{2,4}\b",
        text,
        re.IGNORECASE,
    )
    if route:
        return re.sub(r"^([A-Z]{2})\s?(\d)", r"\1-\2", route.group(0).upper())

    normalized = _normalize(text)
    for pattern, label in NAMED_ROADS:
        if re.search(rf"\b{re.escape(pattern)}\b", normalized):
            return label
    return ""


def _extract_direction(text: str) -> str:
    match = re.search(r"\bsentido\s+([a-zA-Z\u00c0-\u017F0-9 -]{3,40})", text, re.IGNORECASE)
    if not match:
        return ""
    direction = clean_text(match.group(1)).strip(" -,.")
    direction = re.split(r"\b(?:apos|ap\u00f3s|com|por|durante|devido)\b", direction, maxsplit=1, flags=re.IGNORECASE)[0].strip(" -,.")
    return f"sentido {direction.lower()}" if direction else ""


def _extract_km(text: str) -> str:
    km = re.search(r"\bkm\s*\d+(?:[,.]\d+)?\b", text, re.IGNORECASE)
    return km.group(0).replace("KM", "km") if km else ""


def _state_from_text(normalized: str) -> tuple[str, str]:
    for state_name, uf in sorted(STATE_NAMES.items(), key=lambda item: len(item[0]), reverse=True):
        if re.search(rf"\b{re.escape(state_name)}\b", normalized):
            return STATE_LABELS[uf], uf
    uf_match = re.search(r"\b(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b", normalized.upper())
    if uf_match:
        uf = uf_match.group(0)
        return STATE_LABELS[uf], uf
    return "", ""


def _city_state_from_text(text: str, normalized: str) -> str:
    explicit = re.search(
        r"\b(?:em|na|no|entre|proximo a|perto de|pr\u00f3ximo a)\s+([A-Z\u00c0-\u017F][\w\u00c0-\u017F' -]{2,80})\s*[,(/-]\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b",
        text,
        re.IGNORECASE,
    )
    if explicit:
        return f"{_title_case_location(explicit.group(1))}/{explicit.group(2).upper()}"

    city_with_state_name = re.search(
        r"\bem\s+([A-Z\u00c0-\u017F][\w\u00c0-\u017F' -]{2,60}),?\s+(?:no|na|do|da)?\s*(?:interior\s+de\s+)?([A-Z\u00c0-\u017F][\w\u00c0-\u017F' ]{3,40})",
        text,
        re.IGNORECASE,
    )
    if city_with_state_name:
        city = _title_case_location(city_with_state_name.group(1))
        state_key = _normalize(city_with_state_name.group(2))
        uf = STATE_NAMES.get(state_key)
        if uf:
            return f"{city}/{uf}"

    for city_key, (city_label, uf) in KNOWN_CITIES.items():
        if re.search(rf"\b{re.escape(city_key)}\b", normalized):
            return f"{city_label}/{uf}"
    return ""


def extract_region(*parts: str) -> str:
    """Identifica cidade/estado, rodovia, trecho ou sentido sem inventar local."""
    text = clean_text(" ".join(str(part or "") for part in parts))
    normalized = _normalize(text)
    if not normalized:
        return UNKNOWN_REGION

    city_state = _city_state_from_text(text, normalized)
    state_label, state_uf = _state_from_text(normalized)
    route = _extract_route(text)
    direction = _extract_direction(text)
    km = _extract_km(text)

    locality = city_state or state_label
    if route and (direction or km) and not city_state:
        detail = direction or km
        return f"{route} - {detail}"
    if city_state:
        return city_state
    if route and state_uf:
        return f"{route} - {state_uf}"
    if state_label:
        return state_label
    if route:
        return route
    if km:
        return km
    if locality:
        return locality
    return UNKNOWN_REGION


def _location_prefix(location: str) -> str:
    if location == UNKNOWN_REGION:
        return ""
    if re.match(r"^(?:BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF)-?\d", location, re.IGNORECASE):
        return f"Na regi\u00e3o da {location}"
    if re.match(r"^km\b", location, re.IGNORECASE):
        return f"No trecho do {location}"
    if "/" in location:
        return f"Na regi\u00e3o de {location}"
    return f"Na regi\u00e3o de {location}"


def build_summary(title: str, summary: str, limit: int = 500) -> str:
    """Monta resumo limpo e preserva local/rodovia quando aparecer."""
    clean_title = clean_text(title)
    clean_summary = clean_text(summary)

    if clean_summary.lower().startswith(clean_title.lower()):
        clean_summary = clean_summary[len(clean_title):].strip(" -\u2013\u2014:.")

    if not clean_summary:
        clean_summary = clean_title

    location = extract_region(clean_title, clean_summary)
    if location != UNKNOWN_REGION and location.lower() not in clean_summary.lower():
        clean_summary = f"{_location_prefix(location)}, {clean_summary[:1].lower()}{clean_summary[1:]}"

    return clean_summary[:limit].rstrip()
