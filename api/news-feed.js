const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const { assertCanUse, featureFlagEnabled, featureRule, featureUsage, json, recordUsage, supabaseFetch } = require("./_auth");
const { adminErrorMessage, readJson } = require("./_admin");

const BASE_COLUMNS = "title,url,source,category,published_at,scraped_at,created_at,type,summary";
const OPTIONAL_SETS = [
  "image_summary,ai_summary,operational_relevance,operational_impact,risk_level,region,country,state,city,highway,latitude,longitude,geo_precision",
  "image_summary,ai_summary,operational_relevance,operational_impact,risk_level,region,country,state,city,highway",
  "",
];

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

function normalize(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function readDuration(value) {
  const match = String(value || "").match(/^([\d.]+)s$/);
  return match ? Math.round(Number(match[1])) : 0;
}

function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < String(encoded || "").length) {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

function haversineKm(a, b) {
  const toRad = (value) => value * Math.PI / 180;
  const earthRadius = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(value));
}

function nearestRoutePoint(point, routePoints) {
  if (!routePoints.length) return { distanceKm: Infinity, pointIndex: -1 };
  const stride = Math.max(1, Math.floor(routePoints.length / 500));
  let shortest = Infinity;
  let nearestIndex = -1;
  for (let index = 0; index < routePoints.length; index += stride) {
    const distance = haversineKm(point, routePoints[index]);
    if (distance < shortest) {
      shortest = distance;
      nearestIndex = index;
    }
  }
  return { distanceKm: shortest, pointIndex: nearestIndex };
}

function extractKm(text) {
  const match = clean(text).match(/\bkm\s*[-:]?\s*(\d{1,4}(?:[.,]\d{1,2})?)\b/i);
  return match ? match[1].replace(",", ".") : "";
}

function occurrenceTypeLabel(normalizedText) {
  if (/bloqueio total|interdicao total/.test(normalizedText)) return "Rodovia totalmente bloqueada";
  if (/manifestacao|protesto/.test(normalizedText)) return "Rodovia interditada por manifestação";
  if (/queda de barreira|desabamento/.test(normalizedText)) return "Rodovia interditada por queda de barreira";
  if (/bloqueio|interdi/.test(normalizedText)) return "Rodovia bloqueada";
  if (/acidente|colisao|tombamento|capotamento/.test(normalizedText)) return "Acidente na rodovia";
  if (/obra|manutencao/.test(normalizedText)) return "Obra na rodovia";
  if (/lentidao|congestionamento|pare-e-siga|fila/.test(normalizedText)) return "Lentidão na rodovia";
  if (/tempestade|temporal|alagamento|enchente|granizo/.test(normalizedText)) return "Risco climático na rodovia";
  return "Ocorrência na rodovia";
}

function occurrenceShortLabel(normalizedText) {
  const hasFatality = /\bmort[eosa]s?\b|\bfatal\b|\bobito\b/.test(normalizedText);
  if (/bloqueio total|interdicao total/.test(normalizedText)) return "Bloqueio total";
  if (/manifestacao|protesto/.test(normalizedText)) return "Interdição por manifestação";
  if (/queda de barreira|desabamento/.test(normalizedText)) return "Queda de barreira";
  if (/bloqueio|interdi/.test(normalizedText)) return "Via bloqueada";
  if (/acidente|colisao|tombamento|capotamento/.test(normalizedText)) return hasFatality ? "Acidente com vítima fatal" : "Acidente";
  if (/obra|manutencao/.test(normalizedText)) return "Obra na via";
  if (/lentidao|congestionamento|pare-e-siga|fila/.test(normalizedText)) return "Congestionamento";
  if (/tempestade|temporal|alagamento|enchente|granizo/.test(normalizedText)) return "Risco climático";
  return "Ocorrência";
}

function mapLabel(item, highway, km) {
  const shortLabel = occurrenceShortLabel(normalize(`${item.title} ${item.summary} ${item.category}`));
  const prefixParts = [];
  if (km) prefixParts.push(`KM ${km}`);
  if (highway) prefixParts.push(highway);
  const prefix = prefixParts.join(" · ");
  return prefix ? `${prefix} — ${shortLabel}` : shortLabel;
}

