const { json, requireManager, supabaseFetch } = require("./_auth");
const { adminErrorMessage, audit, fetchJson, packageSeatsUsed, readJson } = require("./_admin");

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const account = await requireManager(req);
    const body = await readJson(req);
    const userId = String(body.user_id || "").trim();
    const packageId = String(body.package_id || "").trim();
    if (!userId) throw new Error("Usuario nao informado.");

    const profile = await fetchJson(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role,client_id&limit=1`);
    if (!profile?.length) throw new Error("Usuario nao encontrado.");
    if (!account.isAdmin && profile[0].role === "admin") {
      throw new Error("Voce nao tem permissao para alterar usuarios Admin.");
    }

    // Valida o pacote novo ANTES de encerrar o atual: se falhar, o usuário continua com o que tinha.
    if (packageId) {
      const pkg = await fetchActivePackage(packageId);
      if (!pkg) throw new Error("Pacote inicial nao encontrado ou inativo.");
      const maxUsers = Number(pkg.max_users || 0);
      if (maxUsers > 0 && await packageSeatsUsed(packageId, profile[0].client_id, userId) >= maxUsers) {
        throw new Error("Limite de usuarios deste pacote atingido para este cliente.");
      }
    }

    await supabaseFetch(`/rest/v1/user_packages?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: false, ends_at: new Date().toISOString() }),
    });

    if (packageId) {
      await supabaseFetch("/rest/v1/user_packages", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: userId, package_id: packageId, is_active: true }),
      });
    }

    await audit(account, "assign_package", "profile", userId, {
      package_id: packageId || null,
      client_id: profile[0].client_id || null,
    });
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
