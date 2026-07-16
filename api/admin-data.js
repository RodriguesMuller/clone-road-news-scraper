const { json, requireManager } = require("./_auth");
const { adminErrorMessage, audit, fetchJson } = require("./_admin");

const TEST_PACKAGE = {
  name: "Teste",
  description: "Pacote temporario para clientes avaliarem a plataforma Road News.",
  monthly_news_limit: 100,
  monthly_ai_summary_limit: 10,
  monthly_pdf_limit: 5,
  max_users: 2,
  can_access_map: true,
  can_generate_image: true,
  can_generate_weekly_summary: true,
  is_active: true,
};

async function ensureTestPackage(account) {
  const existing = await fetchJson("/rest/v1/packages?name=eq.Teste&select=id&limit=1");
  if (Array.isArray(existing) && existing.length) return;
  let created = null;
  try {
    created = await fetchJson("/rest/v1/packages?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(TEST_PACKAGE),
    });
  } catch (error) {
    if (!/max_users|column|schema|PGRST/i.test(error.message || "")) throw error;
    const { max_users, ...legacyPackage } = TEST_PACKAGE;
    created = await fetchJson("/rest/v1/packages?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(legacyPackage),
    });
  }
  await audit(account, "seed_test_package", "package", created?.[0]?.id || "Teste", {
    name: TEST_PACKAGE.name,
    trial_days_suggested: 15,
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const account = await requireManager(req);
    await ensureTestPackage(account);
    const monthStart = encodeURIComponent(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
    const [users, packages, userPackages, usage, logs] = await Promise.all([
      fetchJson("/rest/v1/profiles?select=*&order=created_at.desc"),
      fetchJson("/rest/v1/packages?select=*&order=name.asc"),
      fetchJson("/rest/v1/user_packages?select=*&order=created_at.desc"),
      fetchJson(`/rest/v1/usage_events?select=*&created_at=gte.${monthStart}&order=created_at.desc&limit=1000`),
      fetchJson("/rest/v1/audit_logs?select=*&order=created_at.desc&limit=120"),
    ]);
    json(res, 200, {
      users: users || [],
      packages: packages || [],
      userPackages: userPackages || [],
      usage: usage || [],
      logs: logs || [],
    });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
