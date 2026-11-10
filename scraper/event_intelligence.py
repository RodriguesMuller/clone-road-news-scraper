"""Triagem e acompanhamento de eventos logísticos graves com apoio de IA."""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any

import psycopg
import requests
from psycopg.types.json import Jsonb


OPENAI_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-4.1-mini"
EVENT_TYPE = "major_logistics_event"
MIN_CONFIDENCE = 0.82
CLASSIFICATION_VERSION = "major-events-v2"

EVENT_RESPONSE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "events": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "is_major_event": {"type": "boolean"},
                    "event_key": {"type": "string"},
                    "title": {"type": "string"},
                    "category": {"type": "string"},
                    "scope": {"type": "string", "enum": ["nacional", "internacional"]},
                    "severity": {"type": "string", "enum": ["critical"]},
                    "status": {"type": "string", "enum": ["em_andamento", "monitoramento", "encerrado"]},
                    "confidence": {"type": "number"},
                    "country": {"type": "string"},
                    "location": {"type": "string"},
                    "affected_infrastructure": {"type": "array", "items": {"type": "string"}},
                    "operational_impact": {"type": "string"},
                    "summary": {"type": "string"},
                    "why_major": {"type": "array", "items": {"type": "string"}},
                    "recommended_actions": {"type": "array", "items": {"type": "string"}},
                    "detour": {"type": "string"},
                    "estimated_duration": {"type": "string"},
                    "timeline_note": {"type": "string"},
                    "evidence": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "title": {"type": "string"},
                                "url": {"type": "string"},
                                "source": {"type": "string"},
                                "published_at": {"type": "string"},
                            },
                            "required": ["title", "url", "source", "published_at"],
                        },
                    },
                },
                "required": [
                    "is_major_event", "event_key", "title", "category", "scope", "severity", "status",
                    "confidence", "country", "location", "affected_infrastructure", "operational_impact",
                    "summary", "why_major", "recommended_actions", "detour", "estimated_duration",
                    "timeline_note", "evidence",
                ],
            },
        },
    },
    "required": ["events"],
}

LOGISTICS_PATTERN = re.compile(
    r"caminh(?:ao|oes|oneiro|oneiros)|transport(?:e|ador)|rodovi|estrada|\bbr[-\s]?\d+|"
    r"porto|terminal|acesso|corredor|fronteira|aduana|carga|frete|logistic|supply chain|"
    r"truck|highway|road|port|terminal|cargo|freight|shipping|vessel|tanker|maritime|"
    r"estreito|strait|canal|red sea|mar vermelho|bab el.mandeb|ormuz|hormuz|suez|panama",
    re.IGNORECASE,
)
SEVERE_PATTERN = re.compile(
    r"paralis|greve|bloqueio total|interdi[cç][aã]o total|fechamento|opera[cç][aã]o suspensa|"
    r"colapso|queda de ponte|explos[aã]o|ataque|conflito|guerra|desastre|estado de emerg|"
    r"sem previs[aã]o|critical|strike|blockade|shutdown|closed|closure|collapse|attack|war|"
    r"disrupt|suspend|halted|emergency",
    re.IGNORECASE,
)
IMPACT_PATTERN = re.compile(
    r"bloque|interdit|fechad|suspens|parad|fila|congestion|desvio|atras|interromp|"
    r"sem acesso|inoperante|restri[cç][aã]o|reten[cç][aã]o|desabastec|"
    r"blocked|closed|closure|queue|delay|rerout|disrupt|halted|suspended|restricted|"
    r"supply shortage",
    re.IGNORECASE,
)
RESOLUTION_PATTERN = re.compile(
    r"encerr|finaliz|liberad|desbloquead|normaliz|retomad|reabert|fim da greve|"
    r"acordo firmado|opera[cç][aã]o restabelecida|tr[aâ]nsito normal|"
    r"reopened|resolved|ended|cleared|resumed|operations restored|traffic restored",
    re.IGNORECASE,
)
UNRELATED_STRIKE_PATTERN = re.compile(
    r"professor|educa[cç][aã]o|universit|enfermeir|m[ée]dic|banc[áa]ri|servidor p[úu]blico|"
    r"judici[áa]rio|artista|ator|atriz|roteirista|jogador|futebol",
    re.IGNORECASE,
)
STRATEGIC_INFRA_PATTERN = re.compile(
    r"estreito de ormuz|strait of hormuz|canal de suez|suez canal|mar vermelho|red sea|"
    r"bab el.mandeb|canal do panam[áa]|panama canal|porto de santos|port of santos|"
    r"porto de paranagu[áa]|porto de itaja[íi]|porto de rio grande",
    re.IGNORECASE,
)