function blockDescription(item, highway, region) {
  const normalizedText = normalize(`${item.title} ${item.summary} ${item.category}`);
  const km = extractKm(`${item.title} ${item.summary}`);
  const parts = [occurrenceTypeLabel(normalizedText)];
  if (highway) parts.push(highway);
  if (km) parts.push(`km ${km}`);
  const base = parts.join(" ");
  return region ? `${base} na região de ${region}` : base;
}

function extractRoads(value) {
  const matches = clean(value).toUpperCase().match(/\b(?:BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF)[-\s]?\d{2,4}\b/g) || [];
  return [...new Set(matches.map((road) => road.replace(/\s+/g, "-")))];
}

function riskForItem(item) {
  const text = normalize(`${item.title} ${item.summary} ${item.category} ${item.risk_level}`);
  if (/bloqueio total|interdicao total|queda de barreira|manifestacao|protesto|saque|roubo de carga/.test(text)) return [4, "Crítico"];
  if (/acidente|bloqueio|interdicao|tombamento|alagamento|tempestade|grande perigo/.test(text)) return [3, "Alto"];
  if (/lentidao|congestionamento|pare-e-siga|obra|chuva forte|fila/.test(text)) return [2, "Médio"];
  return [1, "Baixo"];
}

function categoryForItem(item) {
  const explicit = clean(item.category);
  if (explicit && !/^noticia$/i.test(explicit)) return explicit;
  const text = normalize(`${item.title} ${item.summary} ${item.type}`);
  if (/acidente|colisao|tombamento|capotamento/.test(text)) return "Acidente";
  if (/interdicao|bloqueio|pare-e-siga/.test(text)) return "Interdição";
  if (/obra|manutencao|recuperacao/.test(text)) return "Obra";
  if (/lentidao|congestionamento|fila/.test(text)) return "Trânsito";
  if (/chuva|tempestade|alagamento|inmet|barreira/.test(text)) return "Clima";
  return "Monitoramento";
}

function trafficBreakdown(intervals) {
  const totals = { NORMAL: 0, SLOW: 0, TRAFFIC_JAM: 0 };
  let total = 0;
  for (const interval of intervals || []) {
    const start = Number(interval.startPolylinePointIndex || 0);
    const end = Number(interval.endPolylinePointIndex || start + 1);
    const weight = Math.max(1, end - start);
    const speed = totals[interval.speed] == null ? "NORMAL" : interval.speed;
    totals[speed] += weight;
    total += weight;
  }
  const percent = (value) => total ? Math.round(value / total * 100) : 0;
  return {
    normal_percent: percent(totals.NORMAL),
    slow_percent: percent(totals.SLOW),
    jam_percent: percent(totals.TRAFFIC_JAM),
  };
}

// Indice do primeiro conjunto de colunas aceito pelo schema. Fica em memoria enquanto a funcao
// estiver quente: sem isso, cada carga do feed em um banco sem as colunas de IA fazia 2 consultas
// falhas antes da valida, em cada uma das 4 consultas paralelas.
let workingOptionalSet = 0;

async function fetchRows(suffix) {
  let lastError = null;
  for (let index = workingOptionalSet; index < OPTIONAL_SETS.length; index += 1) {
    const optional = OPTIONAL_SETS[index];
    const columns = optional ? `${BASE_COLUMNS},${optional}` : BASE_COLUMNS;
    try {
      const response = await supabaseFetch(`/rest/v1/news?select=${columns}${suffix}`);
      workingOptionalSet = index;
      return response.json();
    } catch (error) {
      lastError = error;
      if (!/image_summary|ai_summary|operational_relevance|risk_level|latitude|longitude|geo_precision|column|schema|PGRST/i.test(error.message || "")) {
        throw error;
      }
    }
  }
  throw lastError;
}

