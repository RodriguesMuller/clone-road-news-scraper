const { assertCanUse, json } = require("./_auth");
const { adminErrorMessage, readJson } = require("./_admin");

const FEATURE_BY_EVENT = {
  pdf_generated: "pdf_generated",
  pdf_generation: "pdf_generated",
  map_access: "map_access",
  ai_summary_individual: "ai_summary_individual",
  image_generation: "ai_summary_individual",
  ai_summary_weekly: "ai_summary_weekly",
  weekly_summary: "ai_summary_weekly",
};

const CANONICAL_EVENT = {
  pdf_generation: "pdf_generated",
  image_generation: "ai_summary_individual",
  weekly_summary: "ai_summary_weekly",
};

// metadata vem do navegador e vai para usage_events: so objeto simples e pequeno.
function safeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.stringify(value).length <= 2000 ? value : { truncated: true };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const body = await readJson(req);
    const eventType = String(body.event_type || "").trim();
    const feature = FEATURE_BY_EVENT[eventType];
    if (!feature) throw new Error("Evento de uso invalido.");
    // Reserva atômica: autoriza e registra o uso na mesma operação (o limite nunca é ultrapassado).
    await assertCanUse(req, feature, { reserve: CANONICAL_EVENT[eventType] || eventType, metadata: safeMetadata(body.metadata) });
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) || "Uso nao autorizado." });
  }
};
