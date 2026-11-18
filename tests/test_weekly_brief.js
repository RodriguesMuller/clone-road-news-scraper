const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const { buildWeeklyBrief } = require(path.join(ROOT, "api", "_weekly_brief.js"));
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "weekly_items.json"), "utf8"));
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "weekly_brief_expected.json"), "utf8"));
const brief = buildWeeklyBrief(fixture.items, Date.parse(fixture.now));

test("resumo semanal reproduz o resultado esperado (mesmo arquivo usado pelo Python)", () => {
  assert.deepEqual(brief, expected);
});

test("resumo semanal responde o que o gestor precisa decidir", () => {
  const types = new Set(brief.watchlist.map((w) => w.type));
  assert.ok(types.has("Bloqueio programado"));
  assert.ok(types.has("Paralisação/manifestação"));
  assert.ok(brief.hotspots.length > 0 && brief.hotspots.every((h) => h.action));
  assert.ok(brief.actions.length > 0 && brief.actions.length <= 5);
  assert.ok(brief.numbers.every((n) => Number.isInteger(n.value) && Number.isInteger(n.previous)));
});

test("bloqueio programado já passado sai da lista; data futura citada vira agenda", () => {
  const titles = brief.watchlist.map((w) => w.title);
  assert.ok(!titles.some((t) => t.includes("nesta quinta (5)")), "bloqueio do dia 5 já aconteceu");
  const future = brief.watchlist.find((w) => w.title.includes("no dia 14"));
  assert.equal(future?.scheduled, "14/11");
});

test("trecho liberado depois do bloqueio não aparece como 'pode seguir bloqueado'", () => {
  assert.ok(!brief.watchlist.some((w) => w.type === "Pode seguir bloqueado" && w.road === "BR-277"));
});

test("mesma ocorrência noticiada por vários veículos vira um evento só", () => {
  const items = [
    { title: "BR-101 terá bloqueio total no ES nesta terça", source: "A", created_at: "2026-11-10T10:00:00-03:00" },
    { title: "BR-101 será totalmente interditada nesta terça no Sul do ES", source: "B", created_at: "2026-11-10T11:00:00-03:00" },
    { title: "Saída 221 da BR-101 em Palhoça, SC terá bloqueio temporário", source: "C", created_at: "2026-11-10T12:00:00-03:00" },
  ];
  const result = buildWeeklyBrief(items, Date.parse("2026-11-10T18:00:00-03:00"));
  const planned = result.watchlist.filter((w) => w.type === "Bloqueio programado");
  assert.equal(planned.length, 2, "ES agrupado; SC é outra ocorrência");
  assert.equal(planned.find((w) => w.uf === "ES")?.sources, 2);
});

// Duplicação entre veículos que inflava os números do resumo (bloqueios, acidentes, mortes).
const at = (iso) => ({ created_at: iso });
const eventsOf = (items, now) => buildWeeklyBrief(items, Date.parse(now)).coverage.events;

test("mesmo acidente: um veículo cita a BR, outro não -> um evento só", () => {
  const items = [
    { title: "Carreta tomba e mata motorista na BR-277 em Curitiba - G1", source: "G1", ...at("2026-11-10T08:00:00-03:00") },
    { title: "Carreta tomba e mata motorista em Curitiba - CNN Brasil", source: "CNN", ...at("2026-11-10T09:00:00-03:00") },
  ];
  assert.equal(eventsOf(items, "2026-11-10T18:00:00-03:00"), 1);
});

test("mesma BR no mesmo ciclo de notícia: um veículo cita a UF, outro não -> um evento só", () => {
  const items = [
    { title: "Acidente entre carretas deixa dois mortos na BR-116 em Feira de Santana (BA) - G1", source: "G1", ...at("2026-11-10T08:00:00-03:00") },
    { title: "Colisão entre caminhões mata duas pessoas na BR-116 - Band", source: "Band", ...at("2026-11-10T10:00:00-03:00") },
  ];
  const brief = buildWeeklyBrief(items, Date.parse("2026-11-10T18:00:00-03:00"));
  assert.equal(brief.coverage.events, 1);
  assert.equal(brief.numbers.find((n) => n.key === "fatal").value, 1);
});

test("acidentes diferentes na mesma rodovia, sem UF e em dias diferentes, não se juntam", () => {
  const items = [
    { title: "Tombamento de caminhão na Rodovia Raposo Tavares, em Cotia (SP), gera atrasos", source: "A", ...at("2026-11-06T08:00:00-03:00") },
    { title: "Motorista fica ferido após batida entre carretas na Rodovia Raposo Tavares", source: "B", ...at("2026-11-07T02:00:00-03:00") },
  ];
  assert.equal(eventsOf(items, "2026-11-10T18:00:00-03:00"), 2);
});

test("UF ou rodovia diferentes continuam separando ocorrências", () => {
  const items = [
    { title: "Carreta tomba e interdita a BR-116 em Registro, SP", source: "A", ...at("2026-11-10T08:00:00-03:00") },
    { title: "Carreta tomba e interdita a BR-116 em Feira de Santana, BA", source: "B", ...at("2026-11-10T09:00:00-03:00") },
    { title: "Carreta tomba e interdita a BR-381 em Betim, MG", source: "C", ...at("2026-11-10T09:30:00-03:00") },
  ];
  assert.equal(eventsOf(items, "2026-11-10T18:00:00-03:00"), 3);
});

test("'Zona da Mata' e 'incêndio em mata' não contam como vítima fatal", () => {
  const RoadRisk = require(path.join(ROOT, "public", "risk.js"));
  assert.equal(RoadRisk.classifyRisk({ title: "Carreta tomba na BR-116 na Zona da Mata mineira e trânsito fica lento" }).fatal, false);
  assert.equal(RoadRisk.classifyRisk({ title: "Acidente com caminhão perto de incêndio em mata na BR-040" }).fatal, false);
  assert.equal(RoadRisk.classifyRisk({ title: "Colisão entre carretas mata motorista na BR-116" }).fatal, true);
  assert.equal(RoadRisk.classifyRisk({ title: "Acidente na BR-101 mata 3 pessoas" }).fatal, true);
  assert.equal(RoadRisk.classifyRisk({ title: "Batida entre caminhões matou dois na BR-153" }).fatal, true);
});
