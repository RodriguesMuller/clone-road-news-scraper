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
    if not text or not keywords:
        return False

    # Para evitar falsos positivos (ex: 'ferido' casando com 'ferimentos'),
    # usamos correspondência por palavra inteira para keywords compostas apenas
    # por caracteres de palavra/espaço (letras, dígitos, underscore, unicode).
    # Para keywords que contêm pontuação relevante (ex: 'BR-'), preservamos
    # a busca por substring para manter o comportamento esperado.
    for kw in keywords:
        if not kw:
            continue
        kw = kw.strip()
        if not kw:
            continue

        # se a keyword contém apenas caracteres de palavra ou espaços,
        # aplicamos limites de palavra para casar apenas termos exatos
        if re.match(r"^[\w\s]+$", kw, re.UNICODE):
            pattern = rf"(?<!\w){re.escape(kw)}(?!\w)"
            if re.search(pattern, text, flags=re.IGNORECASE):
                return True
        else:
            # caso contrário (ex.: 'BR-'), mantemos substring
            if kw.lower() in text.lower():
                return True

    return False


def clean_text(text: str) -> str:
    """Remove tags HTML e normaliza espaços em branco."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text
