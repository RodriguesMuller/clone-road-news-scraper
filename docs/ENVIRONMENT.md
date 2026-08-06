# Variáveis de Ambiente — Road News

> Mantido por `tech-docs-agent`, sempre em sincronia com [`.env.example`](../.env.example) (que `devops-engineer` mantém). Se este documento e `.env.example` divergirem, `.env.example` é a fonte de verdade — atualize aqui para bater.

| Variável | Usada por | Onde configurar | Descrição |
|---|---|---|---|
| `DATABASE_URL` | scraper (`main.py`) | Local (`.env`) / GitHub Secret | Connection string Postgres do Supabase. Em GitHub Actions, **precisa** ser a do *Session pooler* (IPv4). Sem ela, o scraper só exibe resultado no terminal (modo teste). |
| `OPENAI_API_KEY` | scraper + API | Local / GitHub Secret / Vercel Env Var | Chave da OpenAI, usada em todos os 4 pontos de IA (ver [`docs/AI_PIPELINE.md`](AI_PIPELINE.md)). |
| `OPENAI_MODEL` | scraper + API | Opcional, qualquer ambiente | Modelo default para resumo semanal e recomendação de rota. Padrão: `gpt-4.1-mini`. |
| `OPENAI_IMAGE_MODEL` | scraper (`image_summary.py`) | Opcional | Modelo para enriquecimento por item (hoje desligado em produção via `SCRAPER_AI_SUMMARIES_ENABLED`). |
| `OPENAI_EVENT_API_KEY` | scraper (`event_intelligence.py`) | Opcional | Override de chave só para a triagem de eventos críticos; se ausente, usa `OPENAI_API_KEY`. |
| `OPENAI_EVENT_MODEL` | scraper (`event_intelligence.py`) | Opcional | Override de modelo só para a triagem de eventos críticos. |
| `EVENT_INTELLIGENCE_ENABLED` | scraper | GitHub Actions (`scraper.yml`) | `"true"` em produção — liga a triagem de eventos críticos. |
| `SCRAPER_AI_SUMMARIES_ENABLED` | scraper | GitHub Actions (`scraper.yml`) | `"false"` em produção — enriquecimento de IA por item desligado por custo. |
| `GOOGLE_ROUTES_API_KEY` | API (`news-feed.js`) | **Somente Vercel** Environment Variables | Chave da Google Routes API (tela Minha Rota). Habilitar a Routes API no Google Cloud, vincular billing, restringir a chave a essa API. **Nunca** enviada ao navegador. |
| `GOOGLE_MAPS_API_KEY` | API (`news-feed.js`) | Vercel | Fallback aceito se `GOOGLE_ROUTES_API_KEY` não estiver setada. |
| `AUTH_ENABLED` | API | Vercel | `true` (padrão/produção) exige login e valida cotas. `false` só para preview/demo — nunca libera Admin no modo demo. Vazio em produção = falha fechado (exige login). |
| `NEXT_PUBLIC_AUTH_ENABLED` | API | Vercel | Mantido só por compatibilidade com deploys antigos; equivalente a `AUTH_ENABLED`. |
| `SUPABASE_URL` | API | Vercel (público) | URL do projeto Supabase. |
| `SUPABASE_ANON_KEY` | API | Vercel (público) | Chave pública/anon do Supabase — usada também pelo navegador. |
| `SUPABASE_SERVICE_ROLE_KEY` | API | **Somente Vercel**, nunca no navegador | Chave de service role — acesso privilegiado ao Supabase. Vazamento é incidente de segurança imediato. |
| `RESEND_API_KEY` | notificação (`weekly_news.py`) | Local / GitHub Secret / Vercel | Chave do Resend para envio do resumo semanal. |
| `WEEKLY_EMAIL_FROM` | notificação | Qualquer ambiente | Remetente do e-mail semanal. Padrão de teste: `onboarding@resend.dev`; produção exige domínio configurado no Resend. |
| `WEEKLY_EMAIL_TO` | notificação | Qualquer ambiente | Destinatários, separados por vírgula. |

## Regras

- `.env` nunca é commitado (`.gitignore` já cobre `.env*`, exceto `.env.example`).
- Chaves de service role/privilegiadas (`SUPABASE_SERVICE_ROLE_KEY`) só existem no lado servidor (`api/**`, scraper) — nunca em `public/**`.
- Toda variável nova é adicionada a `.env.example` (por `devops-engineer`) **e** a esta tabela (por `tech-docs-agent`) no mesmo PR — nunca só uma das duas.
