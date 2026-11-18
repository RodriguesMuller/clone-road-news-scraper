---
name: Road News
description: Boletim de aviso operacional para quem libera carga rodoviária — grau, trecho, vigência e despacho.
colors:
  ink: "#10233F"
  ink-raised: "#1B355C"
  ink-line: "#2B4466"
  ink-text: "#E3E9F1"
  ink-muted: "#9DAEC4"
  accent: "#1D4F91"
  accent-strong: "#163E73"
  bulletin-bg: "#EDF0F4"
  bulletin-bg-deep: "#E4E8EE"
  surface: "#FFFFFF"
  surface-alt: "#F5F7FA"
  surface-high: "#E8ECF1"
  line: "#CAD2DC"
  line-soft: "#E2E7ED"
  text: "#10233F"
  text-muted: "#536177"
  text-muted-strong: "#2C3D55"
  grade-critical: "#C8201A"
  grade-critical-text: "#B01B15"
  grade-high: "#E46C00"
  grade-high-text: "#9C4A00"
  grade-medium: "#EDB800"
  grade-medium-text: "#775A00"
  grade-low: "#5F6E83"
  grade-low-text: "#4D5B6F"
  on-grade-light: "#FFFFFF"
  on-grade-dark: "#10233F"
  success: "#2E7A4C"
  category-accidents: "#1D4F91"
  category-closures: "#10233F"
  category-works: "#5B7FB0"
  category-weather: "#7FA6D6"
  category-fuel-tolls: "#8FA3B8"
  category-other: "#A3ADBA"
  dark-ink: "#0A1220"
  dark-bg: "#0F1828"
  dark-surface: "#152134"
  dark-surface-alt: "#1A283E"
  dark-line: "#2C3D57"
  dark-text: "#E8EDF4"
  dark-text-muted: "#9DAABD"
  dark-accent: "#8DB4EE"
  dark-grade-critical: "#F2493D"
  dark-grade-high: "#FF9433"
  dark-grade-medium: "#F3C934"
  dark-grade-low: "#8796AC"
typography:
  display:
    fontFamily: "Archivo, Segoe UI, system-ui, -apple-system, Arial, sans-serif"
    fontSize: "clamp(20px, 2vw, 27px)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\" 1"
  display-tower:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(30px, 3.2vw, 52px)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\" 1"
  headline:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.2
    fontFeature: "\"tnum\" 1"
  title:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.35
    fontFeature: "\"tnum\" 1"
  section:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    lineHeight: 1.3
    fontFeature: "\"tnum\" 1"
  dispatch:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.4
    fontFeature: "\"tnum\" 1"
  body:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.03em"
    fontFeature: "\"tnum\" 1"
rounded:
  mark: "2px"
  band: "3px"
  badge: "4px"
  control: "6px"
  surface: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
  grade-filter:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  grade-filter-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  grade-badge-critical:
    backgroundColor: "{colors.grade-critical}"
    textColor: "{colors.on-grade-light}"
    rounded: "{rounded.badge}"
  grade-badge-high:
    backgroundColor: "{colors.grade-high}"
    textColor: "{colors.on-grade-dark}"
    rounded: "{rounded.badge}"
  grade-badge-medium:
    backgroundColor: "{colors.grade-medium}"
    textColor: "{colors.on-grade-dark}"
    rounded: "{rounded.badge}"
  grade-badge-low:
    backgroundColor: "{colors.grade-low}"
    textColor: "{colors.on-grade-light}"
    rounded: "{rounded.badge}"
  verdict-band:
    backgroundColor: "{colors.grade-critical}"
    textColor: "{colors.on-grade-light}"
    typography: "{typography.display}"
    padding: "18px 24px"
  aviso-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    padding: "12px 18px 14px"
  surface-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
  input-field:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
    height: "40px"
  nav-sidebar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-text}"
  nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  regua-band:
    rounded: "{rounded.band}"
    height: "24px"
    typography: "{typography.label}"
---

# Design System: Road News

## Overview

**Creative North Star: "O Boletim de Aviso"**

Cada ocorrência é um aviso oficial, no molde do INMET e da Defesa Civil: tem grau, trecho, vigência e despacho. Não é uma notícia nem um cartão de manchete. O sistema existe para que o analista de risco responda de relance "posso liberar a carga agora, por onde?", seja no monitor fixo da torre, no desktop antes de liberar uma carga ou no celular em campo.

