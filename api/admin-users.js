const crypto = require("node:crypto");
const {
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  assertWritableEnvironment,
  json,
  listAuthUsers,
  requireAdmin,
  requireManager,
  supabaseFetch,
} = require("./_auth");
const { adminErrorMessage, audit, fetchJson, readJson } = require("./_admin");
const { inviteRedirectUrl, sendInviteEmail } = require("../lib/invite-email");

function idFromRequest(req, body = {}) {
  const url = new URL(req.url, "http://road-news.local");
  return String(body.user_id || body.id || url.searchParams.get("user_id") || url.searchParams.get("id") || "").trim();
}

function emailFromRequest(req, body = {}) {
  const url = new URL(req.url, "http://road-news.local");
  return String(body.email || url.searchParams.get("email") || "").trim().toLowerCase();
}

async function deleteRows(path) {
  try {
    await supabaseFetch(path, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  } catch (error) {
    if (!/column|schema|PGRST|does not exist/i.test(error.message || "")) throw error;
  }
}

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

function friendlyInviteError(detail) {
  let message = String(detail || "");
  try {
    const parsed = JSON.parse(message);
    message = parsed.msg || parsed.message || parsed.error_description || parsed.error || message;
  } catch {
    // O Supabase tambem pode retornar texto puro.
  }
  if (/already|registered|exists|duplicate|email_exists|cadastrado|ja existe|já existe/i.test(message)) {
    return "Este e-mail já está cadastrado. Verifique a lista de usuários ou exclua o cadastro anterior definitivamente.";
  }
  if (/redirect|not allowed|site url/i.test(message)) {
    return "O endereço de aceite do convite não está autorizado. Contate o administrador da plataforma.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Muitos convites foram solicitados em pouco tempo. Aguarde alguns minutos e tente novamente.";
  }
  return "Não foi possível gerar o link seguro de convite. Tente novamente.";
}

async function profileByEmail(email) {
  const response = await supabaseFetch(`/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}&select=id,email,status,role,full_name,company_name&limit=1`);
  const rows = await response.json();
  return rows?.[0] || null;
}

async function profileById(userId) {
  const rows = await fetchJson(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,status,role,full_name,company_name&limit=1`);
  return rows?.[0] || null;
}

async function authUserByEmail(email) {
  if (!email) return null;
  const users = await listAuthUsers();
  return users.find((user) => String(user.email || "").toLowerCase() === email.toLowerCase()) || null;
}

async function authUserById(userId) {
  if (!userId) return null;
  const users = await listAuthUsers();
  return users.find((user) => user.id === userId) || null;
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

function normalizedInvitation(body) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Informe um e-mail válido.");
  const requestedRole = String(body.role || "client").trim();
  return {
    email,
    fullName: String(body.full_name || "").trim(),
    companyName: String(body.company_name || "").trim(),
    role: ["admin", "manager"].includes(requestedRole) ? requestedRole : "client",
    status: ["active", "blocked", "inactive"].includes(body.status) ? body.status : "active",
  };
}

async function generateAuthLink(type, invitation) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type,
      email: invitation.email,
      redirect_to: inviteRedirectUrl(),
      data: {
        full_name: invitation.fullName,
        company_name: invitation.companyName,
        role: invitation.role,
      },
    }),
  });
  if (!response.ok) throw new Error(friendlyInviteError(await response.text()));
  const payload = await response.json().catch(() => ({}));
  const actionLink = payload.action_link || payload.properties?.action_link || "";
  const user = payload.user || payload.properties?.user || payload;
  if (!actionLink || !user?.id) throw new Error("Não foi possível gerar o link seguro de convite. Tente novamente.");
  return { actionLink, user };
}

async function saveInvitationProfile(userId, invitation, packageId) {
  await supabaseFetch("/rest/v1/profiles", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: userId,
      email: invitation.email,
      full_name: invitation.fullName,
      company_name: invitation.companyName,
      role: invitation.role,
      status: invitation.status,
    }),
  });
  if (packageId) {
    await supabaseFetch("/rest/v1/user_packages", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: userId, package_id: packageId, is_active: true }),
    });
  }
}

async function rollbackInvitation(userId) {
  try { await deleteRows(`/rest/v1/user_packages?user_id=eq.${encodeURIComponent(userId)}`); } catch {}
  try { await deleteRows(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`); } catch {}
  try { await deleteAuthUser(userId); } catch {}
}

async function deliverInvitation(invitation, actionLink, userId) {
  return sendInviteEmail({
    name: invitation.fullName,
    email: invitation.email,
    role: invitation.role,
    companyName: invitation.companyName,
    inviteUrl: actionLink,
  }, {
    idempotencyKey: `road-news-invite-${userId}-${crypto.randomUUID()}`,
  });
}

