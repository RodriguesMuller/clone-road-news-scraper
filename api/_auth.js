const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || "").trim();
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

function assertSupabaseConfigured({ serviceRole = false } = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase nao configurado neste ambiente.");
  }
  if (serviceRole && !SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nao configurada no servidor.");
  }
}

function authSettingValue() {
  return process.env.AUTH_ENABLED ?? process.env.NEXT_PUBLIC_AUTH_ENABLED ?? "";
}

function isAuthEnabled() {
  const value = String(authSettingValue()).trim();
  if (!value) return true;
  return !/^(false|0|no)$/i.test(value);
}

function appEnvironment() {
  return String(process.env.APP_ENV || process.env.VERCEL_ENV || "production").trim().toLowerCase();
}

function isReadOnlyEnvironment() {
  const explicit = String(process.env.STAGING_READ_ONLY || "").trim();
  if (explicit) return /^(true|1|yes)$/i.test(explicit);
  return appEnvironment() === "staging";
}

function assertWritableEnvironment() {
  if (isReadOnlyEnvironment()) {
    throw new Error("Ambiente de testes em modo somente leitura. Esta alteração não foi aplicada ao banco de produção.");
  }
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
  assertSupabaseConfigured({ serviceRole: useServiceRole });
  const key = useServiceRole ? SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
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
  assertSupabaseConfigured();
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

async function listAuthUsers() {
  assertSupabaseConfigured({ serviceRole: true });
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Supabase Auth HTTP ${response.status}`);
  }
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.users) ? payload.users : [];
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
  if (rows[0]) return rows[0];

  const profile = await getProfile(userId);
  if (!profile?.client_id) return null;
  const clientResponse = await supabaseFetch(
    `/rest/v1/clients?id=eq.${encodeURIComponent(profile.client_id)}&status=eq.active&select=package_id&limit=1`,
  );
  const client = (await clientResponse.json())?.[0];
  if (!client?.package_id) return null;
  const packageResponse = await supabaseFetch(
    `/rest/v1/packages?id=eq.${encodeURIComponent(client.package_id)}&is_active=eq.true&select=*&limit=1`,
  );
  const pkg = (await packageResponse.json())?.[0];
  return pkg ? {
    user_id: userId,
    package_id: pkg.id,
    is_active: true,
    source: "client",
    packages: pkg,
  } : null;
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)).toISOString();
}

function isManagerRole(role) {
  return role === "admin" || role === "manager";
}

function accountClientId(account) {
  return String(account?.profile?.client_id || "").trim();
}

function assertCanAccessClient(account, clientId) {
  const targetClientId = String(clientId || "").trim();
  if (!targetClientId) throw new Error("Empresa nao informada.");
  if (!account?.isAdmin && accountClientId(account) !== targetClientId) {
    throw new Error("Voce nao tem permissao para acessar dados de outra empresa.");
  }
  return targetClientId;
}

function assertCanManageProfile(account, profile) {
  if (!profile?.id) throw new Error("Usuario nao encontrado.");
  if (account?.isAdmin) return profile;
  assertCanAccessClient(account, profile.client_id);
  if (!account?.isManager || profile.role !== "client") {
    throw new Error("Gestor so pode administrar usuarios Cliente da propria empresa.");
  }
  return profile;
}

async function getProfileForManagement(account, userId) {
  const profile = await getProfile(userId);
  return assertCanManageProfile(account, profile);
}

async function getClientForAccess(account, clientId) {
  const targetClientId = assertCanAccessClient(account, clientId);
  const response = await supabaseFetch(
    `/rest/v1/clients?id=eq.${encodeURIComponent(targetClientId)}&select=id,slug,company_name,status,package_id&limit=1`,
  );
  const client = (await response.json())?.[0];
  if (!client) throw new Error("Empresa nao encontrada.");
  if (client.status !== "active") throw new Error("Empresa inativa ou bloqueada.");
  return client;
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
  if (!profile.client_id) throw new Error("Perfil sem empresa vinculada. Contate o administrador.");
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
  if (isReadOnlyEnvironment() || !account?.authEnabled || !account.user?.id) return;
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
  appEnvironment,
  isReadOnlyEnvironment,
  assertSupabaseConfigured,
  assertWritableEnvironment,
  json,
  supabaseFetch,
  listAuthUsers,
  monthlyUsage,
  isManagerRole,
  accountClientId,
  assertCanAccessClient,
  assertCanManageProfile,
  getProfileForManagement,
  getClientForAccess,
  requireAccount,
  requireAdmin,
  requireManager,
  assertCanUse,
  recordUsage,
};
