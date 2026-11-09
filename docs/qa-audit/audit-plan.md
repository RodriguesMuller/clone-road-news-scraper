# Plano de auditoria — Road News (2026-11-09)

## Escopo
Repositório `RodriguesMuller/clone-road-news-scraper` (branch `main` @ `3534ab2`), banco Supabase de produção `vdyilgbqxnrwqgoairat`, projeto Vercel `road-news` (`road-news-scraper.vercel.app`), workflows do GitHub Actions.

## Regras de segurança adotadas
- Todo o trabalho foi feito na branch local **`qa-audit`**: nenhum commit, push ou deploy.
- **Produção somente leitura**: consultas pelo endpoint `database/query/read-only` da Management API, `EXPLAIN ANALYZE` apenas de `SELECT`, e requisições HTTP sem credencial (ou com a chave pública) para provar exposição.
- A única escrita tentada contra produção foi um `INSERT` anônimo em `news`, que o RLS **recusou** (era o resultado esperado). Nenhum dado foi alterado.
- Toda mudança de schema virou migration versionada **com rollback** (`scripts/supabase_security_hardening*.sql`), e **nenhuma foi aplicada**.
- Mudanças de configuração em produção (Auth, banco) foram **documentadas e deixadas para autorização**.

## Etapas
1. Mapeamento da arquitetura (código, schema real, variáveis da Vercel, workflows).
2. Segurança: autenticação, autorização, RLS/grants, exposição anônima, segredos, supply chain e headers.
3. Banco: drift de schema, índices, duplicidade, constraints, advisors do Supabase.
4. Scraping: execução real sem gravar, timeouts, deduplicação, fontes quebradas.
5. Correções por prioridade (P0 → P3), cada uma com teste de regressão.
6. Rodar novamente as suítes, provar que os testes novos falham no código antigo e documentar.
