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
    const status = String(body.status || "").trim();
    if (!userId) throw new Error("Usuario nao informado.");
    if (!["active", "blocked", "inactive"].includes(status)) throw new Error("Status invalido.");

    const profile = await fetchJson(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role,client_id&limit=1`);
    if (!profile?.length) throw new Error("Usuario nao encontrado.");
    if (userId === account.user.id && status !== "active") {
      throw new Error("Voce nao pode bloquear ou inativar seu proprio usuario.");
    }
    if (!account.isAdmin && profile[0].role === "admin") {
      throw new Error("Voce nao tem permissao para alterar usuarios Admin.");
    }

    await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status }),
    });
    await audit(account, "update_user_status", "profile", userId, {
      status,
      client_id: profile[0].client_id || null,
    });
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