async function fetchMajorEvents() {
  try {
    const response = await supabaseFetch(
      "/rest/v1/platform_events?event_type=eq.major_logistics_event&select=id,event_type,severity,status,message,metadata,created_at,resolved_at&order=created_at.desc&limit=20"
    );
    return response.json();
  } catch (error) {
    if (/platform_events|relation|schema|PGRST|does not exist/i.test(error.message || "")) return [];
    throw error;
  }
}

function routesApiKey() {
  const value = String(process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "").trim();
  if (!value) throw new Error("GOOGLE_ROUTES_API_KEY_MISSING");
  if (/\s|\.\.\.|…/.test(value)) throw new Error("GOOGLE_ROUTES_API_KEY_INVALID");
  return value;
}

function brazilianAddress(value) {
  const address = clean(value).slice(0, 160);
  return /\bbrasil\b/i.test(address) ? address : `${address}, Brasil`;
}

async function computeRoute(origin, destination, stops) {
  const intermediates = (stops || []).map((stop) => ({ address: brazilianAddress(stop) }));
  const response = await fetch(GOOGLE_ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": routesApiKey(),
      "X-Goog-FieldMask": [
        "routes.distanceMeters",
        "routes.duration",
        "routes.staticDuration",
        "routes.polyline.encodedPolyline",
        "routes.travelAdvisory.speedReadingIntervals",
        "routes.legs.startLocation",
        "routes.legs.endLocation",
        "routes.legs.steps.navigationInstruction.instructions",
        "routes.legs.steps.startLocation",
        "routes.warnings",
        "routes.description",
      ].join(","),
    },
    body: JSON.stringify({
      origin: { address: brazilianAddress(origin) },
      destination: { address: brazilianAddress(destination) },
      ...(intermediates.length ? { intermediates } : {}),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      trafficModel: "BEST_GUESS",
      computeAlternativeRoutes: false,
      optimizeWaypointOrder: false,
      routeModifiers: { avoidTolls: false, avoidHighways: false, avoidFerries: true },
      languageCode: "pt-BR",
      units: "METRIC",
      extraComputations: ["TRAFFIC_ON_POLYLINE"],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = clean(payload?.error?.message || payload?.error?.status || "");
    if (response.status === 403) throw new Error("GOOGLE_ROUTES_API_KEY_DENIED");
    if (response.status === 429) throw new Error("GOOGLE_ROUTES_QUOTA");
    if (response.status === 400 || /address|route|waypoint/i.test(detail)) throw new Error("GOOGLE_ROUTES_ADDRESS");
    throw new Error("GOOGLE_ROUTES_UNAVAILABLE");
  }
  const route = payload.routes?.[0];
  if (!route?.polyline?.encodedPolyline) throw new Error("GOOGLE_ROUTES_NOT_FOUND");
  return route;
}

function routeStopCoordinates(route) {
  const legs = route.legs || [];
  if (legs.length < 2) return [];
  return legs.slice(0, -1).map((leg) => {
    const latLng = leg.endLocation?.latLng;
    return latLng ? { latitude: latLng.latitude, longitude: latLng.longitude } : null;
  }).filter(Boolean);
}

function routeKeywords(origin, destination) {
  const ignored = new Set(["brasil", "estado", "cidade", "rodovia", "origem", "destino"]);
  return [...new Set(normalize(`${origin} ${destination}`).split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !ignored.has(token)))];
}

const ROUTE_SEGMENT_ANCHOR_RADIUS_KM = 15;

function anchorByRoad(road, stepEntries, routePoints) {
  const match = stepEntries.find((entry) => entry.location && entry.roads.includes(road));
  return match ? nearestRoutePoint(match.location, routePoints) : null;
}

