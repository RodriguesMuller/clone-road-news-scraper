const { assertCanUse, json, recordUsage } = require("./_auth");
const { adminErrorMessage } = require("./_admin");

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    const eventType = String(body.event_type || "").trim();
    const feature = FEATURE_BY_EVENT[eventType];
    if (!feature) throw new Error("Evento de uso invalido.");
    const account = await assertCanUse(req, feature);
    await recordUsage(account, CANONICAL_EVENT[eventType] || eventType, { metadata: body.metadata || {} });
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) || "Uso nao autorizado." });
  }
};
