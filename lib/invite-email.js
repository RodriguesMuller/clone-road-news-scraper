const RESEND_EMAILS_URL = "https://api.resend.com/emails";

function normalizePublicUrl(value) {
  let candidate = String(value || "").trim();
  if (!candidate) return "";
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  const parsed = new URL(candidate);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("A URL publica da plataforma e invalida.");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function isLocalUrl(value) {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function publicAppUrl(env = process.env) {
  const configured = env.APP_URL
    || env.SITE_URL
    || env.NEXT_PUBLIC_SITE_URL
    || env.NEXT_PUBLIC_APP_URL
    || env.PUBLIC_SITE_URL
    || "";
  const vercelHost = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || "";
  const url = normalizePublicUrl(configured || vercelHost);
  const isProduction = Boolean(env.VERCEL) || String(env.NODE_ENV || "").toLowerCase() === "production";

  if (url) {
    if (isProduction && isLocalUrl(url)) {
      throw new Error("A URL publica da plataforma nao pode apontar para localhost em producao.");
    }
    return url;
  }
  if (isProduction) throw new Error("A URL publica da plataforma nao esta configurada.");
  return "http://localhost:3000";
}

function inviteRedirectUrl(env = process.env) {
  return `${publicAppUrl(env)}/accept-invite`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function roleName(role) {
  if (role === "admin") return "Admin";
  if (role === "manager") return "Gestor";
  return "Cliente";
}

function renderInviteEmail({ name, email, role, companyName, inviteUrl }) {
  const safeName = escapeHtml(String(name || "").trim() || "novo usuário");
  const safeEmail = escapeHtml(email);
  const safeRole = escapeHtml(roleName(role));
  const safeCompany = escapeHtml(String(companyName || "").trim());
  const safeUrl = escapeHtml(inviteUrl);
  const companyText = safeCompany ? ` da empresa <strong style="color:#ffffff;">${safeCompany}</strong>` : "";
  const plainCompany = String(companyName || "").trim() ? ` da empresa ${String(companyName).trim()}` : "";
  const subject = "Convite para acessar o Road News";
  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#02150f;font-family:Arial,Helvetica,sans-serif;color:#f4f8f6;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#02150f;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background:#0b241b;border:1px solid #176a4c;border-radius:8px;overflow:hidden;">
            <tr><td style="height:5px;background:#22e58b;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr>
              <td style="padding:30px 30px 14px;">
                <div style="font-size:28px;line-height:1;font-weight:900;color:#ffffff;">
                  <span style="display:inline-block;width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-top:23px solid #22e58b;margin-right:10px;vertical-align:-4px;"></span>
                  ROAD NEWS
                </div>
                <div style="margin-top:10px;color:#22e58b;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Inteligência operacional para o modal rodoviário</div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 30px 32px;">
                <h1 style="margin:0 0 16px;color:#ffffff;font-size:25px;line-height:1.25;">Você foi convidado para acessar o Road News</h1>
                <p style="margin:0 0 14px;color:#d7e4de;font-size:15px;line-height:1.6;">Olá, <strong style="color:#ffffff;">${safeName}</strong>.</p>
                <p style="margin:0 0 22px;color:#d7e4de;font-size:15px;line-height:1.6;">Você recebeu um convite para acessar a plataforma Road News como <strong style="color:#ffffff;">${safeRole}</strong>${companyText}. Clique no botão abaixo para aceitar o convite, criar sua senha e acessar sua conta.</p>
                <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#22e58b;border-radius:6px;"><a href="${safeUrl}" style="display:inline-block;padding:14px 21px;color:#02150f;text-decoration:none;font-size:14px;font-weight:900;">Aceitar convite</a></td></tr></table>
                <p style="margin:22px 0 0;color:#91a89e;font-size:12px;line-height:1.55;">Este convite é temporário e pode expirar por segurança. Não compartilhe este link.</p>
                <p style="margin:12px 0 0;color:#91a89e;font-size:12px;line-height:1.55;">Se o botão não funcionar, acesse:<br><a href="${safeUrl}" style="color:#80f0bd;word-break:break-all;">${safeUrl}</a></p>
                <p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #1b4636;color:#91a89e;font-size:12px;line-height:1.55;">Convite destinado a ${safeEmail}.<br>Road News - Inteligência operacional para o modal rodoviário.<br>Se você não esperava este convite, ignore este e-mail.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = [
    "ROAD NEWS",
    "Inteligência operacional para o modal rodoviário",
    "",
    "Você foi convidado para acessar o Road News",
    `Olá, ${String(name || "").trim() || "novo usuário"}.`,
    `Você recebeu um convite para acessar a plataforma Road News como ${roleName(role)}${plainCompany}.`,
    "Crie sua senha pelo link seguro:",
    inviteUrl,
    "",
    "Este convite é temporário e pode expirar por segurança.",
    "Se você não esperava este convite, ignore este e-mail.",
  ].join("\n");
  return { subject, html, text };
}

function senderAddress(env = process.env) {
  const configured = String(env.INVITE_EMAIL_FROM || "Road News <onboarding@resend.dev>").trim();
  return configured.includes("<") ? configured : `Road News <${configured}>`;
}

async function sendInviteEmail(invitation, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw new Error("O servico de e-mail de convites nao esta configurado.");
  const content = renderInviteEmail(invitation);
  const payload = {
    from: senderAddress(env),
    to: [invitation.email],
    subject: content.subject,
    html: content.html,
    text: content.text,
  };
  const replyTo = String(env.INVITE_EMAIL_REPLY_TO || "").trim();
  if (replyTo) payload.reply_to = replyTo;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  const response = await fetchImpl(RESEND_EMAILS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String(result?.message || result?.error || "");
    if (/domain|from address|testing emails|verify/i.test(detail)) {
      throw new Error("O remetente do Road News ainda nao esta autorizado no servico de e-mail.");
    }
    throw new Error("Nao foi possivel enviar o e-mail de convite. Tente novamente.");
  }
  return { id: result?.id || null };
}

module.exports = {
  inviteRedirectUrl,
  normalizePublicUrl,
  publicAppUrl,
  renderInviteEmail,
  sendInviteEmail,
  senderAddress,
};
