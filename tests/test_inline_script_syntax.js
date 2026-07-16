const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];

if (!scripts.length) throw new Error("Nenhum script inline encontrado no frontend.");
new vm.Script(scripts.at(-1)[1], { filename: "public/index.html" });

console.log("inline script syntax ok");
