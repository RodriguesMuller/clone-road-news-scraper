const { supabaseFetch } = require("./_auth");

// Nenhum endpoint precisa de corpo grande; o teto evita que um payload de MB vire custo de IA
// (news-summary) ou consumo de memoria na funcao.
const MAX_BODY_BYTES = 256 * 1024;

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("Requisicao muito grande.");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Requisicao invalida.");
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
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
  if (!Number.isFinite(number)) return fallback;
  if (number < 0) throw new Error("Os limites do pacote nao podem ser negativos.");
  return Math.floor(number);
}

function normalizeCpf(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidCpf(value) {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function maskCpf(value) {
  return normalizeCpf(value).length === 11 ? "***.***.***-**" : "";
}

function normalizePhone(value) {
  const phone = String(value || "").replace(/\D/g, "");
  return phone || null;
}

function packagePayload(body = {}) {
  const name = String(body.name || "").trim();
  if (!name) throw new Error("Informe o nome do pacote.");
  return {
    name,
    description: String(body.description || "").trim(),
    monthly_news_limit: toLimit(body.monthly_news_limit, 0),
    monthly_route_limit: toLimit(body.monthly_route_limit, 0),
    monthly_ai_summary_limit: toLimit(body.monthly_ai_summary_limit, 0),
    monthly_pdf_limit: toLimit(body.monthly_pdf_limit, 0),
    max_users: toLimit(body.max_users, 0),
    can_access_map: toBoolean(body.can_access_map, false),
    can_generate_image: toBoolean(body.can_generate_individual_summary ?? body.can_generate_image, false),
    can_generate_individual_summary: toBoolean(body.can_generate_individual_summary ?? body.can_generate_image, false),
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
  if (/sessao invalida|sessão inválida|jwt expired|token.*expired/i.test(message)) {
    return "Sua sessao expirou. Faca login novamente.";
  }
  if (/(profiles_cpf_uidx|cpf).*(duplicate|already|existe)|(duplicate|already).*(profiles_cpf_uidx|cpf)/i.test(message)) {
    return "Este CPF ja esta cadastrado.";
  }
  if (/(clients_company_name|company_name).*(duplicate|already|existe)|(duplicate|already).*(clients_company_name|company_name)/i.test(message)) {
    return "Este cliente ja esta cadastrado.";
  }
  if (/email_exists|already been registered|already registered|user_already_exists|duplicate key.*email|email.*duplicate|profiles_email/i.test(message)) {
    return "Este e-mail ja esta cadastrado.";
  }
  if (/duplicate key|already exists|ja existe|já existe/i.test(message)) {
    return "Ja existe um cadastro com esses dados.";
  }
  if (/row-level security|violates row-level security|permission denied|insufficient permissions|acesso negado|not allowed/i.test(message)) {
    return "Voce nao tem permissao para realizar esta acao.";
  }
  if (/cliente.*(inativo|inactive)|cliente nao encontrado/i.test(message)) {
    return "Cliente nao encontrado ou inativo.";
  }
  if (/pacote.*(inativo|inactive)|pacote nao encontrado/i.test(message)) {
    return "Pacote nao encontrado ou inativo.";
  }
  if (/seu (usuario|acesso).*(inativo|inactive|blocked|bloqueado)|profile.*inactive/i.test(message)) {
    return "Seu acesso esta inativo. Contate o administrador.";
  }
  if (/expired|token.*invalid|invalid.*token|link.*expir/i.test(message)) {
    return "Este link expirou. Solicite um novo convite.";
  }
  if (/usuario sem pacote|sem pacote ativo|vincule um pacote/i.test(message)) {
    return "Vincule um pacote para liberar os recursos da plataforma.";
  }
  if (/fetch failed|network|econn|timeout|connect|connection/i.test(message)) {
    return "Nao foi possivel conectar ao servidor. Tente novamente em instantes.";
  }
  if (/^\s*[{[]/.test(raw) || /service_role|database_url|openai_api_key|Supabase HTTP|PGRST|stack|trace|schema|column|relation|sqlstate/i.test(message)) {
    return "Nao foi possivel concluir a acao. Tente novamente.";
  }
  return message || "Nao foi possivel concluir a acao. Tente novamente.";
}

module.exports = {
  adminErrorMessage,
  audit,
  fetchJson,
  isValidCpf,
  maskCpf,
  normalizeCpf,
  normalizePhone,
  packagePayload,
  readJson,
};
