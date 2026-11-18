# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Usuário principal: analista ou gestor de risco (papel `client`).** Trabalha numa torre de controle de transportadora, num embarcador de carga de alto valor ou na própria gerenciadora de risco atendendo um contrato. O trabalho dele é decidir, em tempo real: "esta carga pode sair agora por esta rota?" e "este alerta exige ação imediata ou é só monitoramento?". As telas são desenhadas para ele em primeiro lugar.

Públicos secundários, com telas próprias:
- **Gestor** (papel `manager`): administra os clientes da gerenciadora, como usuários, pacotes, consumo, fontes e relatórios. Tem acesso operacional ilimitado, sem administração total do sistema.
- **Admin** (papel `admin`): responsável técnico pela plataforma (monitoramento, integrações, banco, logs e telas `/developer/*`).

As personas foram derivadas dos papéis reais do sistema, não de pesquisa com usuários (ver `product/PERSONAS.md`).

## Product Purpose

Road News é a camada de inteligência operacional de uma gerenciadora de risco do transporte rodoviário de cargas. O produto coleta notícias de portais e órgãos públicos de hora em hora, filtra o que afeta rotas e cargas e responde: "isso afeta minha operação, onde, quão grave e o que fazer".

O sucesso é medido por três coisas: nenhum cliente ser pego de surpresa por um bloqueio, acidente ou evento crítico na rota de uma carga protegida; o alerta chegar a tempo de mudar a decisão; e a classificação ser confiável o bastante para embasar a liberação da carga.

## Positioning

Não é um agregador de notícias. O que o diferencia:
- toda severidade (Baixo, Médio, Alto, Crítico) mede o impacto na operação da frota e vem com justificativa e link da fonte;
- a notícia é cruzada com a rota real do cliente no "Minha Rota" (trajeto com trânsito via Google Routes e notícias das últimas 24h perto do trajeto);
- toda análise crítica tem uma alternativa por regra, então a tela nunca fica sem resposta quando a IA falha;
- os dados de cada cliente ficam isolados de verdade (multi-tenant com RLS).

O produto não substitui o julgamento de quem libera a carga. Ele dá a esse julgamento a evidência que faltava.

## Operating Context

O painel é usado de três formas, todas confirmadas:
- **Torre de controle, tela fixa:** monitor aberto o turno todo, olhado de relance entre outras ferramentas (rastreamento, telemetria). O estado crítico precisa ser legível num golpe de vista.
- **Desktop sob demanda:** consulta pontual antes de liberar uma carga ou montar um relatório.
- **Celular em campo:** gestor ou operador consulta fora do escritório.

Rotinas que fazem parte do uso:
- coleta de hora em hora;
- resumo semanal da frota toda segunda às 08:00 (America/Sao_Paulo), por e-mail ou no painel;
- Central de Evento, onde o cliente escolhe o que acompanhar ("Acompanhar evento") e a IA atualiza o evento a cada coleta até o encerramento, com a decisão de despacho.

Vocabulário do domínio: rodovia, km, sentido, município, UF, trecho, concessionária. Categorias: acidentes, bloqueios, enchentes, clima severo, roubo de carga, greves, fiscalização, obras. Avisos do INMET.

## Capabilities and Constraints

Telas do cliente: Dashboard, Alertas, Central de Evento, Notícias, Mapa rodoviário, Minha Rota, Salvos, Resumo operacional e Relatórios. O usuário escolhe tema claro ou escuro.

Telas de gestão: Admin, Gestor, Clientes, Usuários, Pacotes, Consumo, Fontes, Relatórios, Monitoramento, Integrações, Banco, Logs e `/developer/*`.

**Pacotes.** O acesso é limitado pelo pacote contratado pela empresa: notícias, resumos de IA, PDFs e análises de rota por mês, número de usuários, e mapa e resumos liga/desliga. Cada usuário tem o próprio saldo mensal. Ao estourar o limite, o sistema bloqueia e pede contato com o gestor.

**Régua de severidade** (é a mesma em painel, mapa, Minha Rota e resumos):
- notícia sem rodovia ou local identificado fica limitada a Médio;
- bloqueio total é sempre Crítico;
- rodovia bloqueada recebe borda vermelha e o aviso "Rodovia bloqueada" ou "parcialmente bloqueada" em todas as telas.

**Stack enxuta e deliberada** (ver `CLAUDE.md`):
- frontend em `public/index.html`, arquivo único em HTML/CSS/JS puro, sem framework e sem build;
- API em funções serverless da Vercel, Node puro, sem dependências npm;
- banco Supabase Postgres;
- IA via OpenAI;
- nenhuma dependência ou framework novo entra sem decisão de arquitetura (ADR).

Ainda não existe: alerta em tempo real fora do e-mail semanal (WhatsApp, Telegram, webhook), app mobile nativo e cadastro sem intervenção de gestor ou admin.

Em aberto: preços e tiers comerciais (`product/PRICING.md` não tem valores de propósito).

## Brand Commitments

O nome **Road News** é definitivo. A identidade visual está aberta: a atual (verde `#1eff95` sobre fundo escuro, Geist Mono) é a incumbente, mas não é vinculante e pode ser substituída num redesign. Tom: operacional, direto e acionável; o produto entrega uma resposta, não uma lista de manchetes.

## Evidence on Hand

- Documentação de produto em `product/`: visão, proposta de valor, funcionalidades, personas, modelo de negócio, pitch, FAQ e onboarding.
- Documentação técnica em `docs/`, incluindo a régua de risco de referência em `docs/domain/risk_golden.json`.
- Dados reais de notícias e eventos no Supabase de produção (há ao menos um pacote piloto ativo).

**Não existem e não devem ser inventados:**
- depoimentos e clientes nomeados;
- estudos de caso e métricas de resultado;
- concorrentes nomeados (`product/COMPETITORS.md` deixa isso em aberto de propósito);
- preços;
- personas validadas com usuários reais.

## Product Principles

1. **Resposta, não manchete.** Cada tela responde se a operação é afetada, onde, quão grave e o que fazer.
2. **Severidade auditável.** Nenhuma classificação aparece sem justificativa e fonte; o cliente precisa confiar na régua, não só no veredito.
3. **O crítico vence tudo.** Bloqueios e eventos críticos aparecem primeiro e de forma inconfundível em qualquer tela e em qualquer contexto de uso (tela fixa, desktop ou celular).
4. **Nunca sem resposta.** A IA falhar não pode deixar a tela vazia; sempre há uma alternativa determinística.
5. **Precisão antes de volume.** Mais fontes ou mais conteúdo só entram se melhoram a decisão de quem libera a carga.
