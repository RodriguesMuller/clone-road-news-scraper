# Features — Road News

> Mantido por `product-docs-agent`. Última revisão: 2026-11-10 (impacto na frota e destaque de bloqueios). Cada feature abaixo existe de verdade no código (verificado contra `api/_auth.js: FEATURE_RULES` e as rotas de `vercel.json`) — nada aqui é aspiracional; itens futuros estão em [`../docs/ROADMAP.md`](../docs/ROADMAP.md).

## Features controladas por pacote (o que pode ser limitado/vendido)

| Feature | O que o cliente vê | Limite técnico que a sustenta |
|---|---|---|
| Consulta de notícias | Feed só com o que impacta a frota (bloqueio, acidente, clima, roubo de carga, greve, obra, restrição), cada notícia com a ação sugerida ("Impacto na frota"), atualizado de hora em hora | `monthly_news_limit` |
| Resumo individual por IA | Resumo de uma notícia específica, gerado por IA | `monthly_ai_summary_limit` + `can_generate_individual_summary` |
| Resumo semanal por IA | Resumo operacional da semana, por e-mail ou sob demanda no painel | `monthly_ai_summary_limit` + `can_generate_weekly_summary` |
| Geração de PDF | Exportar conteúdo em PDF | `monthly_pdf_limit` |
| Acesso ao mapa | Mapa rodoviário com marcadores de risco, agrupados por zoom; rodovias bloqueadas sempre visíveis, com destaque vermelho | `can_access_map` |
| Minha Rota | Análise de trajeto: trânsito real + notícias cruzadas por proximidade + recomendação (IA com fallback por regra); bloqueios no trajeto aparecem primeiro, com sugestão de rota alternativa | `monthly_route_limit` |

## Telas do painel (cliente)

Dashboard · Alertas · Central de Eventos · Notícias · Salvos · Resumo Operacional · Tendências · Fontes · Relatórios · Configurações · Mapa · Minha Rota · Resumo Semanal.

## Telas de gestão (papéis `manager`/`admin`)

Admin · Gestor · Clientes · Usuários · Pacotes · Consumo · Fontes (gestor) · Relatórios (gestor) · Monitoramento · Integrações · Banco · Logs · e o conjunto `/developer/*` (visão técnica de clientes, fontes, relatórios, usuários, pacotes, consumo, configurações).

## Como a classificação de gravidade funciona (o motivo pra confiar no alerta)

Toda notícia recebe um nível de risco que mede o **impacto na operação da frota**, sempre com justificativa visível no painel:

| Nível | Quando | Exemplo |
|---|---|---|
| Crítico | Via indisponível agora ou carga sob ameaça imediata | Carreta tomba e interdita a Bandeirantes; INMET Grande Perigo |
| Alto | Impacto forte e provável | Caminhão tombado na BR-459; acidente com morte; roubo de carga; bloqueio total programado |
| Médio | Atraso ou atenção | Acidente sem interdição; bloqueio parcial; obra; neblina; INMET Perigo Potencial |
| Baixo | Sem impacto atual | Trecho liberado; acidente no exterior; notícia de julgamento; greve negada |

Notícia sem rodovia ou local identificado fica limitada a Médio. A mesma régua vale para painel, mapa, Minha Rota, resumo individual e resumo semanal. Notícia de rodovia bloqueada recebe borda vermelha e o aviso "Rodovia bloqueada" (ou "parcialmente bloqueada") em todas as telas, e bloqueio total é sempre Crítico. Eventos logísticos maiores (greve, bloqueio de porto, interdição estratégica) passam por uma triagem adicional com confiança mínima calculada e evidência (link da fonte) obrigatória — nunca uma classificação sem justificativa auditável. Ver [`../docs/AI_PIPELINE.md`](../docs/AI_PIPELINE.md).

## O que existe mas ainda não é "feature vendável" (uso interno/técnico)

Multi-tenancy, isolamento por RLS, papéis e provisionamento — são a fundação que sustenta tudo acima, não algo que o cliente final compra separadamente.

## O que não existe ainda

Alerta em tempo real fora do e-mail semanal (WhatsApp/Telegram/webhook), app mobile nativo, self-signup sem intervenção de `manager`/`admin`. Ver [`../docs/ROADMAP.md`](../docs/ROADMAP.md).
