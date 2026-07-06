const SUPABASE_URL = "https://vdyilgbqxnrwqgoairat.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_de-5vYgBsDImP6s8Y-Sc9Q_xqhcZsnn";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function roadFromText(text) {
  const match = clean(text).match(/\b((?:BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF)[-\s]?\d{2,4})\b/i);
  return match ? match[1].replace(/\s+/g, "-").toUpperCase() : "";
}

function countBy(items, getter) {
  const counts = new Map();
  for (const item of items) {
    const key = getter(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function fallbackSummary(context) {
  const roads = context.roads.slice(0, 5).map(([road, count]) => `${road} (${count})`).join(", ") || "sem rodovias identificadas";
  const sources = context.sources.slice(0, 4).map(([source, count]) => `${source} (${count})`).join(", ") || "sem fontes recentes";
  return {
    headline: "Resumo semanal rodoviario",
    executive_summary: `Foram analisados ${context.total} registros dos ultimos ${context.period_days} dias. As rodovias mais citadas foram ${roads}. As fontes com maior volume foram ${sources}.`,
    risk_level: context.total ? "Atencao" : "Normal",
    operational_points: context.items.slice(0, 5).map((item) => item.title).filter(Boolean),
    critical_roads: context.roads.slice(0, 5).map(([road]) => road),
    weather_notes: context.items.filter((item) => item.type === "INMET").slice(0, 4).map((item) => item.title),
    recommendations: [
      "Monitorar as rodovias mais citadas antes do planejamento operacional.",
      "Priorizar ocorrencias com acidente, bloqueio, interdicao e alerta meteorologico.",
    ],
  };
}

async function fetchWeeklyItems() {
  const since = encodeURIComponent(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  const columns = "title,url,source,category,published_at,scraped_at,created_at,type,summary";
  const url = `${SUPABASE_URL}/rest/v1/news?select=${columns}&created_at=gte.${since}&order=created_at.desc&limit=220`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

function buildContext(items) {
  const compact = items.slice(0, 120).map((item) => ({
    title: clean(item.title),
    source: clean(item.source),
    type: clean(item.type),
    published_at: clean(item.published_at || item.created_at),
    summary: clean(item.summary).slice(0, 700),
    url: clean(item.url),
  }));
  return {
    period_days: 7,
    generated_at: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    total: items.length,
    sources: countBy(items, (item) => clean(item.source) || "Sem fonte").slice(0, 12),
    types: countBy(items, (item) => clean(item.type) || "Noticia").slice(0, 8),
    roads: countBy(items, (item) => roadFromText(`${item.title} ${item.summary}`)).slice(0, 10),
    items: compact,
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

async function generateAiSummary(context) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallbackSummary(context);

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      max_output_tokens: 1600,
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Voce e um analista operacional de risco rodoviario da Overhaul. Responda somente com JSON valido contendo: headline, executive_summary, risk_level, operational_points, critical_roads, weather_notes, recommendations. Use portugues do Brasil, tom executivo e nao invente fatos fora dos dados.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Gere um resumo semanal focado em impacto operacional com base nestes registros:\n${JSON.stringify(context)}`,
            },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const raw = extractText(await response.json()).replace(/^```(?:json)?|```$/gim, "").trim();
  try {
    return { ...fallbackSummary(context), ...JSON.parse(raw) };
  } catch {
    return { ...fallbackSummary(context), executive_summary: raw };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  try {
    const items = await fetchWeeklyItems();
    const context = buildContext(items);
    const summary = await generateAiSummary(context);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ summary, context }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error.message || "Erro ao gerar resumo semanal" }));
  }
};
