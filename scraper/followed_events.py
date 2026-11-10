"""Atualização por IA dos eventos que os clientes escolheram acompanhar (Central de Evento).

Quem decide O QUE vai para a Central é o cliente (botão "Acompanhar evento" numa notícia). A cada
coleta, este módulo pega as notícias novas que podem ser sobre cada evento acompanhado, pede à IA
para confirmar quais são do mesmo evento e atualizar a situação (resumo, impacto, decisão de
despacho, ações e linha do tempo), e encerra o evento quando uma notícia afirmar a liberação.
"""

from __future__ import annotations

import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg
import requests
from psycopg.types.json import Jsonb

from scraper.event_intelligence import OPENAI_URL, DEFAULT_MODEL, RESOLUTION_PATTERN, _clean, _extract_text, _parse_dt, _parse_json

MAX_EVENTS_PER_RUN = 50
MAX_CANDIDATES = 15
MAX_RELATED = 40
MAX_HISTORY = 20
BEFORE_SEED = timedelta(hours=12)
DISPATCH = ("segurar", "liberar_com_desvio", "liberar_com_atencao")
STATUSES = ("em_andamento", "monitoramento", "encerrado")

# Mesmas regras de api/_followed_events.js (pré-filtro barato antes da IA).
UF = "BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF"
ROAD_CODE = re.compile(rf"\b({UF})[-\s]?(\d{{3}})\b", re.IGNORECASE)
ROAD_NAME = re.compile(r"\b(?:rodovia|via|marginal|avenida|estrada)\s+((?:[A-ZÀ-Ú][\wÀ-ú.'-]+\s?){1,4})")
STOPWORDS = set("""
a o as os de da do das dos e em no na nos nas um uma por para com sem sob sobre entre apos ate desde
que se ao aos ou mais menos muito pouco ja ainda tambem como quando onde nesta neste nessa desse dessa
desta deste esta este essa esse isso hoje ontem amanha madrugada manha tarde noite segunda terca quarta
quinta sexta sabado domingo feira dia dias hora horas semana mes ano km quilometro quilometros
rodovia rodovias estrada estradas via vias pista pistas faixa faixas sentido sentidos trecho trechos
transito trafego fluxo motorista motoristas veiculo veiculos carro carros caminhao caminhoes carreta
carretas onibus moto motos acidente acidentes ocorrencia ocorrencias policia rodoviaria federal estadual
prf der dnit concessionaria interdicao interditada interditado liberada liberado bloqueio bloqueada
bloqueado congestionamento lentidao fila filas apos durante segundo informou diz dizem disse afirma
regiao cidade estado brasil grande sao paulo noticia noticias atualizacao g1 globo
""".split())

RESPONSE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "related_urls": {"type": "array", "items": {"type": "string"}},
        "status": {"type": "string", "enum": list(STATUSES)},
        "summary": {"type": "string"},
        "operational_impact": {"type": "string"},
        "dispatch_decision": {"type": "string", "enum": list(DISPATCH)},
        "recommended_actions": {"type": "array", "items": {"type": "string"}},
        "detour": {"type": "string"},
        "estimated_duration": {"type": "string"},
        "timeline_note": {"type": "string"},
    },
    "required": [
        "related_urls", "status", "summary", "operational_impact", "dispatch_decision",
        "recommended_actions", "detour", "estimated_duration", "timeline_note",
    ],
}


def _normalize(value: Any) -> str:
    text = unicodedata.normalize("NFD", _clean(value))
    return "".join(c for c in text if unicodedata.category(c) != "Mn").lower()


def _stem(word: str) -> str:
    return word[:6] if len(word) > 6 else word


def _news_text(item: dict) -> str:
    return f"{_clean(item.get('title'))} {_clean(item.get('summary'))}"


def _roads(text: str) -> set[str]:
    roads = {f"{m.group(1).upper()}-{m.group(2)}" for m in ROAD_CODE.finditer(text)}
    for m in ROAD_NAME.finditer(text):
        name = re.sub(r"[^a-z\s]", " ", _normalize(m.group(1))).strip()
        if len(name) >= 4:
            roads.add(name)
    return roads


def signature(item: dict) -> dict:
    title = _clean(item.get("title"))
    proper, words = set(), set()
    for index, raw in enumerate(title.split()):
        word = re.sub(r"[^a-z0-9]", "", _normalize(raw))
        if len(word) < 4 or word in STOPWORDS:
            continue
        (proper if index > 0 and raw[:1].isupper() else words).add(_stem(word))
    return {"roads": _roads(_news_text(item)), "proper": proper, "words": words}


def related_score(sig: dict, item: dict) -> int:
    """Semelhança com a notícia de origem; exige âncora (mesma rodovia ou nome próprio em comum)."""
    roads = _roads(_news_text(item))
    terms = {_stem(w) for w in re.split(r"[^a-z0-9]+", _normalize(_news_text(item))) if len(w) >= 4 and w not in STOPWORDS}
    shared_roads = len(sig["roads"] & roads)
    shared_proper = len(sig["proper"] & terms)
    if not shared_roads and not shared_proper:
        return 0
    return shared_roads * 3 + shared_proper * 2 + len(sig["words"] & terms)


