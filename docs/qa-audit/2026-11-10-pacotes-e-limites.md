# QA — Pacotes e limites de uso (2026-11-10)

**Escopo:** cobrança dos limites de cada funcionalidade (consultas de notícias, Minha Rota, IA, PDF e mapa), herança do pacote do cliente, vigência dos pacotes, atribuição de pacote e limite de usuários, e a tela de gestão "Uso e notificações".

**Regra de negócio:** o usuário **herda as configurações (pacote) do cliente** a que pertence, mas **não herda o uso**. Cada usuário tem o próprio saldo mensal dentro dos limites do pacote da empresa.

**Método:** simulador do Supabase com estado (`tests/helpers/fake_supabase.js`), em que o consumo gravado por uma chamada é visto pela seguinte. Os handlers reais da API rodaram os cenários de uso, incluindo requisições simultâneas, e cada defeito virou teste de regressão (`tests/test_package_limits.js`).

**Resultado:**
- 6 defeitos encontrados e corrigidos.
- Herança do pacote do cliente implementada.
- 11 testes de ponta a ponta passando; suíte JS 68/68 e Python 42/42.

## Como o controle funciona (após a correção)

1. **Pacote efetivo do usuário.** Se o cliente tem pacote configurado (`clients.package_id`), o usuário herda esse pacote. Só quando o cliente não tem pacote vale o pacote individual do usuário (modelo anterior, mantido por compatibilidade).
2. **Verificação no servidor.** Toda funcionalidade com limite passa por `assertCanUse` (`api/_auth.js`), nesta ordem: pacote vigente, recurso incluído no pacote, saldo do mês.
3. **Saldo de cada usuário.** O consumo é contado por usuário: o que um usuário da empresa gasta não reduz o saldo de outro.
4. **Reserva atômica.** O evento é gravado e o saldo é recontado. Se requisições simultâneas do mesmo usuário (ex.: duas abas) passarem do limite, fica quem gravou primeiro; as excedentes são desfeitas e bloqueadas.
5. **Devolução do uso.** A ação que não chega a acontecer devolve o uso. Exemplos: Minha Rota com entrada inválida ou falha do Google; resumo sem IA disponível.
6. **Vagas.** Com pacote herdado, `max_users` limita quantos usuários Cliente ativos a empresa pode ter.
7. **Perfis privilegiados.** Admin e Gestor seguem ilimitados.
8. **Auditoria.** Tentativas bloqueadas ficam registradas (`blocked_*`) e não consomem saldo.

| Funcionalidade | Campo do pacote | Conta como 1 uso do usuário |
|---|---|---|
| Consultas de notícias | `monthly_news_limit` | cada abertura ou atualização do painel |
| Minha Rota | `monthly_route_limit` | cada rota calculada com sucesso |
| IA (resumo individual, resumo semanal e IA da Minha Rota) | `monthly_ai_summary_limit` (saldo único) | cada geração em que a IA foi de fato usada |
| PDF | `monthly_pdf_limit` | cada exportação |
| Mapa | `can_access_map` (liga/desliga) | sem limite numérico |
| Resumo individual / semanal | `can_generate_individual_summary` / `can_generate_weekly_summary` | liga/desliga + saldo de IA |

## Implementado: herança do pacote do cliente

| O quê | Onde |
|---|---|
| Coluna `clients.package_id` | `scripts/supabase_client_package.sql` (idempotente). Sem a coluna, o sistema segue com o pacote por usuário, sem erro. |
| Pacote efetivo: do cliente; senão, o individual | `getEffectivePackage` em `api/_auth.js`; `my-access` informa `package_source` (`client`/`user`) |
| Pacote no cadastro do cliente | `admin-data.js`: valida se o pacote está ativo e comporta os usuários ativos que a empresa já tem |
| Cadastro de usuário sem pacote individual quando o cliente tem pacote | `admin-users.js`: vaga contada pelos usuários Cliente ativos da empresa |
| Pacote herdado não pode ser trocado no usuário | `admin-user-package.js`: o pacote se altera no cliente |
| Pacote em uso por cliente não pode ser excluído | `admin-packages.js` |
| Painel | Campo "Pacote do cliente" no formulário. O usuário mostra "Herdado do cliente", o campo pacote do cadastro e da edição fica travado, e o card do cliente mostra o pacote. |

## Defeitos encontrados e correções

