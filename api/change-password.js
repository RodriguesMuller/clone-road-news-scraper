const { SERVICE_ROLE_KEY, SUPABASE_URL, json, requireAccount } = require("./_auth");
const { adminErrorMessage, assertPasswordPolicy, audit, readJson } = require("./_admin");

// Troca de senha do proprio usuario. Usado no primeiro acesso (senha temporaria criada pelo admin)
// e sempre que o usuario quiser trocar. A politica e validada aqui, no servidor, e a marca
// must_change_password so e limpa depois que a nova senha foi gravada.
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const account = await requireAccount(req, { allowPasswordChange: true });
    if (!account.authEnabled) throw new Error("Troca de senha indisponivel no modo demo.");
    const body = await readJson(req);
    const password = String(body.password || "");
    assertPasswordPolicy(password);
    if (password !== String(body.password_confirmation || "")) throw new Error("A senha e a confirmacao nao conferem.");

    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(account.user.id)}`, {
      method: "PUT",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password, app_metadata: { must_change_password: false } }),
    });
    if (!response.ok) throw new Error(await response.text());

    await audit(account, "change_own_password", "profile", account.user.id, {
      first_access: Boolean(account.passwordChangeRequired),
    });
    json(res, 200, { ok: true });
  } catch (error) {
    const message = adminErrorMessage(error);
    const status = /senha|conferem/i.test(message) && !/temporaria para continuar/i.test(message) ? 400 : 403;
    json(res, status, { error: message });
  }
};
