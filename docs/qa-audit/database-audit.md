# Auditoria de banco de dados (Supabase `vdyilgbqxnrwqgoairat`)

Todo o levantamento foi feito com consultas **somente leitura**. Nenhuma migration foi aplicada.

## Estado encontrado
| Tabela | Linhas | Tamanho | RLS | Policies |
|---|---|---|---|---|
| news | 23.542 | 31 MB | sim | 1 (`anon`+`authenticated`, `USING true`) ← SEC-01 |
| usage_events | ~321 | 240 kB | sim | 3 |
| profiles | 2 (1 admin, 1 client) | 64 kB | sim | 4 |
| platform_events, event_intelligence_runs | — | — | sim | 0 (só service role) |
| clients, packages, user_packages, audit_logs | pequenas | — | sim | 2 cada |

## Achados
| ID | Prioridade | Problema | Evidência | Ação |
|---|---|---|---|---|
| DB-01 | P1 | **Drift de schema**: `profiles_role_check` só aceita `admin` e `client`. Criar ou promover um **Gestor falha** com violação de constraint, embora a API, as policies e `scripts/supabase_auth_access.sql` já prevejam `manager` | `pg_constraint` | Migration recria o check com `manager` |
| DB-02 | P1 · produto | **Drift de schema**: `news` não tem as colunas de IA e geolocalização (`ai_summary`, `image_summary`, `risk_level`, `latitude`, `longitude`, `highway`…) de `scripts/supabase_image_summary_fields.sql` e `supabase_geo_fields.sql`. O enriquecimento nunca é gravado, o mapa só usa a localização inferida no navegador, e o `news-feed` fazia 2 consultas que falhavam antes de cada consulta válida | `information_schema.columns`; PostgREST `42703 column news.ai_summary does not exist` | Código: cache do conjunto de colunas válido. **Aplicar as colunas é decisão de produto e de custo de IA** (o scraper roda com `SCRAPER_AI_SUMMARIES_ENABLED=false`) |
| DB-03 | P2 | Todas as consultas do feed fazem **seq scan** + sort em `news` (sem índice em `created_at`) | `EXPLAIN ANALYZE`: 11,4 ms (24h), 17,2 ms (últimas 50), 41,8 ms (INMET), crescendo linearmente | `news_created_at_idx` |
| DB-04 | P3 | 4 FKs sem índice (advisor) | Advisor de performance | 4 índices na migration |
| DB-05 | P3 | Policies chamam `auth.uid()` linha a linha e há policies permissivas sobrepostas (advisor) | Advisor | Irrelevante no volume atual; reescrever com `(select auth.uid())` quando as tabelas crescerem |
| DB-06 | P2 | Duplicidade: **0 URLs duplicadas** (UNIQUE funciona). 1.436 títulos repetidos: 781 do INMET (título genérico do aviso, URLs distintas, esperado) e ~230 da mesma matéria vinda por URLs diferentes do Google News / G1 | `count(distinct …)` | Deduplicação por conteúdo entre fontes: pendente (`data-pipeline-engineer`) |
| DB-07 | P3 | `published_at` e `scraped_at` são `TEXT` (ISO com offset), e a ordenação por `published_at` é lexicográfica | Schema | Migrar para `timestamptz` (pendente, exige backfill) |
| DB-08 | P3 | Sem política de retenção: ~23,5 mil linhas e 31 MB em 5 meses | `min(created_at)` = 2026-06-19 | Definir retenção ou arquivamento quando passar de ~200 MB (o plano free tem 500 MB) |
| DB-09 | Info | Funções `SECURITY DEFINER` com `search_path` fixo (ok); `set_updated_at` sem `search_path` | Advisor | Fixado na migration |

## Migração entregue
- [`scripts/supabase_security_hardening.sql`](../../scripts/supabase_security_hardening.sql): idempotente e em transação; **não apaga dados** (o teste garante que não há `drop table`, `truncate` nem `delete`).
- [`scripts/supabase_security_hardening_rollback.sql`](../../scripts/supabase_security_hardening_rollback.sql): restaura exatamente o estado anterior.
- **Ordem obrigatória:** deploy do código da branch → aplicar a migration. Se aplicada antes, o scraper antigo recria a policy anônima na hora seguinte.
