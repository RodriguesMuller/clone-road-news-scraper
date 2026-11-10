// Acento corrompido na fonte: mesma regra da coleta (scraper/utils/filters.py) aplicada às notícias já gravadas.
const assert = require("node:assert/strict");
const test = require("node:test");
const { repairNewsItem, repairText, stripSectionPrefix } = require("../api/_text_repair");

const R = String.fromCharCode(0xfffd);

test("conserta o título do print (Guia Crissiumal) e tira o rótulo de seção", () => {
  const item = repairNewsItem({ title: `Not${R}${R}cias - Grave acidente na RSC-472, em Palmitinho, envolvendo caminh${R}${R}o-ba${R}${R} emplacado em Tr${R}${R}s Passos` });
  assert.equal(item.title, "Grave acidente na RSC-472, em Palmitinho, envolvendo caminhão-baú emplacado em Três Passos");
});

test("UTF-8 lido como Latin-1 é recodificado; texto correto não muda", () => {
  assert.equal(repairText("CaminhÃ£o tomba em SÃ£o Paulo"), "Caminhão tomba em São Paulo");
  assert.equal(repairText("Ônibus e caminhão já liberados"), "Ônibus e caminhão já liberados");
  assert.equal(repairText(`palavra x${R}y desconhecida`), "palavra xy desconhecida", "sem palavra conhecida, o losango sai");
  assert.equal(stripSectionPrefix("Últimas notícias: ponte cai"), "Ponte cai");
  assert.equal(stripSectionPrefix("Notícias boas para o frete"), "Notícias boas para o frete", "só tira rótulo seguido de separador");
});
