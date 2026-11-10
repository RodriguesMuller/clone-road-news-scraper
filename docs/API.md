# API — Road News

> Mantido por `tech-docs-agent`. Donos do código: `backend-engineer` (endpoints de produto) e `saas-platform-engineer` (motor de auth/tenancy). Ver [`docs/AGENTS.md`](AGENTS.md).

Todos os endpoints são Vercel Serverless Functions em `api/*.js`, Node.js puro (CommonJS, sem framework, sem dependência npm). Autenticação via Bearer token do Supabase Auth (`Authorization: Bearer <token>`); quando `AUTH_ENABLED=false`, a API roda em modo demo sem exigir login (nunca libera Admin nesse modo).

## Convenção de acesso

Praticamente todo endpoint de produto começa chamando `assertCanUse(req, "<feature>")` (definido em `api/_auth.js`) e termina registrando uso com `recordUsage`. Isso resolve, nessa ordem: usuário autenticado → perfil → cliente (tenant) → pacote ativo → papel (`admin`/`manager`/`client`) → checagem de feature flag/limite mensal do pacote. `admin`/`manager` (`isPrivileged`) têm acesso operacional ilimitado por desenho.

Erros voltam como `{ "error": "mensagem específica" }`, nunca stack trace ou detalhe interno do Supabase.

## Endpoints de produto (dono: `backend-engineer`)

| Endpoint | Métodos | Feature/quota | Descrição |
|---|---|---|---|
| `/api/news-feed` | `GET`, `POST` | `news_query` (GET) / `route_analysis` + `ai_summary_individual` (POST) | `GET`: feed de notícias (últimas, INMET, recentes 24h, mapa 30d e `followedEvents`: eventos acompanhados pela empresa, com as notícias relacionadas em `related`). `POST`: análise da tela **Minha Rota** (Google Routes + notícias cruzadas por rodovia/proximidade + recomendação por IA com fallback determinístico). Cada item de `alerts` traz `road_blocked` (boolean) e `block_level` (`"total"`, `"partial"` ou `null`); bloqueios vêm primeiro na ordenação e bloqueio total eleva `risk_level` a Crítico. |
| `/api/news-summary` | `POST` | `ai_summary_individual` | Resumo de uma notícia específica via IA. |
| `/api/weekly-summary` | `GET`, `POST` | `ai_summary_weekly` | Resumo semanal da frota (mesmo cálculo do e-mail). (`GET /api/news-feed` passa a incluir `image_url` nas linhas quando a coluna existe.) Resposta: `{ summary: { period, verdict, headline, executive_summary, numbers[{key,label,value,previous,delta}], watchlist[], hotspots[], cargo_security[], weather[], actions[], highlights[], coverage, ai_used }, context: { period_days, generated_at, total } }`; `summary` é `null` sem notícias no período. Lê 14 dias (semana atual + anterior para o comparativo). |
| `/api/my-access` | `GET` | — | Retorna pacote ativo, papel e limites do usuário autenticado (usado pelo painel para exibir consumo). |
| `/api/usage-event` | `POST` | — | Registro de evento de uso genérico vindo do frontend. |
| `/api/news-summary` (ações de evento) | `POST` | — (não consome saldo) | `action: "follow-event"` + `item` (acompanhar a notícia; idempotente por link dentro da empresa), `"followed-event-status"` + `event_id` + `status` (`active`/`closed`), `"unfollow-event"` + `event_id`. Escopo: empresa do usuário. |
| `/api/auth-config` | `GET` | — | Configuração pública de auth (se está habilitada, URL/chave pública do Supabase). |

## Endpoints de plataforma / backoffice (dono: `saas-platform-engineer`)

| Endpoint | Métodos | Papel exigido | Descrição |
|---|---|---|---|
| `/api/admin-data` | `GET`, `POST`, `PATCH` | admin/manager | Dados agregados do backoffice (dashboards internos). |
| `/api/admin-packages` | `POST`, `PATCH`, `DELETE` | admin/manager | CRUD de pacotes (limites, flags). |
| `/api/admin-user-package` | `POST` | admin/manager | Vincula pacote a usuário. |
| `/api/admin-user-profile` | `GET`, `PATCH` | admin/manager | Consulta/edita perfil de usuário (CPF mascarado na listagem). |
| `/api/admin-user-status` | `PATCH` | admin/manager | Ativa/inativa usuário. |
| `/api/admin-users` | `POST`, `DELETE` | admin/manager | Cria/remove usuário. |

`api/_auth.js` e `api/_admin.js` não são endpoints — são o módulo compartilhado que todos os arquivos acima importam (prefixo `_` = não roteável pela Vercel).

## Erros comuns e seus significados

| Situação | Mensagem típica |
|---|---|
| Sessão ausente/expirada | "Login necessário." / "Sessão inválida ou expirada." |
| Sem pacote vinculado | "Vincule um pacote para liberar os recursos da plataforma." |
| Feature desabilitada no pacote | Mensagem específica por feature (ex. "Resumo semanal não está disponível no seu pacote.") |
| Limite mensal atingido | Mensagem específica por feature (ex. "Limite mensal de consultas do Minha Rota atingido...") |
| `GOOGLE_ROUTES_API_KEY` ausente/inválida | "A análise com trânsito ainda não está configurada..." / "A chave da API de rotas não foi aceita..." |
| Acesso negado (papel insuficiente) | "Acesso negado." |

Ver o objeto `FEATURE_RULES` em `api/_auth.js` para a lista completa e exata de mensagens por feature.

## O que não existe hoje

Sem versionamento de API (`/api/v1/...`), sem OpenAPI/Swagger, sem rate limiting explícito além da quota por pacote, sem paginação cursor-based (os endpoints usam `limit` fixo por chamada). Essas são lacunas conhecidas, não bugs — avaliar com `system-architect` antes de assumir que qualquer uma delas precisa ser resolvida.
