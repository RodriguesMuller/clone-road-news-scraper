const { assertWritableEnvironment, getProfileForManagement, json, requireManager, supabaseFetch } = require("./_auth");
const { adminErrorMessage, audit, fetchJson, readJson } = require("./_admin");

async function fetchActivePackage(packageId) {
  try {
    const packages = await fetchJson(`/rest/v1/packages?id=eq.${encodeURIComponent(packageId)}&is_active=eq.true&select=id,max_users&limit=1`);
    return packages?.[0] || null;
  } catch (error) {
    if (!/max_users|column|schema|PGRST/i.test(error.message || "")) throw error;
    const packages = await fetchJson(`/rest/v1/packages?id=eq.${encodeURIComponent(packageId)}&is_active=eq.true&select=id&limit=1`);
    return packages?.[0] || null;
  }
}

async function activePackageUsers(packageId, clientId) {
  const assignments = await fetchJson(
    `/rest/v1/user_packages?package_id=eq.${encodeURIComponent(packageId)}&is_active=eq.true&select=user_id`,
  );
  const userIds = (assignments || []).map((item) => item.user_id).filter(Boolean);
  if (!userIds.length) return 0;
  const profiles = await fetchJson(
    `/rest/v1/profiles?client_id=eq.${encodeURIComponent(clientId)}&id=in.(${userIds.map(encodeURIComponent).join(",")})&select=id`,
  );
  return (profiles || []).length;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const account = await requireManager(req);
    assertWritableEnvironment();
    const body = await readJson(req);
    const userId = String(body.user_id || "").trim();
    const packageId = String(body.package_id || "").trim();
    if (!userId) throw new Error("Usuario nao informado.");

    const profile = await getProfileForManagement(account, userId);

    await supabaseFetch(`/rest/v1/user_packages?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: false, ends_at: new Date().toISOString() }),
    });

    if (packageId) {
      const pkg = await fetchActivePackage(packageId);
      if (!pkg) throw new Error("Pacote inicial nao encontrado ou inativo.");
      const maxUsers = Number(pkg.max_users || 0);
      if (maxUsers > 0 && await activePackageUsers(packageId, profile.client_id) >= maxUsers) {
        throw new Error("Limite de usuarios deste pacote atingido.");
      }
      await supabaseFetch("/rest/v1/user_packages", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: userId, package_id: packageId, is_active: true }),
      });
    }

    await audit(account, "assign_package", "profile", userId, {
      package_id: packageId || null,
      client_id: profile.client_id,
    });
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
