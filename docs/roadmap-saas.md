# Road News - Auditoria tecnica e roadmap SaaS

## Controle do documento

- Fase: 0 - Auditoria inicial e plano tecnico
- Branch: `feature/phase-0-audit`
- Base analisada: commit `402e3d3` da branch `staging`
- Data da auditoria: 2026-07-16
- Escopo desta entrega: documentacao; nenhuma funcionalidade ou schema foi alterado
- Producao: nao acessada, nao alterada e nao testada
- Banco de producao: nao consultado

## Decisao de seguranca para staging

O staging ainda nao esta aprovado para testes integrados.

A branch `staging` possui uma protecao de somente leitura, mas o plano anterior
previa reutilizar o mesmo Supabase de producao. A regra atual do projeto proibe
usar o Supabase de producao em testes, mesmo quando a aplicacao tenta bloquear
escritas. Portanto:

1. `road-news-preview.vercel.app` nao deve receber as chaves do Supabase de
   producao.
2. Deve ser criado um projeto Supabase exclusivo para staging.
3. Auth, banco, publishable key, service role e redirects devem ser exclusivos
   de staging.
4. Os testes de integracao das proximas fases so podem comecar depois desse
   isolamento.
5. Ate la, somente testes unitarios e simulados, sem rede e sem dados reais,
   estao autorizados.

Esse isolamento e o gate obrigatorio `G0.1`, anterior ao inicio da Fase 1.

## Resumo executivo

O Road News funciona hoje como uma aplicacao hibrida:

- frontend estatico em HTML, CSS e JavaScript puro;
- funcoes serverless Node.js CommonJS na Vercel;
- scraper e weekly news em Python;
- Supabase Auth, REST e PostgreSQL;
- GitHub Actions para coleta horaria e e-mail semanal;
- OpenAI Responses API para resumos;
- Resend para e-mails.

A base ja possui login, perfis, pacotes, limites iniciais, mapa, resumos com IA,
gestao de usuarios e auditoria basica. Entretanto, ainda nao e um SaaS
multiempresa isolado. Os principais bloqueios sao:

- frontend aponta diretamente para um projeto Supabase fixo;
- staging ainda nao possui Supabase proprio;
- `profiles` nao possui relacionamento formal com `clients` nos scripts base;
- clientes sao derivados de `company_name`, um texto livre;
- RLS atual nao isola dados por cliente;
- APIs usam service role e dependem de filtros manuais ainda sem tenant;
- scripts SQL concorrentes redefinem funcoes e policies com regras diferentes;
- scraper recria uma policy publica de leitura de `news` a cada execucao;
- frontend monolitico possui funcoes duplicadas e muitas telas preparadas, mas
  ainda sem persistencia real;
- ha exatamente 12 funcoes publicas, limite atual do plano Hobby da Vercel.

Conclusao: a Fase 1 pode comecar somente depois de criar o Supabase de staging e
introduzir configuracao publica por ambiente. A Fase 2 deve consolidar migrations
e tenant isolation antes de expandir pacotes, notificacoes ou relatorios.

## 1. Estrutura do repositorio

```text
road-news-scraper/
|-- .github/workflows/
|   |-- scraper.yml
|   `-- weekly-news.yml
|-- api/                    # 12 Vercel Functions Node.js
|-- config/
|   `-- sources.yaml        # fontes e filtros do scraper
|-- docs/                   # documentacao tecnica
|-- lib/
|   `-- invite-email.js     # template e envio de convite via Resend
|-- public/
|   |-- index.html          # frontend monolitico
|   |-- privacidade.html
|   `-- termos.html
|-- scraper/
|   |-- sources/            # RSS, HTML, Arteris e INMET
|   |-- storage/            # PostgreSQL e adaptador legado Sheets
|   |-- utils/              # filtros, resumo e timezone
|   `-- weekly_news.py
|-- scripts/                # SQL avulso, e-mail e configuracao Vercel
|-- tests/                  # unittest Python e scripts Node sem runner
|-- main.py                 # entrada do scraper
|-- vercel.json             # rewrites da SPA estatica
`-- requirements.txt
```

Nao ha `package.json`, bundler, framework de componentes, TypeScript, lint ou
pipeline de build do frontend.

## 2. Framework e runtime

### Frontend

- HTML/CSS/JavaScript puro em `public/index.html`.
- 5.626 linhas e aproximadamente 279 KB em um unico arquivo.
- Supabase JS carregado de `unpkg.com` com a faixa `@2`, sem versao exata.
- Leaflet 1.9.4 e MarkerCluster 1.5.3 carregados via CDN.
- Renderizacao por `innerHTML`, estado global e exibicao/ocultacao de secoes.
- Roteamento manual com History API e rewrites da Vercel.

