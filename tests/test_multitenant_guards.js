const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.AUTH_ENABLED = "true";
process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_ANON_KEY = "anon_test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service_test";

const {
  assertCanAccessClient,
  assertCanManageProfile,
} = require("../api/_auth");

const manager = {
  isAdmin: false,
  isManager: true,
  profile: { id: "manager_a", role: "manager", client_id: "client_a" },
};
const admin = {
  isAdmin: true,
  isManager: false,
  profile: { id: "admin", role: "admin", client_id: "platform" },
};

assert.equal(assertCanAccessClient(manager, "client_a"), "client_a");
assert.throws(() => assertCanAccessClient(manager, "client_b"), /outra empresa/);
assert.equal(assertCanAccessClient(admin, "client_b"), "client_b");

const clientA = { id: "user_a", role: "client", client_id: "client_a" };
const clientB = { id: "user_b", role: "client", client_id: "client_b" };
const managerA = { id: "manager_a_2", role: "manager", client_id: "client_a" };
assert.equal(assertCanManageProfile(manager, clientA), clientA);
assert.throws(() => assertCanManageProfile(manager, clientB), /outra empresa/);
assert.throws(() => assertCanManageProfile(manager, managerA), /usuarios Cliente/);
assert.equal(assertCanManageProfile(admin, clientB), clientB);

const sql = fs.readFileSync(path.join(__dirname, "..", "scripts", "supabase_phase2_multitenant.sql"), "utf8");
assert.match(sql, /alter table public\.profiles alter column client_id set not null/i);
assert.match(sql, /create policy clients_select_tenant/i);
assert.match(sql, /create policy saved_news_insert_own/i);
assert.match(sql, /create policy platform_events_admin/i);
assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);

const frontend = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
assert.match(frontend, /id="inviteClient"/);
assert.match(frontend, /id="editUserClient"/);
assert.doesNotMatch(frontend, /id="inviteCompany"/);
assert.doesNotMatch(frontend, /id="editUserCompany"/);

console.log("multitenant guards ok");
