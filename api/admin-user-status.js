const { assertWritableEnvironment, getProfileForManagement, json, requireManager, supabaseFetch } = require("./_auth");
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
    const status = String(body.status || "").trim();
    if (!userId) throw new Error("Usuario nao informado.");
    if (!["active", "blocked", "inactive"].includes(status)) throw new Error("Status invalido.");

    const profile = await getProfileForManagement(account, userId);

    await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status }),
    });
    await audit(account, "update_user_status", "profile", userId, { status, client_id: profile.client_id });
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