### Backend web

- 12 funcoes serverless JavaScript CommonJS em `api/`.
- Sem framework HTTP; handlers manipulam `req` e `res` diretamente.
- Helpers compartilhados em `api/_auth.js` e `api/_admin.js`.
- Integracoes externas feitas com `fetch` nativo.

### Coleta e e-mail semanal

- Python 3.11 no GitHub Actions; `.python-version` local indica 3.12.
- Requests, BeautifulSoup, feedparser, psycopg, PyYAML e python-dotenv.
- GitHub Actions executa o scraper a cada hora.
- Weekly news roda segunda-feira, 08:00 de Brasilia.

## 3. Autenticacao

### Fluxo atual

1. O frontend consulta `GET /api/auth-config`.
2. Quando auth esta ativa, cria um cliente Supabase no navegador.
3. Login usa `signInWithPassword`.
4. A sessao fica sob responsabilidade do Supabase JS.
5. O front envia `Authorization: Bearer <access_token>` para as APIs.
6. `api/_auth.js` valida o token em `/auth/v1/user`.
7. O backend carrega `profiles` usando service role.
8. Apenas perfil com `status = active` continua.
9. `requireManager` aceita `manager` e `admin`.
10. `requireAdmin` aceita somente `admin`.

### Convite e recuperacao

- `/accept-invite` e `/auth/callback` sao rewrites para o frontend.
- A tela aceita code/query ou tokens no hash e permite criar senha.
- A branch analisada gera links pelo Supabase Admin e envia e-mail via Resend.
- Recuperacao de senha usa o e-mail do Supabase Auth.

### Riscos da autenticacao

- `SUPABASE_URL` e publishable key estao fixos no frontend.
- `api/_auth.js` tambem possui fallback fixo para um projeto Supabase.
- Isso impede isolamento confiavel entre staging e producao.
- O frontend depende de CDN para carregar o SDK de autenticacao.
- Nao ha Content Security Policy ou Subresource Integrity.
- Login e logout ainda nao geram eventos formais de auditoria.

## 4. Role real e viewMode

### Role real

O role real vem de `profiles.role`:

- `client`
- `manager`
- `admin`

O backend usa esse role para autorizacao. Esse e o controle de seguranca que
deve prevalecer.

### viewMode

`viewMode` e uma preferencia de interface armazenada no `localStorage`:

- `client`
- `manager`
- `developer`

Regras atuais:

- client real: somente modo client;
- manager real: client ou manager;
- admin real: client, manager ou developer.

O seletor nao altera o role no Supabase. Ele apenas muda menus e telas. Isso e
correto como conceito, mas nao pode ser usado como autorizacao no backend.

### Defeito identificado

Existem declaracoes duplicadas no frontend para:

- `setViewMode`
- `toggleViewMode`
- `canAccessAdminView`
- `shouldShowAdminNavigation`

O JavaScript usa a ultima declaracao e ignora silenciosamente a anterior. A
Fase 1 deve remover as versoes obsoletas e adicionar testes de navegacao por
role.

## 5. Sidebar e navegacao

`SIDEBAR_GROUPS` define menus para client, manager e developer.

### Cliente

- Alertas
- Noticias
- Mapa rodoviario
- Salvos
- Fontes
- Resumo operacional
- Configuracoes no rodape

### Gestor

- Operacao: alertas, noticias, mapa, fontes e resumo operacional
- Gestao: clientes, usuarios, pacotes, uso/notificacoes e relatorios

### Admin/Desenvolvedor

- Operacao
- Gestao
- Administracao tecnica: saude, monitoramento, integracoes, banco e logs

O roteamento e manual por `routeTarget()` e `applyRoute()`. A Vercel reescreve
todas as rotas para `/`. O front valida rotas conforme role/viewMode, mas varias
paginas tecnicas sao apresentacoes derivadas do estado atual ou placeholders.

## 6. Renderizacao das paginas

O frontend nao possui paginas ou componentes separados. Todas as views vivem em
`public/index.html`:

- login;
- usuario bloqueado;
- aceite de convite;
- alertas/noticias;
- salvos;
- fontes cliente;
- resumo operacional;
- mapa;
- modais de imagem, weekly summary, edicao e confirmacao;
- secoes de cliente, usuario, pacote, consumo, logs e administracao tecnica.

