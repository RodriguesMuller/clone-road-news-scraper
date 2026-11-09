# Relatório final — Auditoria QA, Segurança e Performance do Road News

**Data:** 2026-11-09 · **Base:** `main @ 3534ab2` · **Correções:** branch local `qa-audit` (sem commit, push ou deploy)

## Resultado

| Ambiente | Classificação | Fundamento |
|---|---|---|
| **Produção hoje** | **Não apta para produção** | Um P0 aberto e comprovado ao vivo: qualquer pessoa lê os 23.542 registros de `news` sem login, com a chave pública que está no HTML, o que contorna o login e as cotas pagas (SEC-01). Convite e recuperação de senha também estão quebrados (SEC-03). |
| **Depois de aplicar esta branch + migration + configuração de Auth** | **Apta com restrições** | Sem achado P0 ou P1 de segurança aberto. As restrições são: isolamento por perfil e por tenant validado só por código e testes unitários, não com contas reais; drift de colunas de IA/geo (DB-02); e decisões de compliance do scraping (SEC-14). |

## A. Diagnóstico geral
A arquitetura é enxuta e coerente (scraper Python no Actions, API Node sem dependências na Vercel, SPA em arquivo único, Supabase). A autorização na API é boa: tudo é resolvido no servidor e os papéis são respeitados. Os riscos reais estavam **fora da API**:
1. na camada de dados acessível direto pelo navegador (policy anônima, RPCs);
2. no **drift** entre as migrations do repositório e o banco de produção;
3. na configuração do Auth;
4. em operação (crons desativados por inatividade, banco pausado, fonte quebrada em silêncio).

Detalhes: [architecture-analysis.md](architecture-analysis.md).

## B. Vulnerabilidades
Tabela completa, com evidência, correção e status: [security-audit.md](security-audit.md). Resumo:

| Prioridade | Total | Corrigidos no código | Pendentes de aplicação ou decisão |
|---|---|---|---|
| P0 | 1 | 1 (frontend + scraper) | migration em produção |
| P1 | 4 | 2 | migration (SEC-02), configuração de Auth (SEC-03 e SEC-04) |
| P2 | 8 | 6 | npm de `scripts/` (SEC-13), UA/403 (SEC-14) |
| P3 | 1 | 1 | — |

## C. Qualidade do código
[code-quality-audit.md](code-quality-audit.md). A Band voltou a ser coletada. O fallback de RSS ganhou timeout. O `readBody` duplicado foi unificado. O caminho de leitura direta no frontend saiu (menos 77 linhas). Não foi feita refatoração cosmética.

## D. Banco de dados
[database-audit.md](database-audit.md). Foram encontrados 2 drifts de schema (o papel `manager` é proibido em produção; as colunas de IA e geo não existem), seq scan em todas as consultas do feed e 4 FKs sem índice. Há **0 URLs duplicadas** (o mecanismo de deduplicação funciona). A migration e o rollback estão prontos, **não aplicados**.

## E. Performance
[performance-audit.md](performance-audit.md). Antes: consultas do feed de 11 a 42 ms em seq scan, 12 requisições ao PostgREST por carga do feed, coleta de 10,5 s. Depois, no código: 4 requisições por carga. O ganho do índice **não foi medido** porque depende de aplicar a migration.

## F. Segurança
- **Chaves:** nenhum segredo real no histórico do git; os segredos do servidor estão só na Vercel e no GitHub. ⚠️ Rotacione o token `sbp_…` (`road_news`) que foi colado no chat.
- **Autenticação:** Supabase Auth com JWT de 1 h e rotação de refresh token. As fraquezas são de configuração (SEC-03 e SEC-04).
- **Autorização e clientes:** a revisão de código e os testes não mostraram escalonamento. Gestor não toca em admin; cliente não chega a `admin-*`.
- **Ataques:** XSS revisado (56 `innerHTML`, todos com escape menos 2 tooltips, já corrigidos); SRI na CDN; headers; teto de payload; teto de custo de IA.

## G. Testes
[test-results.md](test-results.md). Python **25/25**, Node **33/33**. Os testes novos foram validados falhando no código antigo, e foi criado um workflow de CI de testes. Não houve E2E nem testes ao vivo por perfil (não há contas de teste nem ambiente isolado). Nenhum percentual de cobertura é informado porque não foi medido.

## H. Pendências e ação necessária

| # | Pendência | Quem / o que fazer |
|---|---|---|
| 1 | **Fazer commit, merge e deploy da branch `qa-audit`** | Você autoriza → push → PR → Vercel |
| 2 | **Aplicar `scripts/supabase_security_hardening.sql`** (depois do item 1) e repetir o teste SEC-01 (esperado: 401/42501) | Você autoriza; posso aplicar pela Management API |
| 3 | **Configuração de Auth**: `site_url`, `uri_allow_list`, `disable_signup`, senha mínima 8, HIBP | Você autoriza (tabela em security-audit) |
| 4 | Revogar o token `sbp_…` `road_news` | Você, no dashboard do Supabase |
| 5 | DB-02: aplicar as colunas de IA e geo e decidir se `SCRAPER_AI_SUMMARIES_ENABLED` liga (custo OpenAI) | Produto + `finops-agent` |
| 6 | SEC-14: política de User-Agent e respeito a 403 | `compliance-advisor` |
| 7 | SEC-13: subir puppeteer 25 em `scripts/` e regenerar o PDF de docs (`docs-publisher`; não rodou aqui porque exige o Chrome do puppeteer) | `docs-publisher` |
| 8 | Testes por perfil e tenant com contas reais, e E2E de login, convite e recuperação | Staging |
| 9 | Keepalive dos crons (60 dias) e e-mail semanal (secrets do Resend) | Você decide |
| 10 | CSP completa (exige tirar os scripts inline ou usar hash/nonce), retenção de `news`, `published_at` como `timestamptz`, deduplicação por conteúdo entre fontes | Backlog P2/P3 |

## I. LGPD e governança (sem declaração de conformidade)
- Dados pessoais de usuários: nome, e-mail, **CPF** e telefone em `profiles`. O CPF é mascarado nas listagens (`admin-data`) e aparece completo só na tela de edição para gestor ou admin.
- `audit_logs` registra as ações administrativas. A exclusão de usuário apaga também o `usage_events` dele: ajuda no direito de eliminação, mas perde o histórico de faturamento. Isso precisa de decisão jurídica.
- `usage_events.metadata` guarda origem e destino das rotas consultadas, sem retenção definida.
- `privacidade.html` cita a LGPD e a exclusão pelo canal da empresa, mas não traz encarregado (DPO), base legal nem prazos de retenção. **Requer validação jurídica**: esta auditoria não atesta conformidade.
