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
  assert.match(dashboard, /window\.RoadDashboard = \{ render, renderChrome, onShow, applyTheme \}/);
  assert.doesNotMatch(dashboard, /Math\.random\(\) \* \d|fake|mock/i, "sem números inventados");
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