O estado e global no objeto `state`. Mudancas chamam funcoes `render*` que
substituem HTML. Isso acelera o prototipo, mas eleva o risco de regressao e
dificulta testes por tela.

### Funcionalidades locais, nao SaaS

- Noticias salvas ficam em `localStorage`, nao em `saved_news`.
- Regras de notificacao ficam em `localStorage`, nao em `notification_rules`.
- Clientes sao agrupados por `profiles.company_name`.
- Fontes no admin sao derivadas das noticias carregadas.
- Saude, integracoes, banco e monitoramento incluem dados estimados ou textos
  de estrutura preparada.

## 7. Uso do Supabase

### Browser

- Supabase Auth para login, logout, sessao, convite e troca de senha.
- Quando auth esta desativada, o browser pode consultar `news` diretamente com
  a publishable key.
- URL e key publicas estao fixas no arquivo do frontend.

### Vercel Functions

- Por padrao, `supabaseFetch()` usa service role.
- Leitura e escrita via PostgREST.
- Validacao do token de usuario usa a publishable key.
- APIs administrativas usam `requireManager` ou `requireAdmin` antes da service
  role.

### Python

- Scraper usa `DATABASE_URL` e conexao PostgreSQL direta.
- Weekly news tambem consulta PostgreSQL diretamente.
- O scraper cria `news` se necessario, inspeciona colunas e insere registros.

## 8. Inventario de tabelas

O banco de producao nao foi consultado, conforme a regra de seguranca. A tabela
abaixo representa somente o schema declarado no codigo e nos scripts SQL. A
existencia real deve ser confirmada no futuro Supabase de staging.

| Tabela | Declarada em | Estado no codigo | Observacao |
|---|---|---|---|
| `news` | `scraper/storage/postgres.py` | usada | criada dinamicamente pelo scraper |
| `profiles` | `supabase_auth_access.sql` | usada | sem `client_id` declarado |
| `packages` | `supabase_auth_access.sql` | usada | limites iniciais por usuario |
| `user_packages` | `supabase_auth_access.sql` | usada | vinculo pacote/usuario |
| `usage_events` | `supabase_auth_access.sql` | usada | eventos e tokens; `client_id` sem FK declarada |
| `audit_logs` | `supabase_auth_access.sql` | usada | auditoria administrativa parcial |
| `clients` | `supabase_platform_environments.sql` | preparada | nao ligada a `profiles` |
| `sources` | `supabase_platform_environments.sql` | preparada | scraper ainda usa YAML |
| `platform_events` | `supabase_platform_environments.sql` | preparada | UI nao consulta a tabela |
| `platform_integrations` | `supabase_platform_environments.sql` | preparada | UI nao consulta a tabela |
| `notification_rules` | `supabase_platform_environments.sql` | preparada | UI usa localStorage |
| `saved_news` | ausente | inexistente no repo | necessaria para SaaS |

### Inconsistencias de dados

- `profiles` possui `company_name`, mas nao `client_id` nos scripts base.
- O backend tenta registrar `account.profile.client_id`, que tende a ser nulo.
- `clients.package_id` e `user_packages.package_id` criam dois possiveis donos
  do pacote, sem regra canonica.
- `usage_events.news_id` e `uuid`, enquanto `news.id` e `bigserial`; um FK nao
  pode ser criado sem alinhar tipos.
- `usage_events.client_id` e apenas UUID, sem FK para `clients` no script base.
- Campos de data em `news` misturam `text` e `timestamptz`.

## 9. RLS e policies declaradas

### Protecoes existentes

- RLS e habilitada para perfis, pacotes, vinculos, consumo e auditoria.
- Funcoes `is_admin` e `is_manager_or_admin` usam `security definer` e
  `search_path = public`.
- Usuario comum le o proprio perfil e pacote ativo.
- Escritas administrativas sao limitadas a manager/admin em parte das policies.

### Riscos criticos

1. Nao existe tenant isolation por `client_id`.
2. Manager tem acesso global a diversas tabelas.
3. `clients`, `sources`, `platform_events`, `platform_integrations` e
   `notification_rules` usam uma policy geral de manager/admin para todas as
   operacoes.
4. APIs com service role ignoram RLS e precisam de filtros de tenant explicitos.
5. Ha tres scripts que redefinem as mesmas funcoes e policies com semanticas
   diferentes: `supabase_auth_access.sql`, `supabase_packages_rls.sql` e
   `supabase_platform_environments.sql`.
