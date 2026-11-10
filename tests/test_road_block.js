const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const { roadBlockLevel } = require(path.join(ROOT, "api", "news-feed.js"));

const CASES = [
  ["BR-116 totalmente bloqueada após tombamento de carreta em Registro", "total"],
  ["Protesto bloqueia a BR-163 em Sinop", "total"],
  ["Queda de barreira interdita Serra do Mar", "total"],
  ["BR-101 segue interditada sem previsão de liberação", "total"],
  ["Acidente deixa BR-381 com pare e siga no km 450", "partial"],
  ["Rodovia tem interdição parcial após acidente", "partial"],
  ["Rodovia SP-055 é liberada após acidente", ""],
  ["Justiça determina bloqueio de bens de empresário", ""],
  ["Engavetamento causa lentidão na Régis Bittencourt", ""],
];

test("roadBlockLevel classifica bloqueio total, parcial e liberado", () => {
  for (const [title, expected] of CASES) {
    assert.equal(roadBlockLevel({ title }), expected, title);
  }
});

test("painel usa a mesma regra de bloqueio do backend", () => {
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  const api = fs.readFileSync(path.join(ROOT, "api", "news-feed.js"), "utf8");
  for (const name of ["BLOCK_ROAD_CONTEXT", "BLOCK_RELEASED", "BLOCK_STILL_ACTIVE", "BLOCK_PARTIAL", "BLOCK_TOTAL"]) {
    const pattern = new RegExp(`const ${name} = (/.*/);`);
    const fromApi = api.match(pattern)?.[1];
    const fromHtml = html.match(pattern)?.[1];
    assert.ok(fromApi && fromHtml, `${name} presente nos dois arquivos`);
    assert.equal(fromHtml, fromApi, `${name} divergiu entre painel e API`);
  }
});

test("mapa não depende mais dos tiles do CARTO que exigem API key", () => {
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  assert.doesNotMatch(html, /basemaps\.cartocdn\.com/);
});
