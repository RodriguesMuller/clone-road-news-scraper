const { isReadOnlyEnvironment, supabaseFetch } = require("./_auth");

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
  if (isReadOnlyEnvironment()) return;
  try {
    await supabaseFetch("/rest/v1/audit_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        actor_user_id: account?.user?.id || null,
        client_id: metadata.client_id || account?.profile?.client_id || null,
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
  const fallback = "Nao foi possivel concluir a acao. Tente novamente.";
  const nestedMessage = (value, depth = 0) => {
    if (value == null || depth > 3) return "";
    if (typeof value === "string") return value;
    if (typeof value !== "object") return String(value);
    return nestedMessage(value.message ?? value.msg ?? value.error_description ?? value.error ?? value.details, depth + 1);
  };
  const raw = nestedMessage(error).trim();
  let message = raw;
  for (let index = 0; index < 2 && message; index += 1) {
    try {
      const next = nestedMessage(JSON.parse(message)).trim();
      if (!next || next === message) break;
      message = next;
    } catch {
      break;
    }
  }
  message = message.replace(/\s+/g, " ").trim();
  const haystack = `${raw} ${message}`;
  if (/invalid login credentials|invalid_credentials/i.test(haystack)) {
    return "E-mail ou senha incorretos.";
  }
  if (/email_exists|already been registered|already registered|user_already_exists|duplicate key|already exists|ja existe|já existe|cadastrado/i.test(haystack)) {
    return "Este e-mail ja esta cadastrado. Verifique a lista de usuarios ou exclua o usuario existente antes de convidar novamente.";
  }
  if (/row-level security|violates row-level security|permission denied|insufficient permissions|acesso negado|not allowed|sem permiss|nao tem permiss|não tem permiss/i.test(haystack)) {
    return "Você não tem permissão para realizar esta ação.";
  }
  if (/inativo|inactive|blocked|bloqueado/i.test(haystack)) {
    return "Seu acesso esta inativo. Contate o administrador.";
  }
  if (/expired|token.*invalid|invalid.*token|link.*expir/i.test(haystack)) {
    return "Este link expirou. Solicite um novo convite.";
  }
  if (/fetch failed|network|econn|timeout|connect|connection/i.test(haystack)) {
    return "Nao foi possivel conectar ao servidor. Tente novamente.";
  }
  if (/service[_-]?role|database_url|openai_api_key|postgres|supabase http|pgrst|sqlstate|schema|column|relation|stack|trace|unexpected token|invalid header|headers\.append|bearer\s+\S+|sk-(?:proj-)?\S+/i.test(haystack)) {
    return fallback;
  }
  if (/^\s*[\[{]/.test(raw) || message.length > 280) {
    return fallback;
  }
  const safeApplicationMessage = /^(acesso|ambiente|apenas|convite|este|esta|gestor|informe|limite|nao|não|o remetente|pacote|recurso|selecione|sessao|sessão|usuario|usuário|voce|você)\b/i;
  return safeApplicationMessage.test(message) ? message : fallback;
}

module.exports = {
  adminErrorMessage,
  audit,
  fetchJson,
  packagePayload,
  readJson,
};