6. Nao ha migration ledger que prove qual versao foi aplicada.
7. `supabase_secure_news_optional.sql` remove acesso direto a `news`, mas o
   scraper executa `PUBLIC_READ_POLICY` a cada coleta e recria uma policy de
   leitura para `anon, authenticated`. Portanto, a protecao opcional pode ser
   desfeita na execucao seguinte do scraper.

## 10. API routes

Existem exatamente 12 funcoes publicas, o limite ja encontrado no plano Hobby.

| Rota | Metodos | Protecao | Finalidade |
|---|---|---|---|
| `/api/auth-config` | GET | publica | modo auth e ambiente |
| `/api/my-access` | GET | conta | role, pacote, limites e consumo |
| `/api/news-feed` | GET | conta | noticias, mapa e contagem |
| `/api/news-summary` | POST | pacote/IA | resumo individual OpenAI |
| `/api/weekly-summary` | GET/POST | pacote/IA | resumo semanal OpenAI |
| `/api/usage-event` | POST | pacote | registra PDF/IA/uso permitido |
| `/api/admin-data` | GET | manager | usuarios, pacotes, uso e logs |
| `/api/admin-packages` | POST/PATCH/DELETE | manager/admin | CRUD de pacotes |
| `/api/admin-user-package` | POST | manager/admin | atribui pacote |
| `/api/admin-user-profile` | PATCH | manager/admin | edita perfil |
| `/api/admin-user-status` | PATCH | manager/admin | bloqueia/ativa usuario |
| `/api/admin-users` | POST/DELETE | manager/admin | convite, reenvio e exclusao |

Antes de criar novas APIs, a arquitetura deve consolidar rotas administrativas
ou migrar de plano. Adicionar um 13o arquivo publico quebra o deploy Hobby.

## 11. Uso de service role

`SUPABASE_SERVICE_ROLE_KEY` fica no backend e nao foi encontrada no frontend.
Ela e usada em:

- helper `supabaseFetch()` por padrao;
- listagem de usuarios do Supabase Auth;
- geracao de links de convite;
- exclusao de usuario do Auth;
- leituras e escritas administrativas via PostgREST.

Risco: como a service role ignora RLS, toda rota deve validar role, tenant,
recurso e alvo antes de consultar ou alterar dados. Hoje existe validacao de
role, mas ainda nao existe tenant formal para filtrar.

## 12. OpenAI

Chamadas server-side/localizadas em:

- `api/news-summary.js`: resumo individual;
- `api/weekly-summary.js`: resumo semanal do frontend;
- `scraper/utils/image_summary.py`: enriquecimento durante scraping;
- `scraper/weekly_news.py`: weekly news por e-mail.

Todas usam `https://api.openai.com/v1/responses`. O modelo padrao e
`gpt-4.1-mini`. As chaves nao estao no frontend.

Controles atuais:

- backend valida pacote antes de resumos;
- resumos registram uso somente quando IA foi usada;
- managers/admins sao privilegiados e nao sofrem limite;
- fallback local evita resposta vazia em alguns fluxos.

Lacunas:

- taxonomia de eventos nao corresponde ainda ao modelo final solicitado;
- `map_access`, login, logout, source_opened e blocked_by_limit nao sao
  registrados;
- nao ha limite de custo/tokens por cliente ou chamada;
- nao ha persistencia versionada de prompt e resposta sanitizada;
- chamadas no scraper podem consumir IA fora do controle de pacote SaaS.

## 13. Scraper e alimentacao do banco

Fluxo:

1. `main.py` carrega `config/sources.yaml`.
2. RSS: G1, CNN, Google News, Estradas e Blog do Caminhoneiro.
3. HTML/API: Band e Arteris.
4. Clima: INMET.
5. Itens sao limpos, filtrados e resumidos.
6. `save_to_postgres` deduplica por URL e insere no PostgreSQL.
7. GitHub Actions executa a cada hora somente na `main`/schedule/manual.

Riscos:

- DDL e policy sao executados pelo scraper em runtime.
- Falha de uma fonte e tratada com log no console, sem `platform_events`.
- Fontes declaradas no YAML e tabela `sources` nao estao sincronizadas.
- Nao ha ambiente de scraping staging isolado.
- Workflow nao executa a suite de testes antes do scraper.
- `scraper.yml` documenta horario/frequencia de forma inconsistente com alguns
  textos da interface e README.

## 14. Variaveis de ambiente

### Banco e Supabase

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Autenticacao e ambiente

