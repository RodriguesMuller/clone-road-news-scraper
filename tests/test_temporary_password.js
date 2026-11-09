// Fluxo de acesso por senha temporaria: o admin cria o usuario, ele e obrigado a trocar no 1o login.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

function fresh(names) {
  for (const name of names) delete require.cache[require.resolve(path.join(ROOT, "api", name))];
}

function fakeReq(method, url, body, token = "session-test") {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = url;
  req.headers = { authorization: `Bearer ${token}` };
  return req;
}

function fakeRes() {
  return { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = v; } };
}

function setEnv() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  delete process.env.AUTH_ENABLED;
}

// Supabase falso: usuario autenticado com o papel e a marca must_change_password informados.
function mockSupabase({ role = "client", mustChange = false, userId = "user-1", extra = () => null } = {}) {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    const method = options.method || "GET";
    calls.push({ method, url: value, body: options.body ? JSON.parse(options.body) : null });
    const custom = await extra(value, method, options);
    if (custom) return custom;
    if (value.endsWith("/auth/v1/user")) {
      return Response.json({ id: userId, email: "u@example.com", app_metadata: { provider: "email", must_change_password: mustChange } });
    }
    if (value.includes(`/rest/v1/profiles?id=eq.${userId}&select=*`)) {
      return Response.json([{ id: userId, role, status: "active", client_id: null, email: "u@example.com" }]);
    }
    if (value.includes(`/rest/v1/user_packages?user_id=eq.${userId}`)) return Response.json([]);
    if (value.includes("/rest/v1/usage_events") && method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-range": "0/0" } });
    }
    if (value.endsWith("/rest/v1/audit_logs")) return new Response(null, { status: 201 });
    if (value.includes("/auth/v1/admin/users/") && method === "PUT") return Response.json({ id: "x" });
    throw new Error(`Unexpected fetch: ${method} ${value}`);
  };
  return calls;
}

test("password policy: 8+ chars, lowercase, uppercase and special character", () => {
  fresh(["_auth.js", "_admin.js"]);
  const { passwordPolicyError } = require(path.join(ROOT, "api", "_admin.js"));
  assert.match(passwordPolicyError("Ab!1234"), /8 caracteres/);
  assert.match(passwordPolicyError("ABCDEFG!"), /minuscula/);
  assert.match(passwordPolicyError("abcdefg!"), /maiuscula/);
  assert.match(passwordPolicyError("Abcdefgh1"), /especial/);
  assert.equal(passwordPolicyError("Abcdefg!"), "");
  assert.equal(passwordPolicyError("Senha@Forte"), "");
  // o navegador aplica a mesma regra
  assert.match(fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8"), /function passwordPolicyError\(value\)/);
});

test("user with a temporary password is blocked from the API until changing it", async () => {
  setEnv();
  mockSupabase({ mustChange: true });
  fresh(["_auth.js", "_admin.js", "news-feed.js"]);
  const handler = require(path.join(ROOT, "api", "news-feed.js"));
  const res = fakeRes();
  await handler(fakeReq("GET", "/api/news-feed"), res);
  assert.equal(res.statusCode, 403);
  assert.match(JSON.parse(res.body).error, /senha temporaria/i);
});

test("my-access still answers and tells the UI the password must change", async () => {
  setEnv();
  mockSupabase({ mustChange: true });
  fresh(["_auth.js", "_admin.js", "my-access.js"]);
  const handler = require(path.join(ROOT, "api", "my-access.js"));
  const res = fakeRes();
  await handler(fakeReq("GET", "/api/my-access"), res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).must_change_password, true);
});

test("change-password enforces the policy server-side and clears the flag", async () => {
  setEnv();
  const calls = mockSupabase({ mustChange: true });
  fresh(["_auth.js", "_admin.js", "change-password.js"]);
  const handler = require(path.join(ROOT, "api", "change-password.js"));

  const weak = fakeRes();
  await handler(fakeReq("POST", "/api/change-password", { password: "fraca123", password_confirmation: "fraca123" }), weak);
  assert.equal(weak.statusCode, 400);
  assert.equal(calls.some((call) => call.method === "PUT"), false, "senha fraca nao chega ao Supabase");

  const mismatch = fakeRes();
  await handler(fakeReq("POST", "/api/change-password", { password: "Nova@Senha1", password_confirmation: "Outra@Senha1" }), mismatch);
  assert.equal(mismatch.statusCode, 400);

  const ok = fakeRes();
  await handler(fakeReq("POST", "/api/change-password", { password: "Nova@Senha1", password_confirmation: "Nova@Senha1" }), ok);
  assert.equal(ok.statusCode, 200);
  const put = calls.find((call) => call.method === "PUT");
  assert.match(put.url, /\/auth\/v1\/admin\/users\/user-1$/, "so altera o proprio usuario");
  assert.deepEqual(put.body, { password: "Nova@Senha1", app_metadata: { must_change_password: false } });
  const auditCall = calls.find((call) => call.url.endsWith("/rest/v1/audit_logs"));
  assert.equal(JSON.stringify(auditCall.body).includes("Nova@Senha1"), false, "senha nunca vai para auditoria");
});

