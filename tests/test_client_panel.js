const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");

test("ambiente Cliente não mostra Fontes nem Configurações", () => {
  const clientGroup = html.slice(html.indexOf("    const SIDEBAR_GROUPS = {"), html.indexOf("      manager: ["));
  assert.doesNotMatch(clientGroup, /route: "\/fontes"/);
  assert.doesNotMatch(clientGroup, /route: "\/configuracoes"/);
  const routes = html.match(/const CLIENT_ROUTES = new Set\(\[([^\]]*)\]\)/)[1];
  assert.doesNotMatch(routes, /"\/fontes"|"\/configuracoes"/, "rota digitada também é bloqueada para Cliente");
  assert.match(html, /settingsButton\.hidden = mode === "client"/);
});

test("dashboard executivo é a página inicial e carrega antes do script principal", () => {
  const risk = html.indexOf('<script src="/risk.js">');
  const brief = html.indexOf('<script src="/brief.js">');
  const dash = html.indexOf('<script src="/dashboard.js">');
  assert.ok(risk > 0 && risk < brief && brief < dash, "ordem: risk → brief → dashboard");
  assert.match(html, /data-client-page="dashboard"/);
  assert.match(html, /"\/dashboard": \{ view: "occurrences", scroll: "top", page: "dashboard" \}/);
  assert.match(html, /"\/alertas": \{ view: "occurrences", scroll: "clientAlertsPage", page: "alerts" \}/);
  // Tema aplicado no <head>, antes da primeira pintura, com fallback para escuro.
  const head = html.slice(0, html.indexOf("<style>"));
  assert.match(head, /localStorage\.getItem\("roadnews\.theme"\)/);
  assert.match(html, /:root\[data-theme="light"\] \{/);
  const dashboard = fs.readFileSync(path.join(ROOT, "public", "dashboard.js"), "utf8");
  assert.match(dashboard, /window\.RoadDashboard = \{ render, renderChrome, onShow, applyTheme, newsMedia, themeOfItem, icon, THEME_COLOR, LEVEL \}/);
  assert.doesNotMatch(dashboard, /Math\.random\(\) \* \d|fake|mock/i, "sem números inventados");
});

test("identidade Boletim de Aviso: shell azul-tinta, cores de grau do INMET, Archivo, claro principal", () => {
  const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  const layer = css.slice(css.indexOf("Boletim de Aviso (redesign"));
  const light = layer.slice(layer.indexOf(':root, :root[data-theme="light"] {'), layer.indexOf(':root[data-theme="dark"] {'));
  for (const token of ["--ink: #10233F", "--risk-critical: #C8201A", "--risk-high: #E46C00", "--risk-medium: #EDB800", "--risk-low: #5F6E83", "--font-mono: var(--font-sans)"]) {
    assert.ok(light.includes(token), `token ${token}`);
  }
  assert.match(layer, /:root\[data-theme="dark"\] \{[^}]*--risk-critical: /, "tema escuro redefine as cores de grau");
  assert.match(html.slice(0, html.indexOf("<style>")), /localStorage\.getItem\("roadnews\.theme"\) \|\| "light"/, "claro é o tema principal");
  assert.match(css, /font-family: 'Archivo';\s*src: url\('\/assets\/fonts\/archivo\/Archivo-Variable-latin\.woff2'\)/);
  assert.ok(fs.existsSync(path.join(ROOT, "public", "assets", "fonts", "archivo", "Archivo-Variable-latin.woff2")));
  assert.ok(fs.existsSync(path.join(ROOT, "public", "assets", "fonts", "archivo", "OFL.txt")), "licença da fonte junto do arquivo");
  assert.doesNotMatch(css, /url\('assets\/fonts/, "fontes com caminho absoluto (funciona em /developer/...)");
  // Mapa e gráficos leem a cor do token do tema, não hex fixo.
  assert.match(html, /const MAP_RISK_COLORS = \{\s*get critical\(\) \{ return riskColor\("critical"/);
  const dashboard = fs.readFileSync(path.join(ROOT, "public", "dashboard.js"), "utf8");
  assert.match(dashboard, /critical: level\("Crítico", "sev-critical", "--risk-critical"/);
  // Categoria nunca usa as cores de grau.
  const themes = dashboard.slice(dashboard.indexOf("const THEMES = ["), dashboard.indexOf("function themeOf("));
  assert.doesNotMatch(themes, /#C8201A|#E46C00|#EDB800|#FC3700|#FFCD00/i);
});

test("Situação agora: veredito, avisos por grau, régua de vigência sem previsão inventada", () => {
  const dashboard = fs.readFileSync(path.join(ROOT, "public", "dashboard.js"), "utf8");
  for (const id of ["sitVerdict", "sitAvisos", "sitRegua", "sitFilters"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /id="dashFeatured"|id="dashKpis"/, "carrossel e KPIs de volume saíram da home");
  assert.doesNotMatch(dashboard, /featuredTimer|setInterval\(\(\) => \{\s*if \(!target\.matches/, "nada gira sozinho");
  assert.match(dashboard, /Sem previsão de liberação informada pelas fontes/);
  const { eventCode } = require(path.join(ROOT, "public", "risk.js"));
  assert.equal(eventCode("https://x/1"), eventCode("https://x/1"), "número do evento é estável");
  assert.match(eventCode("https://x/1"), /^EV-\d{4}$/);
});

test("dropdowns e itens ocultos respeitam o atributo hidden", () => {
  // .topbar-dropdown tem display: grid; sem esta regra o hidden não escondia (painéis não fechavam).
  assert.match(html, /\[hidden\] \{ display: none !important; \}/);
  const dashboard = fs.readFileSync(path.join(ROOT, "public", "dashboard.js"), "utf8");
  assert.match(dashboard, /e\.target\.closest\("\.topbar-dropdown a, \.topbar-dropdown button"\)\) closeAll\(\)/);
});

test("imagem da notícia vem da fonte, com reserva neutra (sem cena de acidente)", () => {
  const dashboard = fs.readFileSync(path.join(ROOT, "public", "dashboard.js"), "utf8");
  assert.match(dashboard, /referrerpolicy="no-referrer"/);
  assert.match(dashboard, /Imagem: \$\{esc\(source\)\}/, "crédito à fonte");
  const motifs = dashboard.slice(dashboard.indexOf("const MOTIFS = {"), dashboard.indexOf("function illustration("));
  assert.doesNotMatch(motifs, /mort|vitim|sangue|ambul|feri|caveira|skull/i);
  assert.match(fs.readFileSync(path.join(ROOT, "api", "news-feed.js"), "utf8"), /geo_precision,image_url"/);
});

test("resumo operacional usa a janela escolhida e compara com o período anterior", () => {
  const { buildWeeklyBrief } = require(path.join(ROOT, "public", "brief.js"));
  const now = Date.parse("2026-11-10T18:00:00-03:00");
  const at = (hoursAgo) => new Date(now - hoursAgo * 3600e3).toISOString();
  const items = [
    { title: "Carreta tomba e interdita a BR-116 em Registro, SP", source: "A", created_at: at(2) },
    { title: "Carreta tomba e interdita a BR-381 em Betim, MG", source: "B", created_at: at(30) },
    { title: "Carreta tomba e interdita a BR-040 em Juiz de Fora, MG", source: "C", created_at: at(60) },
  ];
  const day = buildWeeklyBrief(items, now, { windowMs: 24 * 3600e3, includeEvents: true });
  assert.equal(day.events.length, 1, "só a ocorrência das últimas 24h");
  assert.equal(day.events[0].road, "BR-116");
  const blocks = day.numbers.find((n) => n.key === "block_total");
  assert.deepEqual([blocks.value, blocks.previous], [1, 1], "24h anteriores entram no comparativo");
  assert.ok(day.earliest <= now - 48 * 3600e3);
  assert.ok(!("events" in buildWeeklyBrief(items, now)), "resumo semanal não muda de formato");
});
