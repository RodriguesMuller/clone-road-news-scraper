# Pitch — Road News

> Mantido por `product-docs-agent`. Última revisão: 2026-08-06 (primeira publicação).

## Elevator pitch (30 segundos)

Gerenciadoras de risco de transporte rodoviário de cargas perdem tempo lendo notícia genérica pra achar a que importa. O Road News monitora rodovias, clima e eventos logísticos em tempo real, filtra o que realmente afeta uma operação de carga, classifica por gravidade com justificativa auditável, e — na tela Minha Rota — cruza isso com o trajeto real de um veículo pra dizer se ele pode seguir, precisa desviar, ou precisa de validação antes de sair.

## O problema

- Notícia relevante para rodovia está diluída entre um volume muito maior de notícia irrelevante, espalhada em dezenas de portais.
- Ler manualmente não escala e chega tarde — um bloqueio vale muito nos primeiros minutos e quase nada horas depois.
- Decisão de liberar ou não uma carga hoje depende de julgamento humano sobre informação fragmentada, sem trilha de auditoria de por que uma rota foi considerada segura.

## A solução

Um pipeline que já resolve as três partes do problema:
1. **Coleta contínua** de fontes rodoviárias, climáticas e logísticas (nacionais e internacionais), agendada de hora em hora.
2. **Triagem por IA com evidência auditável** — todo evento crítico é classificado com confiança mínima e link para a fonte que sustenta a classificação, nunca uma alucinação.
3. **Cruzamento com a rota real** (Minha Rota): trajeto + trânsito real (Google Routes) + notícias das últimas 24h no raio da rota, com recomendação operacional final — e um caminho de fallback baseado em regra quando a IA não está disponível, pra nunca deixar a tela sem resposta.

## Por que agora / por que este time

O produto já roda em produção com multi-tenancy real (isolamento de dado por cliente, papéis, pacotes com limite de uso), não é um protótipo — a base técnica que sustenta escalar cobertura e clientes já existe.

## O que ainda não é verdade (honestidade deliberada)

Não há hoje alerta em tempo real fora do e-mail semanal, nem canal de WhatsApp/Telegram, nem app mobile nativo. Ver [`../docs/ROADMAP.md`](../docs/ROADMAP.md) para o que é lacuna conhecida vs. o que é decisão deliberada de escopo.
