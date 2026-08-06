# Material de Vendas — Road News

> Mantido por `product-docs-agent`. Última revisão: 2026-08-06 (primeira publicação). Ponto de partida para conversa comercial — não um script fechado, e não contém preço (ver [`PRICING.md`](PRICING.md) sobre por quê).

## Abertura (dor, não feature)

"Quanto tempo a sua operação gasta hoje tentando descobrir se uma rota está segura antes de liberar uma carga? E quando descobre, já é tarde?" — a conversa começa na dor de decisão sob informação fragmentada, não na lista de features.

## Argumentos que já são verdade (usar com confiança)

- Classificação de gravidade **auditável**: todo evento crítico vem com evidência (link da fonte) e confiança mínima — não é "a IA disse". Isso importa especialmente em conversa com quem já foi pego de surpresa por um alerta impreciso antes.
- **Minha Rota** responde à pergunta específica que o comprador tem na cabeça: "esta carga, nesta rota, agora" — não "notícia de rodovia em geral".
- **Isolamento de dado real** entre clientes — argumento forte se o comprador já usou ferramenta com painel compartilhado ou "modo demo" disfarçado de multi-tenant.
- **Resiliência**: a análise de rota não trava se a IA cair — tem fallback determinístico. Bom argumento técnico para comprador com equipe de TI própria avaliando o produto.

## Argumentos a NÃO usar (ainda não são verdade)

- Alerta em tempo real fora do e-mail semanal — **não existe hoje**. Não prometa.
- Cobertura internacional ampla — só existe onde afeta rota/porto/frete conectado ao Brasil.
- App mobile nativo — não existe.
- Comparação nomeada com concorrente específico — ver [`COMPETITORS.md`](COMPETITORS.md), ainda sem pesquisa validada.

## Objeções prováveis e como responder com honestidade

**"Vocês têm alerta em tempo real?"** — Hoje o canal automatizado é o resumo semanal por e-mail; a análise sob demanda (Minha Rota, resumo individual) é em tempo real dentro do painel. Alerta push/WhatsApp está no roadmap, não em produção.

**"Como sei que a classificação de risco é confiável?"** — Toda classificação crítica tem confiança mínima calculada e evidência rastreável (link da notícia original) — não é uma caixa-preta.

**"E se a IA de vocês cair?"** — A funcionalidade mais crítica (Minha Rota) tem fallback baseado em regra, não depende só da IA para dar uma resposta.

**"Meu concorrente vai ver meus dados?"** — Não; isolamento de tenant é arquitetural (banco + código), não uma promessa de política.

## Próximo passo de venda hoje

Demo ao vivo da tela Minha Rota com uma rota real do prospect é o argumento mais forte disponível — mostra a proposta de valor central (rota + notícia + recomendação) sem depender de material comparativo ainda não validado.
