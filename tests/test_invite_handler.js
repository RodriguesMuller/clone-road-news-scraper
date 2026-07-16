const assert = require("node:assert/strict");
const { Readable } = require("node:stream");

process.env.AUTH_ENABLED = "true";
process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_ANON_KEY = "anon_test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service_test";
process.env.APP_URL = "https://road-news.example";
process.env.RESEND_API_KEY = "re_test";
process.env.INVITE_EMAIL_FROM = "Road News <acesso@example.com>";

const handler = require("../api/admin-users");

function response(status, payload, headers = {}) {
  return new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function request(body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = "POST";
  req.url = "/api/admin-users";
  req.headers = { authorization: "Bearer session_test" };
  return req;
}

function resultRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = String(value || ""); },
  };
}

function mockFetch({ actorRole = "admin", resendOk = true } = {}) {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url: String(url), method, body, headers: options.headers || {} });

    if (String(url).endsWith("/auth/v1/user")) return response(200, { id: "actor", email: "admin@example.com" });
    if (String(url).includes("/rest/v1/profiles?id=eq.actor&select=*")) {
      return response(200, [{ id: "actor", role: actorRole, status: "active", email: "admin@example.com", client_id: "client_a" }]);
    }
    if (String(url).includes("/rest/v1/clients?id=eq.client_a")) {
      return response(200, [{ id: "client_a", company_name: "Transportadora A", status: "active", package_id: "package_test" }]);
    }
    if (String(url).includes("/rest/v1/profiles?email=ilike.")) return response(200, []);
    if (String(url).includes("/auth/v1/admin/users?page=1")) return response(200, { users: [] });
    if (String(url).includes("/rest/v1/packages?id=eq.package_test")) {
      return response(200, [{ id: "package_test", max_users: 5 }]);
    }
    if (String(url).includes("/rest/v1/user_packages?package_id=eq.package_test")) {
      return response(200, null, { "content-range": "0/0" });
    }
    if (String(url).endsWith("/auth/v1/admin/generate_link")) {
      return response(200, {
        user: { id: "invited_user", email: "cliente@example.com" },
        action_link: "https://supabase.example/auth/v1/verify?token=secret&type=invite&redirect_to=https%3A%2F%2Froad-news.example%2Faccept-invite",
      });
    }
    if (String(url) === "https://api.resend.com/emails") {
      return resendOk
        ? response(200, { id: "email_delivery" })
        : response(403, { message: "domain is not verified" });
    }
    if (method === "DELETE" && String(url).includes("/auth/v1/admin/users/invited_user")) return response(200, {});
    if (String(url).includes("/rest/v1/")) return response(method === "POST" ? 201 : 200, method === "POST" ? null : []);
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  return calls;
}

async function inviteAsAdmin() {
  const calls = mockFetch();
  const res = resultRecorder();
  await handler(request({
    full_name: "Cliente Teste",
    email: "cliente@example.com",
    client_id: "client_a",
    role: "client",
    status: "active",
    package_id: "package_test",
  }), res);
  const payload = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.redirect_to, "https://road-news.example/accept-invite");
  assert.equal(payload.email_provider, "resend");
  assert.ok(!res.body.includes("service_test"));
  assert.ok(!calls.some((call) => call.url.includes("/auth/v1/invite")));

  const generate = calls.find((call) => call.url.endsWith("/auth/v1/admin/generate_link"));
  assert.equal(generate.body.type, "invite");
  assert.equal(generate.body.redirect_to, "https://road-news.example/accept-invite");
  const resend = calls.find((call) => call.url === "https://api.resend.com/emails");
  assert.equal(resend.body.from, "Road News <acesso@example.com>");
  assert.equal(resend.body.to[0], "cliente@example.com");
  assert.match(resend.body.html, /Aceitar convite/);
  const profileWrite = calls.find((call) => call.url.includes("/rest/v1/profiles") && call.method === "POST");
  assert.equal(profileWrite.body.client_id, "client_a");
  assert.equal(profileWrite.body.company_name, "Transportadora A");
}

async function managerCannotInviteAdmin() {
  const calls = mockFetch({ actorRole: "manager" });
  const res = resultRecorder();
  await handler(request({ email: "admin2@example.com", role: "admin", client_id: "client_a" }), res);
  assert.equal(res.statusCode, 403);
  assert.match(JSON.parse(res.body).error, /Gestor|permiss/i);
  assert.ok(!calls.some((call) => call.url.endsWith("/auth/v1/admin/generate_link")));
}

async function rollbackWhenEmailFails() {
  const calls = mockFetch({ resendOk: false });
  const res = resultRecorder();
  await handler(request({
    full_name: "Cliente Teste",
    email: "cliente@example.com",
    client_id: "client_a",
    role: "client",
    package_id: "package_test",
  }), res);
  assert.equal(res.statusCode, 403);
  assert.match(JSON.parse(res.body).error, /remetente do Road News/);
  assert.ok(calls.some((call) => call.method === "DELETE" && call.url.includes("/auth/v1/admin/users/invited_user")));
  assert.ok(calls.some((call) => call.method === "DELETE" && call.url.includes("/rest/v1/profiles?id=eq.invited_user")));
}

async function main() {
  await inviteAsAdmin();
  await managerCannotInviteAdmin();
  await rollbackWhenEmailFails();
  console.log("invite handler ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
