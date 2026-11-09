# Registro de correções (branch `qa-audit`, não commitada)

| # | Achado | Causa raiz | Arquivos | Teste |
|---|---|---|---|---|
| 1 | SEC-01 leitura anônima de `news` | Policy `USING (true)` para anon, **recriada pelo scraper a cada hora** e usada pelo modo demo do frontend | `public/index.html` (`loadNews`), `scraper/storage/postgres.py`, `scripts/supabase_security_hardening.sql` | `frontend never reads…`, `scraper no longer recreates…`, `test_does_not_touch_rls_policies` |
| 2 | SEC-02 RPC anônimo | `EXECUTE` padrão do Postgres para `PUBLIC` em funções novas | migration | `hardening migration…` |
| 3 | SEC-03 convite e recuperação com 404 | Rotas do SPA ausentes em `vercel.json` | `vercel.json` | `invite and password-recovery…` |
| 4 | SEC-05 custo de IA ilimitado | Payload do navegador repassado sem teto | `api/news-summary.js` | `news-summary caps…` |
| 5 | SEC-06 corpo ilimitado / JSON inválido | `readBody` duplicado sem limite | `api/_admin.js`, `api/news-feed.js`, `api/news-summary.js` | `readJson rejects…`, `route analysis answers 400…` |
| 6 | SEC-07 `ilike` na exclusão | Filtro PostgREST com curinga sobre entrada do usuário | `api/admin-users.js`, `tests/test_production_access.js` | `admin user lookups…` |
| 7 | SEC-08 CDN sem versão exata e sem SRI | Tag `@2` flutuante | `public/index.html` | `third-party scripts…` |
| 8 | SEC-09 headers | Sem bloco `headers` | `vercel.json` | `vercel.json sends…` |
| 9 | SEC-10 tooltips | `bindTooltip` com string vira innerHTML | `public/index.html` | `map tooltips escape…` |
| 10 | SEC-11 metadata | Objeto do navegador gravado sem filtro | `api/usage-event.js` | `usage-event stores…` |
| 11 | SEC-12 CVEs | Versões antigas fixadas | `requirements.txt` | `pip-audit` → 0 |
| 12 | DB-01/03/04/09 | Drift de schema e índices ausentes | migration + rollback | `hardening migration…` |
| 13 | DB-02 consultas falhas | Fallback de colunas refeito a cada consulta | `api/news-feed.js` | suíte existente de rota |
| 14 | SCR-01 Band 0 itens | Mudança de formato de URL no portal | `scraper/sources/html.py` | `BandUrlFormatTest` |
| 15 | SCR-02 fallback sem timeout | `feedparser.parse(url)` usa urllib | `scraper/sources/rss.py` | `test_fallback_after_403…` |
| 16 | SCR-03/04 workflow | Sem `concurrency`; actions em Node 20 | `.github/workflows/*.yml` | `scraper workflow cannot…` |
| 17 | QA-01 CI sem testes | — | `.github/workflows/tests.yml` | — |

## Rollback
- Código: descartar a branch (`git checkout main && git branch -D qa-audit`) ou reverter o commit depois do merge.
- Banco: `scripts/supabase_security_hardening_rollback.sql`.
