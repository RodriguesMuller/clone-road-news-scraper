const { assertCanUse, json, recordUsage } = require("./_auth");

const FEATURE_BY_EVENT = {
  pdf_generation: "pdf_generation",
  image_generation: "image_generation",
  ai_summary: "ai_summary",
  weekly_summary: "weekly_summary",
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
    await recordUsage(account, eventType, { metadata: body.metadata || {} });
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 403, { error: error.message || "Uso nao autorizado." });
  }
};
