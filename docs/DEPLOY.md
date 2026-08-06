# Deploy — Road News

> Mantido por `tech-docs-agent`. Dono: `devops-engineer`. Ver [`docs/AGENTS.md`](AGENTS.md) e [`../VERCEL_DEPLOY.md`](../VERCEL_DEPLOY.md) para o passo a passo original de setup na Vercel.

Infraestrutura real: **só Vercel + GitHub Actions**. Sem Docker, Coolify, Railway ou Azure.

## Vercel (frontend + API)

- Serve `public/**` como site estático e `api/*.js` como Serverless Functions.
- `vercel.json` define `cleanUrls`, `trailingSlash: false`, e os `rewrites` que mapeiam as rotas do painel (`/dashboard`, `/mapa`, `/minha-rota`, `/admin`, `/gestor`, `/developer/*` etc.) de volta para `/` — o roteamento real é client-side, dentro de `public/index.html`.
- Deploy dispara em push na branch configurada como produção (normalmente `main`).
- Variáveis de ambiente de produção configuradas em **Vercel → Project Settings → Environment Variables** (nunca em `.env` commitado) — ver [`docs/ENVIRONMENT.md`](ENVIRONMENT.md) para a lista completa e onde cada uma vai.

## GitHub Actions (coleta + notificação)

| Workflow | Gatilho | O que faz |
|---|---|---|
| `.github/workflows/scraper.yml` | `cron: "0 * * * *"` (hora em hora) + push na `main` + manual | Roda `python main.py`; em push, também roda `scripts/upsert_santos_trucker_event.py`. Timeout 15 min. |
| `.github/workflows/weekly-news.yml` | Segunda-feira 08:00 (America/Sao_Paulo) + manual | Gera e envia o resumo semanal por e-mail. |

Segredos configurados em **Settings → Secrets and variables → Actions** do repositório GitHub (`DATABASE_URL`, `OPENAI_API_KEY` no mínimo).

`DATABASE_URL` **precisa** usar a connection string do *Session pooler* do Supabase (compatível com IPv4, exigido pelos runners do GitHub) — não a connection string direta.

## Rollback

Sem pipeline de rollback automatizado hoje. Na prática:
- **Vercel**: reverter para um deployment anterior pelo painel da Vercel (cada push gera um deployment imutável) ou `git revert` + novo push.
- **GitHub Actions**: `workflow_dispatch` permite rodar manualmente após reverter o código; não há "desfazer" uma execução já concluída (ex. um evento crítico já publicado precisa ser corrigido via UPDATE manual ou nova execução que o reclassifique).
- **Banco**: migrations são desenhadas para nunca remover dado (ver [`docs/DATABASE.md`](DATABASE.md)) — rollback estrutural real é manual, com o DBA (`database-expert`) revisando antes.

## Observabilidade

Logs de execução agendada: aba **Actions** do GitHub (por run). Logs de função serverless: painel da Vercel (**Deployments → Functions**). Não há dashboard de erro/latência centralizado (ex. Sentry/Datadog) hoje — lacuna conhecida, não avaliada ainda por `system-architect`.

## Antes de propor uma mudança de infraestrutura

Docker, fila gerenciada, serviço novo, ou qualquer coisa além de Vercel + GitHub Actions exige ADR de `system-architect`, motivado por uma limitação real observada (timeout de função, necessidade de processo de longa duração etc.) — nunca por preferência de arquitetura.
