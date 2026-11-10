const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const RoadRisk = require(path.join(ROOT, "public", "risk.js"));
const GOLDEN = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "domain", "risk_golden.json"), "utf8"));

test("régua de risco reproduz o dataset dourado", () => {
  for (const item of GOLDEN.cases) {
    const result = RoadRisk.classifyRisk(item);
    assert.equal(result.level, item.expected, `${item.title} -> ${result.reason} (${item.why})`);
    assert.ok(result.reason, "toda classificação precisa de justificativa");
  }
});

test("painel, API e resumos usam a mesma régua (sem regex de risco próprias)", () => {
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  assert.match(html, /<script src="\/risk\.js"><\/script>/);
  assert.doesNotMatch(html, /const RISK_[A-Z_]+_PATTERN/);
  assert.doesNotMatch(html, /const BLOCK_TOTAL = \//);
  for (const file of ["news-feed.js", "news-summary.js"]) {
    const source = fs.readFileSync(path.join(ROOT, "api", file), "utf8");
    assert.match(source, /require\("\.\.\/public\/risk\.js"\)/, `${file} usa public/risk.js`);
    assert.doesNotMatch(source, /return "Critico";/, `${file} não tem régua própria`);
  }
  const brief = fs.readFileSync(path.join(ROOT, "public", "brief.js"), "utf8");
  assert.match(brief, /require\("\.\/risk\.js"\)/, "brief.js usa a régua");
  assert.match(fs.readFileSync(path.join(ROOT, "api", "_weekly_brief.js"), "utf8"), /require\("\.\.\/public\/brief\.js"\)/);
  const weekly = fs.readFileSync(path.join(ROOT, "api", "weekly-summary.js"), "utf8");
  assert.match(weekly, /require\("\.\/_weekly_brief"\)/, "resumo semanal usa o mesmo cálculo do e-mail");
});

test("Minha Rota expõe o mesmo nível e justificativa da régua", () => {
  const { riskForItem } = require(path.join(ROOT, "api", "news-feed.js"));
  const item = { title: "Carreta tomba e interdita a BR-116 em Registro" };
  const [rank, label, reason] = riskForItem(item);
  const expected = RoadRisk.classifyRisk(item);
  assert.deepEqual([rank, label, reason], [expected.rank, expected.label, expected.reason]);
});
