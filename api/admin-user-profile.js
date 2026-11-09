const { SERVICE_ROLE_KEY, SUPABASE_URL, json, requireManager, supabaseFetch } = require("./_auth");
const {
  adminErrorMessage,
  assertPasswordPolicy,
  audit,
  fetchJson,
  isValidCpf,
  normalizeCpf,
  normalizePhone,
  readJson,
} = require("./_admin");

function userIdFromRequest(req, body = {}) {
  const url = new URL(req.url, "http://road-news.local");
  return String(body.user_id || url.searchParams.get("user_id") || "").trim();
}

function normalizedRole(account, currentRole, requestedRole) {
  const role = ["admin", "manager"].includes(requestedRole) ? requestedRole : "client";
  if (!account.isAdmin && (currentRole === "admin" || role === "admin")) {
    throw new Error("Voce nao tem permissao para alterar usuarios Admin.");
  }
  return role;
}

async function targetProfile(account, userId) {
  const rows = await fetchJson(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,full_name,cpf,phone,client_id,company_name,role,status&limit=1`,
  );
  const profile = rows?.[0] || null;
  if (!profile) throw new Error("Usuario nao encontrado.");
  if (!account.isAdmin && profile.role === "admin") {
    throw new Error("Voce nao tem permissao para acessar usuarios Admin.");
  }
  return profile;
}

// Admin/gestor define uma nova senha temporaria (usuario esqueceu a senha): o usuario volta a
// ser obrigado a troca-la no proximo login.
async function resetTemporaryPassword(userId, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password, app_metadata: { must_change_password: true } }),
  });
  if (!response.ok) throw new Error(await response.text());
}

async function activeClient(clientId) {
  const rows = await fetchJson(
    `/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}&status=eq.active&select=id,company_name&limit=1`,
  );
  return rows?.[0] || null;
}

module.exports = async function handler(req, res) {
  if (!["GET", "PATCH"].includes(req.method)) {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const account = await requireManager(req);
    const body = req.method === "PATCH" ? await readJson(req) : {};
    const userId = userIdFromRequest(req, body);
    if (!userId) throw new Error("Usuario nao informado.");
    const current = await targetProfile(account, userId);

    if (req.method === "GET") {
      json(res, 200, { user: current });
      return;
    }

    const fullName = String(body.full_name || "").trim();
    const cpf = normalizeCpf(body.cpf);
    const phone = normalizePhone(body.phone);
    const clientId = String(body.client_id || "").trim();
    const status = ["active", "blocked", "inactive"].includes(body.status) ? body.status : current.status;
    const role = normalizedRole(account, current.role, String(body.role || current.role).trim());

    if (userId === account.user.id && status !== "active") {
      throw new Error("Voce nao pode bloquear ou inativar seu proprio usuario.");
    }
    if (userId === account.user.id && role !== current.role) {
      throw new Error("Voce nao pode alterar seu proprio perfil de acesso.");
    }

    const temporaryPassword = String(body.temporary_password || "");
    if (temporaryPassword) {
      if (userId === account.user.id) throw new Error("Para trocar a sua propria senha use a opcao Trocar senha.");
      assertPasswordPolicy(temporaryPassword);
    }

    if (!fullName) throw new Error("Informe o nome completo.");
    if (!isValidCpf(cpf)) throw new Error("Informe um CPF valido.");
    if (!clientId) throw new Error("Selecione o cliente ou empresa.");
    const client = await activeClient(clientId);
    if (!client) throw new Error("Cliente nao encontrado ou inativo.");

    const payload = {
      full_name: fullName,
      cpf,
      phone,
      client_id: client.id,
      company_name: client.company_name,
      role,
      status,
    };
    await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });
    if (temporaryPassword) await resetTemporaryPassword(userId, temporaryPassword);
    await audit(account, "update_user", "profile", userId, {
      role,
      status,
      client_id: client.id,
      temporary_password_reset: Boolean(temporaryPassword),
    });
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