def select_candidates(event: dict, news: list[dict], min_score: int = 2) -> list[dict]:
    """Notícias novas que podem ser do evento (a IA confirma). Mais permissivo que a exibição."""
    seed = event.get("seed") or {}
    state = event.get("ai_state") or {}
    known = {seed.get("url")} | {item.get("url") for item in state.get("related", [])} | set(state.get("rejected_urls", []))
    sig = signature(seed)
    picked = []
    for item in news:
        url = _clean(item.get("url"))
        if not url or url in known or related_score(sig, item) < min_score:
            continue
        known.add(url)
        picked.append({
            "title": _clean(item.get("title"))[:300],
            "summary": _clean(item.get("summary"))[:700],
            "url": url,
            "source": _clean(item.get("source"))[:120],
            "published_at": _clean(item.get("published_at") or item.get("created_at")),
        })
    return picked[-MAX_CANDIDATES:]


def _call_openai(event: dict, candidates: list[dict], api_key: str, model: str) -> dict:
    state = event.get("ai_state") or {}
    prompt = (
        "Você acompanha, para o gestor de frota de uma transportadora de cargas, um evento que o próprio cliente "
        "escolheu monitorar. O gestor usa esta análise para decidir se libera os caminhões para rodar até o cliente. "
        "Você recebe a notícia de origem, a situação atual do evento e notícias novas. Tarefas: (1) related_urls: "
        "liste SOMENTE as notícias novas que tratam da MESMA ocorrência (mesmo local, via e fato); notícia de outro "
        "acidente ou de outro trecho não entra. (2) Atualize a situação usando só fatos das notícias: status "
        "em_andamento (impacto atual confirmado), monitoramento (impacto incerto ou parcialmente normalizado) ou "
        "encerrado (somente se uma notícia afirmar explicitamente liberação, retomada, normalização ou fim). "
        "summary: 2 a 3 frases com a situação mais recente. operational_impact: o que muda para caminhões de carga. "
        "dispatch_decision: segurar (não liberar veículos para o trecho), liberar_com_desvio (há alternativa; cite-a "
        "em detour só se a fonte informar) ou liberar_com_atencao (trafegável com risco ou atraso). "
        "recommended_actions: até 4 ações práticas de despacho. estimated_duration: vazio se a fonte não informar. "
        "timeline_note: uma frase com o que mudou nesta atualização (vazio se nada mudou). Não invente fatos, "
        "desvios, prazos nem encerramento. Responda apenas JSON válido."
    )
    payload = {
        "origin_news": event.get("seed") or {},
        "current_state": {key: state.get(key) for key in ("status", "summary", "operational_impact", "dispatch_decision", "estimated_duration")},
        "already_related": [item.get("title") for item in state.get("related", [])][:10],
        "new_news": candidates,
    }
    import json

    response = requests.post(
        OPENAI_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "max_output_tokens": 2500,
            "text": {"format": {"type": "json_schema", "name": "followed_event_update", "strict": True, "schema": RESPONSE_SCHEMA}},
            "input": [
                {"role": "developer", "content": [{"type": "input_text", "text": prompt}]},
                {"role": "user", "content": [{"type": "input_text", "text": json.dumps(payload, ensure_ascii=False)}]},
            ],
        },
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    if data.get("status") == "incomplete":
        reason = (data.get("incomplete_details") or {}).get("reason") or "desconhecido"
        raise RuntimeError(f"resposta da IA incompleta ({reason})")
    return _parse_json(_extract_text(data))


def apply_update(event: dict, result: dict, candidates: list[dict], model: str, now: str) -> dict:
    """Valida a resposta da IA e devolve {"ai_state", "status", "closed_at"} para gravar.

    A IA só pode citar notícias que recebeu, e só encerra com notícia de liberação explícita.
    """
    state = dict(event.get("ai_state") or {})
    by_url = {item["url"]: item for item in candidates}
    related_now = [by_url[url] for url in dict.fromkeys(_clean(u) for u in result.get("related_urls", [])) if url in by_url]
    rejected = [url for url in by_url if url not in {item["url"] for item in related_now}]

    status = _clean(result.get("status")).lower()
    if status not in STATUSES:
        status = state.get("status") or "em_andamento"
    if status == "encerrado":
        evidence = " ".join(f"{i['title']} {i['summary']}" for i in related_now)
        if not RESOLUTION_PATTERN.search(evidence):
            status = state.get("status") if state.get("status") != "encerrado" else "monitoramento"
            status = status or "monitoramento"
    dispatch = _clean(result.get("dispatch_decision")).lower()
    if dispatch not in DISPATCH:
        dispatch = state.get("dispatch_decision") or "segurar"

    history = list(state.get("history") or [])
    note = _clean(result.get("timeline_note"))
    if note or status != state.get("status"):
        history.append({"at": now, "status": status, "note": note or "Situação atualizada com novas notícias."})

    related = sorted(
        related_now + list(state.get("related") or []),
        key=lambda item: _parse_dt(item.get("published_at")) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )[:MAX_RELATED]
    state.update({
        "status": status,
        "summary": _clean(result.get("summary"))[:900] or state.get("summary", ""),
        "operational_impact": _clean(result.get("operational_impact"))[:800] or state.get("operational_impact", ""),
        "dispatch_decision": "liberar_com_atencao" if status == "encerrado" else dispatch,
        "recommended_actions": [_clean(a) for a in result.get("recommended_actions", []) if _clean(a)][:4] or state.get("recommended_actions", []),
        "detour": _clean(result.get("detour"))[:320],
        "estimated_duration": _clean(result.get("estimated_duration"))[:160],
        "related": related,
        "rejected_urls": (list(state.get("rejected_urls") or []) + rejected)[-200:],
        "history": history[-MAX_HISTORY:],
        "analyzed_at": now,
        "model": model,
    })
    closing = status == "encerrado"
    return {"ai_state": state, "status": "closed" if closing else "active", "closed_at": now if closing else None}


