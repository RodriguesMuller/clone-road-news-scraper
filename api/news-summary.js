const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";
const { assertCanUse, json, recordUsage } = require("./_auth");

function clean(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;?/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function completeSentence(value, limit = 300) {
  let text = clean(value);
  if (!text) return "";
  if (text.length > limit) {
    const slice = text.slice(0, limit + 1);
    const sentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
    text = sentenceEnd > 90 ? slice.slice(0, sentenceEnd + 1) : slice.slice(0, limit).replace(/\s+\S*$/, "");
  }
  text = text.replace(/\s+,/g, ",").replace(/\s+\./g, ".").replace(/\s+/g, " ").trim();
  while (/\b(de|do|da|dos|das|em|para|com|e)[,.:;]?$/i.test(text) && text.split(" ").length > 4) {
    text = text.split(" ").slice(0, -1).join(" ").trim();
  }
  text = text.replace(/[,:; ]+$/, "");
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function roadFromText(value) {
  const match = clean(value).match(/\b((?:BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF)[-\s]?\d{2,4})\b/i);
  return match ? match[1].replace(/\s+/g, "-").toUpperCase() : "";
}

function normalize(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function categoryFromText(item) {
  const text = normalize(`${item.title} ${item.summary} ${item.category} ${item.source}`);
  if (/roubo|saque|assalto.*carga/.test(text)) return "Roubo de carga";
  if (/manifestacao|protesto/.test(text)) return "Manifestacao";
  if (/acidente|colisao|batida|tombamento|capotamento/.test(text)) return "Acidente";
  if (/bloqueio|interdicao|interdita|pista bloqueada|pare-e-siga/.test(text)) return "Interdicao";
  if (/lentidao|congestionamento|fila|trafego lento/.test(text)) return "Lentidao";
  if (/tempestade|chuva|vento|granizo|inmet|alagamento|barreira/.test(text)) return "Clima";
  if (/obra|servico|manutencao|recuperacao/.test(text)) return "Obra";
  if (/fiscalizacao|operacao policial|prf/.test(text)) return "Fiscalizacao";
  return clean(item.category) || "Monitoramento";
}

function riskFromText(item) {
  const text = normalize(`${item.title} ${item.summary} ${item.category} ${item.type}`);
  if (/roubo de carga|saque|bloqueio total|interdicao total|manifestacao|protesto/.test(text)) return "Critico";
  if (/acidente|bloqueio|interdicao|interdita|tempestade|perigo|queda de barreira|tombamento|alagamento/.test(text)) return "Alto";
  if (/lentidao|chuva forte|obra|interdicao parcial|congestionamento|pare-e-siga|fila/.test(text)) return "Medio";
  return "Baixo";
}

function regionFromText(item) {
  const text = clean(`${item.region || ""} ${item.city || ""} ${item.state || ""} ${item.title || ""} ${item.summary || ""}`);
  const cityUf = text.match(/\b([A-ZÁÂÃÉÊÍÓÔÕÚÇ][\wÁÂÃÉÊÍÓÔÕÚÇáâãéêíóôõúç.'-]+(?:\s+[A-ZÁÂÃÉÊÍÓÔÕÚÇ][\wÁÂÃÉÊÍÓÔÕÚÇáâãéêíóôõúç.'-]+){0,3})\/([A-Z]{2})\b/);
  if (cityUf) return `${cityUf[1]}/${cityUf[2]}`;
  const states = [
    "Mato Grosso do Sul", "Mato Grosso", "Minas Gerais", "Rio Grande do Sul", "Rio Grande do Norte",
    "Rio de Janeiro", "Santa Catarina", "Sao Paulo", "São Paulo", "Espirito Santo", "Espírito Santo",
    "Distrito Federal", "Para", "Pará", "Parana", "Paraná", "Ceara", "Ceará", "Maranhao", "Maranhão",
    "Amazonas", "Bahia", "Goias", "Goiás", "Pernambuco", "Rondonia", "Rondônia", "Tocantins",
  ];
  const normalized = normalize(text);
  return states.find((state) => normalized.includes(normalize(state))) || roadFromText(text) || "";
}

function regionPrefix(region) {
  const value = clean(region);
  if (!value) return "";
  if (/^(?:BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF)-?\d{2,4}$/i.test(value)) {
    return `Na região da ${value}`;
  }
  const articles = {
    "Pará": "do",
    "Para": "do",
    "Paraná": "do",
    "Parana": "do",
    "Ceará": "do",
    "Ceara": "do",
    "Maranhão": "do",
    "Maranhao": "do",
    "Amazonas": "do",
    "Tocantins": "do",
    "Bahia": "da",
    "Rondônia": "de",
    "Rondonia": "de",
  };
  return `Na região ${articles[value] || "de"} ${value}`;
}

function lowerFirstForPrefix(text) {
  const value = clean(text);
  if (!value) return "";
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function fallbackSummary(item) {
  const title = clean(item.title);
  const rawSummary = clean(item.summary);
  const region = regionFromText(item);
  const category = categoryFromText(item);
  let base = rawSummary || title;

  if (String(item.type).toUpperCase() === "INMET") {
    const weather = title.match(/^([A-Za-zÀ-ÿ ]+)\s*-\s*([A-Za-zÀ-ÿ ]+)$/);
    if (weather) {
      base = `Há alerta de ${weather[1].trim().toLowerCase()} com ${weather[2].trim().toLowerCase()}, conforme aviso meteorológico publicado pelo INMET.`;
    }
  }

  if (region && !/^na região|^no trecho|^em\s/i.test(base)) {
    base = `${regionPrefix(region)}, ${lowerFirstForPrefix(base)}`;
  }

  const risk = clean(item.risk_level) || riskFromText({ ...item, category });
  const relevance = ["Alto", "Critico"].includes(risk) ? "Alta" : "Baixa";
  return {
    image_summary: completeSentence(base),
    ai_summary: completeSentence(base),
    region: region || clean(item.region),
    country: clean(item.country) || "Brasil",
    state: clean(item.state),
    city: clean(item.city),
    highway: clean(item.highway) || roadFromText(`${title} ${rawSummary}`),
    category,
    risk_level: risk,
    operational_relevance: relevance,
    operational_impact: relevance === "Alta"
      ? "Pode afetar segurança, prazo ou planejamento de rotas no transporte rodoviário."
      : "Sem impacto operacional direto confirmado para rotas no Brasil.",
  };
}

function extractText(data) {
  if (data.output_text) return data.output_text;
  let text = "";
  for (const output of data.output || []) {
    for (const content of output.content || []) {
      text += content.text || "";
    }
  }
  return text.trim();
}

function parseAiJson(text) {
  const raw = clean(text).replace(/^```(?:json)?|```$/gim, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("AI_JSON_PARSE_FAILED");
  }
}

function openAiApiKey() {
  const value = String(process.env.OPENAI_API_KEY || "").trim();
  if (!value) return "";
  if (/[^\x20-\x7E]/.test(value) || value.includes("...") || value.includes("…")) {
    throw new Error("OPENAI_API_KEY inválida na Vercel. Cole a chave completa, sem reticências, sem Bearer e sem quebra de linha.");
  }
  if (!value.startsWith("sk-")) {
    throw new Error("OPENAI_API_KEY inválida na Vercel. A chave deve começar com sk- e estar completa.");
  }
  return value;
}

function publicErrorMessage(error) {
  const message = String(error?.message || "");
  if (/login|sessao|sessão|perfil|inativo|pacote|recurso|limite|acesso/i.test(message)) return message;
  if (/openai_api_key|invalid_api_key|incorrect api key/i.test(message)) {
    return "A IA ainda nao esta configurada corretamente. Verifique a chave da OpenAI na Vercel.";
  }
  if (/quota|billing|cota/i.test(message)) {
    return "A IA recusou a chamada por limite de cota ou billing.";
  }
  return "Nao foi possivel gerar o resumo da noticia. Tente novamente.";
}

async function generateAiSummary(item) {
  const fallback = fallbackSummary(item);
  const apiKey = openAiApiKey();
  if (!apiKey) return { ...fallback, ai_used: false };
  const model = process.env.OPENAI_IMAGE_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const payload = {
    title: clean(item.title),
    raw_summary: clean(item.summary),
    source: clean(item.source),
    url: clean(item.url),
    published_at: clean(item.published_at || item.created_at || item.scraped_at),
    type: clean(item.type),
    current_region: fallback.region,
    current_highway: fallback.highway,
    current_category: fallback.category,
    current_risk_level: fallback.risk_level,
  };

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_output_tokens: 900,
      input: [
        {
          role: "developer",
          content: [{
            type: "input_text",
            text: "Você é um analista de inteligência operacional para transporte rodoviário de cargas no Brasil. Gere resumo individual para card visual do Road News. Responda somente com JSON válido, sem markdown. Campos obrigatórios: image_summary, ai_summary, region, country, state, city, highway, category, risk_level, operational_relevance, operational_impact. Use português do Brasil, 1 a 2 frases completas, máximo 300 caracteres no image_summary. Priorize rodovia, km, cidade, estado, região, bloqueio, lentidão, acidente, clima severo, desvio, obra e impacto operacional. Não invente fatos. Se não houver impacto confirmado, deixe claro.",
          }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify(payload) }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 401 || /invalid_api_key|incorrect api key/i.test(detail)) {
      throw new Error("OPENAI_API_KEY inválida ou ainda não atualizada no deploy da Vercel.");
    }
    if (response.status === 429 || /insufficient_quota|quota/i.test(detail)) {
      throw new Error("A OpenAI recusou a chamada por limite de cota ou billing.");
    }
    throw new Error("Não foi possível gerar o resumo com IA agora.");
  }

  const responseData = await response.json();
  const parsed = parseAiJson(extractText(responseData));
  const result = { ...fallback, ...parsed };
  result.image_summary = completeSentence(result.image_summary || result.ai_summary || fallback.image_summary);
  result.ai_summary = completeSentence(result.ai_summary || result.image_summary);
  result.ai_used = true;
  result._usage = responseData.usage || null;
  result._model = model;
  return result;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const account = await assertCanUse(req, "image_generation");
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))).toString("utf8"))
      : {};
    const item = body.item || body;
    if (!item || !clean(item.title)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Notícia inválida para gerar resumo" }));
      return;
    }

    const summary = await generateAiSummary(item);
    if (summary.ai_used) {
      await recordUsage(account, "ai_summary", {
        tokens_input: summary._usage?.input_tokens ?? null,
        tokens_output: summary._usage?.output_tokens ?? null,
        model: summary._model,
        metadata: { source: "news-summary", title: item.title || "" },
      });
    }
    const { _usage, _model, ...publicSummary } = summary;
    json(res, 200, publicSummary);
  } catch (error) {
    const safeMessage = publicErrorMessage(error);
    res.statusCode = /limite|pacote|login|sessao|acesso|recurso|perfil|inativo/i.test(safeMessage) ? 403 : 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: safeMessage }));
  }
};
