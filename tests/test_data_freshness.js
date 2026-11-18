// Confiabilidade do dado no painel (public/index.html): falha de carga ou dado velho nunca
// pode aparecer como "sem ocorrências". Extrai as funções reais do HTML e roda com stubs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const dashboard = fs.readFileSync(path.join(ROOT, "public", "dashboard.js"), "utf8");

// Copia `function nome(...) { ... }` (ou `async function`) do HTML, casando chaves.
function extract(name) {
  const start = html.search(new RegExp(`(async )?function ${name}\\(`));
  assert.ok(start >= 0, `função ${name} não encontrada`);
  let depth = 0;
  for (let i = html.indexOf("{", html.indexOf(")", start)); i < html.length; i += 1) {
    if (html[i] === "{") depth += 1;
    if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`função ${name} sem fechamento`);
}

function panel({ loadNews, loadMyAccess = async () => {} }) {
  const elements = {
    dataFreshness: { dataset: {}, disabled: false, title: "", setAttribute(k, v) { this[k] = v; } },
    dataFreshnessText: { textContent: "" },
  };
  const ctx = {
    state: { dataLoadError: "", dataLoadedAt: 0, refreshing: false, authEnabled: true, items: [], recentItems: [], mapItems: [], followedEvents: [], total: 0 },
    notices: [],
    document: { getElementById: (id) => elements[id] || null },
    window: {},
    BRASILIA_TIME_ZONE: "America/Sao_Paulo",
    loadNews,
    loadMyAccess,
    usageThresholdMessage: () => "",
    getFriendlyErrorMessage: (error, fallback) => (error && error.message) || fallback,
    escapeHtml: (s) => String(s),
    renderStats() {}, renderRecentAlerts() {}, renderMajorEvents() {}, renderSources() {},
    renderClientHeaderAndTrends() {}, renderNews() {}, renderMap() {},
  };
  ctx.setNotice = (message) => ctx.notices.push(message);
  vm.createContext(ctx);
  const source = html.match(/const STALE_DATA_MS = [^;]+;/)[0] + "\n"
    + ["dataLoadTime", "dataUnavailable", "dataUnavailableMarkup", "dataPanelStatus", "renderDataFreshness", "refresh"].map(extract).join("\n")
    + "\nthis.api = { refresh, dataUnavailable, dataUnavailableMarkup, dataPanelStatus };";
  vm.runInContext(source, ctx);
  return { ...ctx.api, state: ctx.state, notices: ctx.notices, badge: elements.dataFreshness, label: elements.dataFreshnessText };
}

test("primeira carga falhou: telas dizem 'sem dados', nunca 'sem risco'", async () => {
  const p = panel({ loadNews: async () => { throw new Error("Falha de rede."); } });
  await p.refresh();
  assert.equal(p.dataUnavailable(), true);
  assert.match(p.dataUnavailableMarkup(), /não interprete como ausência de risco/);
  assert.equal(p.badge.dataset.state, "error");
  assert.match(p.label.textContent, /Sem dados/);
});

test("atualização falhou depois de uma carga boa: mantém o último dado, marcado como falha", async () => {
  let fail = false;
  const p = panel({ loadNews: async () => { if (fail) throw new Error("Falha de rede."); } });
  await p.refresh();
  p.state.items = [{ title: "Bloqueio BR-116" }]; // o que a carga boa trouxe
  assert.ok(p.state.dataLoadedAt > 0);
  fail = true;
  await p.refresh();
  assert.equal(p.state.items.length, 1, "lista não é esvaziada (vazia seria lida como 'sem ocorrências')");
  assert.equal(p.dataUnavailable(), false);
  assert.equal(p.badge.dataset.state, "error");
  assert.match(p.label.textContent, /Falha ao atualizar · dados de \d{2}:\d{2}/);
  assert.match(p.notices.at(-1), /última leitura, das \d{2}:\d{2}/);
});

test("falha de acesso (usuário inativo) continua limpando os dados", async () => {
  const p = panel({ loadNews: async () => {}, loadMyAccess: async () => { throw new Error("Seu usuário está inativo."); } });
  p.state.items = [{ title: "x" }];
  await p.refresh();
  assert.equal(p.state.items.length, 0);
  assert.equal(p.state.dataLoadedAt, 0);
  assert.equal(p.dataUnavailable(), true);
});

test("dado lido há mais de 75 min aparece como desatualizado, não como 'coleta atrasada'", async () => {
  const p = panel({ loadNews: async () => {} });
  await p.refresh();
  assert.equal(p.badge.dataset.state, "ok");
  p.state.dataLoadedAt = Date.now() - 80 * 60 * 1000;
  assert.equal(p.dataPanelStatus().stale, true);
  assert.match(dashboard, /"Painel desatualizado"/);
});