O mundo é institucional e sóbrio. Shell (barra lateral, cabeçalho de login, cabeçalho do cartão de compartilhamento) em azul-tinta; fundo de boletim cinza-frio claro; superfícies brancas separadas por fios de 1px, sem sombra e sem matiz decorativo. A cor forte é um recurso escasso e tem um único dono: o grau. Vermelho Crítico, laranja Alto, amarelo Médio, cinza-azulado Baixo, sempre em bloco sólido (faixa de veredito, selo, faixa de linha, banda da régua), nunca em degradê decorativo, nunca em outra função. A densidade é de quadro de operação: linhas compactas, números tabulares, uma decisão por linha.

Tema claro é o principal (padrão `light` salvo em `roadnews.theme`). O tema escuro é o turno da noite com a mesma gramática. O modo torre (`/torre`) é uma variante escura em tipo grande, sem navegação, que mostra só veredito, avisos e régua, legível a 2–3 m.

**Key Characteristics:**
- Shell azul-tinta, papel de boletim frio, superfícies brancas com fio de 1px.
- Cor forte reservada aos quatro graus; categorias vivem numa família azul-acinzentada.
- Uma única face sans de trabalho (Archivo) com números tabulares em tudo.
- Plano: profundidade por fio e tom, nunca por sombra.
- Assinatura: a régua de vigência, uma banda por trecho do primeiro registro até agora, com cauda esmaecida onde não há previsão.

## Colors

Paleta institucional neutra e fria, em que só a escala de grau tem saturação.

### Primary
- **Azul-Tinta Institucional** (ink): fundo da barra lateral, do painel de marca no login e da faixa superior do cartão de compartilhamento; também é o preenchimento do botão primário e do filtro pressionado no tema claro. É a voz da instituição, não um destaque.
- **Azul de Despacho** (accent / accent-strong): links, anel de foco (2px, offset 2px), "Por que [grau]?" e seleção de texto. Único azul de interação.

### Secondary — a escala de grau
- **Vermelho Crítico** (grade-critical), **Laranja Alto** (grade-high), **Amarelo Médio** (grade-medium), **Cinza-Azulado Baixo** (grade-low): preenchimento sólido da faixa de veredito, selos, faixas de linha de aviso, bandas da régua, marcadores do mapa e da marca. Texto sobre Crítico e Baixo em branco (on-grade-light); sobre Alto e Médio em azul-tinta (on-grade-dark).
- **Variantes de texto** (grade-*-text): quando o grau precisa aparecer como texto sobre superfície branca (por exemplo "Rodovia bloqueada" em KPI), use a variante escurecida, nunca o preenchimento.
- No tema escuro e no modo torre, os graus clareiam (dark-grade-*) para manter contraste sobre o fundo noturno.

### Tertiary — categorias
- **Família azul-acinzentada de categorias** (category-*): Acidentes, Interdições, Obras, Clima, Combustíveis e pedágios, Outros. Usada em gráficos de distribuição por categoria e chips de tema. Nenhuma categoria usa matiz de grau.

### Neutral
- **Papel de Boletim** (bulletin-bg / bulletin-bg-deep): fundo da página.
- **Branco de Superfície** (surface), **Superfície Recuada** (surface-alt) e **Superfície Alta** (surface-high): painéis, campos e itens recuados, chips neutros e faixa de veredito sem avisos.
- **Fio** (line) e **Fio Suave** (line-soft): o fio de 1px que separa superfícies e linhas internas.
- **Texto** (text), **Texto Secundário** (text-muted, text-muted-strong): títulos e corpo em azul-tinta, metadados em cinza-azulado.
- **Sucesso** (success): só para confirmação de sistema (salvo, enviado), nunca como grau.

### Named Rules
**The Grade Owns Color Rule.** Vermelho, laranja, amarelo e o cinza-azulado de Baixo significam grau e nada mais. Se um elemento não carrega o grau de uma ocorrência, ele não usa essas cores — nem categoria, nem destaque, nem ilustração.

**The No Decorative Hue Rule.** O shell e as superfícies são neutros. Não há gradiente de marca, tinta de fundo colorida ou destaque cromático fora da escala de grau e do azul de interação.

