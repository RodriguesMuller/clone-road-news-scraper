// Pacotes e limites de ponta a ponta: handlers reais contra um Supabase simulado com estado,
// para que o consumo registrado por uma chamada seja visto pela próxima (ver tests/helpers).
// Regra: o usuário HERDA o pacote (recursos e limites) do cliente, mas o consumo é de cada usuário.
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { createFakeSupabase, loadApi, call } = require("./helpers/fake_supabase");

const ROOT = path.resolve(__dirname, "..");
const DAY = 864e5;
const iso = (ms) => new Date(ms).toISOString();

function seed() {
  const now = Date.now();
  const basic = {
    id: "p-basic", name: "Básico", is_active: true, max_users: 2,
    monthly_news_limit: 3, monthly_route_limit: 2, monthly_ai_summary_limit: 2, monthly_pdf_limit: 1,
    can_access_map: false, can_generate_individual_summary: true, can_generate_weekly_summary: true,
  };
  const link = (id, user, pkg, extra = {}) => ({ id, user_id: user, package_id: pkg, is_active: true, starts_at: iso(now - DAY), ends_at: null, created_at: iso(now - DAY), ...extra });
  return {
    users: {
      a1: { id: "u-a1" }, a2: { id: "u-a2" }, a3: { id: "u-a3" }, b1: { id: "u-b1" }, b2: { id: "u-b2" },
      adm: { id: "u-adm" }, exp: { id: "u-exp" }, fut: { id: "u-fut" }, off: { id: "u-off" }, old: { id: "u-old" },
      d1: { id: "u-d1" }, d2: { id: "u-d2" },
    },
    clients: [
      { id: "c-acme", company_name: "ACME", status: "active" },
      { id: "c-beta", company_name: "Beta", status: "active" },
      { id: "c-gama", company_name: "Gama", status: "inactive" },
      { id: "c-delta", company_name: "Delta", status: "active", package_id: "p-delta" },
    ],
    profiles: [
      { id: "u-a1", role: "client", status: "active", client_id: "c-acme" },
      { id: "u-a2", role: "client", status: "active", client_id: "c-acme" },
      { id: "u-a3", role: "client", status: "active", client_id: "c-acme" },
      { id: "u-b1", role: "client", status: "active", client_id: "c-beta" },
      { id: "u-b2", role: "client", status: "active", client_id: "c-beta" },
      { id: "u-adm", role: "admin", status: "active", client_id: null },
      { id: "u-exp", role: "client", status: "active", client_id: "c-acme" },
      { id: "u-fut", role: "client", status: "active", client_id: "c-acme" },
      { id: "u-off", role: "client", status: "active", client_id: "c-gama" },
      { id: "u-old", role: "client", status: "active", client_id: "c-acme" },
      { id: "u-d1", role: "client", status: "active", client_id: "c-delta" },
      { id: "u-d2", role: "client", status: "active", client_id: "c-delta" },
    ],
    packages: [
      basic,
      { ...basic, id: "p-old", name: "Descontinuado", is_active: false, monthly_news_limit: 99 },
      { ...basic, id: "p-delta", name: "Delta Pro", max_users: 3, monthly_news_limit: 2, can_access_map: true },
    ],
    user_packages: [
      link("up1", "u-a1", "p-basic"), link("up2", "u-a2", "p-basic"), link("up3", "u-b1", "p-basic"), link("up3b", "u-b2", "p-basic"),
      link("up4", "u-exp", "p-basic", { ends_at: iso(now - DAY) }),
      link("up5", "u-fut", "p-basic", { starts_at: iso(now + 10 * DAY) }),
      link("up6", "u-off", "p-basic"), link("up7", "u-old", "p-old"),
      // Pacote individual antigo de um usuário da Delta: ignorado, porque a Delta tem pacote próprio.
      link("up8", "u-d1", "p-basic"),
    ],
    usage_events: [{ id: "old-1", user_id: "u-a1", client_id: "c-acme", event_type: "pdf_generated", created_at: iso(now - 40 * DAY) }],
  };
}

function setup() {
  const fake = createFakeSupabase(seed());
  const api = loadApi(ROOT, fake);
  const usageEvent = (token, event_type) => call(api("usage-event.js"), { method: "POST", token, body: { event_type } });
  return { fake, api, usageEvent, feed: (token) => call(api("news-feed.js"), { token }) };
}

