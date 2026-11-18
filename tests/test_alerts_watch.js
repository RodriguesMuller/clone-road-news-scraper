// Tela Alertas = "Meus trechos": o cliente cadastra rodovias/UFs e vê só os alertas delas.
// Extrai as funções reais de public/index.html e roda com stubs (mesmo padrão de test_data_freshness.js).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");

function extract(name) {
  const start = html.search(new RegExp(`function ${name}\\(`));
  assert.ok(start >= 0, `função ${name} não encontrada`);
  let depth = 0;
  for (let i = html.indexOf("{", html.indexOf(")", start)); i < html.length; i += 1) {
    if (html[i] === "{") depth += 1;
    if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`função ${name} sem fechamento`);
}

function load(watchTargets = []) {
  const ufsLine = html.match(/const WATCH_UFS = \[[^\]]+\];/)[0];
  const ctx = { state: { watchTargets }, window: { RoadBrief: require(path.join(ROOT, "public", "brief.js")) } };
  vm.createContext(ctx);
  vm.runInContext([ufsLine, ...["normalizeWatchTarget", "matchesWatchTarget", "matchesWatch"].map(extract)].join("\n"), ctx);
  return ctx;
}

test("normaliza rodovia e UF digitadas de qualquer jeito; recusa o resto", () => {
  const { normalizeWatchTarget: n } = load();
  assert.equal(n(" br 116 "), "BR-116");
  assert.equal(n("sp330"), "SP-330");
  assert.equal(n("pr"), "PR");
  assert.equal(n("XX-10"), "");
  assert.equal(n("rodovia"), "");
  assert.equal(n("ZZ"), "");
});

test("alerta casa pela rodovia (BR-116 não casa BR-1160) e pela UF", () => {
  const ctx = load(["BR-116", "PR"]);
  assert.equal(ctx.matchesWatch({ title: "Carreta tomba na BR 116 em Registro" }), true);
  assert.equal(ctx.matchesWatch({ title: "Acidente na BR-1160" }), false);
  assert.equal(ctx.matchesWatch({ title: "Queda de barreira em Guaratuba, PR" }), true);
  assert.equal(ctx.matchesWatch({ title: "Bloqueio total", state: "PR" }), true);
  assert.equal(ctx.matchesWatch({ title: "Carreta tomba na BR-101 em Joinville, SC" }), false);
});

test("Alertas: Meus trechos no lugar dos cards internos de coleta", () => {
  const page = html.slice(html.indexOf('id="clientAlertsPage"'), html.indexOf('id="clientEventsPage"'));
  assert.match(page, /id="watchForm"/);
  assert.doesNotMatch(page, /id="stats"/);
  assert.match(extract("renderRecentAlerts"), /Isso não indica ausência de risco/);
});