function matchRouteNews(items, route, origin, destination) {
  const stepEntries = (route.legs || []).flatMap((leg) => (leg.steps || []).map((step) => {
    const text = clean(step.navigationInstruction?.instructions);
    const latLng = step.startLocation?.latLng;
    return { text, roads: extractRoads(text), location: latLng ? [latLng.latitude, latLng.longitude] : null };
  }));
  const routeRoads = extractRoads(`${route.description || ""} ${stepEntries.map((entry) => entry.text).join(" ")}`);
  const routeRoadSet = new Set(routeRoads);
  const keywords = routeKeywords(origin, destination);
  const routePoints = decodePolyline(route.polyline?.encodedPolyline);
  const now = Date.now();

  const matches = items.map((item) => {
    const text = `${item.title || ""} ${item.summary || ""} ${item.highway || ""} ${item.city || ""} ${item.state || ""} ${item.region || ""}`;
    const itemRoads = extractRoads(text);
    const roadMatch = itemRoads.find((road) => routeRoadSet.has(road));
    const normalized = normalize(text);
    const endpointMatch = keywords.find((keyword) => normalized.includes(keyword));
    const lat = Number(item.latitude);
    const lng = Number(item.longitude);
    const precision = normalize(item.geo_precision);
    const preciseGeo = Number.isFinite(lat) && Number.isFinite(lng) && !/state|estado|approximate_state/.test(precision);
    const nearest = preciseGeo ? nearestRoutePoint([lat, lng], routePoints) : { distanceKm: Infinity, pointIndex: -1 };
    const corridorDistanceKm = nearest.distanceKm;
    const corridorMatch = corridorDistanceKm <= 45;
    if (!roadMatch && !corridorMatch && !endpointMatch) return null;
    const [riskRank, riskLevel] = riskForItem(item);
    const publishedAt = clean(item.published_at || item.scraped_at || item.created_at);
    const ageHours = publishedAt ? Math.max(0, (now - new Date(publishedAt).getTime()) / 36e5) : 999;
    const highway = roadMatch || clean(item.highway) || itemRoads[0] || "";
    const region = clean(item.city || item.region || item.state);
    const segmentTone = riskRank >= 4 ? "critical" : riskRank === 3 ? "attention" : null;
    const geoAnchorable = preciseGeo && corridorDistanceKm <= ROUTE_SEGMENT_ANCHOR_RADIUS_KM;
    // Sem geolocalizacao precisa o suficiente, mas com rodovia em comum com a rota: ancora no ponto
    // onde essa rodovia aparece nas instrucoes do trajeto, para nao deixar de marcar no mapa uma
    // ocorrencia que a analise textual ja cita pelo codigo da rodovia.
    const roadAnchor = !geoAnchorable && roadMatch ? anchorByRoad(roadMatch, stepEntries, routePoints) : null;
    const anchorPointIndex = geoAnchorable ? nearest.pointIndex : roadAnchor ? roadAnchor.pointIndex : -1;
    const anchorable = Boolean(segmentTone) && anchorPointIndex >= 0;
    return {
      title: clean(item.title),
      summary: clean(item.ai_summary || item.summary).slice(0, 360),
      source: clean(item.source),
      category: categoryForItem(item),
      risk_level: riskLevel,
      highway,
      region,
      published_at: publishedAt,
      age_hours: Math.round(ageHours * 10) / 10,
      url: clean(item.url),
      latitude: preciseGeo ? lat : null,
      longitude: preciseGeo ? lng : null,
      match_reason: roadMatch ? `Rodovia ${roadMatch}` : corridorMatch ? `A ${Math.round(corridorDistanceKm)} km do trajeto` : `Localidade ${endpointMatch}`,
      block_description: blockDescription(item, highway, region),
      map_label: mapLabel(item, highway, extractKm(`${item.title} ${item.summary}`)),
      segment_tone: anchorable ? segmentTone : null,
      route_point_index: anchorable ? anchorPointIndex : null,
      _riskRank: riskRank,
    };
  }).filter(Boolean);

  matches.sort((a, b) => (b._riskRank - a._riskRank) || (a.age_hours - b.age_hours));
  return {
    routeRoads,
    alerts: matches.slice(0, 12).map(({ _riskRank, ...item }) => item),
  };
}

