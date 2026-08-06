# ADR 0001 — Arquitetura de Subagents do Road News

## Status
Aceito — 2026-08-06

## Contexto

O Road News cresceu de um scraper simples para um produto multi-tenant real: coleta de notícias rodoviárias, triagem de eventos críticos por IA, painel com controle de acesso por pacote/quota, e um backoffice de provisionamento de cliente — tudo isso já em produção, não em planejamento. Até esta decisão, todo esse trabalho era feito sem divisão de responsabilidade formalizada entre domínios (scraping, IA, dados, segurança, produto, documentação), o que cria dois riscos concretos à medida que o volume de mudança cresce:

1. **Ambiguidade de escopo.** Sem fronteira explícita, a mesma lógica (ex.: extração de rodovia/km, classificação de severidade) tende a ser reimplementada em mais de um lugar — o próprio código já mostra sinais disso (extração de entidade duplicada entre `scraper/utils/image_summary.py` e `api/news-feed.js`).
2. **Perda de contexto de domínio.** Regras finas de negócio (ex.: por que `MIN_CONFIDENCE = 0.82`, por que `SCRAPER_AI_SUMMARIES_ENABLED` está desligado em produção) vivem só na cabeça de quem as escreveu, sem registro que sobreviva à pessoa.

Adicionalmente, a especificação inicial deste roster de agentes foi escrita a partir de uma "stack de referência" genérica (Next.js/NestJS, Playwright/Crawl4AI/Firecrawl, Docker/Coolify/Railway/Azure, Jest/Vitest) que diverge do estado real do repositório: scraper Python sem browser headless, API em Vercel Serverless Functions com Node vanilla e zero dependências (sem `package.json`), frontend em arquivo único sem build step, deploy só Vercel + GitHub Actions, testes com `unittest`/`node:test` nativos. Essa divergência foi confirmada por inspeção direta do código antes de qualquer agente ser escrito (ver `git log`, `requirements.txt`, ausência de `package.json`, `public/index.html` com ~6.800 linhas).

## Decisão

Adotamos um roster de **22 subagents em 4 camadas**, documentado em `docs/AGENTS.md` e materializado em `.claude/agents/*.md`:

- **Camada A (13 agentes)** — arquitetura e implementação, com `Write`/`Edit` restrito ao(s) artefato(s) de sua propriedade exclusiva.
- **Camada B (3 agentes)** — governança e revisão, somente leitura de código (`security-reviewer`, `compliance-advisor`, `finops-agent`); nunca implementam, apenas emitem achados priorizados ou decisões quantificadas.
- **Camada C (3 agentes)** — produto e dados (`ux-product-designer`, `data-analyst`, `seo-content-agent`), com escrita restrita a specs/relatórios, não a código de aplicação (exceto `seo-content-agent` em artefatos públicos que não colidem com a aplicação).
- **Camada D (3 agentes)** — documentação e memória institucional, cada um dono de uma fatia disjunta de `/docs`, `/product` e `docs/HISTORY.md`.

Cada agente é definido por: `name`, `description` roteável em terceira pessoa com gatilho de proatividade, `tools` sob o princípio de menor privilégio, `model` (opus para decisão de alto risco/domínio, sonnet para implementação, haiku para registro mecânico de alto volume), e um system prompt estruturado em Identidade / Contexto do produto / Escopo / Como você trabalha / Padrões inegociáveis / Formato de saída / Limites e escalonamento.

**Decisão estrutural adicional**: os agentes descrevem e defendem a stack real do repositório como linha de base. A stack de referência mais ampla (framework web, headless browser, containerização, runner de teste externo) é tratada como caixa de ferramentas futura, habilitada por `system-architect` via ADR quando um caso concreto — não uma preferência estética — justificar. Essa escolha foi validada explicitamente com o usuário antes da implementação (ver histórico da sessão), diante de duas alternativas: ancorar na stack real ou escrever os agentes já mirando a stack de referência como direção ativa de migração.

Toda mudança segue uma **Definition of Done** obrigatória (detalhada em `CLAUDE.md`): `tech-docs-agent` (toda mudança técnica), `product-docs-agent` (quando altera capacidade percebida pelo cliente, preço ou posicionamento — decide por si mesmo quando não há impacto), e `project-historian` (toda mudança, sempre por último).

## Alternativas consideradas

