// URL e publishable key sao identificadores publicos usados tambem pelo navegador.
const SUPABASE_URL = String(process.env.SUPABASE_URL || "https://vdyilgbqxnrwqgoairat.supabase.co").trim().replace(/\/+$/, "");
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || "sb_publishable_de-5vYgBsDImP6s8Y-Sc9Q_xqhcZsnn").trim();
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const FEATURE_RULES = {
  news_query: {
    events: ["news_query", "news_view"],
    limit: "monthly_news_limit",
    blockedEvent: "blocked_news_query_limit",
    disabledMessage: "Limite mensal de consultas atingido. Contate o gestor da plataforma para alterar seu pacote.",
    limitMessage: "Limite mensal de consultas atingido. Contate o gestor da plataforma para alterar seu pacote.",
  },
  ai_summary_individual: {
    events: ["ai_summary_individual", "ai_summary", "image_generation"],
    limitEvents: ["ai_summary_individual", "ai_summary_weekly", "ai_summary", "image_generation", "weekly_summary"],
    flag: "can_generate_individual_summary",
    legacyFlag: "can_generate_image",
    limit: "monthly_ai_summary_limit",
    blockedEvent: "blocked_ai_limit",
    disabledEvent: "blocked_summary_disabled",
    disabledMessage: "Resumo individual nao esta disponivel no seu pacote.",
    limitMessage: "Limite mensal de IA atingido. Seu pacote nao permite novas geracoes neste mes.",
  },
  ai_summary_weekly: {
    events: ["ai_summary_weekly", "weekly_summary"],
    limitEvents: ["ai_summary_individual", "ai_summary_weekly", "ai_summary", "image_generation", "weekly_summary"],
    flag: "can_generate_weekly_summary",
    limit: "monthly_ai_summary_limit",
    blockedEvent: "blocked_ai_limit",
    disabledEvent: "blocked_summary_disabled",
    disabledMessage: "Resumo semanal nao esta disponivel no seu pacote.",
    limitMessage: "Limite mensal de IA atingido. Seu pacote nao permite novas geracoes neste mes.",
  },
  pdf_generated: {
    events: ["pdf_generated", "pdf_generation"],
    limit: "monthly_pdf_limit",
    blockedEvent: "blocked_pdf_limit",
    disabledMessage: "Limite mensal de PDFs atingido.",
    limitMessage: "Limite mensal de PDFs atingido.",
  },
  map_access: {
    events: ["map_access"],
    flag: "can_access_map",
    blockedEvent: "blocked_map_disabled",
    disabledMessage: "Mapa rodoviario nao esta disponivel no seu pacote.",
  },
  route_analysis: {
    events: ["route_analysis"],
    limit: "monthly_route_limit",
    blockedEvent: "blocked_route_analysis_limit",
    disabledMessage: "Minha Rota nao esta disponivel no seu pacote.",
    limitMessage: "Limite mensal de consultas do Minha Rota atingido. Contate o gestor da plataforma para alterar seu pacote.",
  },
};

const FEATURE_ALIASES = {
  news_view: "news_query",
  image_generation: "ai_summary_individual",
  ai_summary: "ai_summary_individual",
  weekly_summary: "ai_summary_weekly",
  pdf_generation: "pdf_generated",
  map: "map_access",
  route: "route_analysis",
};

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

async function getProfile(userId) {
  const response = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`);
  const rows = await response.json();
  return rows[0] || null;
}

async function getActivePackage(userId) {
  const now = encodeURIComponent(new Date().toISOString());
  // Vigente = ativo, já começou (starts_at <= agora) e ainda não terminou.
  const path = `/rest/v1/user_packages?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&starts_at=lte.${now}&or=(ends_at.is.null,ends_at.gt.${now})&select=*,packages(*)&order=created_at.desc&limit=1`;
  const response = await supabaseFetch(path);
  const rows = await response.json();
  const active = rows[0] || null;
  return active?.packages?.is_active === false ? null : active;
}

async function getClient(clientId) {
  if (!clientId) return null;
  const response = await supabaseFetch(`/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}&select=id,company_name,status&limit=1`);
  const rows = await response.json();
  return rows[0] || null;
}

function monthStartIso() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return new Date(`${year}-${month}-01T00:00:00-03:00`).toISOString();
}

function isManagerRole(role) {
  return role === "admin" || role === "manager";
}

// Escopo do consumo: o limite do pacote vale para o CLIENTE (empresa) inteiro — todos os
// usuários dele somam no mesmo saldo. Usuário sem cliente (ex.: legado) conta sozinho.
function usageScope(accountOrUserId) {
  if (accountOrUserId && typeof accountOrUserId === "object") {
    return { userId: accountOrUserId.user?.id || null, clientId: accountOrUserId.profile?.client_id || null };
  }
  return { userId: accountOrUserId || null, clientId: null };
}

// Consulta os eventos do mês no escopo do cliente (ou do usuário, se não houver cliente ou se o
// banco ainda não tiver usage_events.client_id). `run` recebe o filtro de escopo pronto.
async function inUsageScope(accountOrUserId, eventTypes, run) {
  const { userId, clientId } = usageScope(accountOrUserId);
  const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
  const since = encodeURIComponent(monthStartIso());
  const encodedTypes = types.map((type) => `"${String(type).replace(/"/g, "")}"`).join(",");
  const base = (scopeFilter) => `/rest/v1/usage_events?${scopeFilter}&event_type=in.(${encodedTypes})&created_at=gte.${since}`;
  if (clientId) {
    try {
      return await run(base(`client_id=eq.${encodeURIComponent(clientId)}`));
    } catch (error) {
      if (!/client_id|column|schema|PGRST/i.test(error.message || "")) throw error;
    }
  }
  return run(base(`user_id=eq.${encodeURIComponent(userId)}`));
}