function fallbackRouteAnalysis(context) {
  const blocking = context.alerts.filter((item) => /bloqueio|interdi|queda de barreira|manifestacao|protesto/i.test(`${item.title} ${item.summary}`));
  const works = context.alerts.filter((item) => /obra|manutencao|pare-e-siga/i.test(`${item.title} ${item.summary}`));
  const severe = context.alerts.filter((item) => /Crítico|Alto/i.test(item.risk_level));
  const hasJam = context.traffic.jam_percent > 0;
  const hasSlow = context.traffic.slow_percent > 8;
  const status = blocking.length || hasJam ? "validacao_obrigatoria" : severe.length || hasSlow ? "atencao" : "sem_restricao_confirmada";
  const headline = status === "validacao_obrigatoria"
    ? "Validação operacional necessária antes da liberação"
    : status === "atencao"
      ? "Rota disponível para análise com pontos de atenção"
      : "Sem restrição crítica confirmada nas fontes monitoradas";
  const recommendation = blocking.length
    ? `Validar o trecho antes da liberação: ${blocking[0].title}.`
    : hasJam
      ? "Há trecho congestionado indicado pela API. Considere ajustar o horário de saída e valide as condições próximas à liberação."
      : context.alerts.length
        ? "Acompanhe as ocorrências relacionadas durante o deslocamento e confirme mudanças antes da saída."
        : "Não há bloqueio confirmado nos dados analisados. Mantenha a checagem operacional antes da saída, pois as fontes podem ter atraso de atualização.";
  const points = [
    `${context.traffic.normal_percent}% do traçado com fluxo normal, ${context.traffic.slow_percent}% lento e ${context.traffic.jam_percent}% congestionado.`,
    context.alerts.length ? `${context.alerts.length} ocorrência(s) relacionada(s) encontrada(s) nas últimas 24h.` : "Nenhuma ocorrência diretamente relacionada foi encontrada nas últimas 24h.",
    blocking.length ? `${blocking.length} registro(s) com possível bloqueio ou interdição exigem validação.` : "Nenhum bloqueio foi confirmado pelas fontes monitoradas.",
  ];
  if (works.length) points.push(`${works.length} registro(s) de obra, manutenção ou pare-e-siga na rota.`);
  return {
    status,
    headline,
    recommendation,
    confidence: context.alerts.length || context.traffic.slow_percent || context.traffic.jam_percent ? "Média" : "Baixa",
    operational_points: points.slice(0, 4),
    watch_points: context.alerts.slice(0, 3).map((item) => item.title),
    ai_used: false,
  };
}

function extractResponseText(data) {
  if (data.output_text) return data.output_text;
  return (data.output || []).flatMap((output) => output.content || []).map((content) => content.text || "").join("").trim();
}

async function generateRouteAnalysis(context) {
  const fallback = fallbackRouteAnalysis(context);
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey || !apiKey.startsWith("sk-") || /\s|\.\.\.|…/.test(apiKey)) return fallback;
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const compactContext = {
    origin: context.origin,
    destination: context.destination,
    distance_km: Math.round(context.distance_meters / 1000),
    duration_minutes: Math.round(context.duration_seconds / 60),
    delay_minutes: Math.round(context.delay_seconds / 60),
    traffic: context.traffic,
    route_roads: context.route_roads,
    alerts: context.alerts.map(({ title, summary, source, category, risk_level, highway, region, published_at, age_hours, match_reason }) => ({
      title, summary, source, category, risk_level, highway, region, published_at, age_hours, match_reason,
    })),
  };
  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 700,
        text: {
          format: {
            type: "json_schema",
            name: "route_operational_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                status: { type: "string", enum: ["validacao_obrigatoria", "atencao", "sem_restricao_confirmada"] },
                headline: { type: "string" },
                recommendation: { type: "string" },
                confidence: { type: "string", enum: ["Alta", "Média", "Baixa"] },
                operational_points: { type: "array", maxItems: 4, items: { type: "string" } },
                watch_points: { type: "array", maxItems: 3, items: { type: "string" } },
              },
              required: ["status", "headline", "recommendation", "confidence", "operational_points", "watch_points"],
            },
          },
        },
        input: [
          {
            role: "developer",
            content: [{
              type: "input_text",
              text: "Você é analista operacional de transporte rodoviário de cargas no Brasil. Avalie somente os dados fornecidos. Não invente bloqueios, acidentes, desvios, rodovias ou condições. Trânsito vem da API de rota; bloqueios, obras e acidentes vêm das fontes monitoradas. Notícias antigas ou sem relação direta não podem justificar retenção. Não trate ausência de notícia como garantia de rota livre. Escreva em português do Brasil, de forma objetiva para uma liberação de veículo.",
            }],
          },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(compactContext) }] },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const responseData = await response.json();
    const parsed = JSON.parse(extractResponseText(responseData));
    return {
      ...fallback,
      ...parsed,
      ai_used: true,
      _usage: responseData.usage || null,
      _model: model,
    };
  } catch {
    return fallback;
  }
}

