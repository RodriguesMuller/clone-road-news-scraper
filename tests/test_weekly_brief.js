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

// Casos reais da auditoria do resumo de 18/11/2026 (espelho em tests/test_weekly_brief.py).
test("morte só de animal não conta como vítima fatal; morte de pessoa com animal envolvido conta", () => {
  const RoadRisk = require(path.join(ROOT, "public", "risk.js"));
  const fatal = (title) => RoadRisk.classifyRisk({ title }).fatal;
  assert.equal(fatal("Carreta com 45 bois tomba e três animais morrem na BR-354, em MG"), false);
  assert.equal(fatal("Tombamento de carreta mata três bois e deixa animais feridos em rodovia de Minas Gerais"), false);
  assert.equal(fatal("Cavalo morre atropelado na BR-393, em Barra do Piraí"), false);
  assert.equal(fatal("Acidente com vários veículos na BR-262 deixa mais de 40 animais mortos em Uberaba"), false);
  assert.equal(fatal("Motociclista e cachorro morrem em acidente na rodovia PR-495"), true);
  assert.equal(fatal("Motociclista morre após atropelar cavalo na BR-277; animal também não resistiu"), true);
  assert.equal(fatal("Caminhão com 140 porcos cai em ribanceira e motorista morre na MG-111"), true);
});

test("notícia publicada mais de 2 dias antes da coleta conta na data de publicação", () => {
  const now = "2026-11-18T12:00:00-03:00";
  const items = [
    { title: "Acidente deixa 38 mortos na BR-116, em município de Teófilo Otoni (MG)", source: "A", published_at: "2024-12-21T10:00:00-03:00", created_at: "2026-11-13T10:00:00-03:00" },
    { title: "Carreta tomba e mata motorista na BR-381 em Betim, MG", source: "B", published_at: "2026-11-13T08:00:00-03:00", created_at: "2026-11-13T10:00:00-03:00" },
  ];
  const fatal = buildWeeklyBrief(items, Date.parse(now)).numbers.find((n) => n.key === "fatal");
  assert.equal(fatal.value, 1, "o acidente de 2024 não entra na semana");
});

test("ERS-135 e RS-135 são a mesma rodovia", () => {
  const items = [
    { title: "Condutora morre em acidente com caminhão na ERS-135, entre Estação e Sertão", source: "A", created_at: "2026-11-14T08:00:00-03:00" },
    { title: "Mulher morre em colisão entre carro e caminhão na RS-135, em Estação", source: "B", created_at: "2026-11-14T15:00:00-03:00" },
  ];
  const brief = buildWeeklyBrief(items, Date.parse("2026-11-18T12:00:00-03:00"), { includeEvents: true });
  assert.equal(brief.coverage.events, 1);
  assert.equal(brief.events[0].road, "RS-135");
  assert.equal(brief.events[0].uf, "RS");
});

test("coleta parada na semana anterior: sem base de comparação", () => {
  assert.equal(brief.comparison.available, true, "fixture tem coleta nas duas semanas");
  // Coleta parou e voltou 2 dias antes do fim da semana anterior (buraco real de 05/10 a 09/11/2026).
  const items = [
    { title: "Carreta tomba e interdita a BR-116 em Registro, SP", source: "A", created_at: "2026-11-09T15:00:00-03:00" },
    { title: "Carreta tomba e interdita a BR-381 em Betim, MG", source: "B", created_at: "2026-11-15T09:00:00-03:00" },
    // Publicada dentro do buraco mas coletada depois: não prova que a coleta funcionou naqueles dias.
    { title: "Caminhão tomba e interdita a BR-040 em Juiz de Fora, MG", source: "C", published_at: "2026-11-06T09:00:00-03:00", created_at: "2026-11-15T09:00:00-03:00" },
  ];
  const gap = buildWeeklyBrief(items, Date.parse("2026-11-18T12:00:00-03:00"));
  assert.equal(gap.comparison.available, false);
  assert.match(gap.executive_summary, /sem base de comparação com a semana anterior/);
});

test("indicadores do boletim em PDF: gravidade, tipo e UF a partir das ocorrências agrupadas", () => {
  const { weeklyReport } = require(path.join(ROOT, "api", "_weekly_report.js"));
  const full = buildWeeklyBrief(fixture.items, Date.parse(fixture.now), { includeEvents: true });
  const report = weeklyReport(full.events);
  assert.equal(report.events, full.coverage.events);
  assert.equal(report.by_level.reduce((sum, l) => sum + l.events, 0) <= report.events, true);
  assert.equal(report.severe, report.by_level[0].events + report.by_level[1].events);
  assert.equal(report.by_category.reduce((sum, c) => sum + c.events, 0), report.events);
  assert.ok(report.by_state.length <= 8 && report.by_state.every((s, i, list) => i === 0 || list[i - 1].events >= s.events));
  assert.deepEqual(weeklyReport([]).by_category, []);
});
