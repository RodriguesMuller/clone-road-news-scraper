# Roadmap — Road News

> Mantido por `tech-docs-agent`. Lista lacunas reais e conhecidas do estado atual — não promessas de prazo. Cada item vira trabalho real quando um agente (ou o usuário) o priorizar explicitamente; nada aqui está em execução só por estar listado.

## Confiabilidade / Qualidade

- **CI não roda a suíte de testes automaticamente.** `tests/` existe e passa localmente, mas nenhum workflow do GitHub Actions executa `unittest`/`node --test` hoje. Dono: `devops-engineer` + `qa-test-engineer`.
- **Sem observabilidade centralizada** (erro/latência) além dos logs nativos de GitHub Actions e Vercel. Avaliar necessidade real antes de introduzir uma ferramenta nova (ver `system-architect`).
- **Extração de entidade duplicada** entre `scraper/utils/image_summary.py` (na coleta) e `api/news-feed.js` (na consulta). Mandato aberto de `data-pipeline-engineer`.

## Produto

- **`/product` ainda não tem conteúdo publicado formalmente** além do primeiro corte gerado por `product-docs-agent` — pricing em R$ e nomes de concorrentes específicos seguem pendentes de validação humana (ver `docs/../product/PRICING.md` e `product/COMPETITORS.md`).
- **Notificação em tempo real** (WhatsApp, Telegram, webhook) não existe — hoje só o resumo semanal por e-mail. Dono: `notification-engineer`, condicionado a demanda real e a análise de custo de `finops-agent`.
- **`docs/domain/`, `docs/ux/`, `docs/metrics/`, `docs/seo/`** existem como pastas mas ainda sem conteúdo — cada uma é mandato do respectivo agente (`logistics-intelligence`, `ux-product-designer`, `data-analyst`, `seo-content-agent`).

## Infraestrutura / IA

- **Roteamento multi-provedor de IA** (Anthropic/Google além de OpenAI) — caixa de ferramentas futura, só entra via ADR de `system-architect` quando custo ou qualidade justificarem.
- **pgvector / busca semântica** — não avaliado ainda; hoje a busca é por keyword determinística.
- **Enriquecimento de IA por item** (`SCRAPER_AI_SUMMARIES_ENABLED`) está desligado em produção por custo — religar exige aprovação de `finops-agent` com projeção de custo mensal.
- **Headless browser (Playwright/Crawl4AI/Firecrawl)** — nenhuma fonte hoje exige renderização JS; só entra se uma fonte concreta justificar, via ADR.

## Fora do escopo por decisão, não por esquecimento

Docker/Coolify/Railway/Azure, framework web (Next.js/NestJS), bundler de frontend, versionamento de API — todos deliberadamente fora até que uma limitação real do produto os justifique. Ver [`docs/adr/0001-arquitetura-de-subagents.md`](adr/0001-arquitetura-de-subagents.md).
