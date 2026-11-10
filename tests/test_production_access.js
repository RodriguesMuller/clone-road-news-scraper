const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const admin = require(path.join(ROOT, "api", "_admin.js"));

test("CPF is normalized, validated and masked", () => {
  assert.equal(admin.normalizeCpf("529.982.247-25"), "52998224725");
  assert.equal(admin.isValidCpf("529.982.247-25"), true);
  assert.equal(admin.isValidCpf("111.111.111-11"), false);
  assert.equal(admin.maskCpf("52998224725"), "***.***.***-**");
});

test("package limits reject negative values", () => {
  assert.throws(
    () => admin.packagePayload({ name: "Teste", monthly_news_limit: -1 }),
    /nao podem ser negativos/i,
  );
  assert.throws(
    () => admin.packagePayload({ name: "Teste", monthly_route_limit: -1 }),
    /nao podem ser negativos/i,
  );
  assert.equal(admin.packagePayload({ name: "Teste", monthly_route_limit: 25 }).monthly_route_limit, 25);
});

test("production migration is non-seeding and keeps self profile writes closed", () => {
  const sql = fs.readFileSync(path.join(ROOT, "scripts", "supabase_production_clients_users_limits.sql"), "utf8");
  assert.doesNotMatch(sql, /insert\s+into\s+public\.(clients|packages|profiles|user_packages)/i);
  assert.match(sql, /alter table public\.profiles add column if not exists client_id/i);
  assert.match(sql, /monthly_route_limit integer not null default 30/i);
  assert.match(sql, /alter table public\.clients enable row level security/i);
  assert.match(sql, /using \(public\.can_manage_target_user\(id\)\)/i);
  assert.doesNotMatch(sql, /using \(id = auth\.uid\(\) or public\.can_manage_target_user/i);
  assert.match(sql, /target_user_id <> auth\.uid\(\)/i);
});

test("manual user flow never stores or returns the initial password", () => {
  const source = fs.readFileSync(path.join(ROOT, "api", "admin-users.js"), "utf8");
  const profilePayload = source.slice(source.indexOf('await supabaseFetch("/rest/v1/profiles"'), source.indexOf('await supabaseFetch("/rest/v1/user_packages"'));
  const successResponse = source.slice(source.indexOf("return { ok: true"), source.indexOf("async function deleteUser"));
  assert.doesNotMatch(profilePayload, /password\s*:/i);
  assert.doesNotMatch(successResponse, /password/i);
  assert.match(source, /password: user\.password/);
  assert.match(source, /\/auth\/v1\/admin\/users/);
});

function loadAuthWithUsage(usageCount, limit = 2, options = {}) {
  const role = options.role || "client";
  const withPackage = options.withPackage !== false;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  const authPath = path.join(ROOT, "api", "_auth.js");
  delete require.cache[require.resolve(authPath)];
  const writes = [];
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith("/auth/v1/user")) return Response.json({ id: "user-1", email: "user@example.com" });
    if (value.includes("/rest/v1/profiles")) return Response.json([{ id: "user-1", role, status: "active", client_id: "client-1" }]);
    if (value.includes("/rest/v1/clients")) return Response.json([{ id: "client-1", company_name: "Transportador", status: "active" }]);
    if (value.includes("/rest/v1/user_packages")) {
      if (!withPackage) return Response.json([]);
      return Response.json([{ package_id: "package-1", packages: {
        monthly_news_limit: limit,
        monthly_route_limit: limit,
        monthly_ai_summary_limit: limit,
        monthly_pdf_limit: limit,
        can_access_map: true,
        can_generate_individual_summary: true,
        can_generate_weekly_summary: true,
      } }]);
    }
    if (value.includes("/rest/v1/usage_events") && options.method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-range": `0/${usageCount}` } });
    }
    if (value.includes("/rest/v1/usage_events") && options.method === "POST") {
      writes.push(JSON.parse(options.body));
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected fetch: ${value}`);
  };
  return { auth: require(authPath), writes };
}

test("monthly limit blocks on the backend and records the blocked event", async () => {
  const { auth, writes } = loadAuthWithUsage(2, 2);
  const req = { headers: { authorization: "Bearer session-test" } };
  await assert.rejects(() => auth.assertCanUse(req, "news_query"), /Limite mensal de consultas atingido/i);
  assert.equal(writes.at(-1).event_type, "blocked_news_query_limit");
  assert.equal(writes.at(-1).user_id, "user-1");
  assert.equal(writes.at(-1).client_id, "client-1");
  assert.equal(writes.at(-1).package_id, "package-1");
});

test("an individual user below the limit remains authorized", async () => {
  const { auth, writes } = loadAuthWithUsage(1, 2);
  const req = { headers: { authorization: "Bearer session-test" } };
  const account = await auth.assertCanUse(req, "ai_summary_weekly");
  assert.equal(account.user.id, "user-1");
  assert.equal(writes.length, 0);
});

test("Minha Rota has an independent monthly package limit", async () => {
  const { auth, writes } = loadAuthWithUsage(2, 2);
  const req = { headers: { authorization: "Bearer session-test" } };
  await assert.rejects(() => auth.assertCanUse(req, "route_analysis"), /Minha Rota atingido/i);
  assert.equal(writes.at(-1).event_type, "blocked_route_analysis_limit");
  assert.equal(writes.at(-1).metadata.feature, "route_analysis");
});

for (const role of ["admin", "manager"]) {
  test(`${role} remains unlimited without a package`, async () => {
    const { auth, writes } = loadAuthWithUsage(9999, 0, { role, withPackage: false });
    const req = { headers: { authorization: "Bearer session-test" } };
    for (const feature of ["news_query", "route_analysis", "ai_summary_individual", "ai_summary_weekly", "pdf_generated", "map_access"]) {
      const account = await auth.assertCanUse(req, feature);
      assert.equal(account.profile.role, role);
      assert.equal(account.isPrivileged, true);
    }
    assert.equal(writes.length, 0);
  });
}

test("access response exposes unlimited resources to privileged profiles", async () => {
  loadAuthWithUsage(9999, 0, { role: "admin", withPackage: false });
  const accessPath = path.join(ROOT, "api", "my-access.js");
  delete require.cache[require.resolve(accessPath)];
  const handler = require(accessPath);
  const req = { method: "GET", headers: { authorization: "Bearer session-test" } };
  const response = { statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value; } };
  await handler(req, response);
  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.is_unlimited, true);
  assert.equal(payload.has_active_package, false);
  assert.equal(payload.can_query_news, true);
  assert.equal(payload.can_access_map, true);
  assert.equal(payload.can_analyze_route, true);
  assert.equal(payload.can_generate_individual_summary, true);
  assert.equal(payload.can_generate_weekly_summary, true);
  assert.equal(payload.can_generate_pdf, true);
});

test("manual user endpoint creates Auth, profile and package link without leaking password", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  const captures = { auth: null, profile: null, packageLink: null, audit: null };
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    const method = options.method || "GET";
    if (value.endsWith("/auth/v1/user")) return Response.json({ id: "admin-1", email: "admin@example.com" });
    if (value.includes("/rest/v1/profiles?id=eq.admin-1")) return Response.json([{ id: "admin-1", role: "admin", status: "active", client_id: null }]);
    if (value.includes("/rest/v1/user_packages?user_id=eq.admin-1")) return Response.json([]);
    if (value.includes("/rest/v1/clients?id=eq.client-1")) return Response.json([{ id: "client-1", company_name: "Transportador A", status: "active" }]);
    if (value.includes("/rest/v1/packages?id=eq.package-1")) return Response.json([{ id: "package-1", is_active: true, max_users: 10 }]);
    if (value.includes("/rest/v1/profiles?email=eq.")) return Response.json([]);
    // Vagas do pacote contadas por cliente (max_users vale por empresa).
    if (value.includes("/rest/v1/profiles?client_id=eq.client-1")) return Response.json([{ id: "other-user" }]);
    if (value.includes("/rest/v1/user_packages?package_id=eq.package-1") && value.includes("user_id=in.") && method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-range": "0/0" } });
    }
    if (value.includes("/auth/v1/admin/users?page=")) return Response.json({ users: [] });
    if (value.includes("/rest/v1/user_packages?package_id=eq.package-1") && method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-range": "0/0" } });
    }
    if (value.endsWith("/auth/v1/admin/users") && method === "POST") {
      captures.auth = JSON.parse(options.body);
      return Response.json({ id: "new-user-1", email: "joao@example.com" });
    }
    if (value.endsWith("/rest/v1/profiles") && method === "POST") {
      captures.profile = JSON.parse(options.body);
      return new Response(null, { status: 201 });
    }
    if (value.endsWith("/rest/v1/user_packages") && method === "POST") {
      captures.packageLink = JSON.parse(options.body);
      return new Response(null, { status: 201 });
    }
    if (value.endsWith("/rest/v1/audit_logs") && method === "POST") {
      captures.audit = JSON.parse(options.body);
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected fetch: ${method} ${value}`);
  };

  for (const moduleName of ["_auth.js", "_admin.js", "admin-users.js"]) {
    const modulePath = path.join(ROOT, "api", moduleName);
    delete require.cache[require.resolve(modulePath)];
  }
  const handler = require(path.join(ROOT, "api", "admin-users.js"));
  const body = JSON.stringify({
    action: "create_user",
    full_name: "Joao Silva",
    email: "joao@example.com",
    password: "SenhaSegura123!",
    cpf: "529.982.247-25",
    phone: "11999999999",
    client_id: "client-1",
    package_id: "package-1",
    role: "client",
    status: "active",
  });
  const req = Readable.from([body]);
  req.method = "POST";
  req.url = "/api/admin-users";
  req.headers = { authorization: "Bearer session-test" };
  const response = { statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value; } };
  await handler(req, response);
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(captures.auth.password, "SenhaSegura123!");
  assert.equal(captures.profile.client_id, "client-1");
  assert.equal(captures.profile.company_name, "Transportador A");
  assert.equal(captures.profile.cpf, "52998224725");
  assert.equal(captures.packageLink.package_id, "package-1");
  assert.equal(Object.hasOwn(captures.profile, "password"), false);
  assert.equal(JSON.stringify(captures.audit).includes("SenhaSegura123!"), false);
  assert.equal(JSON.stringify(payload).includes("SenhaSegura123!"), false);
});

