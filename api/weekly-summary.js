const SUPABASE_URL = "https://vdyilgbqxnrwqgoairat.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_de-5vYgBsDImP6s8Y-Sc9Q_xqhcZsnn";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";

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

function roadFromText(text) {
  const match = clean(text).match(/\b((?:BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF)[-\s]?\d{2,4})\b/i);
  return match ? match[1].replace(/\s+/g, "-").toUpperCase() : "";
}

const STATES = [
  ["Acre", "AC"], ["Alagoas", "AL"], ["Amapa", "AP"], ["Amazonas", "AM"], ["Bahia", "BA"], ["Ceara", "CE"],
  ["Distrito Federal", "DF"], ["Espirito Santo", "ES"], ["Goias", "GO"], ["Maranhao", "MA"], ["Mato Grosso", "MT"],
  ["Mato Grosso do Sul", "MS"], ["Minas Gerais", "MG"], ["Para", "PA"], ["Paraiba", "PB"], ["Parana", "PR"],
  ["Pernambuco", "PE"], ["Piaui", "PI"], ["Rio de Janeiro", "RJ"], ["Rio Grande do Norte", "RN"],
  ["Rio Grande do Sul", "RS"], ["Rondonia", "RO"], ["Roraima", "RR"], ["Santa Catarina", "SC"],
  ["Sao Paulo", "SP"], ["Sergipe", "SE"], ["Tocantins", "TO"],
];

function normalizeForMatch(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function regionFromText(text) {
  const raw = clean(text);
  const normalized = normalizeForMatch(raw);
  const cityUf = raw.match(/\b([A-ZÁÂÃÉÊÍÓÔÕÚÇ][\wÁÂÃÉÊÍÓÔÕÚÇáâãéêíóôõúç.'-]+(?:\s+[A-ZÁÂÃÉÊÍÓÔÕÚÇ][\wÁÂÃÉÊÍÓÔÕÚÇáâãéêíóôõúç.'-]+){0,3})\/([A-Z]{2})\b/);
  if (cityUf) return `${cityUf[1]}/${cityUf[2]}`;
  for (const [name, uf] of STATES) {
    if (normalized.includes(normalizeForMatch(name))) return name;
    if (new RegExp(`\\b${uf}\\b`, "i").test(raw)) return uf;
  }
  return "";
}

function categoryFromText(item) {
  const explicit = clean(item.category);
  if (explicit && !/^noticia$/i.test(explicit)) return explicit;
  const text = normalizeForMatch(`${item.title} ${item.summary}`);
  if (/roubo|saque|assalto|carga/.test(text)) return "Roubo de carga";
  if (/manifestacao|protesto|bloqueio por manifestantes/.test(text)) return "Manifestacao";
  if (/acidente|colisao|batida|tombamento|capotamento/.test(text)) return "Acidente";
  if (/bloqueio|interdicao|interdita|pista bloqueada|pare-e-siga/.test(text)) return "Interdicao";
  if (/lentidao|congestionamento|fila|trafego lento/.test(text)) return "Lentidao";
  if (/tempestade|chuva|vento|granizo|inmet|alagamento|barreira/.test(text)) return "Clima";
  if (/obra|servico|manutencao|recuperacao/.test(text)) return "Obra";
  if (/fiscalizacao|operacao policial|prf/.test(text)) return "Fiscalizacao";
  return "Monitoramento";
}

function riskFromText(item) {
  const text = normalizeForMatch(`${item.title} ${item.summary} ${item.category} ${item.type}`);
  if (/roubo de carga|saque|bloqueio total|interdicao total|manifestacao/.test(text)) return "Critico";
  if (/acidente|bloqueio|interdicao|tempestade|perigo|queda de barreira|tombamento/.test(text)) return "Alto";
  if (/lentidao|chuva forte|obra|interdicao parcial|congestionamento|pare-e-siga/.test(text)) return "Medio";
  return "Baixo";
}

function riskRank(value) {
  return { Critico: 4, Alto: 3, Medio: 2, Baixo: 1 }[value] || 0;
}