test("Dashboard, Alertas, Resumo operacional e sino usam o estado 'sem dados'", () => {
  assert.match(extract("renderRecentAlerts"), /if \(dataUnavailable\(\)\)/);
  assert.match(extract("renderOperationalSummary"), /if \(dataUnavailable\(\)\)/);
  const situation = dashboard.slice(dashboard.indexOf("function renderSituation("));
  assert.match(situation, /if \(noData\(\)\) \{[\s\S]*?Sem dados: não interprete como ausência de risco[\s\S]*?dataUnavailableMarkup\(\)/);
  assert.match(dashboard, /noData\(\) \? `<p class="dash-empty">Sem dados carregados/);
});

test("aviso é anunciado e o selo de atualidade existe no topo", () => {
  assert.match(html, /<div id="notice" class="notice" role="status" aria-live="polite">/);
  assert.match(html, /<button id="dataFreshness" class="data-freshness"/);
  assert.doesNotMatch(html.match(/\.notice \{[^}]*\}/)[0], /#FFCD00/, "cor do aviso vem do token do tema");
});

test("Central de Evento: sem análise da IA após 2h, diz que a IA não saiu", () => {
  const ctx = { Date, formatDate: (v) => v, isActiveFollowedEvent: (e) => e.status !== "closed", parseBrasiliaDate: (v) => (v ? new Date(v) : null) };
  vm.createContext(ctx);
  vm.runInContext(`${html.match(/const FOLLOWED_AI_OVERDUE_MS = [^;]+;/)[0]}\n${extract("followedAiNote")}\nthis.note = followedAiNote;`, ctx);
  const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const old = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
  assert.match(ctx.note({ status: "open", created_at: recent }), /Aguardando a primeira análise/);
  assert.match(ctx.note({ status: "open", created_at: old }), /não saiu nas últimas coletas \(evento acompanhado há 5h\)/);
});

test("bloqueio de recurso diz o motivo e o próximo passo", () => {
  const ctx = { state: { access: { limits: { monthly_route_limit: 10 }, usage_this_month: { route: 10 } } } };
  vm.createContext(ctx);
  vm.runInContext(`${extract("featureBlockedMessage")}\nthis.msg = featureBlockedMessage;`, ctx);
  assert.match(ctx.msg("route_analysis"), /Você usou 10 de 10 consultas de rota deste mês.*Fale com o gestor/);
  ctx.state.access.usage_this_month.route = 2;
  assert.match(ctx.msg("route_analysis"), /Minha Rota não faz parte do seu pacote\. Fale com o gestor/);
  assert.match(ctx.msg("map"), /mapa rodoviário não faz parte do seu pacote/);
});

test("atualização automática: de hora em hora, depois da coleta, só com a aba visível", () => {
  const ctx = { state: {}, document: { visibilityState: "visible" } };
  vm.createContext(ctx);
  const consts = ["AUTO_REFRESH_MIN_AGE_MS", "AUTO_REFRESH_AFTER_MINUTE", "AUTO_REFRESH_RETRY_MS"]
    .map((name) => html.match(new RegExp(`const ${name} = [^;]+;`))[0]).join("\n");
  vm.runInContext(`${consts}\n${extract("shouldAutoRefresh")}\nthis.should = shouldAutoRefresh;`, ctx);
  const at = (iso) => new Date(iso);
  const base = { authEnabled: true, session: {}, refreshing: false, dataLoadError: "", autoRefreshAttemptAt: 0 };

  ctx.state = { ...base, dataLoadedAt: at("2026-11-17T10:20:00Z").getTime() };
  assert.equal(ctx.should(at("2026-11-17T10:50:00Z")), false, "menos de 55 min: não gasta cota");
  assert.equal(ctx.should(at("2026-11-17T11:10:00Z")), false, "antes do minuto 15: coleta ainda rodando");
  assert.equal(ctx.should(at("2026-11-17T11:16:00Z")), true);

  ctx.document.visibilityState = "hidden";
  assert.equal(ctx.should(at("2026-11-17T11:16:00Z")), false, "aba escondida não consome cota");
  ctx.document.visibilityState = "visible";

  ctx.state = { ...base, dataLoadedAt: 0, session: null };
  assert.equal(ctx.should(at("2026-11-17T11:16:00Z")), false, "deslogado");

  ctx.state = { ...base, dataLoadedAt: at("2026-11-17T10:20:00Z").getTime(), dataLoadError: "Falha", autoRefreshAttemptAt: at("2026-11-17T11:16:00Z").getTime() };
  assert.equal(ctx.should(at("2026-11-17T11:20:00Z")), false, "falha: espera 10 min para tentar de novo");
  assert.equal(ctx.should(at("2026-11-17T11:27:00Z")), true);
});
