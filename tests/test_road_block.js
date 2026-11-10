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

test("mapa não depende mais dos tiles do CARTO que exigem API key", () => {
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  assert.doesNotMatch(html, /basemaps\.cartocdn\.com/);
});

// Codificador do formato "encoded polyline" do Google (inverso de decodePolyline).
function encodePolyline(points) {
  let last = [0, 0];
  let out = "";
  for (const point of points) {
    for (let i = 0; i < 2; i += 1) {
      const value = Math.round(point[i] * 1e5);
      let delta = value - last[i];
      last[i] = value;
      delta = delta < 0 ? ~(delta << 1) : delta << 1;
      while (delta >= 0x20) { out += String.fromCharCode((0x20 | (delta & 0x1f)) + 63); delta >>= 5; }
      out += String.fromCharCode(delta + 63);
    }
  }
  return out;
}

test("Minha Rota não puxa bloqueio de outro estado por nome parecido e ancora o que é da rota", () => {
  const { matchRouteNews } = require(path.join(ROOT, "api", "news-feed.js"));
  const points = [[-23.66, -46.53], [-23.60, -46.45], [-23.53, -46.37], [-23.48, -46.35]];
  const route = {
    polyline: { encodedPolyline: encodePolyline(points) },
    legs: [{ steps: [
      { navigationInstruction: { instructions: "Siga pela Av. Industrial" }, startLocation: { latLng: { latitude: -23.66, longitude: -46.53 } } },
      { navigationInstruction: { instructions: "Pegue a SP-021" }, startLocation: { latLng: { latitude: -23.60, longitude: -46.45 } } },
    ] }],
  };
  const now = new Date().toISOString();
  const items = [
    { title: "BR-101 em Rio Novo do Sul terá bloqueio total nesta terça", summary: "Trecho no Espírito Santo", published_at: now },
    { title: "Carreta tomba e bloqueia SP-021 em Poá", summary: "", published_at: now },
    { title: "Alagamento interdita avenida em Santo André, SP", summary: "", published_at: now },
    { title: "Acidente bloqueia avenida em Santos", summary: "", published_at: now },
  ];
  const { alerts } = matchRouteNews(items, route, "Santo André, SP", "Itaquaquecetuba, SP");
  const titles = alerts.map((alert) => alert.title);

  assert.ok(!titles.some((title) => title.includes("Rio Novo do Sul")), "bloqueio do ES não pertence à rota");
  assert.ok(!titles.some((title) => title.includes("Santos")), "Santos não é Santo André");

  const sp021 = alerts.find((alert) => alert.title.includes("SP-021"));
  assert.ok(sp021?.road_blocked, "bloqueio na SP-021 entra e é marcado");
  assert.equal(sp021.route_point_index, 1, "ancorado no ponto da SP-021 no traçado");

  const local = alerts.find((alert) => alert.title.includes("Santo André"));
  assert.equal(local?.route_point_index, 0, "ocorrência na cidade de origem fica marcada na origem");
});