test("production UI exposes the event center only inside the authenticated app", () => {
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  const authStart = html.indexOf('id="authView"');
  const appStart = html.indexOf('id="appShell"');
  const eventPage = html.indexOf('id="clientEventsPage"');
  assert.ok(appStart > authStart);
  assert.ok(eventPage > appStart);
  assert.match(html, /Central de Evento/);
  assert.match(html, /Foi identificado um evento/);
  assert.doesNotMatch(html, /A IA identificou um evento/);
});

test("total news card does not expose the Supabase implementation detail", () => {
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  assert.match(html, /\["Total de notícias", state\.total, ""\]/);
  assert.doesNotMatch(html, /registros no Supabase/);
});

test("event center presents the complete lifecycle and opens closed events", () => {
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  assert.match(html, /<span>Início<\/span>/);
  assert.match(html, /<span>Encerramento<\/span>/);
  assert.match(html, /function formatCalendarDate\(value\)/);
  assert.match(html, /data-event-open=/);
  assert.match(html, /const otherClosed = closed\.filter/);
});

test("event management controls require a privileged profile and management environment", () => {
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  assert.match(html, /const privilegedProfile = isAdminProfile\(\) \|\| isManagerProfile\(\)/);
  assert.match(html, /return privilegedProfile && canAccessManagementView\(\)/);
  assert.match(html, /Ação disponível apenas para gestores e administradores/);
});

