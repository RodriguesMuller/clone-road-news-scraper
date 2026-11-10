// Simulador de Supabase (PostgREST + Auth) com tabelas em memória, para testar pacotes
// e limites de ponta a ponta: o consumo registrado por uma chamada é visto pela próxima.
// Entende só os filtros que a API usa: eq, in, gte, gt, lte, lt, is.null e or=(...).

function parseValue(raw) {
  const value = decodeURIComponent(raw);
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  return value;
}

function matchCondition(row, column, expr) {
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  const cell = row[column];
  if (op === "eq") return String(cell) === String(parseValue(raw));
  if (op === "neq") return String(cell) !== String(parseValue(raw));
  if (op === "is") return raw === "null" ? cell === null || cell === undefined : String(cell) === raw;
  if (op === "in") {
    const list = decodeURIComponent(raw).replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
    return list.includes(String(cell));
  }
  const a = Date.parse(cell);
  const b = Date.parse(decodeURIComponent(raw));
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  if (op === "gte") return a >= b;
  if (op === "gt") return a > b;
  if (op === "lte") return a <= b;
  if (op === "lt") return a < b;
  throw new Error(`Operador não suportado no simulador: ${op}`);
}

function matchOr(row, expr) {
  // or=(ends_at.is.null,ends_at.gt.2026-...)
  const inner = decodeURIComponent(expr).replace(/^\(|\)$/g, "");
  return inner.split(/,(?![^(]*\))/).some((part) => {
    const first = part.indexOf(".");
    return matchCondition(row, part.slice(0, first), part.slice(first + 1));
  });
}

function filterRows(rows, params) {
  return rows.filter((row) => {
    for (const [key, value] of params) {
      if (["select", "order", "limit", "offset"].includes(key)) continue;
      if (key === "or") { if (!matchOr(row, value)) return false; continue; }
      if (!matchCondition(row, key, value)) return false;
    }
    return true;
  });
}

function rawParams(url) {
  const query = url.split("?")[1] || "";
  return query.split("&").filter(Boolean).map((pair) => {
    const eq = pair.indexOf("=");
    return [decodeURIComponent(pair.slice(0, eq)), pair.slice(eq + 1)];
  });
}

function createFakeSupabase(seed = {}) {
  const db = {
    users: seed.users || {},              // token -> { id, email, app_metadata }
    profiles: seed.profiles || [],
    clients: seed.clients || [],
    packages: seed.packages || [],
    user_packages: seed.user_packages || [],
    usage_events: seed.usage_events || [],
    audit_logs: [],
    news: seed.news || [],
    platform_events: [],
  };
  let seq = 0;
  const nextId = (prefix) => `${prefix}-${String(++seq).padStart(6, "0")}`;

  async function fetchImpl(input, options = {}) {
    const url = String(input);
    const method = (options.method || "GET").toUpperCase();
    if (url.endsWith("/auth/v1/user")) {
      const token = String(options.headers?.Authorization || "").replace(/^Bearer\s+/i, "");
      const user = db.users[token];
      return user ? Response.json(user) : new Response("{}", { status: 401 });
    }
    const match = url.match(/\/rest\/v1\/([a-z_]+)/);
    if (!match) throw new Error(`URL não simulada: ${url}`);
    const table = match[1];
    if (!db[table]) throw new Error(`Tabela não simulada: ${table}`);
    const params = rawParams(url);
    let rows = filterRows(db[table], params);

    if (method === "POST") {
      const body = JSON.parse(options.body || "{}");
      const list = Array.isArray(body) ? body : [body];
      const created = list.map((item) => ({ id: nextId(table), created_at: new Date().toISOString(), ...item }));
      db[table].push(...created);
      const wantsRows = /return=representation/.test(String(options.headers?.Prefer || ""));
      return wantsRows ? Response.json(created, { status: 201 }) : new Response(null, { status: 201 });
    }
    if (method === "DELETE") {
      const ids = new Set(rows.map((row) => row.id));
      db[table] = db[table].filter((row) => !ids.has(row.id));
      return new Response(null, { status: 204 });
    }
    if (method === "PATCH") {
      const body = JSON.parse(options.body || "{}");
      rows.forEach((row) => Object.assign(row, body));
      return new Response(null, { status: 204 });
    }
    if (method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
    }
    // GET
    const select = (params.find(([k]) => k === "select") || [])[1] || "*";
    if (table === "user_packages" && /packages\(\*\)/.test(decodeURIComponent(select))) {
      rows = rows.map((row) => ({ ...row, packages: db.packages.find((p) => p.id === row.package_id) || null }));
    }
    const order = (params.find(([k]) => k === "order") || [])[1];
    if (order) {
      const keys = decodeURIComponent(order).split(",").map((part) => part.split("."));
      rows = [...rows].sort((a, b) => {
        for (const [column, dir] of keys) {
          if (String(a[column]) === String(b[column])) continue;
          return (String(a[column]) < String(b[column]) ? -1 : 1) * (dir === "desc" ? -1 : 1);
        }
        return 0;
      });
    }
    const offset = Number((params.find(([k]) => k === "offset") || [])[1] || 0);
    // Como o Supabase real: no máximo 1000 linhas por resposta, mesmo pedindo mais.
    const limit = Math.min(Number((params.find(([k]) => k === "limit") || [])[1] || 1000), 1000);
    rows = rows.slice(offset, offset + limit);
    return Response.json(rows);
  }

  return { db, fetch: fetchImpl };
}

function loadApi(root, fake) {
  process.env.SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  delete process.env.AUTH_ENABLED;
  process.env.OPENAI_API_KEY = "";
  global.fetch = fake.fetch;
  const path = require("node:path");
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(path.join(root, "api"))) delete require.cache[key];
  }
  return (name) => require(path.join(root, "api", name));
}

// Chama um handler serverless como a Vercel chamaria.
async function call(handler, { method = "GET", token, body } = {}) {
  const { Readable } = require("node:stream");
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.headers = token ? { authorization: `Bearer ${token}` } : {};
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(v) { this.body = v; },
  };
  await handler(req, res);
  let data = null;
  try { data = JSON.parse(res.body || "null"); } catch { data = res.body; }
  return { status: res.statusCode, data };
}

module.exports = { createFakeSupabase, loadApi, call };