**The Solid Grade Rule.** O grau aparece em bloco sólido com texto de contraste. A única translucidez permitida é a cauda da régua de vigência (o grau desvanecendo de 45% a 0%), que significa "sem previsão de término".

## Typography

**Display Font:** Archivo (variável 400–700, servida de `/assets/fonts/archivo`), com fallback Segoe UI, system-ui, Arial
**Body Font:** Archivo
**Label/Mono Font:** Archivo — não há face mono; números e códigos usam numerais tabulares

**Character:** Uma sans grotesca de trabalho, firme nos pesos altos (800 em veredito e títulos de seção), neutra no corpo. Tudo em `font-variant-numeric: tabular-nums`, para que horários, km e códigos EV alinhem em coluna.

### Hierarchy
- **Display** (800, clamp(20px, 2vw, 27px), 1.2): a frase de veredito na faixa de grau. No modo torre sobe para clamp(30px, 3.2vw, 52px).
- **Headline** (800, 26px, 1.2): título de tela isolada (login, acesso).
- **Title** (700, 16px, 1.35): título do aviso; sobe para clamp(18px, 1.5vw, 26px) na torre.
- **Section** (800, 15–16px): cabeçalhos de bloco ("Régua de vigência", barra de filtros).
- **Dispatch** (700, 15px): a linha de despacho "o que fazer" de cada aviso — peso de ação, não de corpo.
- **Body** (400, 14px, 1.5): texto corrido; justificativas em 13px secundário.
- **Label** (700, 12px, 0.03em): metadados, eixos da régua, selos. 12px é o piso legível; nada menor.

### Named Rules
**The One Face Rule.** Archivo para tudo. Hierarquia vem de peso (400/700/800) e tamanho, nunca de uma segunda família ou de mono como fantasia técnica.

**The Tabular Rule.** Todo número é tabular. Horário, km, contagem de fontes e código EV precisam alinhar sem esforço.

## Layout

Shell de duas colunas: barra lateral azul-tinta fixa à esquerda e conteúdo em papel de boletim. A tela inicial "Situação agora" é uma única superfície contornada (fio de 1px, canto de 8px) composta de três faixas empilhadas: faixa de veredito em largura total, barra de filtros de grau e a área de trabalho em duas colunas — lista de avisos (5fr) à esquerda e régua de vigência (6fr) à direita, separadas por fio vertical. A lista rola dentro de si (máx. 640px) para que veredito e régua fiquem persistentes.

Ritmo de espaçamento em passos de 4: 4/8/12/16/24px. Linhas de aviso usam 12–14px vertical e 18px horizontal; faixas e barras usam 24px lateral no desktop e 16px no celular.

Responsivo: abaixo de 1100px a área de trabalho vira uma coluna (régua abaixo da lista); abaixo de 760px o login perde o painel de marca; abaixo de 640px o veredito empilha (selo acima da frase) e a coluna de rótulos da régua cai de 148px para 104px. No modo torre a navegação, busca, tema e dashboards secundários somem; o conteúdo ocupa a largura toda.

## Elevation & Depth

Sistema plano. Não há sombra em superfície alguma (`--shadow-card: none`); profundidade é dada por fio de 1px e por tom (papel de boletim → superfície branca → superfície recuada/alta). Hover em cartões só troca a cor do fio para o cinza secundário. A única "elevação" é tonal: o item ativo da navegação vira branco sobre o azul-tinta.

### Named Rules
**The Hairline Rule.** Superfícies se separam por fio de 1px em `line`, nunca por sombra. A exceção de espessura é semântica: rodovia bloqueada ganha fio de 2px em Vermelho Crítico.

## Shapes

Cantos de boletim, retos e pequenos: 2px na marca, 3px nas bandas da régua (abertas à direita enquanto o evento está vigente, fechadas quando encerrado), 4px em selos e chips, 6px em botões, campos e caixas internas, 8px em superfícies. A pílula (999px) é exclusiva dos filtros de grau. A marca é uma barra vertical de 6px dividida nos quatro graus, de Crítico no topo a Baixo na base — a escala de grau como identidade.

## Components