async function createInvitation(account, body, packageId) {
  const invitation = normalizedInvitation(body);
  let userId = "";
  try {
    const generated = await generateAuthLink("invite", invitation);
    userId = generated.user.id;
    await saveInvitationProfile(userId, invitation, packageId);
    const delivery = await deliverInvitation(invitation, generated.actionLink, userId);
    await audit(account, "invite_user", "profile", userId, {
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      package_id: packageId || null,
      email_provider: "resend",
      delivery_id: delivery.id,
    });
    return { userId, invitation };
  } catch (error) {
    if (userId) await rollbackInvitation(userId);
    throw error;
  }
}

async function resendInvitation(account, body) {
  const userId = String(body.user_id || "").trim();
  const profile = userId ? await profileById(userId) : await profileByEmail(String(body.email || "").trim().toLowerCase());
  if (!profile) throw new Error("Usuário não encontrado na lista de acessos.");
  if (!account.isAdmin && profile.role === "admin") throw new Error("Você não tem permissão para reenviar convite de administradores.");
  const authUser = await authUserById(profile.id);
  if (!authUser) throw new Error("O cadastro de acesso está incompleto. Um Admin deve excluir o registro e enviar um novo convite.");
  if (authUser.last_sign_in_at) throw new Error("Este usuário já aceitou o convite. Para trocar a senha, use Recuperar senha na tela de login.");

  const invitation = normalizedInvitation({
    email: profile.email || authUser.email,
    full_name: profile.full_name || authUser.user_metadata?.full_name,
    company_name: profile.company_name || authUser.user_metadata?.company_name,
    role: profile.role,
    status: profile.status,
  });
  const generated = await generateAuthLink("recovery", invitation);
  const delivery = await deliverInvitation(invitation, generated.actionLink, profile.id);
  await audit(account, "resend_invite", "profile", profile.id, {
    email: invitation.email,
    email_provider: "resend",
    delivery_id: delivery.id,
  });
  return { userId: profile.id };
}

async function deleteUser(req) {
  const account = await requireAdmin(req);
  assertWritableEnvironment();
  const userId = idFromRequest(req);
  const email = emailFromRequest(req);
  if (!userId && !email) throw new Error("Usuário não informado.");
  if (userId === account.user.id || (email && email === String(account.user.email || "").toLowerCase())) {
    throw new Error("Você não pode excluir seu próprio usuário Admin.");
  }

  const profile = userId ? await profileById(userId) : await profileByEmail(email);
  const authUser = profile?.id
    ? await authUserById(profile.id)
    : (userId ? await authUserById(userId) : await authUserByEmail(email));
  const targetId = profile?.id || authUser?.id || userId;
  if (!targetId) throw new Error("Usuário não encontrado.");

  await audit(account, "delete_user", "profile", targetId, {
    email: profile?.email || authUser?.email || email || null,
    role: profile?.role || authUser?.user_metadata?.role || null,
    company_name: profile?.company_name || authUser?.user_metadata?.company_name || null,
    orphan_auth: !profile,
  });
  await deleteAuthUser(targetId);
  await deleteRows(`/rest/v1/user_packages?user_id=eq.${encodeURIComponent(targetId)}`);
  await deleteRows(`/rest/v1/usage_events?user_id=eq.${encodeURIComponent(targetId)}`);
  await deleteRows(`/rest/v1/profiles?id=eq.${encodeURIComponent(targetId)}`);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    if (req.method === "DELETE") {
      await deleteUser(req);
      json(res, 200, { ok: true });
      return;
    }

    const account = await requireManager(req);
    assertWritableEnvironment();
    const body = await readJson(req);
    if (body.action === "resend_invite") {
      const result = await resendInvitation(account, body);
      json(res, 200, { ok: true, user_id: result.userId, redirect_to: inviteRedirectUrl() });
      return;
    }

    const invitation = normalizedInvitation(body);
    if (!account.isAdmin && invitation.role === "admin") throw new Error("Você não tem permissão para convidar administradores.");
    const existingProfile = await profileByEmail(invitation.email);
    if (existingProfile) {
      throw new Error("Este e-mail já está cadastrado. Se o convite ainda não foi aceito, use Reenviar convite na lista de usuários.");
    }
    const orphanAuthUser = await authUserByEmail(invitation.email);
    if (orphanAuthUser?.id) {
      throw new Error("Este e-mail possui um cadastro incompleto no Supabase Auth. Um Admin deve excluí-lo definitivamente na lista de usuários antes de convidar novamente.");
    }

    const packageId = String(body.package_id || "").trim();
    if (invitation.role === "client" && !packageId) throw new Error("Selecione um pacote inicial para o cliente.");
    if (packageId) {
      const initialPackage = await fetchActivePackage(packageId);
      if (!initialPackage) throw new Error("Pacote inicial não encontrado ou inativo.");
      const maxUsers = Number(initialPackage.max_users || 0);
      if (maxUsers > 0 && await activePackageUsers(packageId) >= maxUsers) {
        throw new Error("Limite de usuários deste pacote atingido.");
      }
    }

    const result = await createInvitation(account, body, packageId);
    json(res, 200, {
      ok: true,
      user_id: result.userId,
      redirect_to: inviteRedirectUrl(),
      email_provider: "resend",
    });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