# Impacto só em transporte de passageiros ("paralisação de linhas de ônibus") não é gravidade para
# frota de carga: o trecho é removido antes de medir gravidade.
PASSENGER_CONTEXT_PATTERN = re.compile(
    r"(?:paralis\w*|suspens\w*|interromp\w*|interrup\w*|greve|desvio)\s+(?:d[aeo]s?\s+|em\s+)?(?:\S+\s+){0,3}?"
    r"(?:linhas?\s+de\s+[oô]nibus|linhas\b|[oô]nibus|metr[oô]|trens?|transporte p[uú]blico|passageiros)",
    re.IGNORECASE,
)
# Acidente pontual com interdição parcial é ocorrência comum (Alertas), não evento grave da Central.
ROUTINE_ACCIDENT_PATTERN = re.compile(r"tomb|capot|colis|batida|acidente|engavet|incendi", re.IGNORECASE)
PARTIAL_PATTERN = re.compile(r"parcial|uma das faixas|duas faixas|\bfaixas?\b|acostamento|pare e siga|meia pista", re.IGNORECASE)
TOTAL_PATTERN = re.compile(
    r"bloqueio total|interdi[cç][aã]o total|totalmente (?:bloquead|interditad|fechad)|nos dois sentidos|"
    r"ambos os sentidos|sem previs[aã]o|por tempo indeterminado|queda de ponte|desabamento|cratera",
    re.IGNORECASE,
)


def _clean(value: Any) -> str:
    text = html.unescape(str(value or "").replace("&nbsp&nbsp", " "))
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _normalize(value: Any) -> str:
    text = unicodedata.normalize("NFD", _clean(value))
    return "".join(char for char in text if unicodedata.category(char) != "Mn").lower()


def _event_text(item: dict) -> str:
    return _clean(
        f"{item.get('title', '')} {item.get('summary', '')} "
        f"{item.get('category', '')} {item.get('source', '')}"
    )


def candidate_reasons(item: dict) -> list[str]:
    """Aplica a trava determinística antes de enviar qualquer notícia para a IA."""
    text = _event_text(item)
    cargo_text = PASSENGER_CONTEXT_PATTERN.sub(" ", text)
    logistics = bool(LOGISTICS_PATTERN.search(text))
    severe = bool(SEVERE_PATTERN.search(cargo_text))
    impact = bool(IMPACT_PATTERN.search(cargo_text))
    strategic = bool(STRATEGIC_INFRA_PATTERN.search(text))
    resolution = bool(RESOLUTION_PATTERN.search(text))
    unrelated = bool(UNRELATED_STRIKE_PATTERN.search(text))
    routine_accident = (
        bool(ROUTINE_ACCIDENT_PATTERN.search(text))
        and bool(PARTIAL_PATTERN.search(text))
        and not TOTAL_PATTERN.search(text)
    )

    if unrelated and not (logistics and impact):
        return []
    if routine_accident and not strategic:
        return []
    if strategic and (severe or impact or resolution):
        return [name for name, enabled in (
            ("infraestrutura estratégica", strategic),
            ("gravidade", severe),
            ("impacto operacional", impact),
            ("possível encerramento", resolution),
        ) if enabled]
    if logistics and impact and (severe or resolution):
        return [name for name, enabled in (
            ("contexto logístico", logistics),
            ("gravidade", severe),
            ("impacto operacional", impact),
            ("possível encerramento", resolution),
        ) if enabled]
    return []