### Buttons
Diretos e institucionais.
- **Shape:** canto de controle (6px), fio de 1px.
- **Primary:** azul-tinta com texto branco, peso 700; no tema escuro inverte para claro sobre escuro.
- **Secondary / mini:** superfície branca, texto azul-tinta, fio `line`.
- **Hover / Focus:** foco visível sempre com contorno de 2px em azul de despacho e offset de 2px; na barra lateral o contorno é branco.

### Chips (filtros de grau)
- **Style:** pílula, 13px/700, fio `line` sobre superfície, com um ponto de 8px na cor do grau.
- **State:** pressionado (`aria-pressed="true"`) preenche em azul-tinta com texto branco. O ponto é a única cor do chip.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** superfície branca; blocos internos em superfície recuada com 6px.
- **Shadow Strategy:** nenhuma (ver Elevation & Depth).
- **Border:** 1px `line`; 2px Vermelho Crítico apenas para rodovia bloqueada.
- **Internal Padding:** 12–24px conforme densidade.

### Inputs / Fields
- **Style:** superfície recuada, fio de 1px, canto de 6px, altura mínima de 40px, padding 9px 11px.
- **Focus:** contorno de 2px em azul de despacho.

### Navigation
- Barra lateral azul-tinta; itens em `ink-text`, hover em `ink-raised`, ativo em superfície branca com texto azul-tinta e peso 700. Rótulos de grupo em `ink-muted`. Status, usuário e ambiente em blocos `ink-raised` com fio `ink-line`. No celular a barra vira gaveta; no modo torre some.

### Faixa de veredito (signature)
Largura total no topo da Situação agora, preenchida com a cor do grau mais alto em vigor (superfície alta quando não há avisos). À esquerda, o selo de grau carimbado (fio de 2px em `currentColor`, canto 4px, 800); ao lado, a frase de despacho em Display e uma linha de apoio de 15px.

### Linha de aviso (signature)
Uma ocorrência por linha, ordenada por grau. Coluna de grau de 6px à esquerda, preenchida com a cor do grau, seguida do corpo: linha de metadados (código EV estável em `text`, trecho, tipo, idade, nº de fontes), título, linha de despacho e o detalhe "Por que [grau]?" com a justificativa. Linhas separadas por fio suave.

### Régua de vigência (signature)
Para cada trecho, uma banda na cor do grau do primeiro registro até agora, numa janela de 12h com grade de 5 divisões e marcador "agora" (linha de 2px em `text` com rótulo). Depois de agora a banda vira cauda esmaecida: sem previsão de término. Rótulo do trecho à esquerda (148px) em 14px/700 com detalhe em 12px.

### Cartão de compartilhamento
Imagem em canvas que reproduz o boletim: faixa azul-tinta com a marca de quatro graus, faixa de veredito na cor do grau, título em 800, caixa "O que fazer" branca com faixa de grau à esquerda, rodapé separado por fio. Mesmas cores e mesma face do painel.

## Do's and Don'ts

### Do:
- **Do** reservar vermelho, laranja, amarelo e o cinza-azulado de Baixo exclusivamente ao grau de uma ocorrência, em bloco sólido com texto de contraste (branco sobre Crítico e Baixo, azul-tinta sobre Alto e Médio).
- **Do** separar superfícies com fio de 1px e manter tudo sem sombra.
- **Do** usar Archivo com numerais tabulares em todo texto, com hierarquia por peso 400/700/800.
- **Do** dar a cada aviso grau, trecho, vigência e uma linha de despacho, e manter o código EV estável entre atualizações.
- **Do** nomear o grau também em texto (selo, "Por que [grau]?"), além da cor.
- **Do** manter 12px como menor tamanho de texto e contorno de foco de 2px em todo elemento interativo.

### Don't:
- **Don't** usar cor de grau para categoria, destaque, ilustração ou decoração; categorias ficam na família azul-acinzentada.
- **Don't** montar a tela como painel de KPIs, carrossel ou grade de cartões de manchete; a unidade é o aviso.
- **Don't** introduzir sombras, degradês de marca ou matiz decorativo no shell ou nas superfícies.
- **Don't** usar faixa lateral colorida em elementos que não carregam grau; a coluna de grau existe só na linha de aviso e na caixa de despacho do cartão de compartilhamento.
- **Don't** adicionar uma segunda família tipográfica ou mono como fantasia técnica.
