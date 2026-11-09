// Regressao das correcoes da auditoria QA de 2026-11-09 (docs/qa-audit/remediation-log.md).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");

function freshModules(names) {
  for (const name of names) delete require.cache[require.resolve(path.join(ROOT, "api", name))];
}

function fakeRes() {
  return { statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value; } };
}

function fakeReq(method, url, chunks, headers = { authorization: "Bearer session-test" }) {
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = headers;
  return req;
}

function setEnv() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
}

// --- P0: tabela news nao pode ser lida direto pelo navegador ------------------------------

test("frontend never reads the news table directly with the public key", () => {
  const html = read("public", "index.html");
  assert.doesNotMatch(html, /\/rest\/v1\/\$\{/, "nenhum fetch generico para /rest/v1 no navegador");
  assert.doesNotMatch(html, /fetchRowsWithOptionalAi/);
  assert.match(html, /async function loadNews\(\) \{\s*const response = await fetch\("\/api\/news-feed"/);
});

test("scraper no longer recreates the anonymous read policy", () => {
  const source = read("scraper", "storage", "postgres.py");
  assert.doesNotMatch(source, /CREATE POLICY/i);
  assert.doesNotMatch(source, /TO anon/i);
});

test("hardening migration drops anon access and ships a rollback", () => {
  const sql = read("scripts", "supabase_security_hardening.sql");
  assert.match(sql, /drop policy if exists "Allow public read news" on public\.news/i);
  assert.match(sql, /revoke all on table public\.news from anon, authenticated/i);
  assert.match(sql, /revoke execute on function public\.get_user_role\(uuid\) from public, anon/i);
  assert.match(sql, /check \(role in \('admin', 'manager', 'client'\)\)/i);
  assert.match(sql, /create index if not exists news_created_at_idx/i);
  assert.doesNotMatch(sql, /\b(drop table|truncate|delete from)\b/i, "migration nao pode destruir dados");
  assert.ok(fs.existsSync(path.join(ROOT, "scripts", "supabase_security_hardening_rollback.sql")));
});

// --- Entrada de requisicao ----------------------------------------------------------------

test("readJson rejects oversized and malformed bodies with a friendly error", async () => {
  freshModules(["_auth.js", "_admin.js"]);
  const { readJson } = require(path.join(ROOT, "api", "_admin.js"));
  await assert.rejects(readJson(fakeReq("POST", "/", [Buffer.alloc(300 * 1024, 97)])), /muito grande/);
  await assert.rejects(readJson(fakeReq("POST", "/", ["{not json"])), /Requisicao invalida/);
  assert.deepEqual(await readJson(fakeReq("POST", "/", ["[1,2]"])), {});
  assert.deepEqual(await readJson(fakeReq("POST", "/", ['{"a":1}'])), { a: 1 });
});

test("route analysis answers 400 (not 500) for a malformed body", async () => {
  setEnv();
  process.env.AUTH_ENABLED = "false";
  freshModules(["_auth.js", "_admin.js", "news-feed.js"]);
  global.fetch = async (url) => { throw new Error(`Unexpected fetch: ${url}`); };
  const handler = require(path.join(ROOT, "api", "news-feed.js"));
  const res = fakeRes();
  await handler(fakeReq("POST", "/api/news-feed", ["{broken"]), res);
  delete process.env.AUTH_ENABLED;
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /Requisicao invalida/);
});

// --- Custo de IA ----------------------------------------------------------------------------

test("news-summary caps the client-supplied text sent to OpenAI", async () => {
  setEnv();
  process.env.AUTH_ENABLED = "false";
  process.env.OPENAI_API_KEY = "sk-test-key";
  freshModules(["_auth.js", "_admin.js", "news-summary.js"]);
  let openAiBody = null;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes("api.openai.com")) {
      openAiBody = JSON.parse(options.body);
      return Response.json({ output_text: JSON.stringify({ image_summary: "ok", ai_summary: "ok" }) });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const handler = require(path.join(ROOT, "api", "news-summary.js"));
  const huge = "x".repeat(50000);
  const res = fakeRes();
  await handler(fakeReq("POST", "/api/news-summary", [JSON.stringify({ item: { title: `BR-116 ${huge}`, summary: huge, source: huge } })]), res);
  delete process.env.AUTH_ENABLED;
  delete process.env.OPENAI_API_KEY;
  assert.ok(openAiBody, "OpenAI deveria ter sido chamada");
  const userText = openAiBody.input.find((entry) => entry.role === "user").content[0].text;
  const sent = JSON.parse(userText);
  assert.ok(sent.title.length <= 300);
  assert.ok(sent.raw_summary.length <= 2000);
  assert.ok(sent.source.length <= 120);
  assert.ok(userText.length < 4000, `payload enviado a IA ficou com ${userText.length} caracteres`);
});

test("usage-event stores only small plain-object metadata", () => {
  const source = read("api", "usage-event.js");
  assert.match(source, /metadata: safeMetadata\(body\.metadata\)/);
  assert.match(source, /JSON\.stringify\(value\)\.length <= 2000/);
});

// --- Exclusao de usuario --------------------------------------------------------------------

test("admin user lookups match e-mail exactly instead of ilike wildcards", async () => {
  setEnv();
  freshModules(["_auth.js", "_admin.js", "admin-users.js"]);
  const deleted = [];
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    const method = options.method || "GET";
    if (value.endsWith("/auth/v1/user")) return Response.json({ id: "admin-1", email: "admin@example.com" });
    if (value.includes("/rest/v1/profiles?id=eq.admin-1")) return Response.json([{ id: "admin-1", role: "admin", status: "active", client_id: null }]);
    if (value.includes("/rest/v1/user_packages?user_id=eq.admin-1")) return Response.json([]);
    // Se o curinga chegasse ao PostgREST como ilike, este mock devolveria o proprio admin.
    if (value.includes("/rest/v1/profiles?email=ilike.")) return Response.json([{ id: "admin-1", email: "admin@example.com", role: "admin" }]);
    if (value.includes("/rest/v1/profiles?email=eq.")) return Response.json([]);
    if (value.includes("/auth/v1/admin/users?page=")) return Response.json({ users: [] });
    if (method === "DELETE") { deleted.push(value); return new Response(null, { status: 204 }); }
    if (value.endsWith("/rest/v1/audit_logs")) return new Response(null, { status: 201 });
    throw new Error(`Unexpected fetch: ${method} ${value}`);
  };
  const handler = require(path.join(ROOT, "api", "admin-users.js"));
  const res = fakeRes();
  await handler(fakeReq("DELETE", "/api/admin-users?email=*", []), res);
  assert.equal(res.statusCode, 403);
  assert.match(JSON.parse(res.body).error, /nao encontrado/i);
  assert.deepEqual(deleted, [], "nada pode ser excluido por um curinga");
  assert.doesNotMatch(read("api", "admin-users.js"), /email=ilike\./);
});

// --- Frontend / supply chain / headers ------------------------------------------------------

test("third-party scripts and styles are version-pinned with SRI", () => {
  const html = read("public", "index.html");
  const tags = html.match(/<(script|link)[^>]+(src|href)="https:\/\/[^"]+"[^>]*>/g) || [];
  const external = tags.filter((tag) => !/fonts\.googleapis|fonts\.gstatic/.test(tag));
  assert.ok(external.length >= 6);
  for (const tag of external) {
    assert.match(tag, /integrity="sha384-[A-Za-z0-9+/=]+"/, tag);
    assert.match(tag, /crossorigin="anonymous"/, tag);
    assert.match(tag, /@\d+\.\d+\.\d+\//, `versao exata: ${tag}`);
  }
});

test("map tooltips escape scraped text", () => {
  const html = read("public", "index.html");
  assert.doesNotMatch(html, /\.bindTooltip\(item\./);
});

test("vercel.json sends security headers and no-store on the API", () => {
  const config = JSON.parse(read("vercel.json"));
  const all = config.headers.find((entry) => entry.source === "/(.*)").headers;
  const keys = Object.fromEntries(all.map(({ key, value }) => [key, value]));
  assert.equal(keys["X-Content-Type-Options"], "nosniff");
  assert.equal(keys["X-Frame-Options"], "DENY");
  assert.match(keys["Content-Security-Policy"], /frame-ancestors 'none'/);
  const api = config.headers.find((entry) => entry.source === "/api/(.*)").headers;
  assert.deepEqual(api, [{ key: "Cache-Control", value: "no-store" }]);
});

test("scraper workflow cannot run two collections at once", () => {
  const workflow = read(".github", "workflows", "scraper.yml");
  assert.match(workflow, /concurrency:\s*\n\s*group: road-news-scraper/);
  assert.doesNotMatch(workflow, /actions\/checkout@v4|actions\/setup-python@v5/);
});

test("email invite and email password recovery are gone", () => {
  const html = read("public", "index.html");
  const users = read("api", "admin-users.js");
  assert.doesNotMatch(html, /resetPasswordForEmail|exchangeCodeForSession|auth\.updateUser\(/);
  assert.doesNotMatch(users, /\/auth\/v1\/invite|invite_user/);
  const sources = JSON.parse(read("vercel.json")).rewrites.map((rule) => rule.source);
  assert.ok(!sources.includes("/accept-invite"));
  assert.ok(!fs.existsSync(path.join(ROOT, "scripts", "supabase_invite_email_template.html")));
});
