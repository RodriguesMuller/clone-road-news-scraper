const SUPABASE_URL = process.env.SUPABASE_URL || "https://vdyilgbqxnrwqgoairat.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_de-5vYgBsDImP6s8Y-Sc9Q_xqhcZsnn";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function authSettingValue() {
  return process.env.AUTH_ENABLED ?? process.env.NEXT_PUBLIC_AUTH_ENABLED ?? "";
}

function isAuthEnabled() {
  const value = String(authSettingValue()).trim();
  if (!value) return true;
  return !/^(false|0|no)$/i.test(value);
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function supabaseFetch(path, options = {}, useServiceRole = true) {
  const key = useServiceRole ? SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  if (useServiceRole && !SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nao configurada no servidor.");
  }
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Supabase HTTP ${response.status}`);
  }
  return response;
}

async function getAuthUser(req) {
  const token = bearerToken(req);
  if (!token) throw new Error("Login necessario.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error("Sessao invalida ou expirada.");
  const user = await response.json();
  if (!user?.id) throw new Error("Sessao invalida.");
  return { user, token };
}

async function getProfile(userId) {
  const response = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`);
  const rows = await response.json();
  return rows[0] || null;
}

async function getActivePackage(userId) {
  const now = encodeURIComponent(new Date().toISOString());
  const path = `/rest/v1/user_packages?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&or=(ends_at.is.null,ends_at.gt.${now})&select=*,packages(*)&order=created_at.desc&limit=1`;
  const response = await supabaseFetch(path);
  const rows = await response.json();
  return rows[0] || null;
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)).toISOString();
}

function isManagerRole(role) {
  return role === "admin" || role === "manager";
}

async function monthlyUsage(userId, eventTypes) {
  const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
  const since = encodeURIComponent(monthStartIso());
  const encodedTypes = types.map((type) => `"${String(type).replace(/"/g, "")}"`).join(",");
  const path = `/rest/v1/usage_events?user_id=eq.${encodeURIComponent(userId)}&event_type=in.(${encodedTypes})&created_at=gte.${since}&select=id`;
  const response = await supabaseFetch(path, { method: "HEAD", headers: { Prefer: "count=exact" } });
  const range = response.headers.get("content-range") || "0/0";
  return Number(range.split("/")[1] || 0);
}

async function requireAccount(req) {
  if (!isAuthEnabled()) {
    return {
      authEnabled: false,
      user: null,
      profile: { role: "demo", status: "active" },
      activePackage: null,
      isAdmin: false,
      isManager: false,
      isPrivileged: false,
    };
  }
  const { user, token } = await getAuthUser(req);
  const profile = await getProfile(user.id);
  if (!profile) throw new Error("Perfil nao encontrado. Contate o administrador.");
  if (profile.status !== "active") throw new Error("Seu usuario esta inativo. Contate o administrador.");
  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  const isPrivileged = isManagerRole(profile.role);
  const activePackage = isPrivileged ? null : await getActivePackage(user.id);
  return { authEnabled: true, user, token, profile, activePackage, isAdmin, isManager, isPrivileged };
}

function packageFor(account) {
  return account.activePackage?.packages || null;
}

function featureAllowed(pkg, feature) {
  if (!pkg) return false;
  if (feature === "map") return Boolean(pkg.can_access_map);
  if (feature === "image_generation") return Boolean(pkg.can_generate_image);
  if (feature === "weekly_summary") return Boolean(pkg.can_generate_weekly_summary);
  if (feature === "news_view") return Number(pkg.monthly_news_limit || 0) > 0;
  if (feature === "pdf_generation") return Number(pkg.monthly_pdf_limit || 0) > 0;
  if (feature === "ai_summary") return Number(pkg.monthly_ai_summary_limit || 0) > 0;
  return false;
}

async function assertCanUse(req, feature) {
  const account = await requireAccount(req);
  if (!account.authEnabled || account.isPrivileged) return account;
  const pkg = packageFor(account);
  if (!pkg) throw new Error("Recurso nao disponivel: usuario sem pacote ativo.");
  if (!featureAllowed(pkg, feature)) throw new Error("Recurso nao disponivel no pacote atual.");

  if (feature === "ai_summary" || feature === "image_generation" || feature === "weekly_summary") {
    const used = await monthlyUsage(account.user.id, ["ai_summary", "image_generation", "weekly_summary"]);
    if (used >= Number(pkg.monthly_ai_summary_limit || 0)) throw new Error("Limite mensal de IA atingido.");
  }
  if (feature === "pdf_generation") {
    const used = await monthlyUsage(account.user.id, "pdf_generation");
    if (used >= Number(pkg.monthly_pdf_limit || 0)) throw new Error("Limite mensal de PDF atingido.");
  }
  return account;
}

async function recordUsage(account, eventType, data = {}) {
  if (!account?.authEnabled || !account.user?.id) return;
  const payload = {
    user_id: account.user.id,
    client_id: account.profile?.client_id || null,
    package_id: account.activePackage?.package_id || null,
    event_type: eventType,
    news_id: data.news_id || null,
    tokens_input: data.tokens_input ?? null,
    tokens_output: data.tokens_output ?? null,
    model: data.model || null,
    metadata: data.metadata || {},
  };
  try {
    await supabaseFetch("/rest/v1/usage_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!/client_id|package_id|column|schema|PGRST/i.test(error.message || "")) throw error;
    const { client_id, package_id, ...legacyPayload } = payload;
    await supabaseFetch("/rest/v1/usage_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(legacyPayload),
    });
  }
}

async function requireAdmin(req) {
  const account = await requireAccount(req);
  if (!account.authEnabled) throw new Error("Admin indisponivel no modo demo.");
  if (!account.isAdmin) throw new Error("Acesso negado.");
  return account;
}

async function requireManager(req) {
  const account = await requireAccount(req);
  if (!account.authEnabled) throw new Error("Gestao indisponivel no modo demo.");
  if (!account.isPrivileged) throw new Error("Acesso negado.");
  return account;
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SERVICE_ROLE_KEY,
  authSettingValue,
  isAuthEnabled,
  json,
  supabaseFetch,
  monthlyUsage,
  isManagerRole,
  requireAccount,
  requireAdmin,
  requireManager,
  assertCanUse,
  recordUsage,
};
