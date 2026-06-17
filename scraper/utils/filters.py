import re


def matches_keywords(text: str, keywords: list) -> bool:
    """Decide se uma notícia é relevante: True se o texto contiver ao menos uma keyword.

    ┌─────────────────────────────────────────────────────────────────────────┐
    │ ONDE AJUSTAR AS KEYWORDS: você NÃO mexe aqui — a lista de palavras fica   │
    │ em  config/sources.yaml  (seção "keywords"). Este é só o motor que a      │
    │ aplica em G1, CNN e Band. (O INMET não passa por aqui.)                   │
    └─────────────────────────────────────────────────────────────────────────┘

    Regra do casamento (igual à documentada no sources.yaml):
      • case-insensitive: "Acidente" == "acidente";
      • por substring: "morto" casa com "mortos", "amortecedor"... — por isso
        termos genéricos geram falsos positivos.
    """
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
