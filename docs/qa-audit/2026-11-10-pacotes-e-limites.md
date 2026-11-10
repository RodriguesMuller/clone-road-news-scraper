# QA — Pacotes e limites de uso (2026-11-10)

**Escopo:** cobrança dos limites de cada funcionalidade por cliente (consultas de notícias, Minha Rota, IA, PDF e mapa), vigência dos pacotes, atribuição de pacote e limite de usuários, e a tela de gestão "Uso e notificações".
**Método:** simulador do Supabase com estado (`tests/helpers/fake_supabase.js`), em que o consumo gravado por uma chamada é visto pela seguinte. Os handlers reais da API rodaram 20 cenários de uso, incluindo requisições simultâneas, e cada defeito virou teste de regressão (`tests/test_package_limits.js`).
**Resultado:** 7 defeitos encontrados e corrigidos (1 deles introduzido durante a própria correção e pego pelos testes antes do merge). 20/20 cenários passando; suíte JS 65/65 e Python 42/42.

## Como o controle funciona (após a correção)

1. Toda funcionalidade com limite passa por `assertCanUse` no servidor (`api/_auth.js`). A verificação segue esta ordem: pacote vigente, recurso incluído no pacote, saldo do mês.
2. **O saldo é do cliente (empresa).** Todos os usuários da mesma empresa somam no mesmo limite do pacote. Usuário sem empresa conta sozinho.
3. O uso é **reservado de forma atômica**: o evento é gravado e o saldo é recontado. Se requisições simultâneas passarem do limite, fica quem gravou primeiro, e as excedentes são desfeitas e bloqueadas.
4. A ação que não chega a acontecer **devolve** o uso. Exemplos: Minha Rota com entrada inválida ou falha do Google; resumo sem IA disponível.
5. Admin e Gestor seguem ilimitados. Tentativas bloqueadas ficam registradas (`blocked_*`) para auditoria e não consomem saldo.

| Funcionalidade | Campo do pacote | Conta como 1 uso |
|---|---|---|
| Consultas de notícias | `monthly_news_limit` | cada abertura ou atualização do painel |
| Minha Rota | `monthly_route_limit` | cada rota calculada com sucesso |
| IA (resumo individual, resumo semanal e IA da Minha Rota) | `monthly_ai_summary_limit` (saldo único) | cada geração em que a IA foi de fato usada |
| PDF | `monthly_pdf_limit` | cada exportação |
| Mapa | `can_access_map` (liga/desliga) | sem limite numérico |
| Resumo individual / semanal | `can_generate_individual_summary` / `can_generate_weekly_summary` | liga/desliga + saldo de IA |

## Defeitos encontrados e correções

| # | Gravidade | Defeito | Como foi corrigido |
|---|---|---|---|
| **1** | Alta | **O limite era por usuário, não por cliente.** Cada usuário de uma empresa ganhava o saldo inteiro do pacote: uma empresa com 5 usuários num pacote de 100 consultas tinha, na prática, 500. | O consumo passa a ser contado por `usage_events.client_id` (`monthlyUsage`/`featureUsage` recebem a conta e usam o escopo do cliente). Fallback para contagem por usuário se o banco não tiver a coluna. `my-access` e a tela de gestão usam o mesmo escopo. |
| **2** | Alta | **Corrida entre verificar e gravar:** 5 requisições simultâneas com saldo 2 passaram todas. Com vários usuários da mesma empresa, isso fura o limite. | Reserva atômica (`reserveUsage`): grava, reconta e, se passou do limite, mantém só as primeiras pela ordem de gravação (`firstUsageIds`) e desfaz as demais (`releaseUsage`). Aplicada a notícias, PDF, mapa, Minha Rota e às três gerações de IA. Na corrida da IA, Minha Rota e resumo semanal seguem com o texto automático em vez de falhar. |
| **3** | Média | **Pacote com início no futuro já liberava tudo.** `starts_at` era ignorado. | `getActivePackage` passa a exigir `starts_at <= agora`. |
| **4** | Média | **Trocar o pacote para um inválido deixava o usuário sem pacote.** O pacote atual era encerrado antes de validar o novo. | `admin-user-package` valida o pacote novo e as vagas **antes** de encerrar o atual. |
| **5** | Média | **`max_users` contava a plataforma inteira.** Se uma empresa ocupasse as vagas de um pacote, nenhuma outra conseguia usá-lo. | `packageSeatsUsed` conta as vagas por cliente. Vale na atribuição e na criação de usuário. Reatribuir o mesmo pacote não conta a própria vaga. |
| **6** | Média | **Vínculos vencidos ocupavam vaga.** Pacote com `ends_at` no passado ainda contava em `max_users`. | Só vínculos vigentes ocupam vaga. |
| **7** | Média | **Tela de gestão subcontava o consumo.** Carregava no máximo 1000 eventos do mês (limite do Supabase por resposta) e contava por usuário. | `admin-data` pagina os eventos em blocos de 1000 (até 20.000, com aviso explícito se passar disso) e o painel conta pelo mesmo escopo do servidor. |
| — | (regressão) | Durante a correção, `aiAllowed` deixou de existir em `handleRouteAnalysis` e a Minha Rota passaria a responder erro 500. | Pego pelo teste existente de Minha Rota antes do merge e corrigido. |

Ajuste de texto: os avisos de 80% e 90% de consumo agora dizem "sua empresa", porque o saldo é da empresa.

## O que foi verificado e está correto

- Limite mensal por recurso: libera até o limite e bloqueia o seguinte, com mensagem clara.
- O saldo de IA é único para o resumo individual, o resumo semanal e a IA da Minha Rota.
- Consumo do mês anterior não conta (o ciclo vira no dia 1, no horário de Brasília).
- Recurso fora do pacote (ex.: mapa) bloqueia, e o bloqueio fica registrado.
- Pacote vencido ou desativado bloqueia; cliente inativo bloqueia todos os usuários dele.
- Admin e Gestor ficam ilimitados, mesmo sem pacote.
- `my-access` (o que o painel mostra) bate com o que o servidor cobra.

## Pontos de atenção (sem correção de código)

1. **Impacto da mudança 1 em produção:** a partir do deploy, empresas com vários usuários passam a dividir o saldo. Antes de publicar, vale revisar os limites dos pacotes de clientes com equipes grandes.
2. **"Consultas de notícias" conta aberturas do painel**, não notícias lidas. Dimensione `monthly_news_limit` pelo número de acessos esperados da equipe inteira.
3. **Coluna `usage_events.client_id`:** a contagem por cliente depende dela. Sem a coluna, o sistema volta a contar por usuário. Para conferir no Supabase:
   `select column_name from information_schema.columns where table_name = 'usage_events' and column_name = 'client_id';`
4. **PDF é gerado no navegador.** O servidor controla a autorização, mas não consegue impedir alguém tecnicamente avançado de imprimir a tela sem passar por ela.
5. A tela de gestão mostra, para cada usuário, o consumo da empresa dele, que é o saldo que de fato o bloqueia.

## Testes adicionados

- `tests/helpers/fake_supabase.js`: simulador PostgREST + Auth com estado. Entende os filtros `eq`, `in`, `gte`, `gt`, `lte`, `lt`, `is.null` e `or`, e a paginação, com teto de 1000 linhas como o Supabase.
- `tests/test_package_limits.js`: 8 testes de ponta a ponta, cobrindo limites, limite por cliente, vigência, concorrência, Minha Rota, atribuição de pacote, vagas por cliente e paginação da gestão.
