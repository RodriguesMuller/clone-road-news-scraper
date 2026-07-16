"""Publica o evento encerrado do Porto de Santos com evidências verificadas."""

from __future__ import annotations

import os

import psycopg
from psycopg.types.json import Jsonb


EVENT_KEY = "paralisacao-caminhoneiros-porto-santos-mp-frete-2026"
CONFIRMED_AT = "2026-07-15T09:45:00-03:00"

EVENT_METADATA = {
    "event_key": EVENT_KEY,
    "title": "Paralisação de caminhoneiros no Porto de Santos",
    "category": "Paralisação de caminhoneiros",
    "scope": "nacional",
    "severity": "critical",
    "operational_status": "encerrado",
    "confidence": 0.98,
    "confidence_label": "Muito alta",
    "country": "Brasil",
    "location": "Santos/SP - região da Alemoa",
    "affected_infrastructure": [
        "Porto de Santos",
        "Acessos rodoviários da Alemoa",
        "Viaduto Paulo Bonavides",
    ],
    "operational_impact": (
        "A mobilização de dois dias nos acessos ao Porto de Santos afetou o fluxo de caminhões e parte das "
        "operações portuárias. Em 14/07, seis dos 36 navios atracados ficaram sem operar e um registrou atraso; "
        "não houve bloqueio total das vias do complexo portuário."
    ),
    "summary": (
        "Caminhoneiros autônomos iniciaram a mobilização em 13/07/2026 para cobrar a votação da MP 1.343/2026, "
        "conhecida como MP do Frete. O movimento foi encerrado na noite de 14/07 após a aprovação da medida, "
        "com expectativa de normalização gradual dos acessos e das operações de carga."
    ),
    "why_major": [
        "Ocorrência em acesso ao maior complexo portuário do país",
        "Reflexos confirmados no fluxo de caminhões e nas operações de navios",
        "Potencial de afetar janelas de coleta, entrega e embarque de cargas",
    ],
    "recommended_actions": [
        "Confirmar com os terminais a normalização das janelas de recebimento e retirada de cargas",
        "Monitorar filas residuais na Alemoa e nos pátios reguladores antes de liberar novos veículos",
        "Revalidar agendamentos impactados nos dias 13 e 14 de julho",
        "Acompanhar a sanção e a regulamentação da MP 1.343/2026 pela ANTT",
    ],
    "detour": "",
    "estimated_duration": "2 dias (13 e 14 de julho de 2026)",
    "started_on": "2026-07-13",
    "ended_on": "2026-07-14",
    "last_update_at": CONFIRMED_AT,
    "timeline_note": "Encerramento confirmado após a aprovação da MP do Frete.",
    "history": [
        {
            "on": "2026-07-13",
            "status": "em_andamento",
            "note": (
                "Mobilização iniciada nos acessos ao Porto de Santos, concentrada na região da Alemoa, para "
                "pressionar pela votação da MP do Frete."
            ),
        },
        {
            "at": "2026-07-14T17:00:00-03:00",
            "status": "em_andamento",
            "note": (
                "A Autoridade Portuária informou seis dos 36 navios atracados sem operar e um navio com atraso, "
                "sem bloqueio total das vias do complexo."
            ),
        },
        {
            "on": "2026-07-14",
            "status": "encerrado",
            "note": (
                "A paralisação foi encerrada à noite após a aprovação da MP 1.343/2026, iniciando a normalização "
                "gradual dos acessos e das operações."
            ),
        },
        {
            "at": CONFIRMED_AT,
            "status": "encerrado",
            "note": "Fontes locais confirmaram o fim do movimento ocorrido na noite anterior.",
        },
    ],
    "evidence": [
        {
            "title": "Paralisação em Santos pela MP do Frete chega ao segundo dia",
            "url": "https://www.revistacaminhoneiro.com.br/paralisacao-em-santos-pela-mp-do-frete-chega-ao-segundo-dia",
            "source": "Revista Caminhoneiro",
            "published_at": "2026-07-14T10:31:00-03:00",
        },
        {
            "title": "Paralisação de caminhoneiros deixa 6 navios parados no Porto de Santos",
            "url": "https://www.poder360.com.br/poder-infra/paralisacao-de-caminhoneiros-deixa-6-navios-parados-no-porto-de-santos/",
            "source": "Poder360",
            "published_at": "2026-07-14T17:50:00-03:00",
        },
        {
            "title": "Paralisação de caminhoneiros marca protesto, mas Porto de Santos mantém operações",
            "url": "https://www.bnewssaopaulo.com.br/noticias/politica/paralisacao-de-caminhoneiros-marca-protesto-mas-porto-de-santos-mantem-operacoes.html",
            "source": "BNews São Paulo",
            "published_at": "2026-07-13T20:50:00-03:00",
        },
        {
            "title": "Após dois dias, caminhoneiros encerram greve no Porto de Santos",
            "url": "https://costanorte.com.br/amp/geral/apos-dois-dias-caminhoneiros-encerram-greve-no-porto-de-santos.html",
            "source": "Costa Norte",
            "published_at": CONFIRMED_AT,
        },
    ],
    "classification_model": "curadoria operacional",
    "classification_version": "curated-major-event-v1",
    "status_confirmed_by": "fontes verificadas",
}


def publish_event(database_url: str) -> bool:
    with psycopg.connect(database_url, prepare_threshold=None) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s));", (EVENT_KEY,))
            cursor.execute(
                """
                SELECT id
                FROM public.platform_events
                WHERE event_type = 'major_logistics_event'
                  AND metadata ->> 'event_key' = %s
                LIMIT 1;
                """,
                (EVENT_KEY,),
            )
            if cursor.fetchone():
                print("[Eventos] Evento do Porto de Santos já está publicado.")
                return False

            cursor.execute(
                """
                INSERT INTO public.platform_events
                  (event_type, severity, status, message, metadata, resolved_at)
                VALUES
                  ('major_logistics_event', 'critical', 'resolved', %s, %s, %s::timestamptz);
                """,
                (EVENT_METADATA["title"], Jsonb(EVENT_METADATA), CONFIRMED_AT),
            )
        connection.commit()
    print("[Eventos] Evento encerrado do Porto de Santos publicado.")
    return True


if __name__ == "__main__":
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL não configurada.")
    publish_event(database_url)
