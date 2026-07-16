const { supabaseFetch } = require("./_auth");

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function fetchJson(path, options = {}) {
  const response = await supabaseFetch(path, options);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function toLimit(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function packagePayload(body = {}) {
  const name = String(body.name || "").trim();
  if (!name) throw new Error("Informe o nome do pacote.");
  return {
    name,
    description: String(body.description || "").trim(),
    monthly_news_limit: toLimit(body.monthly_news_limit, 0),
    monthly_ai_summary_limit: toLimit(body.monthly_ai_summary_limit, 0),
    monthly_pdf_limit: toLimit(body.monthly_pdf_limit, 0),
    max_users: toLimit(body.max_users, 0),
    can_access_map: toBoolean(body.can_access_map, false),
    can_generate_image: toBoolean(body.can_generate_image, false),
    can_generate_weekly_summary: toBoolean(body.can_generate_weekly_summary, false),
    is_active: toBoolean(body.is_active, true),
  };
}

async function audit(account, action, targetType, targetId, metadata = {}) {
  try {
    await supabaseFetch("/rest/v1/audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        actor_user_id: account?.user?.id || null,
        action,
        target_type: targetType,
        target_id: targetId ? String(targetId) : null,
        metadata,
      }),
    });
  } catch {
    // Auditoria nao pode bloquear uma acao administrativa ja validada.
  }
}

function adminErrorMessage(error) {
  const raw = String(error?.message || error || "");
  let message = raw;
  try {
    const parsed = JSON.parse(raw);
    message = parsed.msg || parsed.message || parsed.error_description || parsed.error || raw;
  } catch {
    // Mantem a mensagem original.
  }
  if (/invalid login credentials|invalid_credentials/i.test(message)) {
    return "E-mail ou senha incorretos.";
  }
  if (/email_exists|already been registered|already registered|user_already_exists|duplicate key|already exists|ja existe|já existe|cadastrado/i.test(message)) {
    return "Este e-mail ja esta cadastrado. Verifique a lista de usuarios ou exclua o usuario existente antes de convidar novamente.";
  }
  if (/row-level security|violates row-level security|permission denied|insufficient permissions|acesso negado|not allowed/i.test(message)) {
    return "Voce nao tem permissao para realizar esta acao.";
  }
  if (/inativo|inactive|blocked|bloqueado/i.test(message)) {
    return "Seu acesso esta inativo. Contate o administrador.";
  }
  if (/expired|token.*invalid|invalid.*token|link.*expir/i.test(message)) {
    return "Este link expirou. Solicite um novo convite.";
  }
  if (/fetch failed|network|econn|timeout|connect|connection/i.test(message)) {
    return "Nao foi possivel conectar ao servidor. Tente novamente em instantes.";
  }
  if (/service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(message)) {
    return "SUPABASE_SERVICE_ROLE_KEY nao configurada no servidor.";
  }
  if (/^\s*[{[]/.test(raw) || /Supabase HTTP|PGRST|stack|trace|schema|column/i.test(message)) {
    return "Nao foi possivel concluir a acao. Tente novamente.";
  }
  return message || "Nao foi possivel concluir a acao. Tente novamente.";
}

module.exports = {
  adminErrorMessage,
  audit,
  fetchJson,
  packagePayload,
  readJson,
};
