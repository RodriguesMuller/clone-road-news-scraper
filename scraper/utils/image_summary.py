import html
import json
import os
import re
from datetime import datetime

OPENAI_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-4.1-mini"

TRAILING_WORDS = {"de", "do", "da", "dos", "das", "em", "para", "com", "e"}
RELEVANT_PATTERN = re.compile(
    r"acidente|interdi[cç][aã]o|interdita|bloqueio|lentid[aã]o|roubo de carga|saque|"
    r"manifesta[cç][aã]o|protesto|alagamento|tempestade|queda de barreira|tombamento|"
    r"obra|pare-e-siga|congestionamento|chuva forte|perigo|br-\d{2,4}|tesla semi|transporte",
    re.IGNORECASE,
)


def clean_html_text(value: str) -> str:
    text = html.unescape(str(value or "").replace("&nbsp&nbsp", " "))
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;?", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"&amp;?", "&", text, flags=re.IGNORECASE)
    text = re.sub(r"&quot;?", '"', text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()


def _complete_sentence(text: str, limit: int = 280) -> str:
    text = clean_html_text(text)
    if not text:
        return ""
    if len(text) > limit:
        text = text[: limit + 1]
        sentence_end = max(text.rfind(". "), text.rfind("! "), text.rfind("? "))
        if sentence_end > 80:
            text = text[: sentence_end + 1]
        else:
            text = re.sub(r"\s+\S*$", "", text[:limit]).strip()

    text = text.strip(" ,;:")
    text = re.sub(r"\s+", " ", text)
    while text.split(" ")[-1].lower().strip(".,;:") in TRAILING_WORDS and len(text.split(" ")) > 4:
        text = " ".join(text.split(" ")[:-1]).strip(" ,;:")
    if text and text[-1] not in ".!?":
        text = f"{text}."
    return text


def _road(text: str) -> str | None:
    match = re.search(r"\b((?:BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF)[-\s]?\d{2,4})\b", text, re.I)
    return match.group(1).replace(" ", "-").upper() if match else None


def _category(text: str, current: str = "") -> str:
    normalized = clean_html_text(f"{current} {text}").lower()
    if re.search(r"estados unidos|china|europa|internacional|tesla semi", normalized):
        return "Internacional"
    if re.search(r"roubo|saque|assalto.*carga", normalized):
        return "Roubo de carga"
    if re.search(r"manifestacao|manifestação|protesto", normalized):
        return "Manifestação"
    if re.search(r"acidente|colisao|colisão|tombamento|capotamento", normalized):
        return "Acidente"
    if re.search(r"bloqueio|interdicao|interdição|interdita", normalized):
        return "Interdição"
    if re.search(r"lentidao|lentidão|congestionamento|fila", normalized):
        return "Lentidão"
    if re.search(r"tempestade|chuva|inmet|alagamento|barreira|vento", normalized):
        return "Clima"
    if re.search(r"obra|manutencao|manutenção|pare-e-siga", normalized):
        return "Obra"
    if re.search(r"fiscalizacao|fiscalização|prf", normalized):
        return "Fiscalização"
    return current or "Outros"


def build_image_summary_fallback(item: dict) -> dict:
    title = clean_html_text(item.get("title"))
    raw_summary = clean_html_text(item.get("summary"))
    source = clean_html_text(item.get("source"))
    category = _category(f"{title} {raw_summary}", clean_html_text(item.get("category")))
    highway = _road(f"{title} {raw_summary}")
    region = clean_html_text(item.get("region")) or highway or "Não identificado"
    country = "Estados Unidos" if re.search(r"estados unidos|tesla semi", f"{title} {raw_summary}", re.I) else "Brasil"

    base = raw_summary or title
    if category == "Internacional":
        base = f"Em {country}, {base}. O caso tem relevância informativa para o setor, sem impacto operacional direto no Brasil"
    elif region != "Não identificado" and not base.lower().startswith(("na região", "no trecho", "em ")):
        base = f"Na região de {region}, {base}"

    image_summary = _complete_sentence(base)
    risk_level = "Alto" if category in {"Acidente", "Interdição", "Clima", "Roubo de carga", "Manifestação"} else "Baixo"
    relevance = "Alta" if risk_level == "Alto" and country == "Brasil" else "Baixa"
    impact = "Pode impactar viagens, prazos e segurança operacional no trecho." if relevance == "Alta" else "Sem impacto operacional direto identificado para rotas no Brasil."

    return {
        "image_summary": image_summary,
        "region": region,
        "country": country,
        "state": None,
        "city": None,
        "highway": highway,
        "category": category,
        "risk_level": risk_level,
        "operational_relevance": relevance,
        "operational_impact": impact,
    }


def _sanitize_region(region: str | None, source: str, fallback_region: str) -> str:
    """Evita que o campo region receba o nome da fonte ou um pedaco de frase
    que deveria estar no resumo (bug observado: "SC - ND Mais", onde "ND Mais"
    e o nome de um portal de noticias, nao um lugar)."""
    value = clean_html_text(region)
    if not value:
        return fallback_region
    source_clean = clean_html_text(source)
    if source_clean and len(source_clean) > 2 and source_clean.lower() in value.lower():
        return fallback_region
    if len(value) > 60 or re.search(r"\bna regi[aã]o\b|\bno trecho\b", value, re.IGNORECASE):
        return fallback_region
    return value


def should_use_ai_for_image_summary(item: dict) -> bool:
    text = clean_html_text(
        f"{item.get('title', '')} {item.get('summary', '')} {item.get('category', '')} {item.get('source', '')}"
    )
    return bool(RELEVANT_PATTERN.search(text))


def _extract_text(data: dict) -> str:
    if data.get("output_text"):
        return data["output_text"]
    text = ""
    for output in data.get("output", []):
        for content in output.get("content", []):
            text += content.get("text", "")
    return text.strip()


def generate_image_summary(item: dict, api_key: str | None = None, model: str | None = None) -> dict:
    fallback = build_image_summary_fallback(item)
    api_key = (api_key or os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return fallback

    payload = {
        "title": clean_html_text(item.get("title")),
        "raw_summary": clean_html_text(item.get("summary")),
        "content": clean_html_text(item.get("content"))[:1500],
        "source": clean_html_text(item.get("source")),
        "url": clean_html_text(item.get("url")),
        "published_at": clean_html_text(item.get("published_at")),
        "region": clean_html_text(item.get("region")),
        "category": clean_html_text(item.get("category")),
        "risk_level": clean_html_text(item.get("risk_level")),
    }

    prompt = (
        "Você é um analista de inteligência operacional especializado no modal rodoviário de cargas no Brasil.\n"
        "Sua tarefa é analisar uma notícia e gerar um resumo executivo para um card visual do Road News.\n"
        "Regras:\n"
        "- Escreva em português do Brasil.\n"
        "- Gere um resumo claro, profissional e objetivo.\n"
        "- O resumo deve ter 1 a 2 frases completas.\n"
        "- Nunca corte frases no meio.\n"
        "- Sempre inclua localidade/região quando identificável.\n"
        "- Informe se há impacto operacional para transporte rodoviário de cargas.\n"
        "- Se a notícia for internacional e não afetar diretamente o Brasil, deixe isso claro.\n"
        "- Não invente informações.\n"
        "- Se não houver região, use \"Não identificado\".\n"
        "- Responda apenas em JSON válido, sem markdown."
    )

    try:
        import requests

        response = requests.post(
            OPENAI_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model or os.environ.get("OPENAI_IMAGE_MODEL") or os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
                "input": [
                    {"role": "developer", "content": [{"type": "input_text", "text": prompt}]},
                    {"role": "user", "content": [{"type": "input_text", "text": json.dumps(payload, ensure_ascii=False)}]},
                ],
                "max_output_tokens": 700,
            },
            timeout=45,
        )
        response.raise_for_status()
        parsed = json.loads(re.sub(r"^```(?:json)?|```$", "", _extract_text(response.json()), flags=re.I | re.M).strip())
    except Exception:
        return fallback

    result = {**fallback, **{key: parsed.get(key) for key in fallback.keys() if parsed.get(key) is not None}}
    result["region"] = _sanitize_region(result.get("region"), item.get("source"), fallback["region"])
    result["image_summary"] = _complete_sentence(result.get("image_summary"), 280)
    result["ai_processed_at"] = datetime.utcnow().isoformat() + "Z"
    result["ai_model"] = model or os.environ.get("OPENAI_IMAGE_MODEL") or os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)
    return result
