const { json, monthlyUsage, recordUsage, requireAccount, supabaseFetch } = require("./_auth");

const BASE_COLUMNS = "title,url,source,category,published_at,scraped_at,created_at,type,summary";
const OPTIONAL_SETS = [
  "image_summary,ai_summary,operational_relevance,operational_impact,risk_level,region,country,state,city,highway,latitude,longitude,geo_precision",
  "image_summary,ai_summary,operational_relevance,operational_impact,risk_level,region,country,state,city,highway",
  "",
];

async function fetchRows(suffix) {
  let lastError = null;
  for (const optional of OPTIONAL_SETS) {
    const columns = optional ? `${BASE_COLUMNS},${optional}` : BASE_COLUMNS;
    try {
      const response = await supabaseFetch(`/rest/v1/news?select=${columns}${suffix}`);
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

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const account = await requireAccount(req);
    const pkg = account.activePackage?.packages || null;
    const monthlyNewsLimit = account.isAdmin || !account.authEnabled
      ? 700
      : Number(pkg?.monthly_news_limit || 0);
    if (account.authEnabled && !account.isAdmin && monthlyNewsLimit <= 0) {
      throw new Error("Usuario sem pacote ativo para visualizar noticias.");
    }
    if (account.authEnabled && !account.isAdmin) {
      const usedNewsViews = await monthlyUsage(account.user.id, "news_view");
      if (usedNewsViews >= monthlyNewsLimit) {
        throw new Error("Limite mensal de consultas de noticias atingido.");
      }
    }

    const since24h = encodeURIComponent(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    const since30d = encodeURIComponent(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    const cap = Math.max(1, Math.min(monthlyNewsLimit, 700));
    const [latestNews, latestInmet, recentRows, mapRows, countResponse] = await Promise.all([
      fetchRows(`&order=created_at.desc&limit=${Math.min(50, cap)}`),
      fetchRows(`&or=(source.ilike.*INMET*,type.eq.INMET)&order=published_at.desc&limit=${Math.min(20, cap)}`),
      fetchRows(`&created_at=gte.${since24h}&order=created_at.desc&limit=${Math.min(300, cap)}`),
      fetchRows(`&created_at=gte.${since30d}&order=created_at.desc&limit=${cap}`),
      supabaseFetch("/rest/v1/news?select=id", { method: "HEAD", headers: { Prefer: "count=exact" } }),
    ]);

    await recordUsage(account, "news_view", {
      metadata: {
        loaded_latest: latestNews.length,
        loaded_recent: recentRows.length,
        loaded_map: mapRows.length,
      },
    });

    const total = Number((countResponse.headers.get("content-range") || "0/0").split("/")[1] || 0);
    json(res, 200, { latestNews, latestInmet, recentRows, mapRows, total });
  } catch (error) {
    json(res, 403, { error: error.message || "Nao foi possivel carregar noticias." });
  }
};
