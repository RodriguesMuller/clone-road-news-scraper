const { SERVICE_ROLE_KEY, SUPABASE_URL, json, requireAdmin, supabaseFetch } = require("./_auth");
const { adminErrorMessage, audit, fetchJson, readJson } = require("./_admin");

function idFromRequest(req, body = {}) {
  const url = new URL(req.url, "http://road-news.local");
  return String(body.user_id || body.id || url.searchParams.get("user_id") || url.searchParams.get("id") || "").trim();
}

function emailFromRequest(req, body = {}) {
  const url = new URL(req.url, "http://road-news.local");
  return String(body.email || url.searchParams.get("email") || "").trim().toLowerCase();
}

async function deleteRows(path) {
  try {
    await supabaseFetch(path, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  } catch (error) {
    if (!/column|schema|PGRST|does not exist/i.test(error.message || "")) throw error;
  }
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
  if (!response.ok && response.status !== 404) {
    const detail = await response.text();
    throw new Error(detail || "Nao foi possivel excluir o usuario no Supabase Auth.");
  }
}

async function authUserByEmail(email) {
  if (!email) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  const users = Array.isArray(payload.users) ? payload.users : [];
  return users.find((user) => String(user.email || "").toLowerCase() === email) || null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "DELETE" && req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const account = await requireAdmin(req);
    const body = req.method === "POST" ? await readJson(req) : {};
    const userId = idFromRequest(req, body);
    const email = emailFromRequest(req, body);
    if (!userId && !email) throw new Error("Usuario nao informado.");
    if (userId === account.user.id || (email && email === String(account.user.email || "").toLowerCase())) {
      throw new Error("Voce nao pode excluir seu proprio usuario admin.");
    }

    const profilePath = userId
      ? `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,role,company_name&limit=1`
      : `/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}&select=id,email,role,company_name&limit=1`;
    const rows = await fetchJson(profilePath);
    const profile = rows?.[0] || null;
    const authUser = profile?.id ? { id: profile.id, email: profile.email } : await authUserByEmail(email);
    const targetId = profile?.id || authUser?.id || userId;
    if (!targetId) throw new Error("Usuario nao encontrado.");

    await audit(account, "delete_user", "profile", targetId, {
      email: profile?.email || authUser?.email || email || null,
      role: profile?.role || null,
      company_name: profile?.company_name || null,
    });

    await deleteAuthUser(targetId);
    await deleteRows(`/rest/v1/user_packages?user_id=eq.${encodeURIComponent(targetId)}`);
    await deleteRows(`/rest/v1/usage_events?user_id=eq.${encodeURIComponent(targetId)}`);
    await deleteRows(`/rest/v1/profiles?id=eq.${encodeURIComponent(targetId)}`);

    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
