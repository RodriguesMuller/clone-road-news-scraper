import re

# Conectivos ignorados ao casar keywords de várias palavras (ex.: em
# "incêndio em caminhão", só "incêndio" e "caminhão" precisam aparecer).
_STOPWORDS = {
    "de", "da", "do", "das", "dos", "e", "em", "a", "o", "as", "os",
    "na", "no", "nas", "nos", "com", "para", "por", "ao", "à", "um", "uma",
}


def matches_keywords(text: str, keywords: list) -> bool:
    """Decide se uma notícia é relevante: True se o texto contiver ao menos uma keyword.

    ┌─────────────────────────────────────────────────────────────────────────┐
    │ ONDE AJUSTAR AS KEYWORDS: você NÃO mexe aqui — a lista de palavras fica   │
    │ em  config/sources.yaml  (seção "keywords"). Este é só o motor que a      │
    │ aplica em G1, CNN e Band. (O INMET não passa por aqui.)                   │
    └─────────────────────────────────────────────────────────────────────────┘

    Regra do casamento (igual à documentada no sources.yaml):
      • case-insensitive: "Acidente" == "acidente";
      • palavra inteira: "ferido" NÃO casa com "ferimentos";
      • keyword com VÁRIAS palavras (ex.: "incêndio em caminhão") casa quando
        TODAS as suas palavras aparecem no texto (em qualquer posição), sem
        exigir a frase exata;
      • keyword com pontuação (ex.: "BR-") casa por substring.
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
        # aplicamos limites de palavra. Para keywords de VÁRIAS palavras,
        # casamos quando TODAS as palavras aparecem (em qualquer posição) —
        # assim "incêndio em caminhão" casa com um título que tenha "incêndio"
        # e "caminhão", sem exigir a frase exata.
        if re.match(r"^[\w\s]+$", kw, re.UNICODE):
            palavras = [p for p in kw.split() if p.lower() not in _STOPWORDS]
            if not palavras:  # keyword só de conectivos (raro): usa todas
                palavras = kw.split()
            if all(
                re.search(rf"(?<!\w){re.escape(p)}(?!\w)", text, flags=re.IGNORECASE)
                for p in palavras
            ):
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
