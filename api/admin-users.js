const { SERVICE_ROLE_KEY, SUPABASE_URL, json, requireAdmin, supabaseFetch } = require("./_auth");

async function inviteUser(body) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("E-mail invalido.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      data: {
        full_name: body.full_name || "",
        company_name: body.company_name || "",
        role: body.role || "client",
      },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Nao foi possivel convidar usuario.");
  }
  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const account = await requireAdmin(req);
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    const invited = await inviteUser(body);
    const userId = invited?.id || invited?.user?.id;
    if (userId) {
      await supabaseFetch("/rest/v1/profiles", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: userId,
          email: String(body.email || "").trim().toLowerCase(),
          full_name: body.full_name || "",
          company_name: body.company_name || "",
          role: body.role === "admin" ? "admin" : "client",
          status: "active",
        }),
      });
      await supabaseFetch("/rest/v1/audit_logs", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          actor_user_id: account.user.id,
          action: "invite_user",
          target_type: "profile",
          target_id: userId,
          metadata: { email: body.email, role: body.role || "client" },
        }),
      });
    }
    json(res, 200, { ok: true, user_id: userId || null });
  } catch (error) {
    json(res, 403, { error: error.message || "Nao foi possivel convidar usuario." });
  }
};