const readBody = readJson;

function routePublicError(error) {
  const message = String(error?.message || "");
  if (/GOOGLE_ROUTES_API_KEY_MISSING/.test(message)) return "A análise com trânsito ainda não está configurada. Adicione GOOGLE_ROUTES_API_KEY na Vercel.";
  if (/GOOGLE_ROUTES_API_KEY_INVALID|GOOGLE_ROUTES_API_KEY_DENIED/.test(message)) return "A chave da API de rotas não foi aceita. Revise a configuração na Vercel e faça um novo deploy.";
  if (/GOOGLE_ROUTES_QUOTA/.test(message)) return "A API de rotas atingiu o limite de uso. Tente novamente mais tarde.";
  if (/GOOGLE_ROUTES_ADDRESS|GOOGLE_ROUTES_NOT_FOUND/.test(message)) return "Não foi possível localizar uma rota rodoviária entre a origem e o destino informados.";
  if (/login|sessao|sessão|perfil|inativo|pacote|limite|mapa|acesso|requisicao/i.test(message)) return message;
  return "Não foi possível analisar a rota agora. Tente novamente.";
}

// Mesma regra de assertCanUse("ai_summary_individual"), mas reaproveita a conta ja carregada e nao
// grava evento "blocked_*": a IA aqui e opcional (cai no fallback), nao uma tentativa bloqueada.
async function canUseRouteAi(account) {
  if (!account.authEnabled || account.isPrivileged) return true;
  const pkg = account.activePackage?.packages;
  const rule = featureRule("ai_summary_individual");
  if (!pkg || !featureFlagEnabled(pkg, rule)) return false;
  const limit = Number(pkg[rule.limit] || 0);
  return limit > 0 && (await featureUsage(account.user.id, "ai_summary_individual")) < limit;
}