1. **Agente único generalista.** Rejeitada: um único agente com contexto de scraping, IA, banco, segurança, produto e documentação ao mesmo tempo dilui o contexto disponível para qualquer decisão específica (viola o princípio de contexto mínimo) e não permite `tools` com menor privilégio — um agente que só deveria revisar ganharia `Write` por conveniência.
2. **Roster amplo sem camadas, todos com as mesmas permissões.** Rejeitada: colapsar Camada B (governança) na Camada A removeria a garantia estrutural de que revisão de segurança/compliance/custo nunca é feita pelo mesmo agente que implementou — o viés de quem constrói revisar o próprio trabalho é exatamente o que a separação evita.
3. **Roster técnico apenas (só Camada A), sem produto/documentação como agentes formais.** Rejeitada: já observamos no histórico do projeto que documentação e contexto de negócio decaem mais rápido que código quando não têm dono — a ausência de `/product` e de um `docs/HISTORY.md` estruturado hoje é evidência direta disso.
4. **Espelhar 1:1 a especificação original do roster, sem resolver sobreposições.** Rejeitada: a especificação original continha sobreposições reais (`ADR` reivindicado por três agentes diferentes; `api/**` dividido de forma genérica demais para o código real; landing e painel logado tratados como arquivos separados quando são o mesmo arquivo). Implementar sem resolver essas sobreposições teria produzido exatamente o defeito que o roster deveria evitar: dois agentes com `Write` no mesmo artefato.
5. **Escrever os agentes mirando a stack de referência (Next.js/NestJS/Playwright/Docker/Jest) como direção ativa.** Rejeitada nesta rodada, por escolha explícita do usuário: os agentes ficariam recomendando comandos, arquivos e padrões que não existem no repositório real, o que é mais custoso de corrigir depois do que de ancorar corretamente agora. Permanece disponível como evolução deliberada via ADR futuro.

## Sobreposições resolvidas

Sete sobreposições já vinham identificadas na especificação original do roster (fusão dos dois agentes de inteligência de notícia em `logistics-intelligence`; separação `ai-engineer`×`prompt-engineer`; ampliação de `cost-optimization-agent` para `finops-agent`; eliminação da duplicata `documentation-writer`=`tech-docs-agent`; hierarquia `product-docs-agent`→`seo-content-agent`; separação `security-reviewer`×`compliance-advisor`; separação `data-analyst`×quem corrige). Durante a implementação, identificamos e resolvemos mais sete sobreposições residuais não previstas na especificação original — a mais relevante sendo a divisão de `docs/adr` entre três agentes diferentes na redação original (`system-architect`, `tech-docs-agent` e `project-historian` reivindicavam o mesmo caminho), resolvida atribuindo `Write` exclusivo em `docs/adr/**` só a `system-architect`. A lista completa, com a justificativa de cada resolução, está em `docs/AGENTS.md`, seção "Sobreposições resolvidas".

## Consequências

**Positivas:**
- Nenhum caminho do repositório tem dois agentes com permissão de escrita — verificável diretamente pela matriz de propriedade em `docs/AGENTS.md`.
- Agentes consultivos (Camada B) estruturalmente não podem "corrigir" o que revisam — preserva a separação entre quem implementa e quem audita.
- A régua de severidade e a taxonomia de domínio (hoje fragmentadas entre `event_intelligence.py` e `riskForItem` em `news-feed.js`) passam a ter um dono único (`logistics-intelligence`) responsável por fazer convergir as duas implementações.
- Documentação técnica, de produto e histórico institucional deixam de depender de alguém lembrar de escrevê-las — viram parte obrigatória da Definition of Done.

**Custos/trade-offs:**
- 22 agentes é mais overhead de manutenção do próprio roster do que um número menor — mitigado pelo teste de responsabilidade exclusiva aplicado a cada um antes de ser incluído (nenhum agente foi criado sem um conjunto de tarefas que só ele cobre).
- A divisão fina de `api/**` entre `backend-engineer` e `saas-platform-engineer`, e de `scraper/weekly_news.py` entre três agentes por sub-responsabilidade, exige que quem orquestra (o agente principal) leia a matriz de propriedade com atenção em vez de assumir "um arquivo, um agente" universalmente — documentado explicitamente para não virar fonte de confusão.
- Ancorar na stack real significa que, se o produto de fato crescer na direção da stack de referência, haverá trabalho de revisão dos agentes técnicos (não do roster em si) nesse momento — aceito como custo futuro menor do que o custo presente de documentar capacidades inexistentes.