async function monthlyUsage(accountOrUserId, eventTypes) {
  return inUsageScope(accountOrUserId, eventTypes, async (path) => {
    const response = await supabaseFetch(`${path}&select=id`, { method: "HEAD", headers: { Prefer: "count=exact" } });
    const range = response.headers.get("content-range") || "0/0";
    return Number(range.split("/")[1] || 0);
  });
}

// Ids dos primeiros `n` usos do mês (ordem de gravação): quem está aqui cabe no limite.
async function firstUsageIds(accountOrUserId, eventTypes, n) {
  return inUsageScope(accountOrUserId, eventTypes, async (path) => {
    const response = await supabaseFetch(`${path}&select=id&order=created_at.asc,id.asc&limit=${Math.max(1, n)}`);
    const rows = await response.json();
    return new Set((rows || []).map((row) => String(row.id)));
  });
}

const PASSWORD_CHANGE_REQUIRED = "Troque sua senha temporaria para continuar.";

// Marcado pelo servidor (app_metadata, que o usuario nao consegue editar) quando o admin cria o
// acesso ou redefine a senha. Enquanto estiver true, so /api/my-access (GET acesso, POST troca de senha) responde.
function mustChangePassword(user) {
  return user?.app_metadata?.must_change_password === true;
}

async function requireAccount(req, { allowPasswordChange = false } = {}) {
  if (!isAuthEnabled()) {
    return {
      authEnabled: false,
      user: null,
      profile: { role: "demo", status: "active" },
      activePackage: null,
      isAdmin: false,
      isManager: false,
      isPrivileged: false,
      passwordChangeRequired: false,
    };
  }
  const { user, token } = await getAuthUser(req);
  const profile = await getProfile(user.id);
  if (!profile) throw new Error("Perfil nao encontrado. Contate o administrador.");
  if (profile.status !== "active") throw new Error("Seu usuario esta inativo. Contate o administrador.");
  const client = await getClient(profile.client_id);
  if (profile.client_id && (!client || client.status !== "active")) {
    throw new Error("Seu acesso esta inativo. Contate o administrador.");
  }
  const isAdmin = profile.role === "admin";
  const isManager = profile.role === "manager";
  const isPrivileged = isManagerRole(profile.role);
  const passwordChangeRequired = mustChangePassword(user);
  if (passwordChangeRequired && !allowPasswordChange) throw new Error(PASSWORD_CHANGE_REQUIRED);
  const activePackage = await getActivePackage(user.id);
  return { authEnabled: true, user, token, profile, client, activePackage, isAdmin, isManager, isPrivileged, passwordChangeRequired };
}

function packageFor(account) {
  return account.activePackage?.packages || null;
}

function canonicalFeature(feature) {
  return FEATURE_ALIASES[feature] || feature;
}

function featureRule(feature) {
  return FEATURE_RULES[canonicalFeature(feature)] || null;
}

function featureFlagEnabled(pkg, rule) {
  if (!rule?.flag) return true;
  if (typeof pkg?.[rule.flag] === "boolean") return pkg[rule.flag];
  return rule.legacyFlag ? Boolean(pkg?.[rule.legacyFlag]) : false;
}

async function featureUsage(accountOrUserId, feature) {
  const rule = featureRule(feature);
  if (!rule) return 0;
  return monthlyUsage(accountOrUserId, rule.limitEvents || rule.events);
}

