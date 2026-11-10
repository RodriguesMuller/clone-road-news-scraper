// Página de Notícias (mockup 2026-11-10): filtros por categoria e ilustração por tema.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(ROOT, "public", "dashboard.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");

test("toda categoria do Dashboard tem cena própria de ilustração", () => {
  const themes = [...dashboard.matchAll(/^\s*\["([^"]+)", "#[0-9A-Fa-f]{6}", \(/gm)].map((m) => m[1]);
  assert.ok(themes.length >= 9);
  for (const theme of [...themes, "Outros"]) assert.match(dashboard, new RegExp(`"${theme}": \{ sky:`), `sem cena para ${theme}`);
});

test("página de Notícias tem filtros por categoria, período e rodapé", () => {
  for (const id of ["newsThemeFilters", "newsPeriod", "newsFooter"]) assert.match(html, new RegExp(`id="${id}"`));
  for (const label of ["Todas", "Acidentes", "Interdições", "Obras", "Clima", "Outros"]) assert.ok(html.includes(`", "${label}", "`), `sem filtro ${label}`);
  assert.match(html, /Ver detalhe \$\{dashIcon\("arrow"\)\}/);
});
