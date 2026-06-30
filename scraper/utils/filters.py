import html
import re

# Conectivos ignorados ao casar keywords de varias palavras.
_STOPWORDS = {
    "de", "da", "do", "das", "dos", "e", "em", "a", "o", "as", "os",
    "na", "no", "nas", "nos", "com", "para", "por", "ao", "à", "um", "uma",
}


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

    city_state = re.search(
        r"\b(?:em|na|no|entre|próximo a|perto de)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç' -]{2,80}(?:,\s*[A-Z]{2})?)",
        text,
    )
    if city_state:
        return city_state.group(1).strip(" -,.")

    return ""


def _location_prefix(location: str) -> str:
    if re.match(r"^(?:BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF)-?\d", location, re.IGNORECASE):
        return f"Na região da {location}"
    if re.match(r"^km\b", location, re.IGNORECASE):
        return f"No trecho do {location}"
    return f"Na região de {location}"


def build_summary(title: str, summary: str, limit: int = 500) -> str:
    """Monta resumo limpo e preserva local/rodovia quando aparecer."""
    clean_title = clean_text(title)
    clean_summary = clean_text(summary)

    if clean_summary.lower().startswith(clean_title.lower()):
        clean_summary = clean_summary[len(clean_title):].strip(" -–—:.")

    if not clean_summary:
        clean_summary = clean_title

    location = _location_from_text(f"{clean_title} {clean_summary}")
    if location and location.lower() not in clean_summary.lower():
        clean_summary = f"{_location_prefix(location)}, {clean_summary[:1].lower()}{clean_summary[1:]}"

    return clean_summary[:limit].rstrip()
