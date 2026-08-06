# Visão — Road News

> Mantido por `product-docs-agent`. Última revisão: 2026-08-06 (primeira publicação).

## Em uma frase

Fazer com que nenhuma gerenciadora de risco de transporte rodoviário de cargas seja pega de surpresa por um bloqueio, acidente ou evento crítico na rota de uma carga que ela está protegendo.

## O problema que existe hoje

Notícia relevante para operação rodoviária está espalhada entre dezenas de portais, misturada com um volume muito maior de notícia irrelevante. Uma torre de controle ou gestor de risco que tentasse acompanhar isso manualmente teria que ler centenas de manchetes por dia para encontrar as poucas que de fato importam — e mesmo assim chegaria tarde, porque a notícia read não vem com "isso afeta a rota X, aqui está o desvio".

## Onde o Road News quer chegar

Ser a camada de inteligência entre "aconteceu algo na estrada" e "a pessoa certa sabe, no tempo certo, o que fazer" — não mais um agregador de notícias, e sim um sistema que já filtrou, já classificou por gravidade, já cruzou com a rota real do cliente, e já sugere a ação.

Isso significa, na prática, evoluir em três direções ao mesmo tempo:
1. **Cobertura**: mais fontes, sem perder precisão — cada fonte nova passa por um filtro de relevância e legalidade antes de entrar.
2. **Velocidade**: o tempo entre "notícia publicada" e "cliente notificado" é o que separa um alerta útil de uma nota de rodapé.
3. **Confiança**: toda classificação de severidade vem com justificativa auditável — o cliente precisa poder confiar na régua, não só na resposta.

## O que a visão não é

Não é virar um agregador de notícias genérico, nem um produto de mídia. Não é competir em volume de conteúdo — é competir em precisão do que chega até quem decide. Cada fonte, cada regra de classificação, cada alerta existe para responder a uma pergunta operacional concreta, nunca para "ter mais conteúdo".

## Onde isso já é realidade, hoje

A base técnica da visão já existe em produção: coleta contínua, triagem de eventos críticos com evidência auditável, análise de rota cruzando trajeto real com notícia recente, e um modelo de acesso por pacote que já separa clientes por tenant com isolamento real de dado. O que falta não é a arquitetura — é ampliar cobertura de fonte, velocidade de alerta e canais de entrega (ver [`FEATURES.md`](FEATURES.md) e [`../docs/ROADMAP.md`](../docs/ROADMAP.md)).