test("admin creates users with a temporary password flagged for change, never by e-mail invite", async () => {
  setEnv();
  let authPayload = null;
  mockSupabase({
    role: "admin",
    userId: "admin-1",
    extra: (value, method, options) => {
      if (value.includes("/rest/v1/clients?id=eq.client-1")) return Response.json([{ id: "client-1", company_name: "Transportador A", status: "active" }]);
      if (value.includes("/rest/v1/packages?id=eq.package-1")) return Response.json([{ id: "package-1", is_active: true, max_users: 0 }]);
      if (value.includes("/rest/v1/profiles?email=eq.")) return Response.json([]);
      if (value.includes("/auth/v1/admin/users?page=")) return Response.json({ users: [] });
      if (value.endsWith("/auth/v1/admin/users") && method === "POST") {
        authPayload = JSON.parse(options.body);
        return Response.json({ id: "new-1" });
      }
      if (value.endsWith("/rest/v1/profiles") || value.endsWith("/rest/v1/user_packages")) return new Response(null, { status: 201 });
      if (value.includes("/auth/v1/invite")) throw new Error("convite por e-mail nao deveria ser chamado");
      return null;
    },
  });
  fresh(["_auth.js", "_admin.js", "admin-users.js"]);
  const handler = require(path.join(ROOT, "api", "admin-users.js"));
  const base = {
    full_name: "Joao Silva", email: "joao@example.com", cpf: "529.982.247-25",
    client_id: "client-1", package_id: "package-1", role: "client", status: "active",
  };

  const weak = fakeRes();
  await handler(fakeReq("POST", "/api/admin-users", { ...base, password: "senhafraca" }), weak);
  assert.equal(weak.statusCode, 403);
  assert.match(JSON.parse(weak.body).error, /maiuscula/);
  assert.equal(authPayload, null);

  const legacyInvite = fakeRes();
  await handler(fakeReq("POST", "/api/admin-users", { ...base, action: "invite_user" }), legacyInvite);
  assert.equal(legacyInvite.statusCode, 403, "sem senha temporaria nao cria (o convite por e-mail nao existe mais)");

  const ok = fakeRes();
  await handler(fakeReq("POST", "/api/admin-users", { ...base, password: "Temp@2026x" }), ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(JSON.parse(ok.body).mode, "temporary");
  assert.deepEqual(authPayload.app_metadata, { must_change_password: true });
});

test("admin can reset a temporary password; it re-flags the user and is never audited in clear", async () => {
  setEnv();
  const calls = mockSupabase({
    role: "admin",
    userId: "admin-1",
    extra: (value, method) => {
      if (value.includes("/rest/v1/profiles?id=eq.user-9&select=id,email")) {
        return Response.json([{ id: "user-9", email: "c@example.com", role: "client", status: "active", client_id: "client-1" }]);
      }
      if (value.includes("/rest/v1/clients?id=eq.client-1")) return Response.json([{ id: "client-1", company_name: "Transportador A" }]);
      if (value.includes("/rest/v1/profiles?id=eq.user-9") && method === "PATCH") return new Response(null, { status: 204 });
      return null;
    },
  });
  fresh(["_auth.js", "_admin.js", "admin-user-profile.js"]);
  const handler = require(path.join(ROOT, "api", "admin-user-profile.js"));
  const body = { user_id: "user-9", full_name: "Cliente", cpf: "529.982.247-25", client_id: "client-1", role: "client", status: "active" };

  const weak = fakeRes();
  await handler(fakeReq("PATCH", "/api/admin-user-profile", { ...body, temporary_password: "abc" }), weak);
  assert.equal(weak.statusCode, 403);
  assert.equal(calls.some((call) => call.method === "PUT"), false);

  const ok = fakeRes();
  await handler(fakeReq("PATCH", "/api/admin-user-profile", { ...body, temporary_password: "Reset@2026" }), ok);
  assert.equal(ok.statusCode, 200);
  const put = calls.find((call) => call.method === "PUT");
  assert.match(put.url, /\/auth\/v1\/admin\/users\/user-9$/);
  assert.deepEqual(put.body, { password: "Reset@2026", app_metadata: { must_change_password: true } });
  const auditCall = calls.filter((call) => call.url.endsWith("/rest/v1/audit_logs")).at(-1);
  assert.equal(JSON.stringify(auditCall.body).includes("Reset@2026"), false);
  assert.equal(auditCall.body.metadata.temporary_password_reset, true);
});
