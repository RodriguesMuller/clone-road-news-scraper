# FAQ — Road News

> Mantido por `product-docs-agent`. Última revisão: 2026-08-06 (primeira publicação). Respostas verificadas contra o comportamento real do produto — nenhuma aqui descreve uma capacidade que não existe hoje.

**De onde vêm as notícias?**
De portais e órgãos públicos monitorados continuamente (RSS, HTML, APIs públicas), incluindo INMET para clima e uma concessionária de rodovia para ocorrência em tempo real. Lista completa em [`../docs/SCRAPERS.md`](../docs/SCRAPERS.md).

**Com que frequência o sistema atualiza?**
Coleta roda de hora em hora. A tela Minha Rota considera notícias das últimas 24h.

**Como o sistema decide o que é "crítico"?**
Combinação de regra determinística (padrão de texto, infraestrutura estratégica) e classificação por IA com confiança mínima calculada — nunca uma classificação sem justificativa e evidência (link da fonte). Detalhe técnico em [`../docs/AI_PIPELINE.md`](../docs/AI_PIPELINE.md).

**E se a IA estiver fora do ar?**
A tela Minha Rota continua funcionando com uma recomendação baseada em regra determinística (trânsito real + bloqueios detectados), sem depender da IA estar disponível.

**Meus dados ficam visíveis para outros clientes?**
Não — isolamento de tenant por controle de acesso em duas camadas (banco de dados e código da API), não um "modo demo" compartilhado.

**Como adiciono um usuário novo na minha empresa?**
Hoje é feito pelo gestor da plataforma (papel `manager`/`admin`), não por self-signup. Ver [`ONBOARDING.md`](ONBOARDING.md).

**Recebo alerta em tempo real?**
Hoje, o canal automatizado é o resumo semanal por e-mail (segunda-feira de manhã) — não há WhatsApp/Telegram/webhook ainda. Ver [`../docs/ROADMAP.md`](../docs/ROADMAP.md).

**Posso analisar uma rota específica antes de liberar uma carga?**
Sim — a tela Minha Rota cruza o trajeto (com trânsito real via Google Routes) com notícias recentes no raio da rota e devolve uma recomendação (seguir / atenção / validação obrigatória).

**O que acontece se eu atingir o limite do meu pacote?**
A funcionalidade correspondente é bloqueada com uma mensagem específica, orientando contato com o gestor da plataforma para ajustar o pacote.

**O produto cobre eventos fora do Brasil?**
Só quando afetam rota, porto, frete ou cadeia de suprimentos conectados ao Brasil (ex. fechamento de um canal estratégico internacional) — não é cobertura internacional geral.
