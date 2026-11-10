// Regressão (2026-11-10): api/_text_repair.js lia config/accented_words.json, que o .vercelignore
// exclui do deploy; o feed caiu com FUNCTION_INVOCATION_FAILED. Nada em api/ pode depender de
// arquivo ignorado pela Vercel.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

test("a API não requer arquivos excluídos pelo .vercelignore", () => {
  const ignored = fs.readFileSync(path.join(ROOT, ".vercelignore"), "utf8")
    .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  const apiDir = path.join(ROOT, "api");
  for (const file of fs.readdirSync(apiDir).filter((name) => name.endsWith(".js"))) {
    const source = fs.readFileSync(path.join(apiDir, file), "utf8");
    for (const [, target] of source.matchAll(/require\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g)) {
      const relative = path.relative(ROOT, path.resolve(apiDir, target)).split(path.sep).join("/");
      const top = relative.split("/")[0];
      assert.ok(!ignored.includes(top) && !ignored.includes(relative), `${file} requer ${relative}, excluído do deploy pelo .vercelignore`);
    }
  }
});
