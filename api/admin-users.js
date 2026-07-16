const { SERVICE_ROLE_KEY, SUPABASE_URL, json, requireManager, supabaseFetch } = require("./_auth");

async function fetchActivePackage(packageId) {
  try {
    const response = await supabaseFetch(`/rest/v1/packages?id=eq.${encodeURIComponent(packageId)}&is_active=eq.true&select=id,max_users&limit=1`);
    return (await response.json())?.[0] || null;
  } catch (error) {
    if (!/max_users|column|schema|PGRST/i.test(error.message || "")) throw error;
    const response = await supabaseFetch(`/rest/v1/packages?id=eq.${encodeURIComponent(packageId)}&is_active=eq.true&select=id&limit=1`);
    return (await response.json())?.[0] || null;
  }
}

async function activePackageUsers(packageId) {
  const response = await supabaseFetch(
    `/rest/v1/user_packages?package_id=eq.${encodeURIComponent(packageId)}&is_active=eq.true&select=id`,
    { method: "HEAD", headers: { Prefer: "count=exact" } },
  );
  return Number((response.headers.get("content-range") || "0/0").split("/")[1] || 0);
}

async function inviteUser(body) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("E-mail invalido.");
  const requestedRole = String(body.role || "client").trim();
  const role = ["admin", "manager"].includes(requestedRole) ? requestedRole : "client";
  const status = ["active", "blocked", "inactive"].includes(body.status) ? body.status : "active";
  const response = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      data: {
        full_name: body.full_name || "",
        company_name: body.company_name || "",
        role,
      },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Nao foi possivel convidar usuario.");
  }
  const invited = await response.json();
  return { invited, role, status };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const account = await requireManager(req);
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    const requestedRole = String(body.role || "client").trim();
    const normalizedRole = ["admin", "manager"].includes(requestedRole) ? requestedRole : "client";
    if (!account.isAdmin && normalizedRole !== "client") throw new Error("Gestor so pode convidar usuarios client.");
    const { invited, role, status } = await inviteUser(body);
    const userId = invited?.id || invited?.user?.id;
    if (userId) {
      await supabaseFetch("/rest/v1/profiles", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: userId,
          email: String(body.email || "").trim().toLowerCase(),
          full_name: body.full_name || "",
          company_name: body.company_name || "",
          role,
          status,
        }),
      });
      const packageId = String(body.package_id || "").trim();
      if (packageId) {
        const initialPackage = await fetchActivePackage(packageId);
        if (!initialPackage) throw new Error("Pacote inicial nao encontrado ou inativo.");
        const maxUsers = Number(initialPackage.max_users || 0);
        if (maxUsers > 0 && await activePackageUsers(packageId) >= maxUsers) {
          throw new Error("Limite de usuarios deste pacote atingido.");
        }
        await supabaseFetch("/rest/v1/user_packages", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            user_id: userId,
            package_id: packageId,
            is_active: true,
          }),
        });
      }
      await supabaseFetch("/rest/v1/audit_logs", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          actor_user_id: account.user.id,
          action: "invite_user",
          target_type: "profile",
          target_id: userId,
          metadata: { email: body.email, role, status, package_id: body.package_id || null },
        }),
      });
    }
    json(res, 200, { ok: true, user_id: userId || null });
  } catch (error) {
    json(res, 403, { error: error.message || "Nao foi possivel convidar usuario." });
  }
};