test("limite mensal por recurso: libera até o limite e bloqueia o seguinte", async () => {
  const { usageEvent, feed, fake } = setup();
  const news = [];
  for (let i = 0; i < 4; i += 1) news.push((await feed("a1")).status);
  assert.deepEqual(news, [200, 200, 200, 403], "notícias: 3/mês");
  assert.deepEqual([(await usageEvent("a1", "pdf_generated")).status, (await usageEvent("a1", "pdf_generated")).status], [200, 403], "PDF: 1/mês; o do mês passado não conta");
  assert.equal((await usageEvent("a1", "map_access")).status, 403, "mapa fora do pacote");
  assert.deepEqual(
    [(await usageEvent("a1", "ai_summary_individual")).status, (await usageEvent("a1", "ai_summary_weekly")).status, (await usageEvent("a1", "ai_summary_individual")).status],
    [200, 200, 403], "IA: individual e semanal somam no mesmo limite",
  );
  const blocked = fake.db.usage_events.filter((e) => e.event_type.startsWith("blocked_")).map((e) => e.event_type);
  assert.ok(blocked.includes("blocked_news_query_limit") && blocked.includes("blocked_pdf_limit") && blocked.includes("blocked_map_disabled"));
});

test("o consumo é de cada USUÁRIO: usuários da mesma empresa não dividem o saldo", async () => {
  const { feed, api } = setup();
  for (let i = 0; i < 3; i += 1) assert.equal((await feed("a1")).status, 200);
  assert.equal((await feed("a1")).status, 403, "a1 gastou as 3 consultas dele");
  assert.equal((await feed("a2")).status, 200, "a2, da mesma empresa, ainda tem o próprio saldo");
  const access = await call(api("my-access.js"), { token: "a2" });
  assert.equal(access.data.usage_this_month.news, 1, "my-access mostra só o consumo do próprio usuário");
  assert.equal(access.data.can_query_news, true);
});

test("o usuário herda o pacote do cliente (recursos e limites), mas não o consumo", async () => {
  const { feed, usageEvent, api } = setup();
  const access = await call(api("my-access.js"), { token: "d1" });
  assert.equal(access.data.package_name, "Delta Pro", "pacote do cliente vale sobre o pacote individual antigo");
  assert.equal(access.data.package_source, "client");
  assert.equal((await usageEvent("d1", "map_access")).status, 200, "mapa liberado pelo pacote do cliente");
  assert.deepEqual([(await feed("d1")).status, (await feed("d1")).status, (await feed("d1")).status], [200, 200, 403], "limite herdado: 2/mês");
  assert.deepEqual([(await feed("d2")).status, (await feed("d2")).status], [200, 200], "d2 herda o mesmo limite com saldo próprio");
});

test("vigência do pacote: vencido, futuro e desativado bloqueiam; cliente inativo bloqueia; admin ilimitado", async () => {
  const { feed } = setup();
  assert.equal((await feed("exp")).status, 403, "pacote vencido");
  assert.equal((await feed("fut")).status, 403, "pacote que ainda não começou (starts_at no futuro)");
  assert.equal((await feed("old")).status, 403, "pacote desativado");
  assert.match((await feed("off")).data.error, /inativo/i, "cliente inativo");
  for (let i = 0; i < 5; i += 1) assert.equal((await feed("adm")).status, 200, "admin sem pacote e sem limite");
});

test("requisições simultâneas nunca ultrapassam o limite do usuário", async () => {
  const { fake, api, usageEvent } = setup();
  const auth = api("_auth.js");
  const results = await Promise.allSettled(Array.from({ length: 5 }, async () => {
    const account = await auth.assertCanUse({ headers: { authorization: "Bearer a1" } }, "route_analysis");
    await auth.reserveUsage(account, "route_analysis", "route_analysis", {});
  }));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2, "Minha Rota: saldo 2, passam exatamente 2");
  assert.equal(fake.db.usage_events.filter((e) => e.event_type === "route_analysis").length, 2);
  const pdf = await Promise.all(["a1", "a1", "a1", "a1"].map((token) => usageEvent(token, "pdf_generated")));
  assert.equal(pdf.filter((r) => r.status === 200).length, 1, "PDF: 4 abas do mesmo usuário disputando o último, só 1 passa");
});

test("Minha Rota só consome a consulta quando a rota é calculada", async () => {
  const { fake, api } = setup();
  const feed = api("news-feed.js");
  const invalid = await call(feed, { method: "POST", token: "a1", body: { origin: "SP", destination: "" } });
  assert.equal(invalid.status, 400);
  delete process.env.GOOGLE_ROUTES_API_KEY;
  const failed = await call(feed, { method: "POST", token: "a1", body: { origin: "São Paulo, SP", destination: "Curitiba, PR" } });
  assert.ok(failed.status >= 400);
  assert.equal(fake.db.usage_events.filter((e) => e.event_type === "route_analysis").length, 0, "entrada inválida ou falha do Google devolvem a consulta");
});

