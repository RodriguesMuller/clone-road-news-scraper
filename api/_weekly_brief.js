/*
 * Resumo semanal para o gestor de frota (determinístico).
 *
 * Responde, nesta ordem, o que o gestor precisa decidir na segunda-feira:
 *   1. Veredito da semana e números contra a semana anterior.
 *   2. Atenção para os próximos dias: bloqueio programado, greve anunciada, trecho que pode
 *      seguir fechado, aviso INMET de Perigo.
 *   3. Trechos mais críticos (pontuados por risco, não por volume de notícia) e o que fazer.
 *   4. Segurança da carga (roubo de carga).
 *   5. Clima por estado (INMET).
 *   6. Ações recomendadas e principais ocorrências.
 *
 * O mesmo cálculo existe em Python para o e-mail (scraper/weekly_brief.py); os dois são
 * validados pelo mesmo par fixture/esperado em tests/fixtures/.
 */
const RoadRisk = require("../public/risk.js");

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_ZONE = "America/Sao_Paulo";

const UF_CODES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const STATE_NAMES = [
  ["mato grosso do sul", "MS"], ["rio grande do norte", "RN"], ["rio grande do sul", "RS"], ["distrito federal", "DF"],
  ["espirito santo", "ES"], ["rio de janeiro", "RJ"], ["santa catarina", "SC"], ["minas gerais", "MG"], ["mato grosso", "MT"],
  ["pernambuco", "PE"], ["tocantins", "TO"], ["sao paulo", "SP"], ["maranhao", "MA"], ["rondonia", "RO"], ["amazonas", "AM"],
  ["alagoas", "AL"], ["paraiba", "PB"], ["roraima", "RR"], ["sergipe", "SE"], ["parana", "PR"], ["bahia", "BA"],
  ["ceara", "CE"], ["goias", "GO"], ["piaui", "PI"], ["amapa", "AP"], ["acre", "AC"],
];
const NAMED_ROADS = [
  ["regis bittencourt", "Régis Bittencourt"], ["raposo tavares", "Raposo Tavares"], ["castello branco", "Castello Branco"],
  ["castelo branco", "Castello Branco"], ["fernao dias", "Fernão Dias"], ["washington luis", "Washington Luís"],
  ["carvalho pinto", "Carvalho Pinto"], ["ayrton senna", "Ayrton Senna"], ["anhanguera", "Anhanguera"],
  ["bandeirantes", "Bandeirantes"], ["imigrantes", "Imigrantes"], ["anchieta", "Anchieta"], ["tamoios", "Tamoios"],
  ["rio-santos", "Rio-Santos"], ["rodoanel", "Rodoanel"], ["dutra", "Via Dutra"], ["ponte rio-niteroi", "Ponte Rio-Niterói"],
];
const STOPWORDS = new Set(["para", "apos", "entre", "durante", "sobre", "deixa", "deixam", "nesta", "neste", "esta", "este", "rodovia", "pela", "pelo", "como", "mais", "fica", "ficam", "veja", "video", "foto", "fotos", "trecho", "regiao", "cidade"]);