async function handleRouteAnalysis(req, res) {
  // Minha Rota possui franquia propria e e validada antes de chamar a API do Google.
  const account = await assertCanUse(req, "route_analysis");
  const body = await readBody(req);
  const origin = clean(body.origin);
  const destination = clean(body.destination);
  const stops = (Array.isArray(body.stops) ? body.stops : []).map(clean).filter(Boolean).slice(0, 8);
  if (origin.length < 3 || destination.length < 3 || origin.length > 160 || destination.length > 160) {
    json(res, 400, { error: "Informe uma origem e um destino válidos." });
    return;
  }
  if (stops.some((stop) => stop.length < 3 || stop.length > 160)) {
    json(res, 400, { error: "Informe paradas válidas ou remova os campos vazios." });
    return;
  }
  if (normalize(origin) === normalize(destination)) {
    json(res, 400, { error: "Origem e destino precisam ser diferentes." });
    return;
  }

  const route = await computeRoute(origin, destination, stops);
  const since24h = encodeURIComponent(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const recentRows = await fetchRows(`&created_at=gte.${since24h}&order=created_at.desc&limit=350`);
  const matched = matchRouteNews(recentRows, route, origin, destination);
  const intervals = route.travelAdvisory?.speedReadingIntervals || [];
  const durationSeconds = readDuration(route.duration);
  const staticDurationSeconds = readDuration(route.staticDuration);
  const context = {
    origin,
    destination,
    distance_meters: Number(route.distanceMeters || 0),
    duration_seconds: durationSeconds,
    static_duration_seconds: staticDurationSeconds,
    delay_seconds: Math.max(0, durationSeconds - staticDurationSeconds),
    traffic: trafficBreakdown(intervals),
    route_roads: matched.routeRoads,
    alerts: matched.alerts,
  };

  const aiAllowed = await canUseRouteAi(account);
  const analysis = aiAllowed ? await generateRouteAnalysis(context) : fallbackRouteAnalysis(context);

  await recordUsage(account, "route_analysis", {
    metadata: {
      origin,
      destination,
      stops,
      alerts: matched.alerts.length,
      ai_used: Boolean(analysis.ai_used),
    },
  });
  if (analysis.ai_used) {
    await recordUsage(account, "ai_summary_individual", {
      tokens_input: analysis._usage?.input_tokens ?? null,
      tokens_output: analysis._usage?.output_tokens ?? null,
      model: analysis._model,
      metadata: { source: "route-analysis", origin, destination },
    });
  }

  const { _usage, _model, ...publicAnalysis } = analysis;
  json(res, 200, {
    route: {
      provider: "Google Routes",
      origin,
      destination,
      stops,
      stop_points: routeStopCoordinates(route),
      distance_meters: context.distance_meters,
      duration_seconds: context.duration_seconds,
      static_duration_seconds: context.static_duration_seconds,
      delay_seconds: context.delay_seconds,
      polyline: route.polyline.encodedPolyline,
      traffic_intervals: intervals,
      traffic: context.traffic,
      roads: matched.routeRoads,
      warnings: (route.warnings || []).map(clean).filter(Boolean),
      updated_at: new Date().toISOString(),
    },
    alerts: matched.alerts,
    analysis: {
      ...publicAnalysis,
      ai_available: aiAllowed,
    },
    data_window_hours: 24,
  });
}

async function handleNewsFeed(req, res) {
  const account = await assertCanUse(req, "news_query");
  const pkg = account.activePackage?.packages || null;
  const monthlyNewsLimit = !account.authEnabled || account.isPrivileged ? 700 : Number(pkg?.monthly_news_limit || 0);
  const canAccessMap = !account.authEnabled || account.isPrivileged || featureFlagEnabled(pkg, featureRule("map_access"));

  const since24h = encodeURIComponent(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const since30d = encodeURIComponent(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  const cap = Math.max(1, Math.min(monthlyNewsLimit, 700));
  const [latestNews, latestInmet, recentRows, mapRows, majorEvents, countResponse] = await Promise.all([
    fetchRows(`&order=created_at.desc&limit=${Math.min(50, cap)}`),
    fetchRows(`&or=(source.ilike.*INMET*,type.eq.INMET)&order=published_at.desc&limit=${Math.min(20, cap)}`),
    fetchRows(`&created_at=gte.${since24h}&order=created_at.desc&limit=${Math.min(300, cap)}`),
    canAccessMap ? fetchRows(`&created_at=gte.${since30d}&order=created_at.desc&limit=${cap}`) : Promise.resolve([]),
    fetchMajorEvents(),
    supabaseFetch("/rest/v1/news?select=id", { method: "HEAD", headers: { Prefer: "count=exact" } }),
  ]);

  await recordUsage(account, "news_query", {
    metadata: {
      loaded_latest: latestNews.length,
      loaded_recent: recentRows.length,
      loaded_map: mapRows.length,
    },
  });

  const total = Number((countResponse.headers.get("content-range") || "0/0").split("/")[1] || 0);
  json(res, 200, { latestNews, latestInmet, recentRows, mapRows, majorEvents, total });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") {
      await handleRouteAnalysis(req, res);
      return;
    }
    if (req.method === "GET") {
      await handleNewsFeed(req, res);
      return;
    }
    json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    const message = req.method === "POST"
      ? routePublicError(error)
      : adminErrorMessage(error) || "Nao foi possivel carregar noticias.";
    // Falha de Google/OpenAI/Supabase nao e "acesso negado": so erros de conta/pacote viram 403.
    const status = /origem|destino|diferentes|paradas|requisicao/i.test(message) ? 400
      : /login|sess|perfil|inativo|pacote|limite|mapa|acesso|permiss/i.test(message) ? 403
        : 500;
    json(res, status, { error: message });
  }
};