test("atribuição de pacote: valida antes de trocar e max_users vale por cliente", async () => {
  // ACME ocupa o Básico com a1 e a2 (vigentes) e u-exp (vencido, não ocupa vaga).
  const fake = createFakeSupabase({ ...seed(), user_packages: seed().user_packages.filter((r) => r.user_id !== "u-fut") });
  const api = loadApi(ROOT, fake);
  const assign = (body) => call(api("admin-user-package.js"), { method: "POST", token: "adm", body });
  const bad = await assign({ user_id: "u-a1", package_id: "p-inexistente" });
  assert.equal(bad.status, 403);
  assert.ok(fake.db.user_packages.some((r) => r.user_id === "u-a1" && r.is_active), "usuário mantém o pacote atual quando o novo é inválido");
  // ACME já ocupa as 2 vagas do Básico (a1, a2): o 3º da ACME é barrado…
  const third = await assign({ user_id: "u-a3", package_id: "p-basic" });
  assert.equal(third.status, 403);
  assert.match(third.data.error, /limite de usuarios/i);
  // …e reatribuir o mesmo pacote a quem já tem não conta a própria vaga.
  assert.equal((await assign({ user_id: "u-a1", package_id: "p-basic" })).status, 200);
});

test("max_users de uma empresa não impede outra empresa de usar o mesmo pacote", async () => {
  const fake = createFakeSupabase({ ...seed(), user_packages: seed().user_packages.filter((r) => r.user_id !== "u-b1" && r.user_id !== "u-b2") });
  const api = loadApi(ROOT, fake);
  const res = await call(api("admin-user-package.js"), { method: "POST", token: "adm", body: { user_id: "u-b1", package_id: "p-basic" } });
  assert.equal(res.status, 200, "ACME cheia no Básico; Beta ainda pode usar");
});

test("gestão vê todo o consumo do mês, mesmo acima de 1000 eventos", async () => {
  const base = seed();
  const events = Array.from({ length: 2500 }, (_, i) => ({ id: `e-${String(i).padStart(5, "0")}`, user_id: "u-a1", client_id: "c-acme", event_type: "news_query", created_at: iso(Date.now() - 1000 - i) }));
  const fake = createFakeSupabase({ ...base, usage_events: events });
  const api = loadApi(ROOT, fake);
  const res = await call(api("admin-data.js"), { token: "adm" });
  assert.equal(res.status, 200);
  assert.equal(res.data.usage.length, 2500, "antes: no máximo 1000 (limite do Supabase por resposta)");
  assert.equal(res.data.usage_truncated, false);
});

test("cadastro: usuário de cliente com pacote herda sem pacote individual; vagas contam os usuários da empresa", async () => {
  const fake = createFakeSupabase(seed());
  const api = loadApi(ROOT, fake);
  const create = (email) => call(api("admin-users.js"), {
    method: "POST", token: "adm",
    body: { action: "create_user", full_name: "Novo Usuário", email, password: "Senha@123", cpf: "52998224725", client_id: "c-delta" },
  });
  const first = await create("novo1@delta.test");
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.ok(!fake.db.user_packages.some((r) => r.user_id === first.data.user_id), "não cria pacote individual");
  fake.db.profiles.find((p) => p.id === first.data.user_id).status = "active";
  const second = await create("novo2@delta.test");
  assert.equal(second.status, 403, "Delta Pro permite 3 usuários e a Delta já tem 3");
  assert.match(second.data.error, /limite de usuarios/i);
});

test("pacote herdado não pode ser trocado por usuário; o cliente define o pacote", async () => {
  const fake = createFakeSupabase(seed());
  const api = loadApi(ROOT, fake);
  const assign = await call(api("admin-user-package.js"), { method: "POST", token: "adm", body: { user_id: "u-d2", package_id: "p-basic" } });
  assert.equal(assign.status, 403);
  assert.match(assign.data.error, /herda o pacote do cliente/i);
  const tooSmall = await call(api("admin-data.js"), { method: "PATCH", token: "adm", body: { id: "c-acme", package_id: "p-basic" } });
  assert.equal(tooSmall.status, 403, "Básico permite 2 usuários e a ACME tem mais ativos");
  const ok = await call(api("admin-data.js"), { method: "PATCH", token: "adm", body: { id: "c-beta", package_id: "p-delta" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(fake.db.clients.find((c) => c.id === "c-beta").package_id, "p-delta");
  const access = await call(api("my-access.js"), { token: "b1" });
  assert.equal(access.data.package_name, "Delta Pro", "usuários da Beta passam a herdar o novo pacote");
});