- `AUTH_ENABLED`
- `NEXT_PUBLIC_AUTH_ENABLED` (compatibilidade)
- `APP_URL`
- `APP_ENV`
- `STAGING_READ_ONLY`
- `VERCEL_ENV` (fornecida pela Vercel)
- fallbacks: `SITE_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`,
  `PUBLIC_SITE_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`

### IA

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_IMAGE_MODEL`

### E-mail

- `RESEND_API_KEY`
- `WEEKLY_EMAIL_FROM`
- `WEEKLY_EMAIL_TO`
- `INVITE_EMAIL_FROM`
- `INVITE_EMAIL_REPLY_TO`

### Legado/opcional

- `GOOGLE_CREDENTIALS_JSON` no adaptador Sheets, nao usado por `main.py`.

## 15. Separacao atual entre staging e producao

### Git

- `main`: producao remota no commit `7667b36`.
- `staging`: commit `402e3d3` com convite personalizado e protecao read-only.
- `feature/phase-0-audit`: esta documentacao.

### Vercel

- Dominio reservado para testes: `road-news-preview.vercel.app`.
- Vinculo da branch e variaveis nao foram confirmados nesta auditoria.
- Nenhuma configuracao de producao foi alterada.

### Supabase

- Nao existe no repositorio evidencia de um projeto Supabase separado para
  staging.
- O frontend ainda contem URL/key fixa de um unico projeto.
- `APP_ENV=staging` e `STAGING_READ_ONLY=true` reduzem risco de escrita, mas nao
  atendem a regra atual de nao usar dados de producao em testes.

Status: staging bloqueado para teste integrado ate concluir `G0.1`.

## 16. Tabelas necessarias para o SaaS

### Manter e consolidar

- `news`
- `profiles`
- `clients`
- `packages`
- `usage_events`
- `audit_logs`
- `sources`
- `notification_rules`
- `platform_events`
- `platform_integrations`

### Criar

- `saved_news`: salvos por usuario e cliente.
- `client_subscriptions`: pacote, vigencia, status e limites contratados por
  cliente. Deve ser a fonte canonica da assinatura.
- `client_memberships` ou `profiles.client_id`: vinculo formal usuario/cliente.
- `notification_deliveries`: envio, idempotencia, canal, destinatario e status.
- `user_preferences`: estados, rodovias, categorias e onboarding.
- `monitored_routes`: corredores/rotas favoritas por cliente.
- `report_exports`: PDF/CSV/Excel gerados e consumo associado.
- `auth_events` ou ampliacao de `audit_logs`: login, logout e sessao.

### Revisar ou descontinuar

- `user_packages`: decidir se permanece como override individual ou migra para
  `client_subscriptions`.
- `clients.package_id`: remover se `client_subscriptions` for a fonte canonica.
- `profiles.company_name`: manter apenas como dado de exibicao durante migracao,
  nunca como chave de tenant.

## 17. Riscos priorizados

### Criticos - bloqueiam fases seguintes

1. Staging sem Supabase separado.
2. Frontend e backend com fallback fixo para o Supabase atual.
3. Ausencia de tenant key formal em `profiles`.
4. RLS sem isolamento por cliente.
5. Service role sem filtro de tenant porque tenant ainda nao existe.
6. Scraper recria policy publica de `news`.
7. Scripts SQL concorrentes sem migrations versionadas.

### Altos

1. Frontend monolitico de 5.626 linhas.
2. Funcoes de role/viewMode duplicadas.
3. Limite de 12 funcoes Vercel ja atingido.
4. Clientes, fontes, notificacoes e saude parcialmente simulados no frontend.
5. Uso de CDN sem CSP/SRI e Supabase JS sem versao exata.
6. DDL executado durante scraping.
7. Tipos incompativeis entre `usage_events.news_id` e `news.id`.

### Medios

1. Ausencia de lint/build/test runner JavaScript.
2. Testes nao rodam em CI.
3. Salvos e notificacoes dependem de localStorage.
4. Event types nao seguem taxonomia final.
5. PDF e gerado pelo navegador, com variacao por browser.
6. Admin data possui comportamento de seed em uma requisicao GET fora do modo
   read-only.

## 18. Arquivos principais por responsabilidade

| Responsabilidade | Arquivos |
|---|---|
| Frontend e navegacao | `public/index.html`, `vercel.json` |
| Auth e autorizacao | `api/_auth.js`, `api/my-access.js`, `api/auth-config.js` |
| Erros/admin | `api/_admin.js` |
| Usuarios/convites | `api/admin-users.js`, `lib/invite-email.js` |
| Pacotes e consumo | `api/admin-packages.js`, `api/admin-user-package.js`, `api/usage-event.js` |
| Noticias | `api/news-feed.js`, `main.py`, `scraper/` |
| IA | `api/news-summary.js`, `api/weekly-summary.js`, `scraper/weekly_news.py` |
| Banco/RLS | `scripts/supabase_*.sql`, `scraper/storage/postgres.py` |
| Automacao | `.github/workflows/*.yml` |
| Testes | `tests/` |

## 19. Plano tecnico por fases

### Gate G0.1 - isolamento de staging

Antes da Fase 1:

1. criar projeto Supabase staging;
2. criar chaves e redirects exclusivos;
3. remover fallbacks fixos do backend;
4. carregar configuracao publica do Supabase por ambiente;
5. aplicar migrations somente no staging;
6. criar usuarios e dados seed sem informacao de producao;
7. provar por IDs de projeto diferentes que staging e producao estao isolados.

### Fase 1 - estabilizacao

- decompor utilitarios de erro e navegacao sem alterar contratos;
- remover funcoes duplicadas;
- testar login, bloqueio, sidebar, rotas e modais por role;
- corrigir selects e estados visuais;
- manter somente mensagens amigaveis.

### Fase 2 - multiempresa

- adotar migrations versionadas;
- criar tenant key formal;
- escolher assinatura canonica por cliente;
- reescrever RLS e filtros server-side por tenant;
- criar seeds exclusivos de staging;
- testar isolamento entre dois clientes.

### Fase 3 - pacotes

- consolidar taxonomia de eventos;
- aplicar limites no backend e front;
- registrar tentativas bloqueadas;
- controlar usuarios por cliente/assinatura.

### Fase 4 - convites

- validar o fluxo Resend ja preparado contra o Supabase staging;
- finalizar reenvio, aceite e exclusao completa;
- garantir vinculo client/profile/package na mesma transacao logica.

### Fases 5 a 12

Seguir a ordem definida na especificacao somente depois da aprovacao formal da
fase anterior. Cada fase deve usar `feature/<fase>-<nome>`, PR para `develop` ou
`staging`, testes no Supabase staging e promocao manual para producao.

## 20. Estrategia de branches e promocao

Fluxo recomendado:

```text
feature/* -> develop -> staging -> main
```

- `feature/*`: uma fase ou subfase pequena.
- `develop`: integracao das features aprovadas.
- `staging`: apenas commits candidatos ao teste no ambiente isolado.
- `main`: somente release aprovada.

Regras:

- PR obrigatoria entre etapas.
- Sem push direto na `main`.
- Sem secrets em commits.
- Migration revisada antes do deploy.
- Rollback definido por release.
- Promocao para producao exige aprovacao explicita do usuario.

## 21. Estrategia de testes

### Permitido agora

- unittest Python local;
- testes Node com mocks;
- validacao de sintaxe;
- testes visuais locais sem credenciais reais;
- revisao estatica de SQL.

### Permitido apos G0.1

- Auth real no Supabase staging;
- migrations e seeds no staging;
- RLS com dois clientes ficticios;
- convites para enderecos de teste;
- OpenAI com chave/limite exclusivo de staging;
- Resend em dominio/remetente de teste;
- deploy em `road-news-preview.vercel.app`.

### Proibido

- usar URL, anon key, service role ou DATABASE_URL de producao no staging;
- copiar usuarios reais para staging;
- enviar convite de teste para clientes reais;
- executar SQL de teste em producao;
- testar exclusao ou bloqueio no Auth de producao.

## 22. Gates de aprovacao

### Fase 0 pronta quando

- este documento for revisado;
- riscos forem aceitos;
- nenhuma funcionalidade tiver sido alterada nesta fase.

### Fase 1 pode iniciar quando

- Supabase staging separado existir;
- frontend apontar dinamicamente para o projeto correto;
- Vercel staging nao possuir secrets de producao;
- seeds ficticios estiverem disponiveis;
- teste de isolamento de ambiente passar.

## 23. Estado ao final da Fase 0

- Funcionalidades alteradas: nenhuma.
- Tabelas alteradas: nenhuma.
- SQL executado: nenhum.
- Secrets alterados: nenhum.
- Producao alterada: nao.
- Staging integrado testado: nao, bloqueado por falta de Supabase separado.
- Pronto para merge: documentacao pronta para revisao; Fase 1 ainda nao esta
  liberada ate concluir o gate G0.1.