| # | Gravidade | Defeito | Como foi corrigido |
|---|---|---|---|
| **1** | Alta | **Corrida entre verificar e gravar:** 5 requisições simultâneas com saldo 2 passaram todas. | Reserva atômica (`reserveUsage`): grava, reconta e, se passou do limite, mantém só as primeiras pela ordem de gravação (`firstUsageIds`) e desfaz as demais (`releaseUsage`). Aplicada a notícias, PDF, mapa, Minha Rota e às três gerações de IA. Na corrida da IA, Minha Rota e resumo semanal seguem com o texto automático em vez de falhar. |
| **2** | Média | **Pacote com início no futuro já liberava tudo.** `starts_at` era ignorado. | `getActivePackage` passa a exigir `starts_at <= agora`. |
| **3** | Média | **Trocar o pacote para um inválido deixava o usuário sem pacote.** O pacote atual era encerrado antes de validar o novo. | `admin-user-package` valida o pacote novo e as vagas **antes** de encerrar o atual. |
| **4** | Média | **`max_users` contava a plataforma inteira.** Se uma empresa ocupasse as vagas de um pacote, nenhuma outra conseguia usá-lo. | Vagas contadas por cliente (`packageSeatsUsed`; `clientSeatsUsed` no pacote herdado). Reatribuir o mesmo pacote não conta a própria vaga. |
| **5** | Média | **Vínculos vencidos ocupavam vaga.** Pacote com `ends_at` no passado ainda contava em `max_users`. | Só vínculos vigentes ocupam vaga. |
| **6** | Média | **Tela de gestão subcontava o consumo.** Carregava no máximo 1000 eventos do mês (limite do Supabase por resposta). | `admin-data` pagina os eventos em blocos de 1000 (até 20.000, com aviso explícito se passar disso). |
| — | (regressão) | Durante a correção, `aiAllowed` deixou de existir em `handleRouteAnalysis` e a Minha Rota passaria a responder erro 500. | Pego pelo teste existente de Minha Rota antes do merge e corrigido. |

## O que foi verificado e está correto

- Limite mensal por recurso: libera até o limite e bloqueia o seguinte, com mensagem clara.
- Usuários da mesma empresa têm saldos independentes, com os limites do pacote do cliente.
- O pacote do cliente vale sobre um pacote individual antigo do usuário.
- O saldo de IA é único para o resumo individual, o resumo semanal e a IA da Minha Rota.
- Consumo do mês anterior não conta (o ciclo vira no dia 1, no horário de Brasília).
- Recurso fora do pacote (ex.: mapa) bloqueia, e o bloqueio fica registrado.
- Pacote vencido ou desativado bloqueia.
- Cliente inativo bloqueia todos os usuários dele.
- Admin e Gestor ficam ilimitados, mesmo sem pacote.
- `my-access` (o que o painel mostra) bate com o que o servidor cobra.

## Pontos de atenção

1. **Migration necessária:** rode `scripts/supabase_client_package.sql` no SQL Editor do Supabase. Sem ela, nada quebra: o painel avisa ao tentar salvar o pacote do cliente e os usuários seguem com o pacote individual.
2. **Transição:** depois do deploy, nada muda até um cliente receber um pacote. A partir daí, os usuários dele passam a usar o pacote do cliente, e o pacote individual antigo é ignorado.
3. **"Consultas de notícias" conta aberturas do painel**, não notícias lidas. Dimensione `monthly_news_limit` pelos acessos esperados de cada usuário.
4. **PDF é gerado no navegador.** O servidor controla a autorização, mas não consegue impedir alguém tecnicamente avançado de imprimir a tela sem passar por ela.
5. **Reativação de usuário:** ativar um usuário bloqueado não verifica `max_users`; só o cadastro e a troca de pacote do cliente verificam.

## Testes adicionados

- `tests/helpers/fake_supabase.js`: simulador PostgREST + Auth com estado.
  - Entende os filtros `eq`, `neq`, `in`, `gte`, `gt`, `lte`, `lt`, `is.null` e `or`, a paginação (com teto de 1000 linhas como o Supabase) e o cadastro de usuários do Auth admin.
- `tests/test_package_limits.js`: 11 testes de ponta a ponta, cobrindo:
  - limites e saldo por usuário;
  - herança do pacote do cliente;
  - vigência;
  - concorrência;
  - Minha Rota;
  - atribuição de pacote;
  - vagas por cliente;
  - cadastro com pacote herdado;
  - pacote no cliente;
  - paginação da gestão.