def select_event_candidates(items: list[dict], limit: int = 40) -> list[dict]:
    candidates: list[dict] = []
    seen: set[str] = set()
    for item in items:
        reasons = candidate_reasons(item)
        url = _clean(item.get("url"))
        key = url or hashlib.sha256(_event_text(item).encode("utf-8")).hexdigest()
        if not reasons or key in seen:
            continue
        seen.add(key)
        candidates.append({
            "title": _clean(item.get("title"))[:320],
            "summary": _clean(item.get("summary"))[:900],
            "source": _clean(item.get("source"))[:180],
            "url": url,
            "published_at": _clean(item.get("published_at") or item.get("scraped_at")),
            "category": _clean(item.get("category"))[:120],
            "screening_reasons": reasons,
        })
    return candidates[:limit]


def _extract_text(data: dict) -> str:
    if data.get("output_text"):
        return str(data["output_text"])
    return "".join(
        str(content.get("text", ""))
        for output in data.get("output", [])
        for content in output.get("content", [])
    ).strip()


def _parse_json(text: str) -> dict:
    raw = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.I | re.M).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start >= 0 and end > start:
            return json.loads(raw[start : end + 1])
        raise


def _ensure_tables(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS public.platform_events (
          id uuid primary key default gen_random_uuid(),
          event_type text not null,
          severity text not null default 'info',
          status text not null default 'open',
          message text not null,
          metadata jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          resolved_at timestamptz
        );
        CREATE INDEX IF NOT EXISTS platform_events_created_idx
          ON public.platform_events(created_at desc);
        CREATE INDEX IF NOT EXISTS platform_events_major_status_idx
          ON public.platform_events(event_type, status, created_at desc);

        CREATE TABLE IF NOT EXISTS public.event_intelligence_runs (
          fingerprint text primary key,
          analyzed_at timestamptz not null default now(),
          model text,
          candidate_count integer not null default 0,
          event_count integer not null default 0
        );

        ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.event_intelligence_runs ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON public.event_intelligence_runs FROM anon, authenticated;
        """
    )


def _load_current_events(cur) -> list[dict]:
    cur.execute(
        """
        SELECT id, message, status, metadata, created_at, resolved_at
        FROM public.platform_events
        WHERE event_type = %s
          AND (status = 'open' OR resolved_at >= now() - interval '7 days'
               OR (metadata ->> 'operational_status' = 'descartado' AND resolved_at >= now() - interval '30 days'))
        ORDER BY created_at DESC
        LIMIT 20;
        """,
        (EVENT_TYPE,),
    )
    events = []
    for event_id, message, status, metadata, created_at, resolved_at in cur.fetchall():
        events.append({
            "id": str(event_id),
            "message": message,
            "status": status,
            "metadata": metadata if isinstance(metadata, dict) else {},
            "created_at": created_at.isoformat() if created_at else "",
            "resolved_at": resolved_at.isoformat() if resolved_at else "",
        })
    return events


def _fingerprint(candidates: list[dict], model: str) -> str:
    state = {
        "classification_version": CLASSIFICATION_VERSION,
        "model": model,
        "candidates": sorted(
            (item["url"], item["title"], item["summary"], item["published_at"])
            for item in candidates
        ),
    }
    payload = json.dumps(state, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _already_analyzed(cur, fingerprint: str) -> bool:
    cur.execute(
        "SELECT 1 FROM public.event_intelligence_runs WHERE fingerprint = %s LIMIT 1;",
        (fingerprint,),
    )
    return cur.fetchone() is not None


def _call_openai(candidates: list[dict], current_events: list[dict], api_key: str, model: str) -> dict:
    current_context = [{
        "event_key": event["metadata"].get("event_key"),
        "title": event["message"],
        "status": event["metadata"].get("operational_status") or event["status"],
        "location": event["metadata"].get("location"),
        "affected_infrastructure": event["metadata"].get("affected_infrastructure"),
        "last_update_at": event["metadata"].get("last_update_at"),
    } for event in current_events]

    prompt = (
        "Você é o motor de inteligência de eventos graves do Road News. Analise somente as notícias fornecidas e "
        "agrupe as que descrevem a mesma ocorrência logística. Publique apenas eventos CRÍTICOS com impacto concreto "
        "sobre transporte rodoviário de cargas, portos, fronteiras, corredores logísticos ou infraestrutura marítima "
        "estratégica. Uma palavra isolada como 'greve' não basta. Greves de categorias sem impacto logístico direto devem "
        "ser ignoradas. NÃO são eventos graves: acidente pontual (tombamento, colisão, incêndio de veículo) com "
        "interdição parcial ou de faixas, congestionamento comum, e impactos só em ônibus, metrô ou transporte de "
        "passageiros — essas ocorrências já aparecem em Alertas. Evento grave é o que obriga o gestor de frota de carga "
        "a replanejar rotas ou janelas: bloqueio total ou prolongado de corredor rodoviário, greve ou paralisação de "
        "caminhoneiros, porto, terminal ou fronteira parados, queda de ponte, desastre natural que fecha rodovias. "
        "Eventos internacionais podem entrar quando afetarem rotas, portos, estreitos, canais, frete, "
        "combustível ou cadeia de suprimentos, incluindo Estreito de Ormuz, Suez, Mar Vermelho e Canal do Panamá. "
        "Não invente fatos, locais, desvios, duração ou encerramento. Preserve event_key de evento existente quando a "
        "notícia for continuação dele. Use status em_andamento somente com evidência atual de impacto; monitoramento quando "
        "o impacto grave está confirmado mas a situação atual é incerta; encerrado somente quando uma notícia afirmar "
        "explicitamente liberação, retomada, normalização ou fim. Retorne apenas JSON válido com a chave events. Cada item "
        "deve conter: is_major_event boolean, event_key string, title string, category string, scope nacional ou internacional, "
        "severity critical, status em_andamento ou monitoramento ou encerrado, confidence número 0 a 1, country string, "
        "location string, affected_infrastructure array, operational_impact string, summary string, why_major array, "
        "recommended_actions array, detour string vazio se não confirmado, estimated_duration string vazio se não confirmada, "
        "timeline_note string e evidence array com title, url, source e published_at copiados das notícias fornecidas."
    )
    response = requests.post(
        OPENAI_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "max_output_tokens": 3000,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "major_logistics_events",
                    "strict": True,
                    "schema": EVENT_RESPONSE_SCHEMA,
                }
            },
            "input": [
                {"role": "developer", "content": [{"type": "input_text", "text": prompt}]},
                {"role": "user", "content": [{
                    "type": "input_text",
                    "text": json.dumps({
                        "current_events": current_context,
                        "candidate_news": candidates,
                    }, ensure_ascii=False),
                }]},
            ],
        },
        timeout=60,
    )
    response.raise_for_status()
    return _parse_json(_extract_text(response.json()))


def _slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", _normalize(value)).strip("-")
    return normalized[:100]


def _valid_events(data: dict, candidates: list[dict], current_events: list[dict]) -> list[dict]:
    candidate_by_url = {item["url"]: item for item in candidates if item.get("url")}
    existing_keys = {
        event["metadata"].get("event_key")
        for event in current_events
        if event["metadata"].get("event_key")
    }
    valid: list[dict] = []

    for event in data.get("events", []):
        try:
            confidence = float(event.get("confidence", 0))
        except (TypeError, ValueError):
            confidence = 0
        evidence = [
            candidate_by_url.get(_clean(item.get("url")))
            for item in event.get("evidence", [])
            if isinstance(item, dict)
        ]
        evidence = [item for item in evidence if item]
        evidence_text = " ".join(_event_text(item) for item in evidence)
        status = _clean(event.get("status")).lower()
        infrastructure = [_clean(value) for value in event.get("affected_infrastructure", []) if _clean(value)]
        impact = _clean(event.get("operational_impact"))

        if event.get("is_major_event") is not True:
            continue
        if _clean(event.get("severity")).lower() != "critical" or confidence < MIN_CONFIDENCE:
            continue
        if status not in {"em_andamento", "monitoramento", "encerrado"}:
            continue
        if not evidence or not infrastructure or len(impact) < 20:
            continue
        if not any(candidate_reasons(item) for item in evidence):
            continue
        if status == "encerrado" and not RESOLUTION_PATTERN.search(evidence_text):
            continue

        event_key = _slug(event.get("event_key"))
        if not event_key or (event_key not in existing_keys and len(event_key) < 8):
            event_key = _slug(
                f"{event.get('category')} {event.get('location')} {' '.join(infrastructure)}"
            )
        if not event_key:
            continue

        valid.append({
            "event_key": event_key,
            "title": _clean(event.get("title"))[:220],
            "category": _clean(event.get("category"))[:80] or "Evento logístico",
            "scope": "internacional" if _clean(event.get("scope")).lower() == "internacional" else "nacional",
            "severity": "critical",
            "operational_status": status,
            "confidence": min(1.0, max(0.0, confidence)),
            "country": _clean(event.get("country"))[:100],
            "location": _clean(event.get("location"))[:180],
            "affected_infrastructure": infrastructure[:8],
            "operational_impact": impact[:800],
            "summary": _clean(event.get("summary"))[:900],
            "why_major": [_clean(value) for value in event.get("why_major", []) if _clean(value)][:5],
            "recommended_actions": [_clean(value) for value in event.get("recommended_actions", []) if _clean(value)][:5],
            "detour": _clean(event.get("detour"))[:320],
            "estimated_duration": _clean(event.get("estimated_duration"))[:160],
            "timeline_note": _clean(event.get("timeline_note"))[:420],
            "evidence": [{
                "title": item["title"],
                "url": item["url"],
                "source": item["source"],
                "published_at": item["published_at"],
            } for item in evidence[:8]],
        })
    return valid


def _confidence_label(value: float) -> str:
    if value >= 0.92:
        return "Muito alta"
    if value >= MIN_CONFIDENCE:
        return "Alta"
    return "Moderada"


def _parse_dt(value: Any) -> datetime | None:
    text = _clean(value)
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            from email.utils import parsedate_to_datetime

            parsed = parsedate_to_datetime(text)
        except (TypeError, ValueError):
            return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def merge_event(event: dict, previous: dict | None, model: str, now: str) -> dict | None:
    """Combina a classificação nova com o evento já publicado.

    Devolve {"metadata", "db_status", "resolved_at"} ou None quando a atualização deve ser ignorada:
    um evento encerrado por gestor só é reaberto pela IA com notícia publicada DEPOIS do encerramento.
    """
    previous_meta = previous["metadata"] if previous else {}
    previous_status = previous_meta.get("operational_status")
    new_status = event["operational_status"]
    # Descartado pelo gestor (não era evento grave): a IA nunca o republica.
    if previous_status == "descartado":
        return None
    closing = new_status == "encerrado"

    if previous_status == "encerrado" and not closing and previous_meta.get("status_confirmed_by") == "platform_manager":
        closed_at = _parse_dt(previous_meta.get("last_update_at"))
        newest = max((d for d in (_parse_dt(i.get("published_at")) for i in event["evidence"]) if d), default=None)
        if not closed_at or not newest or newest <= closed_at:
            return None

    history = list(previous_meta.get("history") or [])[-10:]
    timeline_note = event["timeline_note"] or (
        "Evento encerrado com base em atualização explícita da fonte."
        if closing
        else "Status operacional atualizado com novas evidências."
    )
    if not history or history[-1].get("note") != timeline_note or previous_status != new_status:
        history.append({"at": now, "status": new_status, "note": timeline_note})

    # Início = notícia mais antiga (por data real, não pela ordem alfabética do texto).
    evidence_dates = [(d, item["published_at"]) for item in event["evidence"] if (d := _parse_dt(item.get("published_at")))]
    metadata = {
        **previous_meta,
        **event,
        "confidence_label": _confidence_label(event["confidence"]),
        "started_at": previous_meta.get("started_at") or (min(evidence_dates)[1] if evidence_dates else now),
        "last_update_at": now,
        "history": history[-12:],
        "classification_model": model,
        "classification_version": CLASSIFICATION_VERSION,
        "status_confirmed_by": "event_intelligence",
    }
    # Já encerrado continua com a data original de encerramento (não "anda" a cada coleta).
    already_closed = previous_status == "encerrado" and bool(previous and previous.get("resolved_at"))
    resolved_at = None
    if closing:
        resolved_at = previous["resolved_at"] if already_closed else now
        metadata["ended_at"] = metadata.get("ended_at") if already_closed and metadata.get("ended_at") else resolved_at
    else:
        metadata.pop("ended_at", None)
        metadata.pop("ended_on", None)
    return {"metadata": metadata, "db_status": "resolved" if closing else "open", "resolved_at": resolved_at}


def _upsert_events(cur, events: list[dict], current_events: list[dict], model: str) -> int:
    existing = {
        event["metadata"].get("event_key"): event
        for event in current_events
        if event["metadata"].get("event_key")
    }
    now = datetime.now(timezone.utc).isoformat()
    changed = 0

    for event in events:
        previous = existing.get(event["event_key"])
        merged = merge_event(event, previous, model, now)
        if not merged:
            print(f"[Eventos] '{event['title'][:60]}' mantido como o gestor definiu (encerrado ou descartado).")
            continue
        metadata, db_status, resolved_at = merged["metadata"], merged["db_status"], merged["resolved_at"]

        if previous:
            cur.execute(
                """
                UPDATE public.platform_events
                SET severity = 'critical', status = %s, message = %s,
                    metadata = %s, resolved_at = %s
                WHERE id = %s;
                """,
                (db_status, event["title"], Jsonb(metadata), resolved_at, previous["id"]),
            )
        else:
            cur.execute(
                """
                INSERT INTO public.platform_events
                  (event_type, severity, status, message, metadata, resolved_at)
                VALUES (%s, 'critical', %s, %s, %s, %s);
                """,
                (EVENT_TYPE, db_status, event["title"], Jsonb(metadata), resolved_at),
            )
        changed += 1
    return changed


def process_major_events(news_items: list[dict], database_url: str) -> int:
    """Analisa candidatos em lote e atualiza somente eventos críticos validados."""
    if not str(os.environ.get("EVENT_INTELLIGENCE_ENABLED", "false")).lower() in {"1", "true", "yes"}:
        return 0
    api_key = (os.environ.get("OPENAI_EVENT_API_KEY") or os.environ.get("OPENAI_API_KEY") or "").strip()
    candidates = select_event_candidates(news_items)
    model = os.environ.get("OPENAI_EVENT_MODEL") or os.environ.get("OPENAI_MODEL") or DEFAULT_MODEL
    try:
        with psycopg.connect(database_url, prepare_threshold=None) as conn:
            with conn.cursor() as cur:
                _ensure_tables(cur)
                # A estrutura fica pronta mesmo quando a chave da IA ainda não
                # foi configurada no executor de produção.
                conn.commit()
                if not api_key:
                    print("[Eventos] OPENAI_API_KEY ausente; triagem inteligente não executada.")
                    return 0
                if not candidates:
                    print("[Eventos] Nenhuma notícia atingiu os critérios mínimos de gravidade.")
                    return 0
                current_events = _load_current_events(cur)
                fingerprint = _fingerprint(candidates, model)
                if _already_analyzed(cur, fingerprint):
                    print("[Eventos] Notícias sem alteração; análise anterior reutilizada.")
                    return 0

                result = _call_openai(candidates, current_events, api_key, model)
                events = _valid_events(result, candidates, current_events)
                changed = _upsert_events(cur, events, current_events, model)
                cur.execute(
                    """
                    INSERT INTO public.event_intelligence_runs
                      (fingerprint, model, candidate_count, event_count)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (fingerprint) DO NOTHING;
                    """,
                    (fingerprint, model, len(candidates), len(events)),
                )
            conn.commit()
        print(f"[Eventos] {len(candidates)} candidato(s) analisado(s); {changed} evento(s) atualizado(s).")
        return changed
    except Exception as error:
        # A inteligência de eventos não pode interromper a coleta principal.
        print(f"[Eventos] Falha na triagem inteligente: {error.__class__.__name__}")
        return 0
