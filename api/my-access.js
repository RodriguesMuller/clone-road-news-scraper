const { json, requireAccount } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const account = await requireAccount(req);
    const profile = account.profile || {};
    const pkg = account.activePackage?.packages || null;
    const isAdmin = account.isAdmin;

    json(res, 200, {
      role: profile.role || "client",
      status: profile.status || "inactive",
      email: profile.email || account.user?.email || "",
      full_name: profile.full_name || "",
      company_name: profile.company_name || "",
      package_name: pkg?.name || null,
      can_access_map: isAdmin || Boolean(pkg?.can_access_map),
      can_generate_image: isAdmin || Boolean(pkg?.can_generate_image),
      can_generate_weekly_summary: isAdmin || Boolean(pkg?.can_generate_weekly_summary),
    });
  } catch (error) {
    json(res, 403, { error: error.message || "Acesso nao autorizado." });
  }
};
