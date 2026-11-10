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
