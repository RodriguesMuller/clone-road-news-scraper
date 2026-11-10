const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";
const { assertCanUse, finalizeReservation, json, releaseUsage, reserveUsage, supabaseFetch } = require("./_auth");
const { buildWeeklyBrief } = require("./_weekly_brief");
const { repairNewsItem } = require("./_text_repair");

// Semana atual + semana anterior (para o comparativo dos números).
async function fetchTwoWeeks() {
  const since = encodeURIComponent(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());
  const columns = "title,url,source,category,published_at,scraped_at,created_at,type,summary";
  const response = await supabaseFetch(`/rest/v1/news?select=${columns}&created_at=gte.${since}&order=created_at.desc&limit=800`);
  return (await response.json()).map(repairNewsItem);
}

function extractText(data) {
  if (data.output_text) return data.output_text;
  let text = "";
  for (const output of data.output || []) {
    for (const content of output.content || []) text += content.text || "";
  }
  return text.trim();
}

function parseAiJson(text) {
  const raw = String(text || "").replace(/^```(?:json)?|```$/gim, "").trim();
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
    throw new Error("OPENAI_API_KEY invalida na Vercel. Cole a chave completa da OpenAI, sem reticencias, sem 'Bearer', sem aspas e sem quebra de linha.");
  }
  if (!value.startsWith("sk-")) {
    throw new Error("OPENAI_API_KEY invalida na Vercel. A chave deve comecar com sk- e deve ser colada completa.");
  }
  return value;
}

// Só os fatos já calculados vão para a IA: ela redige a abertura, não decide nada.
function factsForAi(brief) {
  const pick = (list, n) => list.slice(0, n).map(({ url, worst_url, ...rest }) => rest);
  return {
    period: brief.period,
    verdict: brief.verdict,
    numbers: brief.numbers,
    watchlist: pick(brief.watchlist, 6),
    hotspots: pick(brief.hotspots, 3),
    cargo_security: pick(brief.cargo_security, 3),
    weather: brief.weather.slice(0, 3),
    actions: brief.actions,
  };
}

async function polishWithAi(brief) {
  const apiKey = openAiApiKey();
  if (!apiKey) return { brief, ai: null };
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_output_tokens: 500,
      input: [
        {
          role: "developer",
          content: [{
            type: "input_text",
            text: "Você redige a abertura do resumo semanal do Road News para gestores de frota de transporte rodoviário de cargas. Use SOMENTE os fatos do JSON; não invente rodovia, data, número ou causa. Escreva em português do Brasil, tom direto de torre de controle. Responda apenas JSON válido com: headline (até 90 caracteres, diz o que mais pesa na semana) e executive_summary (2 a 3 frases, até 420 caracteres: o que aconteceu, o que vem nos próximos dias e a principal ação). Não repita a lista de números inteira.",
          }],
        },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(factsForAi(brief)) }] },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 401 || /invalid_api_key|incorrect api key/i.test(detail)) {
      throw new Error("OPENAI_API_KEY invalida ou ainda nao atualizada no deploy da Vercel. Revogue a chave exposta, crie uma nova, atualize a variavel e faca redeploy sem cache.");
    }
    // Qualquer outra falha da IA: o resumo determinístico já está completo.
    return { brief, ai: null };
  }
  const data = await response.json();
  try {
    const parsed = parseAiJson(extractText(data));
    const headline = String(parsed.headline || "").trim();
    const summary = String(parsed.executive_summary || "").trim();
    if (!headline || !summary) return { brief, ai: { usage: data.usage || null, model } };
    return {
      brief: { ...brief, headline: headline.slice(0, 120), executive_summary: summary.slice(0, 520) },
      ai: { usage: data.usage || null, model },
    };
  } catch {
    return { brief, ai: { usage: data.usage || null, model } };
  }
}

function publicErrorMessage(error) {
  const message = String(error?.message || "");
  if (/login|sessao|sessão|perfil|inativo|pacote|recurso|limite|acesso|senha temporaria|OPENAI_API_KEY/i.test(message)) return message;
  return "Nao foi possivel gerar o resumo semanal. Tente novamente.";
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const account = await assertCanUse(req, "ai_summary_weekly");
    const items = await fetchTwoWeeks();
    const generatedAt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const context = { period_days: 7, generated_at: generatedAt, total: 0 };
    if (!items.length) {
      json(res, 200, { summary: null, context });
      return;
    }
    const base = buildWeeklyBrief(items);
    // A IA só redige a abertura: reserva a geração antes; sem saldo (corrida) segue com o texto automático.
    let reserved = false;
    if (String(process.env.OPENAI_API_KEY || "").trim()) {
      try {
        await reserveUsage(account, "ai_summary_weekly", "ai_summary_weekly", { source: "weekly-summary" });
        reserved = true;
      } catch {
        reserved = false;
      }
    }
    let result = { brief: base, ai: null };
    try {
      if (reserved) result = await polishWithAi(base);
    } catch (error) {
      await releaseUsage(account);
      throw error;
    }
    const { brief, ai } = result;
    if (ai) {
      await finalizeReservation(account, {
        tokens_input: ai.usage?.input_tokens ?? null,
        tokens_output: ai.usage?.output_tokens ?? null,
        model: ai.model,
        metadata: { source: "weekly-summary", events: brief.coverage.events },
      });
    } else if (reserved) {
      await releaseUsage(account);
    }
    json(res, 200, { summary: { ...brief, ai_used: Boolean(ai) }, context: { ...context, total: brief.coverage.analyzed } });
  } catch (error) {
    const safeMessage = publicErrorMessage(error);
    const status = /limite|pacote|login|sessao|sessão|acesso|recurso|perfil|inativo|senha temporaria/i.test(safeMessage) ? 403 : 500;
    json(res, status, { error: safeMessage });
  }
};
