# Banco de Dados — Road News

> Mantido por `tech-docs-agent`. Dono do schema: `database-expert` (ver [`docs/AGENTS.md`](AGENTS.md)).

Postgres gerenciado pelo Supabase. **Não há framework de migration** — cada mudança de schema é um arquivo SQL idempotente em [`scripts/`](../scripts), aplicado manualmente no SQL editor do Supabase (`create ... if not exists`, `add column if not exists`, para poder rodar de novo com segurança).

## Tabelas

### `news`
Criada em runtime pelo próprio scraper (`scraper/storage/postgres.py`), não por um script em `scripts/`.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | bigserial | PK |
| `title`, `url`, `source`, `category`, `published_at`, `summary`, `scraped_at`, `type` | text | Colunas base, sempre presentes |
| `url` | text | `UNIQUE` — é a chave de deduplicação primária |
| `created_at` | timestamptz | default `now()` |
| `image_summary`, `ai_summary`, `operational_relevance`, `operational_impact`, `ai_processed_at`, `ai_model`, `region`, `country`, `state`, `city`, `highway`, `risk_level` | — | **Opcionais**: adicionadas por migration posterior. O código consumidor (`api/news-feed.js`) tenta múltiplos conjuntos de colunas (`OPTIONAL_SETS`) para tolerar ambiente onde a migration ainda não rodou — nunca assuma que essas colunas existem sem checar. |
| `latitude`, `longitude`, `geo_precision` | — | Adicionadas por `scripts/supabase_geo_fields.sql` |
| `image_url` | text | Opcional, por `scripts/supabase_news_image_url.sql`. Imagem publicada pela própria fonte (feed ou `og:image`); vazia quando a fonte não fornece. |

RLS: **sem policy de leitura** depois de `scripts/supabase_security_hardening.sql` — a antiga `Allow public read news` (`anon`, `USING true`) expunha a tabela inteira a qualquer pessoa com a chave pública, contornando login e cota. Toda leitura passa por `api/news-feed.js` com service role; o scraper grava com o usuário `postgres`. A tabela não é segregada por tenant: o que é segregado é o **acesso** via quota/pacote (ver `usage_events`). Em produção (2026-11-09) as colunas opcionais de IA/geo **não existem** — ver `docs/qa-audit/database-audit.md` (DB-02).

### `platform_events` + `event_intelligence_runs`
Criadas por `scraper/event_intelligence.py` em runtime (não por script em `scripts/`). `platform_events` guarda eventos logísticos críticos (`event_type = 'major_logistics_event'`), com `metadata` jsonb contendo `event_key`, `operational_status`, `history` (linha do tempo), `confidence`, `affected_infrastructure` etc. `event_intelligence_runs` é só controle de idempotência (fingerprint sha256 do lote analisado → não reanalisa o mesmo lote duas vezes). RLS habilitada; `event_intelligence_runs` é revogada de `anon`/`authenticated` (só acesso via service role).

### Multi-tenancy (`scripts/supabase_production_clients_users_limits.sql` e relacionados)

| Tabela | Papel |
|---|---|
| `clients` | Tenant. `company_name`, `status` (`active`/`inactive`/`blocked`), `package_id` (pacote herdado por todos os usuários da empresa; consumo por usuário. Migration `scripts/supabase_client_package.sql`). |
| `profiles` | Usuário. `role` (`admin`/`manager`/`client`), `client_id` (FK), `status`, `cpf` (mascarado em listagem), `phone`. |
| `packages` | Plano/pacote: `monthly_news_limit`, `monthly_ai_summary_limit`, `monthly_pdf_limit`, `monthly_route_limit`, `max_users`, `can_generate_individual_summary`, `can_generate_weekly_summary`, `can_access_map`, `is_active`. |
| `user_packages` | Vínculo usuário↔pacote ativo (`ends_at` nullable = sem expiração). |
| `usage_events` | Log de uso e de tentativa bloqueada (`event_type`, `client_id`, `user_id`, `package_id`, `tokens_input`/`tokens_output`, `metadata`). Fonte de dado para `data-analyst`. |
| `audit_logs` | Auditoria de ação administrativa. |

RLS: todas com `enable row level security`. Autorização resolvida por funções `SECURITY DEFINER` (`is_admin`, `is_manager_or_admin`, `can_manage_target_user`, `get_user_role`) — nunca por policy inline duplicando essa lógica. Ver `scripts/supabase_production_clients_users_limits.sql` para o texto exato das policies.

## Migrations existentes (`scripts/*.sql`)

| Arquivo | O que faz |
|---|---|
| `supabase_auth_access.sql` | Base de auth/acesso |
| `supabase_packages_rls.sql` | RLS de pacotes |
| `supabase_platform_environments.sql` | Ambientes de plataforma |
| `supabase_production_clients_users_limits.sql` | Clientes/usuários/pacotes/limites (produção) — sem seed |
| `supabase_route_package_limit.sql` | Limite de análise de rota por pacote |
| `supabase_geo_fields.sql` | Campos de geolocalização em `news` |
| `supabase_image_summary_fields.sql` | Campos de enriquecimento por IA em `news` |
| `supabase_news_image_url.sql` | Coluna `news.image_url` (imagem da notícia). Idempotente; pode ser aplicada antes ou depois do deploy, porque scraper e API toleram a ausência. |
| `supabase_security_hardening.sql` (+ `_rollback.sql`) | Remove leitura anônima de `news`, revoga RPC anônimo das funções SECURITY DEFINER, aceita papel `manager` no check de `profiles`, índices de `news.created_at` e de FKs. Aplicar **depois** do deploy do código correspondente. |
| `supabase_major_events.sql` | Suporte a `platform_events` |
| `supabase_secure_news_optional.sql` | Ajustes de segurança em colunas opcionais |
| `reactivate_admin_user.sql` | Script pontual de correção |

## Convenções para migration nova

1. Sempre idempotente (`if not exists`), documentada no cabeçalho do arquivo.
2. Nunca `DROP COLUMN`/`DROP TABLE` — o produto depende de histórico de notícias para tendência; prefira coluna nova + migração de leitura.
3. Toda tabela nova nasce com RLS habilitada e policy de negar-por-padrão.
4. Índice composto `(client_id, created_at desc)` obrigatório em tabela nova consultada por tenant.
5. Aplicação em produção é manual (SQL editor do Supabase) ou via `devops-engineer` — nunca automática a partir de um merge.

Ver `database-expert` em [`docs/AGENTS.md`](AGENTS.md) para o processo completo de proposta/revisão de schema.
