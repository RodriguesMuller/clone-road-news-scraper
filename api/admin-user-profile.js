const {
  assertWritableEnvironment,
  getClientForAccess,
  getProfileForManagement,
  json,
  requireManager,
  supabaseFetch,
} = require("./_auth");
const { adminErrorMessage, audit, readJson } = require("./_admin");

module.exports = async function handler(req, res) {
  if (req.method !== "PATCH") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const account = await requireManager(req);
    assertWritableEnvironment();
    const body = await readJson(req);
    const userId = String(body.user_id || "").trim();
    if (!userId) throw new Error("Usuario nao informado.");

    const current = await getProfileForManagement(account, userId);

    const requestedRole = String(body.role || current.role || "client").trim();
    const role = ["admin", "manager"].includes(requestedRole) ? requestedRole : "client";
    if (!account.isAdmin && role !== "client") {
      throw new Error("Gestor so pode manter usuarios no perfil Cliente.");
    }

    const status = ["active", "blocked", "inactive"].includes(body.status) ? body.status : "active";
    const client = await getClientForAccess(
      account,
      account.isAdmin ? (body.client_id || current.client_id) : current.client_id,
    );
    const payload = {
      full_name: String(body.full_name || "").trim(),
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
    await audit(account, "update_user", "profile", userId, payload);
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