function shorten(value, limit = 160) {
  const text = clean(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).replace(/\s+\S*$/, "")}...`;
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
  const operational = context.items.filter((item) => /acidente|bloqueio|interdi|obra|lentid|congestion|desvio|pare-e-siga|alagamento|queda|tombamento/i.test(`${item.title} ${item.summary}`));
  const inmet = context.items.filter((item) => item.type === "INMET");
  return {
    headline: "Resumo semanal rodoviario",
    executive_summary: `Foram analisados ${context.total} registros dos ultimos ${context.period_days} dias. As rodovias mais citadas foram ${roads}. As fontes com maior volume foram ${sources}.`,
    risk_level: context.total ? "Atencao" : "Normal",
    indicators: context.indicators,
    weekly_points: context.weekly_points,
    top_occurrences: context.top_occurrences,
    featured_regions: context.regions.slice(0, 6).map(([region, count]) => `${region} (${count})`),
    featured_roads: context.roads.slice(0, 6).map(([road, count]) => `${road} (${count})`),
    featured_categories: context.category_counts.slice(0, 6).map(([category, count]) => `${category} (${count})`),
    operational_points: operational.slice(0, 6).map((item) => item.title).filter(Boolean),
    critical_roads: context.roads.slice(0, 5).map(([road, count]) => ({
      road,
      why_critical: `Rodovia citada em ${count} registro(s) no periodo.`,
      blockage_status: "Nao confirmado nos dados analisados.",
      works_status: "Nao confirmado nos dados analisados.",
      evidence: "Volume de mencoes no periodo.",
    })),
    inmet_regions: inmet.slice(0, 5).map((item) => ({
      region: "Regioes citadas no aviso INMET",
      danger_reason: item.title || "Alerta meteorologico",
      rainfall_or_wind: (item.summary || "").slice(0, 220),
      attention_required: "Avaliar impacto em rotas que cruzam a area do alerta.",
      evidence: item.source || "INMET",
    })),
    blockages_or_works: context.items
      .filter((item) => /bloqueio|interdi|obra|pare-e-siga/i.test(`${item.title} ${item.summary}`))
      .slice(0, 6)
      .map((item) => item.title),
    detours: ["Nao ha desvio alternativo confirmado nos dados analisados."],
    weather_notes: inmet.slice(0, 5).map((item) => `${item.title}: ${(item.summary || "").slice(0, 220)}`),
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
  // Enrich locally so the report stays useful even when the AI fallback is used.
  const compact = items.slice(0, 120).map((item) => {
    const title = clean(item.title);
    const summary = clean(item.summary).slice(0, 700);
    const merged = `${title} ${summary}`;
    return {
      title,
      source: clean(item.source),
      type: clean(item.type),
      category: categoryFromText(item),
      risk_level: riskFromText(item),
      region: regionFromText(merged),
      road: roadFromText(merged),
      published_at: clean(item.published_at || item.created_at),
      scraped_at: clean(item.scraped_at),
      summary,
      short_summary: shorten(summary || title),
      url: clean(item.url),
    };
  });
  const roads = countBy(compact, (item) => item.road).slice(0, 10);
  const regions = countBy(compact, (item) => item.region).slice(0, 10);
  const riskCounts = countBy(compact, (item) => item.risk_level);
  const categoryCounts = countBy(compact, (item) => item.category);
  const topOccurrences = [...compact]
    .filter((item) => item.title)
    .sort((a, b) => (riskRank(b.risk_level) - riskRank(a.risk_level)) || Number(Boolean(b.road || b.region)) - Number(Boolean(a.road || a.region)))
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      region: item.region,
      road: item.road,
      category: item.category,
      risk: item.risk_level,
      source: item.source,
      date: item.published_at || item.scraped_at,
      url: item.url,
      short_summary: item.short_summary,
    }));
  const highCritical = compact.filter((item) => riskRank(item.risk_level) >= 3).length;
  const topSource = countBy(items, (item) => clean(item.source) || "Sem fonte")[0]?.[0] || "Sem fonte";
  const indicators = {
    total_news: items.length,
    high_critical_alerts: highCritical,
    impacted_regions: regions.length,
    cited_roads: roads.length,
    top_source: topSource,
    updated_at: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  };
  const weeklyPoints = [
    `Foram analisados ${items.length} registros nos ultimos 7 dias, com ${highCritical} alerta(s) de risco alto ou critico.`,
    roads.length ? `Rodovias mais citadas: ${roads.slice(0, 3).map(([road]) => road).join(", ")}.` : "Nao houve rodovia dominante identificada nos registros.",
    regions.length ? `Regioes com maior recorrencia: ${regions.slice(0, 3).map(([region]) => region).join(", ")}.` : `Fonte mais recorrente no periodo: ${topSource}.`,
  ];
  return {
    period_days: 7,
    generated_at: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    total: items.length,
    sources: countBy(items, (item) => clean(item.source) || "Sem fonte").slice(0, 12),
    types: countBy(items, (item) => clean(item.type) || "Noticia").slice(0, 8),
    roads,
    regions,
    risk_counts: riskCounts,
    category_counts: categoryCounts,
    indicators,
    weekly_points: weeklyPoints,
    top_occurrences: topOccurrences,
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

async function generateAiSummary(context) {
  const apiKey = openAiApiKey();
  if (!apiKey) return fallbackSummary(context);

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      max_output_tokens: 2400,
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Voce e um analista operacional de risco rodoviario do Road News. O resumo semanal e estrategico, para tendencia e planejamento, nao operacao em tempo real. Responda somente com JSON valido contendo: headline, executive_summary, risk_level, indicators, weekly_points, top_occurrences, featured_regions, featured_roads, featured_categories, operational_points, critical_roads, inmet_regions, blockages_or_works, detours, weather_notes, recommendations. top_occurrences deve ter no maximo 5 objetos com title, region, road, category, risk, source, date, url, short_summary. weekly_points e recommendations devem ter no maximo 3 bullets cada. critical_roads deve ser array de objetos com road, why_critical, blockage_status, works_status, evidence. inmet_regions deve ser array de objetos com region, danger_reason, rainfall_or_wind, attention_required, evidence. Analise concentracao de acidentes, interdições, clima severo, roubo de carga e manifestacoes. Use portugues do Brasil, tom executivo, frases objetivas e nao invente fatos fora dos dados.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Gere um relatório executivo semanal compacto para clientes de transporte rodoviario de cargas. Nao liste todas as noticias. Responda: principais riscos da semana, estados/regioes com mais ocorrencias, rodovias mais citadas, categorias mais frequentes, concentracao de acidentes/interdicoes/clima severo/roubo de carga/manifestacoes e atencao operacional para os proximos dias. Use top ocorrencias apenas como exemplos relevantes, priorizando risco critico/alto, rodovia, regiao e impacto operacional. Para INMET, informe regioes em perigo, motivo do perigo e chuva/vento quando existir. Informe desvios apenas se houver dado explicito. Nao transforme volume de noticia em risco se nao houver indicio operacional.\n${JSON.stringify(context)}`,
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
