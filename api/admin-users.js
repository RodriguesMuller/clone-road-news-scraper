const { SERVICE_ROLE_KEY, SUPABASE_URL, json, requireAdmin, requireManager, supabaseFetch } = require("./_auth");
const {
  adminErrorMessage,
  audit,
  fetchJson,
  isValidCpf,
  normalizeCpf,
  normalizePhone,
  readJson,
} = require("./_admin");

function requestValue(req, body, key) {
  const url = new URL(req.url, "http://road-news.local");
  return String(body?.[key] || url.searchParams.get(key) || "").trim();
}

async function listAuthUsers() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) throw new Error("Nao foi possivel consultar usuarios cadastrados.");
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload.users) ? payload.users : [];
}

async function authUserByEmail(email) {
  return (await listAuthUsers()).find((user) => String(user.email || "").toLowerCase() === email) || null;
}

async function deleteAuthUser(userId) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok && response.status !== 404) throw new Error("Nao foi possivel remover o acesso do usuario.");
}

async function deleteRows(path) {
  await supabaseFetch(path, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}

async function activePackage(packageId) {
  const rows = await fetchJson(`/rest/v1/packages?id=eq.${encodeURIComponent(packageId)}&is_active=eq.true&select=*&limit=1`);
  return rows?.[0] || null;
}

async function activePackageUsers(packageId) {
  const response = await supabaseFetch(
    `/rest/v1/user_packages?package_id=eq.${encodeURIComponent(packageId)}&is_active=eq.true&select=id`,
    { method: "HEAD", headers: { Prefer: "count=exact" } },
  );
  return Number((response.headers.get("content-range") || "0/0").split("/")[1] || 0);
}

async function activeClient(clientId) {
  const rows = await fetchJson(`/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}&status=eq.active&select=id,company_name,status&limit=1`);
  return rows?.[0] || null;
}

async function profileByEmail(email) {
  const rows = await fetchJson(`/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}&select=id,email,role,client_id&limit=1`);
  return rows?.[0] || null;
}

function normalizeRole(account, value) {
  const requested = String(value || "client").trim();
  const role = ["admin", "manager"].includes(requested) ? requested : "client";
  if (!account.isAdmin && role === "admin") throw new Error("Voce nao tem permissao para criar usuarios Admin.");
  return role;
}

async function normalizedUser(account, body, requirePassword) {
  const fullName = String(body.full_name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const cpf = normalizeCpf(body.cpf);
  const phone = normalizePhone(body.phone);
  const clientId = String(body.client_id || "").trim();
  const packageId = String(body.package_id || "").trim();
  const status = ["active", "inactive", "blocked"].includes(body.status) ? body.status : "active";
  const role = normalizeRole(account, body.role);

  if (!fullName) throw new Error("Informe o nome completo.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe um e-mail valido.");
  if (requirePassword && password.length < 8) throw new Error("A senha inicial deve ter pelo menos 8 caracteres.");
  if (!isValidCpf(cpf)) throw new Error("Informe um CPF valido.");
  if (!clientId) throw new Error("Selecione o cliente ou empresa.");
  if (!packageId) throw new Error("Selecione um pacote para o usuario.");

  const [client, pkg, profile, authUser] = await Promise.all([
    activeClient(clientId),
    activePackage(packageId),
    profileByEmail(email),
    authUserByEmail(email),
  ]);
  if (!client) throw new Error("Cliente nao encontrado ou inativo.");
  if (!pkg) throw new Error("Pacote nao encontrado ou inativo.");
  if (profile || authUser) throw new Error("Este e-mail ja esta cadastrado.");
  const maxUsers = Number(pkg.max_users || 0);
  if (maxUsers > 0 && await activePackageUsers(packageId) >= maxUsers) {
    throw new Error("Limite de usuarios deste pacote atingido.");
  }

  return { fullName, email, password, cpf, phone, client, packageId, status, role };
}

async function createAuthUser(user) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        full_name: user.fullName,
        client_id: user.client.id,
        company_name: user.client.company_name,
        role: user.role,
      },
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function inviteAuthUser(user) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: user.email,
      data: {
        full_name: user.fullName,
        client_id: user.client.id,
        company_name: user.client.company_name,
        role: user.role,
      },
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function saveUser(account, authUser, user, action) {
  const userId = authUser?.id || authUser?.user?.id;
  if (!userId) throw new Error("Nao foi possivel criar o usuario no Supabase Auth.");
  try {
    await supabaseFetch("/rest/v1/profiles", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        id: userId,
        email: user.email,
        full_name: user.fullName,
        cpf: user.cpf,
        phone: user.phone,
        client_id: user.client.id,
        company_name: user.client.company_name,
        role: user.role,
        status: user.status,
      }),
    });
    await supabaseFetch("/rest/v1/user_packages", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: userId, package_id: user.packageId, is_active: true }),
    });
    await audit(account, action, "profile", userId, {
      role: user.role,
      status: user.status,
      client_id: user.client.id,
      package_id: user.packageId,
    });
    return userId;
  } catch (error) {
    try { await deleteRows(`/rest/v1/user_packages?user_id=eq.${encodeURIComponent(userId)}`); } catch {}
    try { await deleteRows(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`); } catch {}
    try { await deleteAuthUser(userId); } catch {}
    throw error;
  }
}

async function createOrInvite(req, account) {
  const body = await readJson(req);
  const isInvite = body.action === "invite_user";
  const user = await normalizedUser(account, body, !isInvite);
  const authUser = isInvite ? await inviteAuthUser(user) : await createAuthUser(user);
  const userId = await saveUser(account, authUser, user, isInvite ? "invite_user" : "create_user");
  return { ok: true, user_id: userId, mode: isInvite ? "invite" : "manual" };
}

async function deleteUser(req) {
  const account = await requireAdmin(req);
  const body = {};
  const userId = requestValue(req, body, "user_id") || requestValue(req, body, "id");
  const email = requestValue(req, body, "email").toLowerCase();
  if (!userId && !email) throw new Error("Usuario nao informado.");
  if (userId === account.user.id || email === String(account.user.email || "").toLowerCase()) {
    throw new Error("Voce nao pode excluir seu proprio usuario Admin.");
  }

  const profilePath = userId
    ? `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,role,client_id&limit=1`
    : `/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}&select=id,email,role,client_id&limit=1`;
  const profile = (await fetchJson(profilePath))?.[0] || null;
  const authUser = profile?.id ? { id: profile.id, email: profile.email } : await authUserByEmail(email);
  const targetId = profile?.id || authUser?.id || userId;
  if (!targetId) throw new Error("Usuario nao encontrado.");

  await audit(account, "delete_user", "profile", targetId, {
    role: profile?.role || null,
    client_id: profile?.client_id || null,
  });
  await deleteAuthUser(targetId);
  await deleteRows(`/rest/v1/user_packages?user_id=eq.${encodeURIComponent(targetId)}`);
  await deleteRows(`/rest/v1/usage_events?user_id=eq.${encodeURIComponent(targetId)}`);
  await deleteRows(`/rest/v1/profiles?id=eq.${encodeURIComponent(targetId)}`);
}

module.exports = async function handler(req, res) {
  if (!["POST", "DELETE"].includes(req.method)) {
    json(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    if (req.method === "DELETE") {
      await deleteUser(req);
      json(res, 200, { ok: true });
      return;
    }
    const account = await requireManager(req);
    json(res, 200, await createOrInvite(req, account));
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