def _ensure_columns(cur) -> bool:
    cur.execute("SELECT to_regclass('public.followed_events') IS NOT NULL;")
    if not cur.fetchone()[0]:
        return False
    cur.execute(
        """
        ALTER TABLE public.followed_events ADD COLUMN IF NOT EXISTS ai_state jsonb NOT NULL DEFAULT '{}'::jsonb;
        ALTER TABLE public.followed_events ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;
        """
    )
    return True


def update_followed_events(database_url: str) -> int:
    """Atualiza com IA os eventos ativos acompanhados pelos clientes. Nunca interrompe a coleta."""
    if str(os.environ.get("FOLLOWED_EVENTS_AI_ENABLED", "true")).lower() not in {"1", "true", "yes"}:
        return 0
    api_key = (os.environ.get("OPENAI_EVENT_API_KEY") or os.environ.get("OPENAI_API_KEY") or "").strip()
    model = os.environ.get("OPENAI_EVENT_MODEL") or os.environ.get("OPENAI_MODEL") or DEFAULT_MODEL
    updated = 0
    try:
        with psycopg.connect(database_url, prepare_threshold=None) as conn:
            with conn.cursor() as cur:
                if not _ensure_columns(cur):
                    print("[Acompanhamento] Tabela followed_events ausente (scripts/supabase_followed_events.sql).")
                    return 0
                conn.commit()
                if not api_key:
                    print("[Acompanhamento] OPENAI_API_KEY ausente; eventos acompanhados não atualizados.")
                    return 0
                cur.execute(
                    """
                    SELECT id, title, seed, ai_state, created_at, last_checked_at
                    FROM public.followed_events WHERE status = 'active'
                    ORDER BY last_checked_at NULLS FIRST LIMIT %s;
                    """,
                    (MAX_EVENTS_PER_RUN,),
                )
                rows = cur.fetchall()
            for event_id, title, seed, ai_state, created_at, last_checked_at in rows:
                event = {"id": str(event_id), "title": title, "seed": seed or {}, "ai_state": ai_state or {}}
                seed_dt = _parse_dt((seed or {}).get("published_at")) or created_at
                since = last_checked_at or (seed_dt - BEFORE_SEED)
                now = datetime.now(timezone.utc)
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            SELECT title, summary, url, source, published_at, created_at FROM public.news
                            WHERE created_at >= %s ORDER BY created_at ASC LIMIT 500;
                            """,
                            (since,),
                        )
                        news = [dict(zip(("title", "summary", "url", "source", "published_at", "created_at"), row)) for row in cur.fetchall()]
                        for item in news:
                            item["published_at"] = str(item["published_at"] or "")
                            item["created_at"] = item["created_at"].isoformat() if item["created_at"] else ""
                        candidates = select_candidates(event, news)
                        first_analysis = not event["ai_state"].get("analyzed_at")
                        if candidates or first_analysis:
                            result = _call_openai(event, candidates, api_key, model)
                            update = apply_update(event, result, candidates, model, now.isoformat())
                            cur.execute(
                                """
                                UPDATE public.followed_events
                                SET ai_state = %s, status = %s, closed_at = COALESCE(%s, closed_at), last_checked_at = %s
                                WHERE id = %s AND status = 'active';
                                """,
                                (Jsonb(update["ai_state"]), update["status"], update["closed_at"], now, event["id"]),
                            )
                            updated += 1
                        else:
                            cur.execute("UPDATE public.followed_events SET last_checked_at = %s WHERE id = %s;", (now, event["id"]))
                    conn.commit()
                except Exception as error:  # um evento com falha não impede os demais
                    conn.rollback()
                    detail = str(error).splitlines()[0][:160] if isinstance(error, (RuntimeError, ValueError)) else ""
                    print(f"[Acompanhamento] Falha no evento {event['id']}: {error.__class__.__name__} {detail}".rstrip())
        print(f"[Acompanhamento] {len(rows)} evento(s) ativo(s); {updated} atualizado(s) pela IA.")
        return updated
    except Exception as error:
        print(f"[Acompanhamento] Falha geral: {error.__class__.__name__}")
        return updated