test("client cannot call manager-only event actions", async () => {
  const { auth } = loadAuthWithUsage(0, 10, { role: "client", withPackage: true });
  const req = { headers: { authorization: "Bearer session-test" } };
  await assert.rejects(() => auth.requireManager(req), /Acesso negado/);
});

test("manager can close a major event through the existing secure summary endpoint", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  let patchedEvent = null;
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    const method = options.method || "GET";
    if (value.endsWith("/auth/v1/user")) return Response.json({ id: "manager-1", email: "manager@example.com" });
    if (value.includes("/rest/v1/profiles?id=eq.manager-1")) {
      return Response.json([{ id: "manager-1", role: "manager", status: "active", client_id: null }]);
    }
    if (value.includes("/rest/v1/user_packages?user_id=eq.manager-1")) return Response.json([]);
    if (value.includes("/rest/v1/platform_events?id=eq.event-1") && method === "GET") {
      return Response.json([{
        id: "event-1",
        message: "Paralisação no Porto de Santos",
        status: "open",
        metadata: { operational_status: "em_andamento", history: [] },
      }]);
    }
    if (value.includes("/rest/v1/platform_events?id=eq.event-1") && method === "PATCH") {
      patchedEvent = JSON.parse(options.body);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fetch: ${method} ${value}`);
  };

  for (const moduleName of ["_auth.js", "news-summary.js"]) {
    const modulePath = path.join(ROOT, "api", moduleName);
    delete require.cache[require.resolve(modulePath)];
  }
  const handler = require(path.join(ROOT, "api", "news-summary.js"));
  const req = Readable.from([JSON.stringify({
    action: "event-status",
    event_id: "event-1",
    operational_status: "encerrado",
  })]);
  req.method = "POST";
  req.headers = { authorization: "Bearer session-test" };
  const response = { statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value; } };
  await handler(req, response);

  assert.equal(response.statusCode, 200);
  assert.equal(patchedEvent.status, "resolved");
  assert.equal(patchedEvent.metadata.operational_status, "encerrado");
  assert.equal(patchedEvent.metadata.status_confirmed_by, "platform_manager");
  assert.match(patchedEvent.metadata.history.at(-1).note, /encerrado por um responsável/i);
});

test("Minha Rota is rendered only inside the authenticated app and keeps the API key server-side", () => {
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  const appStart = html.indexOf('id="appShell"');
  const routePage = html.indexOf('id="clientRoutePage"');
  assert.ok(routePage > appStart);
  assert.match(html, /Minha Rota/);
  assert.match(html, /\/minha-rota/);
  assert.match(html, /fetch\("\/api\/news-feed"/);
  assert.match(html, /weeklyButton\.hidden = state\.activeClientPage === "route"/);
  assert.match(html, /Tráfego consultado agora/);
  assert.match(html, /Lento \/ pare e siga/);
  assert.match(html, /function renderRiskMarkers/);
  assert.match(html, /route-risk-marker/);
  assert.doesNotMatch(html, /GOOGLE_ROUTES_API_KEY|GOOGLE_MAPS_API_KEY/);
  assert.equal(fs.existsSync(path.join(ROOT, "api", "route-analysis.js")), false);
  const inlineScripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.doesNotThrow(() => new Function(inlineScripts.at(-1)[1]));
});

test("route analysis combines traffic, route news and the server-side AI without leaking secrets", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  process.env.GOOGLE_ROUTES_API_KEY = "google-routes-test";
  process.env.OPENAI_API_KEY = "sk-route-test";
  process.env.OPENAI_MODEL = "gpt-4.1-mini";
  const usageWrites = [];
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    const method = options.method || "GET";
    if (value.endsWith("/auth/v1/user")) return Response.json({ id: "user-1", email: "user@example.com" });
    if (value.includes("/rest/v1/profiles")) return Response.json([{ id: "user-1", role: "client", status: "active", client_id: "client-1" }]);
    if (value.includes("/rest/v1/clients")) return Response.json([{ id: "client-1", company_name: "Transportador", status: "active" }]);
    if (value.includes("/rest/v1/user_packages")) {
      return Response.json([{ package_id: "package-1", packages: {
        is_active: true,
        monthly_news_limit: 100,
        monthly_route_limit: 30,
        monthly_ai_summary_limit: 20,
        can_access_map: true,
        can_generate_individual_summary: true,
      } }]);
    }
    if (value.includes("/rest/v1/usage_events") && method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-range": "0/0" } });
    }
    if (value.includes("/rest/v1/usage_events") && method === "POST") {
      usageWrites.push(JSON.parse(options.body));
      return new Response(null, { status: 201 });
    }
    if (value === "https://routes.googleapis.com/directions/v2:computeRoutes") {
      const request = JSON.parse(options.body);
      assert.match(request.origin.address, /Paulínia\/SP, Brasil/);
      assert.equal(options.headers["X-Goog-Api-Key"], "google-routes-test");
      return Response.json({ routes: [{
        distanceMeters: 1034000,
        duration: "52200s",
        staticDuration: "50400s",
        polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
        travelAdvisory: { speedReadingIntervals: [
          { startPolylinePointIndex: 0, endPolylinePointIndex: 2, speed: "NORMAL" },
          { startPolylinePointIndex: 2, endPolylinePointIndex: 3, speed: "SLOW" },
        ] },
        legs: [{ steps: [{ navigationInstruction: { instructions: "Siga pela BR-364" } }] }],
      }] });
    }
    if (value.includes("/rest/v1/news?select=")) {
      return Response.json([{
        title: "Obra causa pare-e-siga na BR-364",
        summary: "Intervenção exige atenção dos motoristas no trecho.",
        source: "Fonte rodoviária",
        category: "rodovia",
        highway: "BR-364",
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        url: "https://example.com/noticia",
      }]);
    }
    if (value === "https://api.openai.com/v1/responses") {
      assert.equal(options.headers.Authorization, "Bearer sk-route-test");
      return Response.json({
        output_text: JSON.stringify({
          status: "atencao",
          headline: "Rota com ponto de atenção na BR-364",
          recommendation: "Validar o pare-e-siga antes da liberação.",
          confidence: "Média",
          operational_points: ["Há obra relacionada à BR-364."],
          watch_points: ["Pare-e-siga na BR-364"],
        }),
        usage: { input_tokens: 120, output_tokens: 60 },
      });
    }
    throw new Error(`Unexpected fetch: ${method} ${value}`);
  };

  for (const moduleName of ["_auth.js", "_admin.js", "news-feed.js"]) {
    const modulePath = path.join(ROOT, "api", moduleName);
    delete require.cache[require.resolve(modulePath)];
  }
  const handler = require(path.join(ROOT, "api", "news-feed.js"));
  const req = Readable.from([JSON.stringify({ origin: "Paulínia/SP", destination: "Cuiabá/MT" })]);
  req.method = "POST";
  req.headers = { authorization: "Bearer session-test" };
  const response = { statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value; } };
  await handler(req, response);
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200, response.body);
  assert.equal(payload.route.provider, "Google Routes");
  assert.equal(payload.route.roads[0], "BR-364");
  assert.equal(payload.alerts[0].highway, "BR-364");
  assert.equal(payload.analysis.ai_used, true);
  assert.equal(payload.analysis.status, "atencao");
  assert.equal(JSON.stringify(payload).includes("google-routes-test"), false);
  assert.equal(JSON.stringify(payload).includes("sk-route-test"), false);
  assert.ok(usageWrites.some((event) => event.event_type === "route_analysis"));
  assert.ok(!usageWrites.some((event) => event.event_type === "news_query"));
  assert.ok(usageWrites.some((event) => event.event_type === "ai_summary_individual"));
});

test("weekly summary classifies region and category without false positives", async () => {
  process.env.AUTH_ENABLED = "false";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  process.env.OPENAI_API_KEY = "";
  const rows = [
    "Caminhão de carga tomba e motorista se fere a caminho para o porto",
    "Acidente na BR-163 em Mato Grosso do Sul",
    "Chuva forte no Paraná",
    "Bloqueio de rodovia no Pará",
  ].map((title) => ({ title, summary: "", source: "Fonte", created_at: new Date().toISOString() }));
  global.fetch = async (url) => {
    if (String(url).includes("/rest/v1/news?select=")) return Response.json(rows);
    throw new Error(`Unexpected fetch: ${url}`);
  };
  for (const moduleName of ["_auth.js", "weekly-summary.js"]) {
    delete require.cache[require.resolve(path.join(ROOT, "api", moduleName))];
  }
  const handler = require(path.join(ROOT, "api", "weekly-summary.js"));
  const response = { statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value; } };
  try {
    await handler({ method: "GET", headers: {} }, response);
  } finally {
    delete process.env.AUTH_ENABLED;
  }
  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.summary.coverage.analyzed, 4);
  assert.equal(payload.summary.ai_used, false);
  // "para" (preposição) não é Pará; "Mato Grosso do Sul" não vira Mato Grosso.
  const { ufFromText } = require(path.join(ROOT, "api", "_weekly_brief.js"));
  assert.deepEqual(rows.map((row) => ufFromText(row.title)), ["", "MS", "PR", "PA"]);
  assert.ok(!payload.summary.cargo_security.length, "tombamento não é roubo de carga");
  assert.ok(payload.summary.highlights.some((h) => h.uf === "PA" && h.kind === "block_total"));
});
