(function exposeRoadNewsErrors(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.RoadNewsErrors = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createRoadNewsErrors() {
  const DEFAULT_MESSAGE = "Não foi possível concluir a ação. Tente novamente.";

  function nestedMessage(value, depth = 0) {
    if (value == null || depth > 3) return "";
    if (typeof value === "string") return value;
    if (typeof value !== "object") return String(value);
    return nestedMessage(
      value.message
        ?? value.msg
        ?? value.error_description
        ?? value.error
        ?? value.details
        ?? value.hint,
      depth + 1,
    );
  }

  function parsedMessage(value) {
    let message = nestedMessage(value).trim();
    for (let index = 0; index < 2 && message; index += 1) {
      try {
        const parsed = JSON.parse(message);
        const next = nestedMessage(parsed).trim();
        if (!next || next === message) break;
        message = next;
      } catch {
        break;
      }
    }
    return message.replace(/\s+/g, " ").trim();
  }

  function isSafeApplicationMessage(message) {
    return /^(a ia|acesso|ambiente|apenas|convite|e-mail|este|esta|informe|limite|mapa|não|nao|notícia|noticia|o remetente|pacote|recurso|resumo|selecione|sessão|sessao|seu|sua|usuário|usuario|visão|visao|você|voce)\b/i.test(message);
  }

  function getFriendlyErrorMessage(error, fallback = DEFAULT_MESSAGE) {
    const message = parsedMessage(error);
    if (!message) return fallback;
    const raw = typeof error === "string" ? error : nestedMessage(error);
    const haystack = `${raw} ${message}`.toLowerCase();

    if (/invalid login credentials|invalid_credentials|email not confirmed|invalid grant/.test(haystack)) {
      return "E-mail ou senha incorretos.";
    }
    if (/email_exists|already been registered|already registered|user_already_exists|duplicate key|already exists|cadastrado|ja existe|já existe/.test(haystack)) {
      return "Este e-mail já está cadastrado.";
    }
    if (/permission denied|insufficient permissions|row-level security|violates row-level security|acesso negado|not allowed|sem permiss/.test(haystack)) {
      return "Você não tem permissão para realizar esta ação.";
    }
    if (/inativo|inactive|blocked|bloqueado/.test(haystack)) {
      return "Seu acesso está inativo. Contate o administrador.";
    }
    if (/expired|token.*invalid|invalid.*token|link.*expir|refresh token/.test(haystack)) {
      return "Este link expirou. Solicite um novo convite.";
    }
    if (/failed to fetch|network|timeout|econn|connection|fetch failed|servidor indispon/.test(haystack)) {
      return "Não foi possível conectar ao servidor. Tente novamente.";
    }

    const technical = /service[_-]?role|database_url|openai_api_key|postgres|supabase http|pgrst|sqlstate|schema cache|\bcolumn\b|\brelation\b|stack|trace|unexpected token|invalid header|headers\.append|<\/?[a-z][^>]*>|bearer\s+\S+|sk-(?:proj-)?\S+/i;
    if (technical.test(haystack) || /^\s*[\[{]/.test(raw) || message.length > 280) return fallback;
    if (typeof error === "object" && error !== null && !isSafeApplicationMessage(message)) return fallback;
    return message;
  }

  return { DEFAULT_MESSAGE, getFriendlyErrorMessage };
}));