// options.reserve: tipo de evento a registrar JÁ na autorização. O uso é gravado primeiro e o
// saldo é recontado; se a gravação passou do limite (requisições simultâneas), ela é desfeita e a
// chamada é bloqueada. Assim o limite nunca é ultrapassado, mesmo com vários usuários do mesmo
// cliente ao mesmo tempo. Quem reserva e depois falha deve chamar releaseUsage(account).
async function assertCanUse(req, feature, options = {}) {
  const account = await requireAccount(req);
  if (!account.authEnabled) return account;
  const normalizedFeature = canonicalFeature(feature);
  const rule = featureRule(normalizedFeature);
  if (!rule) throw new Error("Recurso controlado invalido.");
  // Admin e Gestor possuem acesso operacional ilimitado, independente de pacote.
  if (account.isPrivileged) {
    if (options.reserve) await reserveUsage(account, normalizedFeature, options.reserve, options.metadata);
    return account;
  }
  const pkg = packageFor(account);
  if (!pkg) {
    await recordUsage(account, rule.disabledEvent || rule.blockedEvent, {
      metadata: { feature: normalizedFeature, reason: "no_package" },
    });
    throw new Error("Vincule um pacote para liberar os recursos da plataforma.");
  }
  if (!featureFlagEnabled(pkg, rule)) {
    await recordUsage(account, rule.disabledEvent || rule.blockedEvent, {
      metadata: { feature: normalizedFeature, reason: "disabled" },
    });
    throw new Error(rule.disabledMessage);
  }
  if (rule.limit) {
    const limit = Number(pkg[rule.limit] || 0);
    const used = await featureUsage(account, normalizedFeature);
    if (limit <= 0 || used >= limit) await blockForLimit(account, normalizedFeature, rule, used, limit);
  }
  if (options.reserve) await reserveUsage(account, normalizedFeature, options.reserve, options.metadata);
  return account;
}

async function blockForLimit(account, feature, rule, used, limit) {
  await recordUsage(account, rule.blockedEvent, { metadata: { feature, reason: "limit", used, limit } });
  throw new Error(rule.limitMessage);
}

// Registra o uso e confirma que ele coube no limite do cliente. Se requisições simultâneas
// passaram do saldo, fica quem gravou primeiro e as excedentes são desfeitas e bloqueadas.
// Use depois de assertCanUse(req, feature) — ou via assertCanUse(req, feature, { reserve }).
async function reserveUsage(account, feature, eventType, metadata) {
  if (!account?.authEnabled) return account;
  const normalizedFeature = canonicalFeature(feature);
  const rule = featureRule(normalizedFeature);
  account.reservation = await recordUsage(account, eventType, { metadata });
  const pkg = packageFor(account);
  if (account.isPrivileged || !rule?.limit || !pkg) return account;
  const limit = Number(pkg[rule.limit] || 0);
  const after = await featureUsage(account, normalizedFeature);
  if (after <= limit) return account;
  const keep = account.reservation?.id
    ? (await firstUsageIds(account, rule.limitEvents || rule.events, limit)).has(String(account.reservation.id))
    : false;
  if (!keep) {
    await releaseUsage(account);
    await blockForLimit(account, normalizedFeature, rule, after - 1, limit);
  }
  return account;
}

// Completa a reserva com o que só se sabe depois da ação (tokens, modelo, metadados).
async function finalizeReservation(account, data = {}) {
  const id = account?.reservation?.id;
  if (!id) return;
  const patch = {};
  if (data.tokens_input !== undefined) patch.tokens_input = data.tokens_input;
  if (data.tokens_output !== undefined) patch.tokens_output = data.tokens_output;
  if (data.model) patch.model = data.model;
  if (data.metadata) patch.metadata = data.metadata;
  if (!Object.keys(patch).length) return;
  try {
    await supabaseFetch(`/rest/v1/usage_events?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
  } catch {
    // Os tokens são informativos; o uso já está contado.
  }
}

// Desfaz a reserva feita por assertCanUse({ reserve }) quando a ação não chegou a acontecer.
async function releaseUsage(account) {
  const id = account?.reservation?.id;
  if (!id) return;
  account.reservation = null;
  try {
    await supabaseFetch(`/rest/v1/usage_events?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  } catch {
    // Melhor contar a mais do que derrubar a resposta ao usuário.
  }
}

// Grava um evento de uso e devolve { id } quando o banco informa (para poder desfazer).
async function recordUsage(account, eventType, data = {}) {
  if (!account?.authEnabled || !account.user?.id) return null;
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
  const insert = async (body) => {
    const response = await supabaseFetch("/rest/v1/usage_events?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    const rows = response.status === 201 || response.status === 200 ? await response.json().catch(() => null) : null;
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row?.id ? { id: row.id } : null;
  };
  try {
    return await insert(payload);
  } catch (error) {
    if (!/client_id|package_id|column|schema|PGRST/i.test(error.message || "")) throw error;
    const { client_id, package_id, ...legacyPayload } = payload;
    return insert(legacyPayload);
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
  PASSWORD_CHANGE_REQUIRED,
  mustChangePassword,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SERVICE_ROLE_KEY,
  authSettingValue,
  isAuthEnabled,
  assertSupabaseConfigured,
  json,
  supabaseFetch,
  monthlyUsage,
  monthStartIso,
  featureUsage,
  featureRule,
  featureFlagEnabled,
  isManagerRole,
  requireAccount,
  requireAdmin,
  requireManager,
  assertCanUse,
  recordUsage,
  reserveUsage,
  releaseUsage,
  finalizeReservation,
};