// Rótulo e ação por tipo de ocorrência (kind vem de public/risk.js).
const KIND = {
  block_total: ["Bloqueio total", "Trecho indisponível: use desvio ou aguarde a liberação confirmada."],
  strike_block: ["Manifestação com bloqueio", "Trecho indisponível: use desvio e confirme a liberação antes de passar."],
  block_planned: ["Bloqueio programado", "Planeje o desvio ou ajuste o horário de saída para fora da janela informada."],
  strike: ["Paralisação/manifestação", "Confirme a situação antes de despachar e tenha rota alternativa definida."],
  cargo_theft: ["Roubo de carga", "Evite paradas no trecho, reforce rastreamento/escolta e prefira trafegar de dia."],
  cargo_theft_police: ["Ação policial contra roubo de carga", "Trecho visado: mantenha protocolo de segurança reforçado."],
  structural: ["Dano na pista", "Confirme condição da via e restrição de peso antes de programar a passagem."],
  hazmat: ["Acidente com produto perigoso", "Interdição longa é provável: tenha rota alternativa definida."],
  heavy_vehicle: ["Veículo pesado tombado/incendiado", "Interdições de faixa recorrentes: inclua margem de tempo na janela de entrega."],
  fatal_accident: ["Acidente com vítima fatal", "A perícia interdita por horas: confirme a liberação antes de passar."],
  accident_partial: ["Acidente com interdição parcial", "Fila e atraso prováveis: inclua margem de tempo."],
  accident_jam: ["Acidente com congestionamento", "Fila extensa: ajuste o horário de saída."],
  accident: ["Acidente", "Possível lentidão pontual."],
  block_partial: ["Bloqueio parcial", "Fila e atraso prováveis: inclua margem de tempo."],
  block_partial_planned: ["Interdição parcial programada", "Inclua margem de tempo na janela informada."],
  jam: ["Congestionamento extenso", "Ajuste o horário de saída."],
  weather: ["Clima severo", "Avalie adiar saídas nos horários de chuva forte."],
  visibility: ["Neblina/baixa visibilidade", "Evite trafegar de madrugada e no início da manhã."],
  fire: ["Incêndio próximo à via", "Possível fumaça e lentidão."],
  small_fire: ["Princípio de incêndio", "Sem impacto prolongado esperado."],
  traffic: ["Lentidão/obra", "Inclua margem de tempo."],
  intl: ["Corredor internacional", "Acompanhe preço do diesel e do frete."],
  inmet_red: ["Aviso INMET Grande Perigo", "Adie saídas na área do aviso."],
  inmet_orange: ["Aviso INMET Perigo", "Avalie adiar saídas nos horários de tempestade."],
  inmet_yellow: ["Aviso INMET Perigo Potencial", "Atenção a chuva e vento."],
  inmet: ["Aviso INMET", "Atenção ao clima."],
};
const WEIGHT = { 4: 8, 3: 4, 2: 1, 1: 0 };

function clean(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isInmet(item) {
  return item.type === "INMET" || /inmet/i.test(item.source || "");
}

function stripOutlet(title, inmet) {
  return inmet ? title : title.replace(/\s[-–—|]\s[^-–—|]{2,60}$/, "").trim();
}

function itemTime(item) {
  for (const value of [item.created_at, item.published_at, item.scraped_at]) {
    const t = Date.parse(value || "");
    if (Number.isFinite(t)) return t;
  }
  return null;
}

function dayMonth(t) {
  if (t === null) return "";
  return new Date(t).toLocaleDateString("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" });
}

// [ano, mês, dia] no fuso de Brasília.
function ymd(t) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(t)).map((part) => [part.type, part.value]));
  return [Number(parts.year), Number(parts.month), Number(parts.day)];
}

// Data agendada citada no título ("nesta terça (10)", "dia 12", "15/11"), como [ano, mês, dia].
// Sem número explícito, retorna null (o bloqueio continua na lista, para o gestor conferir).
function scheduledDate(title, publishedAt) {
  if (publishedAt === null) return null;
  const norm = RoadRisk.normalize(title);
  const explicit = norm.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  const day = explicit ? Number(explicit[1]) : Number((norm.match(/\((\d{1,2})\)/) || norm.match(/\bdia (\d{1,2})\b/) || [])[1] || 0);
  if (!day || day > 31) return null;
  let [year, month, pubDay] = ymd(publishedAt);
  if (explicit) {
    const m = Number(explicit[2]);
    if (m < 1 || m > 12) return null;
    if (m < month) year += 1;
    month = m;
  } else if (day < pubDay - 3) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return [year, month, day];
}

