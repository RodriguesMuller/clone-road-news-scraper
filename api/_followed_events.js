// Eventos acompanhados: o usuário escolhe uma notícia ("Acompanhar evento") e a Central de Evento
// passa a reunir as notícias seguintes sobre o mesmo evento. Sem IA: a correspondência é por regra
// (rodovia, nomes próprios e palavras-chave em comum com a notícia de origem).
// O evento é da EMPRESA (client_id): todos os usuários do cliente veem e atualizam.
const { supabaseFetch } = require("./_auth");

const TABLE = "/rest/v1/followed_events";
const MISSING_TABLE = "Rode scripts/supabase_followed_events.sql no Supabase para habilitar o acompanhamento de eventos.";
const NEWS_COLUMNS = "title,url,source,category,published_at,scraped_at,created_at,type,summary";
const CLOSED_WINDOW_DAYS = 30;
const MAX_RELATED = 30;
const BEFORE_SEED_MS = 12 * 3600 * 1000;
const MAX_TEXT = 600;

const UF = "BR|SP|MG|RJ|RS|SC|PR|BA|GO|MT|MS|PA|PE|CE|ES|RO|TO|MA|PI|RN|PB|AL|SE|AM|AC|RR|AP|DF";
const ROAD_CODE = new RegExp(`\\b(${UF})[-\\s]?(\\d{3})\\b`, "gi");
const ROAD_NAME = /\b(?:rodovia|via|marginal|avenida|estrada)\s+((?:[A-ZÀ-Ú][\wÀ-ú.'-]+\s?){1,4})/g;

// Palavras que aparecem em quase toda notícia de trânsito e não identificam um evento.
const STOPWORDS = new Set(`
  a o as os de da do das dos e em no na nos nas um uma por para com sem sob sobre entre apos ate desde
  que se ao aos ou mais menos muito pouco ja ainda tambem como quando onde nesta neste nessa desse dessa
  desta deste esta este essa esse isso hoje ontem amanha madrugada manha tarde noite segunda terca quarta
  quinta sexta sabado domingo feira dia dias hora horas semana mes ano km quilometro quilometros
  rodovia rodovias estrada estradas via vias pista pistas faixa faixas sentido sentidos trecho trechos
  transito trafego fluxo motorista motoristas veiculo veiculos carro carros caminhao caminhoes carreta
  carretas onibus moto motos acidente acidentes ocorrencia ocorrencias policia rodoviaria federal estadual
  prf der dnit concessionaria interdicao interditada interditado liberada liberado bloqueio bloqueada
  bloqueado congestionamento lentidao fila filas apos durante segundo informou diz dizem disse afirma
  regiao cidade estado brasil grande sao paulo noticia noticias atualizacao g1 globo
`.split(/\s+/).filter(Boolean));

function clean(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Radical simples: "tombamento"/"tomba" e "caminhoneiros"/"caminhoneiro" passam a coincidir.
function stem(word) {
  return word.length > 6 ? word.slice(0, 6) : word;
}

function newsText(item) {
  return `${clean(item?.title)} ${clean(item?.summary)}`;
}

function roadsOf(text) {
  const roads = new Set();
  for (const match of String(text).matchAll(ROAD_CODE)) roads.add(`${match[1].toUpperCase()}-${match[2]}`);
  for (const match of String(text).matchAll(ROAD_NAME)) {
    const name = normalize(match[1]).replace(/[^a-z\s]/g, " ").trim();
    if (name.length >= 4) roads.add(name);
  }
  return roads;
}

// Termos da notícia de origem: nomes próprios (identificam o lugar/evento) e palavras comuns.
function signature(item) {
  const title = clean(item?.title);
  const text = newsText(item);
  const proper = new Set();
  const words = new Set();
  title.split(/\s+/).forEach((raw, index) => {
    const word = normalize(raw).replace(/[^a-z0-9]/g, "");
    if (word.length < 4 || STOPWORDS.has(word)) return;
    if (index > 0 && /^[A-ZÀ-Ú]/.test(raw)) proper.add(stem(word));
    else words.add(stem(word));
  });
  return { roads: roadsOf(text), proper, words };
}

function termsOf(item) {
  return new Set(normalize(newsText(item)).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOPWORDS.has(w)).map(stem));
}

function dateMs(item) {
  for (const value of [item?.published_at, item?.scraped_at, item?.created_at]) {
    const ms = Date.parse(String(value || "").replace(" ", "T"));
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

// Pontua a semelhança com a notícia de origem. Exige uma âncora (mesma rodovia ou um nome próprio
// em comum) para não juntar ocorrências diferentes só por palavras genéricas.
function relatedScore(sig, item) {
  const roads = roadsOf(newsText(item));
  const terms = termsOf(item);
  const sharedRoads = [...sig.roads].filter((road) => roads.has(road)).length;
  const sharedProper = [...sig.proper].filter((term) => terms.has(term)).length;
  const sharedWords = [...sig.words].filter((term) => terms.has(term)).length;
  if (!sharedRoads && !sharedProper) return 0;
  return sharedRoads * 3 + sharedProper * 2 + sharedWords;
}

const MIN_SCORE = 3;

function relatedNews(event, news) {
  const seed = event.seed || {};
  const sig = signature(seed);
  const from = dateMs(seed) - BEFORE_SEED_MS;
  const until = event.status === "closed" && event.closed_at ? Date.parse(event.closed_at) : Infinity;
  const seen = new Set([seed.url]);
  return (news || [])
    .filter((item) => {
      if (!item?.url || seen.has(item.url)) return false;
      const when = dateMs(item);
      if (when && (when < from || when > until)) return false;
      if (relatedScore(sig, item) < MIN_SCORE) return false;
      seen.add(item.url);
      return true;
    })
    .sort((a, b) => dateMs(b) - dateMs(a))
    .slice(0, MAX_RELATED)
    .map((item) => ({ title: clean(item.title), url: item.url, source: clean(item.source), published_at: item.published_at || item.created_at || "", summary: clean(item.summary).slice(0, 280) }));
}

function withRelated(event, news) {
  const related = relatedNews(event, news);
  const latest = related[0]?.published_at || event.seed?.published_at || event.created_at;
  return { ...event, related, last_update_at: latest };
}

function scopeFilter(account) {
  const clientId = account.profile?.client_id;
  return clientId
    ? `client_id=eq.${encodeURIComponent(clientId)}`
    : `client_id=is.null&created_by=eq.${encodeURIComponent(account.user.id)}`;
}

function missingTable(error) {
  return /followed_events|relation|does not exist|schema cache|PGRST205|42P01/i.test(error?.message || "");
}

async function newsSince(ms) {
  const since = encodeURIComponent(new Date(ms).toISOString());
  const response = await supabaseFetch(`/rest/v1/news?select=${NEWS_COLUMNS}&created_at=gte.${since}&order=created_at.desc&limit=1000`);
  return response.json();
}

// Eventos da empresa (ativos e encerrados nos últimos 30 dias) com as notícias relacionadas.
async function listFollowedEvents(account) {
  if (!account?.authEnabled || !account.user?.id) return [];
  const closedSince = encodeURIComponent(new Date(Date.now() - CLOSED_WINDOW_DAYS * 864e5).toISOString());
  let events;
  try {
    const response = await supabaseFetch(`${TABLE}?${scopeFilter(account)}&or=(status.eq.active,closed_at.gte.${closedSince})&select=*&order=created_at.desc&limit=30`);
    events = await response.json();
  } catch (error) {
    if (missingTable(error)) return [];
    throw error;
  }
  if (!events?.length) return [];
  const oldest = Math.min(...events.map((event) => dateMs(event.seed) || Date.parse(event.created_at) || Date.now()));
  const news = await newsSince(Math.max(oldest - BEFORE_SEED_MS, Date.now() - 90 * 864e5));
  return events.map((event) => withRelated(event, news));
}

function seedFromItem(item = {}) {
  const url = clean(item.url).slice(0, 1000);
  const title = clean(item.title).slice(0, 300);
  if (!title || !/^https?:\/\//i.test(url)) throw new Error("Notícia inválida para acompanhar.");
  return {
    title,
    url,
    summary: clean(item.summary).slice(0, MAX_TEXT),
    source: clean(item.source).slice(0, 120),
    category: clean(item.category).slice(0, 80),
    published_at: clean(item.published_at || item.created_at || item.scraped_at).slice(0, 40),
    road: clean(item.road || item.highway).slice(0, 40),
    region: clean(item.region || item.city || item.state).slice(0, 80),
  };
}

async function followEvent(account, item) {
  if (!account?.authEnabled || !account.user?.id) throw new Error("Faça login para acompanhar eventos.");
  const seed = seedFromItem(item);
  try {
    const existing = await (await supabaseFetch(`${TABLE}?${scopeFilter(account)}&status=eq.active&select=*`)).json();
    const already = (existing || []).find((event) => event.seed?.url === seed.url);
    if (already) return { event: withRelated(already, await newsSince(dateMs(seed) - BEFORE_SEED_MS || Date.now() - 7 * 864e5)), created: false };
    const response = await supabaseFetch(`${TABLE}?select=*`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        client_id: account.profile?.client_id || null,
        created_by: account.user.id,
        created_by_name: clean(account.profile?.full_name || account.user.email).slice(0, 120) || null,
        title: seed.title,
        seed,
        status: "active",
      }),
    });
    const [created] = await response.json();
    const news = await newsSince(Math.max((dateMs(seed) || Date.now()) - BEFORE_SEED_MS, Date.now() - 90 * 864e5));
    return { event: withRelated(created, news), created: true };
  } catch (error) {
    if (missingTable(error)) throw new Error(MISSING_TABLE);
    throw error;
  }
}

async function ownEvent(account, id) {
  const eventId = clean(id);
  if (!eventId) throw new Error("Evento não informado.");
  const rows = await (await supabaseFetch(`${TABLE}?id=eq.${encodeURIComponent(eventId)}&${scopeFilter(account)}&select=id&limit=1`)).json();
  if (!rows?.length) throw new Error("Evento não encontrado.");
  return eventId;
}

async function setFollowedEventStatus(account, id, status) {
  if (!["active", "closed"].includes(status)) throw new Error("Status inválido para o evento.");
  const eventId = await ownEvent(account, id);
  await supabaseFetch(`${TABLE}?id=eq.${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(status === "closed"
      ? { status, closed_at: new Date().toISOString(), closed_by: account.user.id }
      : { status, closed_at: null, closed_by: null }),
  });
  return { id: eventId, status };
}

async function unfollowEvent(account, id) {
  const eventId = await ownEvent(account, id);
  await supabaseFetch(`${TABLE}?id=eq.${encodeURIComponent(eventId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  return { id: eventId, removed: true };
}

module.exports = {
  followEvent,
  listFollowedEvents,
  relatedNews,
  relatedScore,
  setFollowedEventStatus,
  signature,
  unfollowEvent,
};
