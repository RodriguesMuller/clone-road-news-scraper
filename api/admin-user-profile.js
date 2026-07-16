const { json, requireManager, supabaseFetch } = require("./_auth");
const { adminErrorMessage, audit, fetchJson, readJson } = require("./_admin");

module.exports = async function handler(req, res) {
  if (req.method !== "PATCH") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const account = await requireManager(req);
    const body = await readJson(req);
    const userId = String(body.user_id || "").trim();
    if (!userId) throw new Error("Usuario nao informado.");

    const current = await fetchJson(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`);
    if (!current?.length) throw new Error("Usuario nao encontrado.");

    const requestedRole = String(body.role || current[0].role || "client").trim();
    const role = ["admin", "manager"].includes(requestedRole) ? requestedRole : "client";
    if (!account.isAdmin && (current[0].role !== "client" || role !== "client")) {
      throw new Error("Gestor so pode editar usuarios cliente.");
    }

    const status = ["active", "blocked", "inactive"].includes(body.status) ? body.status : "active";
    const payload = {
      full_name: String(body.full_name || "").trim(),
      company_name: String(body.company_name || "").trim(),
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
