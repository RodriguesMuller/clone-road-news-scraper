---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: ["public/dashboard.js","public/privacidade.html","public/termos.html"]
---

# Painel Road News (public/index.html)

## Escopo e modo
Operate. Redesign completo de todas as telas do SPA: cliente (nova home "Situação agora", Avisos, Central de Evento, Minha Rota, Mapa, Notícias, Salvos, Resumos), modo torre separado, login, páginas legais, gestão e admin.

## Público, tarefa e restrições
Analista ou gestor de risco decide "posso liberar a carga agora, por onde?". O veredito é lido de relance na tela fixa da torre; o celular é usado em campo. Preservar todas as funções e o comportamento do passo 1 (selo de atualidade, "Sem dados", atualização horária). SPA único em JS puro, sem build, sem dependências novas, fontes servidas do projeto. Tema claro principal; escuro disponível; modo torre escuro. Não pode parecer portal de notícias.

## Direção escolhida
Boletim de Aviso: cada ocorrência é um aviso oficial com grau, vigência, trecho e despacho. Momento memorável: a régua de vigência.

## Decisões em aberto
Escolha final da face de texto (workhorse com números tabulares) e detalhes do modo torre.

## Direction contract
THESIS: Cada ocorrência é um aviso oficial (grau, trecho, vigência, despacho), não uma notícia. Recusa o painel de KPIs, carrossel e grade de cards de manchete.
OWN-WORLD: Barra lateral e cabeçalho azul-tinta institucional (#10233F); fundo de boletim cinza-frio claro; superfícies brancas separadas por fios de 1px; sem matiz decorativo. As únicas cores fortes são de grau, como no INMET: vermelho Crítico, laranja Alto, amarelo Médio, cinza-azulado Baixo. Uma face sans de trabalho com números tabulares; rótulos em maiúsculas pequenas só em metadados.
STORY: O analista entende na hora se pode liberar cargas, vê quais trechos seguram e até quando, confia no grau pela justificativa e age (segurar, desviar, acompanhar).
FIRST VIEWPORT: Faixa de veredito em largura total no topo, na cor do grau mais alto, com a frase de despacho e o selo "Dados de HH:MM" à direita. Abaixo, filtros de grau. Coluna esquerda: avisos vigentes ordenados por grau, cada um com faixa lateral de grau, número EV, trecho, idade, título e linha de despacho. Coluna direita: régua de vigência de 12h por trecho, com marcador de agora. Navegação lateral azul-tinta.
FORM: Boletim de aviso INMET/Defesa Civil, 5º da lista ordenada. seed:6b06dea130edd687. Assinatura: régua de vigência. Herdados dos recusados: shell sem matiz; veredito e régua persistentes; ações destrutivas isoladas; uma decisão por linha, liberado sai; número EV estável; um aviso por tela no celular.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