function compareYmd(a, b) {
  return (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
}

function roadOf(raw, norm) {
  const code = raw.match(/\b((?:BR|ERS|RSC|MGC|AMG|PRC|SPA|SPI|AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO))[-\s]?(\d{2,4})\b/i);
  if (code) return `${code[1].toUpperCase()}-${code[2]}`;
  const named = NAMED_ROADS.find(([key]) => norm.includes(key));
  return named ? named[1] : "";
}

function ufOf(raw, norm, road) {
  const cityUf = raw.match(/\b[A-ZÀ-Ý][\wÀ-ÿ.'-]+\/([A-Z]{2})\b/);
  if (cityUf && UF_CODES.includes(cityUf[1])) return cityUf[1];
  if (/(^|[^\p{L}])Pará(?!\p{L})/u.test(raw)) return "PA";
  const state = STATE_NAMES.find(([name]) => new RegExp(`\\b${name}\\b`).test(norm));
  if (state) return state[1];
  // Primeira sigla que seja UF de fato ("na BR-163 em Sinop, MT" -> MT, não "BR").
  for (const abbr of raw.matchAll(/(?:,|\(|\s-\s|\bem |\bno |\bna |\bdo |\bda )\s?([A-Z]{2})\b/g)) {
    if (UF_CODES.includes(abbr[1])) return abbr[1];
  }
  const prefix = road.match(/^([A-Z]{2})-/);
  if (prefix && prefix[1] !== "BR" && UF_CODES.includes(prefix[1])) return prefix[1];
  return "";
}

function tokensOf(norm) {
  return new Set(norm.split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !STOPWORDS.has(word)));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const word of a) if (b.has(word)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function enrich(item) {
  const inmet = isInmet(item);
  const title = stripOutlet(clean(item.title), inmet);
  const summary = clean(item.summary);
  const raw = `${title} ${summary}`;
  const norm = RoadRisk.normalize(raw);
  const risk = RoadRisk.classifyRisk({ ...item, title, summary });
  const road = inmet ? "" : roadOf(raw, norm);
  return {
    title,
    url: clean(item.url),
    source: clean(item.source),
    inmet,
    time: itemTime(item),
    risk,
    road,
    uf: ufOf(raw, norm, road),
    tokens: tokensOf(RoadRisk.normalize(title)),
  };
}

function byTimeThenTitle(a, b) {
  if ((a.time === null) !== (b.time === null)) return a.time === null ? 1 : -1;
  if (a.time !== b.time) return a.time - b.time;
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
}

// Agrupa a mesma ocorrência noticiada por vários veículos.
function clusterEvents(items) {
  const clusters = [];
  for (const item of [...items].sort(byTimeThenTitle)) {
    const key = item.road || (item.uf ? `uf:${item.uf}` : "");
    // Mesma rodovia + mesmo tipo em 24h, ou títulos parecidos em 48h = mesma ocorrência.
    const match = clusters.find((cluster) => {
      if (cluster.key !== key) return false;
      const gap = Math.abs((item.time ?? 0) - (cluster.last ?? 0));
      // Rodovias federais cruzam estados: UF diferente (ou desconhecida) não pode juntar só pelo tipo.
      if (item.uf && cluster.rep.uf && item.uf !== cluster.rep.uf) return false;
      if (item.road && item.uf && item.uf === cluster.rep.uf && cluster.rep.risk.kind === item.risk.kind && gap <= DAY_MS) return true;
      return gap <= 2 * DAY_MS && jaccard(item.tokens, cluster.tokens) >= 0.35;
    });
    if (match) {
      match.items.push(item);
      match.last = item.time ?? match.last;
      for (const word of item.tokens) match.tokens.add(word);
      if (item.risk.rank > match.rep.risk.rank) match.rep = item;
      if (item.risk.fatal) match.fatal = true;
      if (item.source) match.sources.add(item.source);
    } else {
      clusters.push({ key, rep: item, items: [item], last: item.time, tokens: new Set(item.tokens), fatal: Boolean(item.risk.fatal), sources: new Set(item.source ? [item.source] : []) });
    }
  }
  return clusters;
}

function count(clusters, inmetItems) {
  const kinds = (set) => clusters.filter((cluster) => set.includes(cluster.rep.risk.kind)).length;
  return {
    block_total: kinds(["block_total", "strike_block"]),
    block_planned: kinds(["block_planned"]),
    heavy: kinds(["heavy_vehicle", "hazmat"]),
    fatal: clusters.filter((cluster) => cluster.fatal).length,
    cargo: kinds(["cargo_theft"]),
    strike: kinds(["strike", "strike_block"]),
    inmet: inmetItems.filter((item) => ["inmet_orange", "inmet_red"].includes(item.risk.kind)).length,
  };
}

const NUMBER_LABELS = [
  ["block_total", "Bloqueios totais"],
  ["block_planned", "Bloqueios programados"],
  ["heavy", "Acidentes com veículo pesado"],
  ["fatal", "Acidentes com vítima fatal"],
  ["cargo", "Roubos de carga"],
  ["strike", "Paralisações/manifestações"],
  ["inmet", "Avisos INMET de Perigo"],
];

function short(text, limit = 120) {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).replace(/\s+\S*$/, "")}…`;
}

function eventView(cluster) {
  const rep = cluster.rep;
  const [kindLabel, action] = KIND[rep.risk.kind] || ["Ocorrência", "Monitore antes de passar."];
  return {
    title: rep.title,
    road: rep.road,
    uf: rep.uf,
    date: dayMonth(rep.time),
    level: rep.risk.level,
    level_label: rep.risk.label,
    kind: rep.risk.kind,
    kind_label: kindLabel,
    action,
    sources: cluster.sources.size,
    url: rep.url,
  };
}

function rankSort(a, b) {
  return (b.rep.risk.rank - a.rep.risk.rank) || (b.sources.size - a.sources.size) || ((b.rep.time ?? 0) - (a.rep.time ?? 0)) || (a.rep.title < b.rep.title ? -1 : a.rep.title > b.rep.title ? 1 : 0);
}

function mostCommon(values) {
  const counts = new Map();
  for (const value of values) if (value) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))[0]?.[0] || "";
}

function hotspots(clusters) {
  const byRoad = new Map();
  for (const cluster of clusters) {
    if (!cluster.rep.road) continue;
    if (!byRoad.has(cluster.rep.road)) byRoad.set(cluster.rep.road, []);
    byRoad.get(cluster.rep.road).push(cluster);
  }
  return [...byRoad.entries()].map(([road, list]) => {
    const score = list.reduce((sum, cluster) => sum + WEIGHT[cluster.rep.risk.rank], 0);
    const strong = list.filter((cluster) => cluster.rep.risk.rank >= 3);
    const pool = strong.length ? strong : list;
    const kindCounts = new Map();
    for (const cluster of pool) {
      const kind = cluster.rep.risk.kind;
      const entry = kindCounts.get(kind) || { count: 0, rank: 0 };
      entry.count += 1;
      entry.rank = Math.max(entry.rank, cluster.rep.risk.rank);
      kindCounts.set(kind, entry);
    }
    const dominant = [...kindCounts.entries()].sort((a, b) => (b[1].count - a[1].count) || (b[1].rank - a[1].rank) || (a[0] < b[0] ? -1 : 1))[0][0];
    const worst = [...pool].filter((cluster) => cluster.rep.risk.kind === dominant).sort(rankSort)[0];
    const [mainProblem, action] = KIND[dominant] || ["Ocorrências", "Monitore antes de passar."];
    return {
      road,
      uf: mostCommon(list.map((cluster) => cluster.rep.uf)),
      score,
      events: list.length,
      critical_high: strong.length,
      main_problem: mainProblem,
      action,
      worst_title: worst.rep.title,
      worst_url: worst.rep.url,
    };
  })
    .filter((spot) => spot.score >= 4)
    .sort((a, b) => (b.score - a.score) || (b.events - a.events) || (a.road < b.road ? -1 : 1))
    .slice(0, 5);
}

function weatherByState(inmetItems) {
  const byUf = new Map();
  for (const item of inmetItems) {
    const uf = item.uf || "Área não informada";
    if (!byUf.has(uf)) byUf.set(uf, []);
    byUf.get(uf).push(item);
  }
  return [...byUf.entries()].map(([uf, list]) => {
    const worst = [...list].sort((a, b) => b.risk.rank - a.risk.rank)[0];
    const level = (worst.title.split(" - ")[1] || worst.risk.label).trim();
    const phenomena = [...new Set(list.map((item) => item.title.split(" - ")[0].trim()).filter(Boolean))].sort();
    return { uf, alerts: list.length, max_rank: worst.risk.rank, max_level: level, phenomena };
  })
    .sort((a, b) => (b.max_rank - a.max_rank) || (b.alerts - a.alerts) || (a.uf < b.uf ? -1 : 1))
    .slice(0, 6)
    .map(({ max_rank, ...rest }) => ({ ...rest, action: max_rank >= 3 ? "Avalie adiar saídas nos horários de tempestade na área do aviso." : "Atenção a chuva e vento; sem restrição de saída." }));
}

function buildWeeklyBrief(rawItems, nowMs = Date.now()) {
  const items = rawItems.map(enrich);
  const currentStart = nowMs - 7 * DAY_MS;
  const previousStart = nowMs - 14 * DAY_MS;
  const current = items.filter((item) => item.time === null || item.time >= currentStart);
  const previous = items.filter((item) => item.time !== null && item.time >= previousStart && item.time < currentStart);

  const relevant = (list) => list.filter((item) => !item.inmet && item.risk.rank >= 2);
  const inmetOf = (list) => list.filter((item) => item.inmet);
  const currentClusters = clusterEvents(relevant(current));
  const previousClusters = clusterEvents(relevant(previous));
  const currentInmet = inmetOf(current);
  const now = count(currentClusters, currentInmet);
  const before = count(previousClusters, inmetOf(previous));
  const numbers = NUMBER_LABELS.map(([key, label]) => ({ key, label, value: now[key], previous: before[key], delta: now[key] - before[key] }));

  // Atenção para os próximos dias.
  const released = current.filter((item) => item.risk.kind === "released");
  const watch = [];
  const today = ymd(nowMs);
  const pushWatch = (type, cluster, scheduled = null) => watch.push({
    type,
    ...eventView(cluster),
    scheduled: scheduled ? `${String(scheduled[2]).padStart(2, "0")}/${String(scheduled[1]).padStart(2, "0")}` : "",
  });
  currentClusters.filter((c) => c.rep.risk.kind === "block_planned").sort(rankSort).forEach((c) => {
    const scheduled = scheduledDate(c.rep.title, c.rep.time);
    if (scheduled && compareYmd(scheduled, today) < 0) return; // já aconteceu
    pushWatch("Bloqueio programado", c, scheduled);
  });
  currentClusters.filter((c) => ["strike", "strike_block"].includes(c.rep.risk.kind)).sort(rankSort).forEach((c) => pushWatch("Paralisação/manifestação", c));
  currentClusters
    .filter((c) => c.rep.risk.kind === "block_total" && c.rep.time !== null && c.rep.time >= nowMs - 3 * DAY_MS)
    .filter((c) => !released.some((item) => item.road && item.road === c.rep.road && item.time !== null && item.time > c.rep.time))
    .sort(rankSort)
    .forEach((c) => {
      pushWatch("Pode seguir bloqueado", c);
      watch[watch.length - 1].action = "Sem notícia de liberação: confirme com a concessionária/PRF antes de liberar o veículo.";
    });
  const recentInmet = currentInmet.filter((item) => item.risk.rank >= 3 && (item.time === null || item.time >= nowMs - 2 * DAY_MS));
  for (const spot of weatherByState(recentInmet)) {
    watch.push({ type: "Aviso INMET", title: `${spot.phenomena.join(", ")} — ${spot.max_level}`, road: "", uf: spot.uf, date: "", level: "high", level_label: "Alto", kind: "inmet_orange", kind_label: "Aviso INMET", action: spot.action, sources: 1, url: "", scheduled: "" });
  }
  // Cota por tipo para um tipo não esconder os demais.
  const QUOTA = { "Bloqueio programado": 4, "Paralisação/manifestação": 2, "Pode seguir bloqueado": 3, "Aviso INMET": 2 };
  const used = {};
  const watchlist = watch.filter((w) => {
    used[w.type] = (used[w.type] || 0) + 1;
    return used[w.type] <= QUOTA[w.type];
  });

  const spots = hotspots(currentClusters);
  const cargo = currentClusters
    .filter((c) => ["cargo_theft", "cargo_theft_police"].includes(c.rep.risk.kind))
    .sort(rankSort)
    .slice(0, 5)
    .map((c) => ({ ...eventView(c), police: c.rep.risk.kind === "cargo_theft_police" }));
  const weather = weatherByState(currentInmet);
  const highlights = currentClusters.filter((c) => c.rep.risk.rank >= 3).sort(rankSort).slice(0, 6).map(eventView);

  // Ações recomendadas (máx. 5), das mais urgentes para as estruturais.
  const actions = [];
  watchlist.filter((w) => w.type === "Bloqueio programado").slice(0, 2).forEach((w) => actions.push(`Planeje o desvio${w.scheduled ? ` para ${w.scheduled}` : ""}: ${short(w.title)}.`));
  watchlist.filter((w) => w.type === "Paralisação/manifestação").slice(0, 1).forEach((w) => actions.push(`Confirme antes de despachar: ${short(w.title)}.`));
  watchlist.filter((w) => w.type === "Pode seguir bloqueado").slice(0, 1).forEach((w) => actions.push(`Confirme a liberação antes de passar: ${short(w.title)}.`));
  const coveredRoads = new Set(watchlist.slice(0, 4).map((w) => w.road).filter(Boolean));
  spots.filter((spot) => !coveredRoads.has(spot.road)).slice(0, 2)
    .forEach((spot) => actions.push(`${spot.road}${spot.uf ? `/${spot.uf}` : ""} (${spot.main_problem.toLowerCase()}): ${spot.action}`));
  const theftPlaces = [...new Set(cargo.filter((c) => !c.police).map((c) => c.road || c.uf).filter(Boolean))].slice(0, 3);
  if (theftPlaces.length) actions.push(`Segurança da carga em ${theftPlaces.join(", ")}: ${KIND.cargo_theft[1]}`);
  const dangerUfs = weather.filter((w) => w.action.startsWith("Avalie")).map((w) => w.uf).filter((uf) => UF_CODES.includes(uf)).slice(0, 4);
  if (dangerUfs.length) actions.push(`Clima: avisos de Perigo em ${dangerUfs.join(", ")}: avalie adiar saídas nos horários de tempestade.`);
  const uniqueActions = [...new Set(actions)].slice(0, 5);
  if (!uniqueActions.length) uniqueActions.push("Sem restrição relevante na semana: mantenha a checagem padrão antes das saídas.");

  // Veredito.
  const critical = currentClusters.filter((c) => c.rep.risk.rank === 4).length;
  const high = currentClusters.filter((c) => c.rep.risk.rank === 3).length;
  const strikeAnnounced = watchlist.some((w) => w.type === "Paralisação/manifestação");
  const level = critical >= 3 || strikeAnnounced ? "critical" : critical >= 1 || high >= 8 ? "high" : currentClusters.length ? "medium" : "low";
  const verdictLabel = { critical: "Crítica", high: "Atenção alta", medium: "Atenção moderada", low: "Tranquila" }[level];
  const facts = numbers.filter((n) => n.value > 0).slice(0, 3).map((n) => `${n.value} ${n.label.toLowerCase()}`);
  const verdictText = facts.length ? `${facts.join(", ")}.` : "Nenhuma ocorrência com impacto operacional relevante.";

  const trend = numbers.slice(0, 5).reduce((sum, n) => sum + n.value, 0) - numbers.slice(0, 5).reduce((sum, n) => sum + n.previous, 0);
  const trendText = trend > 0 ? "mais ocorrências graves que na semana anterior" : trend < 0 ? "menos ocorrências graves que na semana anterior" : "volume de ocorrências graves igual ao da semana anterior";
  const summaryParts = [`Semana ${verdictLabel.toLowerCase()}: ${verdictText.replace(/\.$/, "")}, ${trendText}.`];
  if (spots.length) summaryParts.push(`Trechos mais críticos: ${spots.slice(0, 3).map((s) => `${s.road}${s.uf ? `/${s.uf}` : ""}`).join(", ")}.`);
  if (watchlist.length) summaryParts.push(`${watchlist.length} ponto(s) de atenção para os próximos dias.`);

  return {
    period: { days: 7, start: dayMonth(currentStart), end: dayMonth(nowMs) },
    verdict: { level, label: verdictLabel, text: verdictText },
    headline: `Semana ${verdictLabel.toLowerCase()}${facts.length ? `: ${facts.slice(0, 2).join(" e ")}` : ""}`,
    executive_summary: summaryParts.join(" "),
    numbers,
    watchlist,
    hotspots: spots,
    cargo_security: cargo,
    weather,
    actions: uniqueActions,
    highlights,
    coverage: {
      analyzed: current.length,
      relevant: relevant(current).length + currentInmet.length,
      events: currentClusters.length,
      discarded: current.filter((item) => !item.inmet && item.risk.rank < 2).length,
    },
  };
}

function ufFromText(text) {
  const raw = clean(text);
  const norm = RoadRisk.normalize(raw);
  return ufOf(raw, norm, roadOf(raw, norm));
}

module.exports = { buildWeeklyBrief, ufFromText };
