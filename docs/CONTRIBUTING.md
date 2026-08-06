# Contribuindo — Road News

> Mantido por `tech-docs-agent`.

## Rodando localmente

### Scraper (Python 3.11)
```bash
python -m venv .venv
.venv\Scripts\Activate.ps1      # Windows PowerShell
pip install -r requirements.txt
copy .env.example .env          # preencha DATABASE_URL (ver docs/ENVIRONMENT.md)
python main.py
```
Sem `DATABASE_URL`, o scraper só exibe os resultados no terminal (não grava no banco) — bom para testar fonte nova sem risco.

### API + Frontend
Sem build step. Para testar `public/**` localmente, sirva a pasta com qualquer servidor estático (ex. `python -m http.server` dentro de `public/`) ou use `vercel dev` se a CLI da Vercel estiver instalada. Os endpoints de `api/**` dependem das variáveis de ambiente do Supabase/OpenAI/Google Routes estarem configuradas (ver [`docs/ENVIRONMENT.md`](ENVIRONMENT.md)).

### Publicador de documentação (Node.js)
```bash
cd scripts
npm install      # baixa o Chrome do Puppeteer no postinstall — primeira vez demora mais
npm run build:docs-pdf
```
Gera/atualiza `docs/dist/road-news-documentation.pdf`. Ver `docs-publisher` em [`docs/AGENTS.md`](AGENTS.md).

## Testes

Sem framework externo — bibliotecas nativas, coerente com a filosofia zero-dependência do projeto:

```bash
python -m unittest discover tests    # Python: event_intelligence, curated_event, image_summary, summary_generation, timezone
node --test tests/                   # JS: test_production_access.js
```

**Nenhum workflow do GitHub Actions roda essa suíte automaticamente hoje** — rodar é manual, antes de propor merge. Isso é uma lacuna conhecida (ver [`docs/ROADMAP.md`](ROADMAP.md)), não uma escolha deliberada.

Regra de teste: para bug reportado, o teste vermelho vem antes da correção. Para fonte de scraper nova, use fixture de HTML/RSS congelado, nunca a URL ao vivo. Nenhum teste usa credencial de produção nem dado real de cliente.

## Arquitetura de agentes

Este projeto usa 23 subagents especializados do Claude Code (`.claude/agents/*.md`). Antes de propor uma mudança maior, leia [`CLAUDE.md`](../CLAUDE.md) (mapa de roteamento rápido) e [`docs/AGENTS.md`](AGENTS.md) (roster completo, matriz de propriedade de arquivo, workflows). Regra central: **um dono por arquivo** — se não estiver claro quem deveria mexer em algo, é sinal de arbitrar com `system-architect`, não escolher um dono ad hoc.

## Definition of Done

Nenhuma mudança está pronta sem, nesta ordem: `tech-docs-agent` (toda mudança técnica) → `product-docs-agent` (se mudou capacidade percebida pelo cliente) → `project-historian` (sempre, registra em `docs/HISTORY.md`) → `docs-publisher` (regenera o PDF se `/product` ou `/docs` mudou). Gate antes do merge: `qa-test-engineer` verde → `security-reviewer` sem achado `[BLOQUEANTE]`.

## Convenções de código

- Scraper: Python 3.11, sem browser headless. Prefira RSS/API pública a HTML scraping ao adicionar fonte.
- API: Node.js puro, sem framework, sem dependência npm nova sem aprovação de `system-architect` (exceção já aprovada: `scripts/` do `docs-publisher`, isolado do resto do projeto).
- Frontend: HTML/CSS/JS vanilla em `public/index.html`, sem bundler.
- SQL: migration sempre idempotente, nunca `DROP COLUMN`/`DROP TABLE`.
- Commits: mensagem descreve o comportamento observável da mudança, não só o arquivo tocado (ver `git log` para o padrão já usado no projeto: `feat:`, `fix:`, `security:`, `data-quality:`).
