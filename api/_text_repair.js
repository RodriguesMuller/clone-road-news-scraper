// Conserta acento corrompido vindo da fonte (mesma regra de scraper/utils/filters.py: repair_text e
// strip_section_prefix), para as notícias que já estão gravadas com o texto quebrado.
// O vocabulário fica em public/ porque o .vercelignore exclui config/ do deploy (em config/, o
// require falhava e derrubava o feed inteiro). Sem o arquivo, o conserto vira no-op, nunca erro.
let words = [];
try {
  ({ words } = require("../public/accented_words.json"));
} catch {
  words = [];
}

const REPLACEMENT = String.fromCharCode(0xfffd);
const INDEX = new Map();
for (const entry of words) {
  for (const word of String(entry).split(/\s+/)) {
    if (!/[^\x00-\x7f]/.test(word)) continue;
    const key = word.toLowerCase().replace(/[^\x00-\x7f]/g, "?");
    const list = INDEX.get(key) || [];
    if (!list.includes(word)) list.push(word);
    INDEX.set(key, list);
  }
}
const BROKEN_WORD = new RegExp(`[\\p{L}\\p{N}_${REPLACEMENT}-]*${REPLACEMENT}[\\p{L}\\p{N}_${REPLACEMENT}-]*`, "gu");
const SECTION_PREFIX = new RegExp(`^\\s*(?:[uú${REPLACEMENT}]+ltimas\\s+)?not[ií${REPLACEMENT}]+cias?\\s*[-:|–]\\s+`, "i");
const MOJIBAKE_HINT = /[ÃÂ][\u0080-¿]/;

function fixMojibake(value) {
  if (!MOJIBAKE_HINT.test(value)) return value;
  try {
    const decoded = Buffer.from(value, "latin1").toString("utf8");
    return decoded.includes(REPLACEMENT) ? value : decoded;
  } catch {
    return value;
  }
}

function repairText(text) {
  if (!text) return text;
  const value = fixMojibake(String(text));
  if (!value.includes(REPLACEMENT)) return value;
  return value.replace(BROKEN_WORD, (word) => {
    const key = word.toLowerCase().replace(new RegExp(`${REPLACEMENT}+`, "g"), "?");
    const candidates = INDEX.get(key) || [];
    if (!candidates.length) return word.split(REPLACEMENT).join("");
    const upper = /^\p{Lu}/u.test(word);
    const proper = upper ? candidates.filter((c) => /^\p{Lu}/u.test(c)) : [];
    const fixed = (proper.length ? proper : candidates)[0];
    return upper ? fixed[0].toUpperCase() + fixed.slice(1) : fixed.toLowerCase();
  });
}

function stripSectionPrefix(title) {
  const value = String(title || "");
  const stripped = value.replace(SECTION_PREFIX, "");
  return stripped === value ? value : stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function repairNewsItem(item) {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    title: stripSectionPrefix(repairText(item.title)),
    summary: repairText(item.summary),
    source: repairText(item.source),
  };
}

module.exports = { repairNewsItem, repairText, stripSectionPrefix };
