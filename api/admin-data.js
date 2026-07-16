const { accountClientId, isReadOnlyEnvironment, json, listAuthUsers, requireManager } = require("./_auth");
const { adminErrorMessage, audit, fetchJson } = require("./_admin");

const TEST_PACKAGE = {
  name: "Teste",
  description: "Pacote temporario para clientes avaliarem a plataforma Road News.",
  monthly_news_limit: 100,
  monthly_ai_summary_limit: 10,
  monthly_pdf_limit: 5,
  max_users: 2,
  can_access_map: true,
  can_generate_image: true,
  can_generate_weekly_summary: true,
  is_active: true,
};

async function ensureTestPackage(account) {
  if (isReadOnlyEnvironment() || !account.isAdmin) return;
  const existing = await fetchJson("/rest/v1/packages?name=eq.Teste&select=id&limit=1");
  if (Array.isArray(existing) && existing.length) return;
  let created = null;
  try {
    created = await fetchJson("/rest/v1/packages?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(TEST_PACKAGE),
    });
  } catch (error) {
    if (!/max_users|column|schema|PGRST/i.test(error.message || "")) throw error;
    const { max_users, ...legacyPackage } = TEST_PACKAGE;
    created = await fetchJson("/rest/v1/packages?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(legacyPackage),
    });
  }
  await audit(account, "seed_test_package", "package", created?.[0]?.id || "Teste", {
    name: TEST_PACKAGE.name,
    trial_days_suggested: 15,
  });
}

function normalizeRole(value) {
  return ["admin", "manager"].includes(value) ? value : "client";
}

function authState(user) {
  if (!user) return { auth_missing: true, invite_status: "auth_missing" };
  const invitationSentAt = user.invited_at || user.confirmation_sent_at || null;
  return {
    auth_missing: false,
    invite_status: user.last_sign_in_at ? "accepted" : (invitationSentAt ? "pending" : "not_accepted"),
    invitation_sent_at: invitationSentAt,
    last_sign_in_at: user.last_sign_in_at || null,
  };
}

function mergeAuthUsers(profiles, authUsers, includeOrphans) {
  const byId = new Map(authUsers.map((user) => [user.id, user]));
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const enriched = profiles.map((profile) => ({
    ...profile,
    ...authState(byId.get(profile.id)),
  }));
  if (!includeOrphans) return enriched;

  const orphans = authUsers
    .filter((user) => user?.id && !profileIds.has(user.id))
    .map((user) => ({
      id: user.id,
      email: user.email || "",
      full_name: user.user_metadata?.full_name || "Cadastro incompleto",
      company_name: user.user_metadata?.company_name || "",
      role: normalizeRole(user.user_metadata?.role || user.app_metadata?.role),
      status: "orphaned",
      created_at: user.created_at || null,
      updated_at: user.updated_at || user.created_at || null,
      orphan_auth: true,
      ...authState(user),
    }));
  return [...enriched, ...orphans].sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const account = await requireManager(req);
    await ensureTestPackage(account);
    const monthStart = encodeURIComponent(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
    const clientId = accountClientId(account);
    const clientFilter = account.isAdmin ? "" : `&client_id=eq.${encodeURIComponent(clientId)}`;
    const [profiles, packages, clients, authUsers] = await Promise.all([
      fetchJson(`/rest/v1/profiles?select=*&order=created_at.desc${clientFilter}`),
      fetchJson("/rest/v1/packages?select=*&order=name.asc"),
      fetchJson(`/rest/v1/clients?select=*&order=company_name.asc${account.isAdmin ? "" : `&id=eq.${encodeURIComponent(clientId)}`}`),
      listAuthUsers(),
    ]);
    const profileIds = (profiles || []).map((profile) => profile.id).filter(Boolean);
    const userFilter = account.isAdmin || !profileIds.length
      ? ""
      : `&user_id=in.(${profileIds.map(encodeURIComponent).join(",")})`;
    const tenantFilter = account.isAdmin ? "" : `&client_id=eq.${encodeURIComponent(clientId)}`;
    const [userPackages, usage, logs] = await Promise.all([
      profileIds.length || account.isAdmin
        ? fetchJson(`/rest/v1/user_packages?select=*&order=created_at.desc${userFilter}`)
        : Promise.resolve([]),
      fetchJson(`/rest/v1/usage_events?select=*&created_at=gte.${monthStart}&order=created_at.desc&limit=1000${tenantFilter}`),
      fetchJson(`/rest/v1/audit_logs?select=*&order=created_at.desc&limit=120${tenantFilter}`),
    ]);
    const allowedAuthUsers = account.isAdmin
      ? authUsers
      : authUsers.filter((user) => profileIds.includes(user.id));
    const users = mergeAuthUsers(profiles || [], allowedAuthUsers, account.isAdmin);
    json(res, 200, {
      users: users || [],
      clients: clients || [],
      packages: packages || [],
      userPackages: userPackages || [],
      usage: usage || [],
      logs: logs || [],
    });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
