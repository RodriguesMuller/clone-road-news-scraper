# Pipeline de IA — Road News

> Mantido por `tech-docs-agent`. Donos do código: `ai-engineer` (infraestrutura de chamada), `prompt-engineer` (texto de prompt), `logistics-intelligence` (taxonomia/schema/régua). Ver [`docs/AGENTS.md`](AGENTS.md).

Todo uso de IA no Road News é via **OpenAI Responses API** (`gpt-4.1-mini` como modelo padrão, configurável por variável de ambiente). Não há roteamento multi-provedor (Anthropic/Google) — é caixa de ferramentas futura.

## Os 4 pontos de uso

### 1. Triagem de eventos logísticos críticos (`scraper/event_intelligence.py`)
O padrão-ouro do projeto: roda a cada execução do scraper (se `EVENT_INTELLIGENCE_ENABLED=true`), sobre o lote recém-coletado.

- **Pré-filtro determinístico** (regex) antes de qualquer chamada de IA: `candidate_reasons()` combina padrões de contexto logístico, gravidade, impacto operacional, infraestrutura estratégica e resolução — só o que casa é enviado à IA. Notícia com padrão de "greve não-logística" (professores, bancários...) é descartada mesmo antes do pré-filtro positivo, a menos que também case com impacto logístico.
- **Schema estrito** (`EVENT_RESPONSE_SCHEMA`, `strict: true`): `is_major_event`, `event_key`, `category`, `scope` (`nacional`/`internacional`), `severity` (sempre `critical` neste pipeline), `status` (`em_andamento`/`monitoramento`/`encerrado`), `confidence`, `evidence` (com URL/fonte/data rastreável).
- **Confidence mínimo**: `0.82` (`MIN_CONFIDENCE`) — abaixo disso, descartado.
- **Idempotência**: fingerprint sha256 do lote de candidatos + modelo; lote já analisado não gera nova chamada (`event_intelligence_runs`).
- **Anti-alucinação**: o prompt exige evidência real (URL/título/fonte copiados das notícias fornecidas), proíbe inventar local/desvio/duração/encerramento, e cada evento validado (`_valid_events`) precisa de `evidence` não-vazia e `affected_infrastructure` preenchida.
- Grava/atualiza em `platform_events`, preservando `event_key` entre execuções (mesma ocorrência não vira evento novo) e mantendo `history` (linha do tempo de mudança de status).

### 2. Enriquecimento por item (`scraper/utils/image_summary.py`)
Roda por notícia individual na coleta, **desligado em produção hoje** (`SCRAPER_AI_SUMMARIES_ENABLED=false` no cron — decisão de custo, ver [`finops-agent`](AGENTS.md)). Quando habilitado, preenche `ai_summary`, `operational_relevance`, `operational_impact`, `region`/`country`/`state`/`city`/`highway`, `risk_level`. Tem fallback determinístico (`build_image_summary_fallback`) para quando a IA está desabilitada ou indisponível.

### 2.1. Resumo do botão "Gerar Resumo" (`api/news-summary.js` → `generateAiSummary`)
Gera o resumo individual mostrado no card compartilhável (canvas em `public/index.html`, `drawShareImage`). Campos obrigatórios do JSON: `image_summary`, `ai_summary`, `region`, `country`, `state`, `city`, `highway`, `km`, `direction`, `status`, `category`, `risk_level`, `operational_relevance`, `operational_impact`, `insufficient_data`.

- **Regra de corte mínimo**: quando não há rodovia/km/UF identificável nem categoria operacional clara, o modelo marca `insufficient_data: true` em vez de gerar uma frase vaga tipo "impacto ainda não confirmado" sem dizer o motivo — o frontend decide como exibir isso, não é responsabilidade do texto "empurrar" a incerteza.
- `km`, `direction` (sentido) e `status` (ativo/controlado/encerrado) vêm vazios (`""`) quando a fonte não informa — nunca inventados.
- `fallbackSummary()` (sem `OPENAI_API_KEY`) preenche a mesma forma de dado, com `km`/`direction`/`status` sempre vazios (a extração determinística por regex ainda não infere esses três campos).
- O card de imagem (`drawShareImage`) agora renderiza um badge de rota (rodovia + região) além dos badges de risco/relevância, e a cor do badge de risco varia por severidade (crítico/alto/médio/baixo) em vez de usar sempre a cor de marca.

### 3. Resumo semanal da frota (`api/_weekly_brief.js` / `scraper/weekly_brief.py`)
O conteúdo é **determinístico**: `buildWeeklyBrief` classifica cada notícia com a régua de risco, descarta o que não tem impacto na frota, agrupa a mesma ocorrência noticiada por vários veículos (mesma rodovia+UF+tipo em 24h, ou títulos parecidos em 48h) e compara com os 7 dias anteriores. As seções são veredito, números com variação, atenção para os próximos dias (bloqueio programado com data citada ainda futura, paralisação, bloqueio de até 72h sem notícia de liberação, aviso INMET de Perigo nas últimas 48h), trechos mais críticos (pontuação 8/4/1 por Crítico/Alto/Médio), segurança da carga, clima por UF, ações (máx. 5) e principais ocorrências.

A IA (opcional) **só reescreve `headline` e `executive_summary`** a partir dos fatos já calculados (`factsForAi`), e qualquer falha mantém o texto automático. O painel (`api/weekly-summary.js`) e o e-mail de segunda-feira (`scraper/weekly_news.py`, ver [`docs/DEPLOY.md`](DEPLOY.md)) usam o mesmo cálculo; a paridade JS × Python é garantida por `tests/fixtures/weekly_items.json` → `weekly_brief_expected.json`.

### 4. Recomendação da tela "Minha Rota" (`api/news-feed.js` → `generateRouteAnalysis`)
Combina trajeto real (Google Routes API, com trânsito) + notícias das últimas 24h cruzadas por rodovia/proximidade geográfica + recomendação por IA. **Tem fallback determinístico completo** (`fallbackRouteAnalysis`): se a chave de API estiver ausente/inválida ou a chamada falhar, a tela continua funcionando com uma síntese baseada em regras (status `validacao_obrigatoria`/`atencao`/`sem_restricao_confirmada` calculado a partir de bloqueios/tráfego detectados, sem IA).

## Padrões que qualquer chamada de IA nova precisa seguir

1. Pré-filtro determinístico antes da chamada (regra/heurística que elimina o óbvio sem custo).
2. `strict: true` no JSON schema — nunca parsing best-effort de texto livre para dado que vai para produção.
3. Fallback funcional sem a chave de API presente ou com a chamada falhando.
4. Evidência rastreável — nunca gravar campo que a IA "alucinou" sem URL/fonte real por trás.
5. Modelo sempre configurável por variável de ambiente (`OPENAI_MODEL`, `OPENAI_EVENT_MODEL`, `OPENAI_IMAGE_MODEL`), nunca hardcoded sem override.
6. Idempotência: reprocessar o mesmo lote não pode gerar uma segunda chamada nem duplicar resultado.

Ver `ai-engineer` em [`docs/AGENTS.md`](AGENTS.md) para o processo completo de revisão dessas regras.

## Custo

Ver `finops-agent` — o controle de custo mais importante hoje é justamente o enriquecimento por item estar desligado em produção, e o pré-filtro determinístico de `event_intelligence.py` reduzir o volume que chega a custar chamada de IA.
