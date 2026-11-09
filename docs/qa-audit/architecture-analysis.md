# Análise de arquitetura

## Componentes (stack real, confirmada no código e em produção)

| Camada | Implementação | Observações da auditoria |
|---|---|---|
| Coleta | `main.py` + `scraper/sources/{rss,html,inmet,arteris}.py`, rodando a cada hora no GitHub Actions | 11 fontes. Python 3.11 no CI e 3.12 em `.python-version` (divergência menor). |
| Persistência | `scraper/storage/postgres.py` grava via `psycopg` no pooler do Supabase (usuário `postgres`, ignora RLS) | Deduplica por `url` (UNIQUE + `ON CONFLICT DO NOTHING`). **Recriava a policy anônima a cada execução** (corrigido). |
| Inteligência | `scraper/event_intelligence.py` (OpenAI) → `platform_events` | Deduplicação por fingerprint (`event_intelligence_runs`). |
| API | 13 funções serverless em `api/*.js`, Node puro, sem dependências | Toda leitura e escrita de dados usa a `SUPABASE_SERVICE_ROLE_KEY` no servidor. A autorização fica em `_auth.js` (`requireAccount`, `assertCanUse`, `requireManager`, `requireAdmin`). |
| Frontend | `public/index.html` (~6,8 mil linhas, JS puro) | Supabase JS apenas para Auth. Antes da correção, o modo demo lia `news` direto com a chave pública. |
| Banco | Supabase Postgres, 9 tabelas em `public`, RLS ativo em todas | **Schema de produção diverge das migrations do repositório** (ver database-audit). |
| Deploy | Vercel (`road-news-scraper.vercel.app`, `road-news-teal.vercel.app`) | `AUTH_ENABLED` está definido em production e preview (modo auth confirmado via `/api/auth-config`). |

## Fluxo principal
```
cron (GitHub Actions) → main.py → fontes externas → save_to_postgres → news
                                                  → process_major_events → platform_events
navegador → Supabase Auth (login) → /api/news-feed (Bearer) → _auth.assertCanUse
          → service role → news / platform_events → JSON
```

## Papéis e tenant
- `admin`: tudo, inclusive excluir usuários e pacotes.
- `manager` (gestor): equipe da gerenciadora de risco, **com escopo de plataforma**, não de um cliente. Vê todos os clientes e os usuários que não são admin, e gerencia pacotes. É ilimitado em cotas.
- `client`: usuário de uma empresa cliente (`profiles.client_id`), com cotas definidas pelo pacote (`user_packages` → `packages`).
- O dado de notícia é **global**: o mesmo feed para todos os clientes. O que separa os tenants são os dados de conta: `profiles`, `usage_events`, `user_packages` e `audit_logs`.
