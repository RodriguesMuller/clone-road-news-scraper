const { SERVICE_ROLE_KEY, SUPABASE_URL, json, requireManager, supabaseFetch } = require("./_auth");
const { adminErrorMessage } = require("./_admin");

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

function publicAppUrl() {
  const configuredUrl = process.env.APP_URL
    || process.env.SITE_URL
    || process.env.NEXT_PUBLIC_SITE_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.PUBLIC_SITE_URL
    || "";
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "";
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/+$/, "");
  return "http://localhost:3000";
}

function inviteRedirectUrl() {
  return `${publicAppUrl()}/accept-invite`;
}

function friendlyInviteError(detail) {
  let message = detail || "Nao foi possivel convidar usuario.";
  try {
    const parsed = JSON.parse(detail);
    message = parsed.msg || parsed.message || parsed.error_description || message;
  } catch (_) {
    // Supabase pode retornar texto puro em alguns erros.
  }
  if (/already|registered|exists|duplicate|ja existe|já existe|cadastrado/i.test(message)) {
    return "Este e-mail ja esta cadastrado. Use outro e-mail ou ajuste o usuario existente.";
  }
  if (/redirect|not allowed|site url/i.test(message)) {
    return "O link de convite nao esta autorizado no Supabase. Confira a URL de redirecionamento do projeto.";
  }
  return message;
}

async function profileByEmail(email) {
  const response = await supabaseFetch(`/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}&select=id,email,status,role&limit=1`);
  const rows = await response.json();
  return rows?.[0] || null;
}

async function authUserByEmail(email) {
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
  return users.find((user) => String(user.email || "").toLowerCase() === email.toLowerCase()) || null;
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
    throw new Error(friendlyInviteError(detail));
  }
}

async function inviteUser(body) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("E-mail invalido.");
  const requestedRole = String(body.role || "client").trim();
  const role = ["admin", "manager"].includes(requestedRole) ? requestedRole : "client";
  const status = ["active", "blocked", "inactive"].includes(body.status) ? body.status : "active";
  const response = await fetch(`${SUPABASE_URL}/auth/v1/invite?redirect_to=${encodeURIComponent(inviteRedirectUrl())}`, {
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
    throw new Error(friendlyInviteError(detail));
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
    const email = String(body.email || "").trim().toLowerCase();
    const requestedRole = String(body.role || "client").trim();
    const normalizedRole = ["admin", "manager"].includes(requestedRole) ? requestedRole : "client";
    if (!account.isAdmin && normalizedRole === "admin") throw new Error("Voce nao tem permissao para convidar administradores.");
    const existingProfile = email ? await profileByEmail(email) : null;
    if (existingProfile) {
      throw new Error("Este e-mail ja esta cadastrado. Verifique a lista de usuarios ou exclua o usuario existente antes de convidar novamente.");
    }
    const orphanAuthUser = email ? await authUserByEmail(email) : null;
    if (orphanAuthUser?.id) {
      await deleteAuthUser(orphanAuthUser.id);
    }
    const packageId = String(body.package_id || "").trim();
    if (normalizedRole === "client" && !packageId) throw new Error("Selecione um pacote inicial para o cliente.");
    let initialPackage = null;
    if (packageId) {
      initialPackage = await fetchActivePackage(packageId);
      if (!initialPackage) throw new Error("Pacote inicial nao encontrado ou inativo.");
      const maxUsers = Number(initialPackage.max_users || 0);
      if (maxUsers > 0 && await activePackageUsers(packageId) >= maxUsers) {
        throw new Error("Limite de usuarios deste pacote atingido.");
      }
    }
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
      if (initialPackage) {
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
    json(res, 200, { ok: true, user_id: userId || null, redirect_to: inviteRedirectUrl() });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
