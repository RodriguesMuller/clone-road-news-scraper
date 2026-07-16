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
});

test("production migration is non-seeding and keeps self profile writes closed", () => {
  const sql = fs.readFileSync(path.join(ROOT, "scripts", "supabase_production_clients_users_limits.sql"), "utf8");
  assert.doesNotMatch(sql, /insert\s+into\s+public\.(clients|packages|profiles|user_packages)/i);
  assert.match(sql, /alter table public\.profiles add column if not exists client_id/i);
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

function loadAuthWithUsage(usageCount, limit = 2) {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  const authPath = path.join(ROOT, "api", "_auth.js");
  delete require.cache[require.resolve(authPath)];
  const writes = [];
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith("/auth/v1/user")) return Response.json({ id: "user-1", email: "user@example.com" });
    if (value.includes("/rest/v1/profiles")) return Response.json([{ id: "user-1", role: "client", status: "active", client_id: "client-1" }]);
    if (value.includes("/rest/v1/clients")) return Response.json([{ id: "client-1", company_name: "Transportador", status: "active" }]);
    if (value.includes("/rest/v1/user_packages")) {
      return Response.json([{ package_id: "package-1", packages: {
        monthly_news_limit: limit,
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
    if (value.includes("/rest/v1/profiles?email=ilike.")) return Response.json([]);
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
