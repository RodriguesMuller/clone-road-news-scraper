const assert = require("node:assert/strict");

process.env.AUTH_ENABLED = "true";
process.env.APP_ENV = "staging";
process.env.STAGING_READ_ONLY = "true";
process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_ANON_KEY = "anon_test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service_test";

const handler = require("../api/admin-data");

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
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
  const calls = [];
  global.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.endsWith("/auth/v1/user")) return response({ id: "manager_a", email: "manager-a@example.com" });
    if (value.includes("/profiles?id=eq.manager_a&select=*")) {
      return response([{ id: "manager_a", email: "manager-a@example.com", role: "manager", status: "active", client_id: "client_a" }]);
    }
    if (value.includes("/profiles?select=*&order=created_at.desc&client_id=eq.client_a")) {
      return response([
        { id: "manager_a", email: "manager-a@example.com", role: "manager", status: "active", client_id: "client_a" },
        { id: "user_a", email: "user-a@example.com", role: "client", status: "active", client_id: "client_a" },
      ]);
    }
    if (value.includes("/packages?select=*")) return response([]);
    if (value.includes("/clients?select=*&order=company_name.asc&id=eq.client_a")) {
      return response([{ id: "client_a", company_name: "Cliente A", status: "active" }]);
    }
    if (value.includes("/auth/v1/admin/users")) {
      return response({ users: [
        { id: "manager_a", email: "manager-a@example.com" },
        { id: "user_a", email: "user-a@example.com" },
        { id: "user_b", email: "user-b@example.com" },
      ] });
    }
    if (value.includes("/user_packages?")) return response([]);
    if (value.includes("/usage_events?") && value.includes("client_id=eq.client_a")) return response([]);
    if (value.includes("/audit_logs?") && value.includes("client_id=eq.client_a")) return response([]);
    throw new Error(`Unexpected request: ${value}`);
  };

  const req = { method: "GET", headers: { authorization: "Bearer session_test" } };
  const res = recorder();
  await handler(req, res);
  const payload = JSON.parse(res.body);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(payload.clients.map((client) => client.id), ["client_a"]);
  assert.deepEqual(payload.users.map((user) => user.id), ["manager_a", "user_a"]);
  assert.ok(!payload.users.some((user) => user.id === "user_b"));
  assert.ok(calls.some((url) => url.includes("profiles?select=*&order=created_at.desc&client_id=eq.client_a")));
  assert.ok(calls.some((url) => url.includes("usage_events?") && url.includes("client_id=eq.client_a")));
  assert.ok(calls.some((url) => url.includes("audit_logs?") && url.includes("client_id=eq.client_a")));
  console.log("admin tenant filter ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
