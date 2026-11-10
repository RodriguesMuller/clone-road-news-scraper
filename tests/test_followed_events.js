// Central de Evento por acompanhamento: o usuário escolhe a notícia ("Acompanhar evento") e a API
// reúne as notícias seguintes sobre o mesmo evento, sem IA. O evento é da empresa (client_id).
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { createFakeSupabase, loadApi, call } = require("./helpers/fake_supabase");

const ROOT = path.resolve(__dirname, "..");
const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();

const SEED = {
  title: "Caminhão carregado de legumes tomba na Raposo Tavares e provoca congestionamento",
  summary: "Tombamento no km 24,5 da Rodovia Raposo Tavares, em Cotia, interdita duas faixas no sentido capital.",
  url: "https://g1.globo.com/sp/raposo-tombamento",
  source: "G1 - SP",
  published_at: hoursAgo(6),
};
const NEWS = [
  { ...SEED, created_at: SEED.published_at },
  { title: "Raposo Tavares é liberada após tombamento de caminhão em Cotia", summary: "Pistas do km 24 foram liberadas pela concessionária.", url: "https://example.com/raposo-liberada", source: "Portal Cotia", published_at: hoursAgo(2), created_at: hoursAgo(2) },
  { title: "Carga de legumes é retirada da pista na Raposo Tavares", summary: "Trabalho de limpeza no km 24,5.", url: "https://example.com/raposo-limpeza", source: "Band", published_at: hoursAgo(4), created_at: hoursAgo(4) },
  { title: "Caminhão tomba na Anhanguera e congestiona acesso a Campinas", summary: "Acidente no km 90 da Rodovia Anhanguera.", url: "https://example.com/anhanguera", source: "EPTV", published_at: hoursAgo(3), created_at: hoursAgo(3) },
  { title: "Chuva forte provoca alagamentos na zona sul de São Paulo", summary: "Defesa Civil emite alerta.", url: "https://example.com/chuva", source: "G1", published_at: hoursAgo(1), created_at: hoursAgo(1) },
  { title: "Raposo Tavares tem obras noturnas na semana passada", summary: "Obras em Cotia.", url: "https://example.com/raposo-antiga", source: "Portal", published_at: hoursAgo(24 * 8), created_at: hoursAgo(24 * 8) },
];

test("reúne só as notícias do mesmo evento (rodovia/local + termos), da mais recente para a mais antiga", () => {
  const { relatedNews } = require("../api/_followed_events");
  const related = relatedNews({ status: "active", seed: SEED }, NEWS).map((item) => item.url);
  assert.deepEqual(related, ["https://example.com/raposo-liberada", "https://example.com/raposo-limpeza"]);
});

test("encerrado não recebe notícias publicadas depois do encerramento", () => {
  const { relatedNews } = require("../api/_followed_events");
  const related = relatedNews({ status: "closed", closed_at: hoursAgo(3), seed: SEED }, NEWS).map((item) => item.url);
  assert.deepEqual(related, ["https://example.com/raposo-limpeza"]);
});

function setup() {
  const fake = createFakeSupabase({
    users: { a1: { id: "u-a1", email: "a1@acme.test" }, a2: { id: "u-a2" }, b1: { id: "u-b1" } },
    clients: [{ id: "c-acme", company_name: "ACME", status: "active" }, { id: "c-beta", company_name: "Beta", status: "active" }],
    profiles: [
      { id: "u-a1", role: "client", status: "active", client_id: "c-acme", full_name: "Ana Souza" },
      { id: "u-a2", role: "client", status: "active", client_id: "c-acme" },
      { id: "u-b1", role: "client", status: "active", client_id: "c-beta" },
    ],
    packages: [{ id: "p", name: "P", is_active: true, monthly_news_limit: 50 }],
    user_packages: ["u-a1", "u-a2", "u-b1"].map((user, i) => ({ id: `up${i}`, user_id: user, package_id: "p", is_active: true, starts_at: hoursAgo(48), ends_at: null, created_at: hoursAgo(48) })),
    news: NEWS,
  });
  const api = loadApi(ROOT, fake);
  const action = (token, body) => call(api("news-summary.js"), { method: "POST", token, body });
  const feed = (token) => call(api("news-feed.js"), { token });
  return { fake, action, feed };
}

test("acompanhar: o evento aparece para toda a empresa, com as atualizações; outra empresa não vê", async () => {
  const { fake, action, feed } = setup();
  const followed = await action("a1", { action: "follow-event", item: SEED });
  assert.equal(followed.status, 200, JSON.stringify(followed.data));
  assert.equal(followed.data.created, true);
  assert.equal(followed.data.event.related.length, 2);
  assert.equal(fake.db.followed_events[0].created_by_name, "Ana Souza");

  const again = await action("a2", { action: "follow-event", item: SEED });
  assert.equal(again.data.created, false, "a mesma notícia não vira dois eventos na empresa");
  assert.equal(fake.db.followed_events.length, 1);

  const colleague = await feed("a2");
  assert.equal(colleague.status, 200, JSON.stringify(colleague.data));
  assert.equal(colleague.data.followedEvents.length, 1, "colega da mesma empresa vê o evento");
  assert.equal(colleague.data.followedEvents[0].related[0].url, "https://example.com/raposo-liberada");
  assert.equal((await feed("b1")).data.followedEvents.length, 0, "outra empresa não vê");
});

test("encerrar, reabrir e parar de acompanhar só dentro da própria empresa", async () => {
  const { fake, action } = setup();
  const { data } = await action("a1", { action: "follow-event", item: SEED });
  const id = data.event.id;
  assert.notEqual((await action("b1", { action: "followed-event-status", event_id: id, status: "closed" })).status, 200, "outra empresa não altera");
  assert.equal(fake.db.followed_events[0].status, "active");
  assert.equal((await action("a2", { action: "followed-event-status", event_id: id, status: "closed" })).status, 200);
  assert.equal(fake.db.followed_events[0].status, "closed");
  assert.ok(fake.db.followed_events[0].closed_at);
  assert.equal((await action("a1", { action: "followed-event-status", event_id: id, status: "active" })).status, 200);
  assert.equal(fake.db.followed_events[0].closed_at, null);
  assert.notEqual((await action("b1", { action: "unfollow-event", event_id: id })).status, 200);
  assert.equal((await action("a1", { action: "unfollow-event", event_id: id })).status, 200);
  assert.equal(fake.db.followed_events.length, 0);
});

test("notícia sem link válido não pode ser acompanhada", async () => {
  const { action } = setup();
  const res = await action("a1", { action: "follow-event", item: { title: "Sem link", url: "javascript:alert(1)" } });
  assert.equal(res.status, 403);
  assert.match(res.data.error, /inválida para acompanhar/);
});
