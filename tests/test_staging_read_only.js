const assert = require("node:assert/strict");
const { Readable } = require("node:stream");

process.env.AUTH_ENABLED = "true";
process.env.APP_ENV = "staging";
process.env.STAGING_READ_ONLY = "true";
process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_ANON_KEY = "anon_test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service_test";

const auth = require("../api/_auth");
const authConfig = require("../api/auth-config");
const adminPackages = require("../api/admin-packages");

function request(method = "GET", body = null) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.url = "/api/test";
  req.headers = { authorization: "Bearer session_test" };
  return req;
}

function recorder() {
  return {
    statusCode: 200,
    body: "",
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = String(value || ""); },
  };
}

async function main() {
  assert.equal(auth.appEnvironment(), "staging");
  assert.equal(auth.isReadOnlyEnvironment(), true);
  assert.throws(() => auth.assertWritableEnvironment(), /somente leitura/);

  const configRes = recorder();
  await authConfig(request("GET"), configRes);
  const config = JSON.parse(configRes.body);
  assert.equal(config.environment, "staging");
  assert.equal(config.readOnly, true);

  const calls = [];
  global.fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    calls.push({ url: String(url), method });
    if (String(url).endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "manager", email: "manager@example.com" }), { status: 200 });
    }
    if (String(url).includes("/rest/v1/profiles?id=eq.manager&select=*")) {
      return new Response(JSON.stringify([{ id: "manager", role: "admin", status: "active", client_id: "client_a" }]), { status: 200 });
    }
    throw new Error(`Unexpected write or request: ${method} ${url}`);
  };

  const packageRes = recorder();
  await adminPackages(request("POST", { name: "Nao criar" }), packageRes);
  assert.equal(packageRes.statusCode, 403);
  assert.match(JSON.parse(packageRes.body).error, /somente leitura/);
  assert.ok(!calls.some((call) => call.method !== "GET"));

  const beforeUsage = calls.length;
  await auth.recordUsage({ authEnabled: true, user: { id: "manager" } }, "news_view", {});
  assert.equal(calls.length, beforeUsage);
  console.log("staging read-only ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
