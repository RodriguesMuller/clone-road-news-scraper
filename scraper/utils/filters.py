import re


def matches_keywords(text: str, keywords: list) -> bool:
    """Retorna True se o texto contiver ao menos uma keyword (case-insensitive)."""
    if not text:
        return False
    text_lower = text.lower()
    return any(kw.lower() in text_lower for kw in keywords)


def clean_text(text: str) -> str:
    """Remove tags HTML e normaliza espaços em branco."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text
