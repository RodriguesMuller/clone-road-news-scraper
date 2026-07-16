const { assertWritableEnvironment, json, requireAdmin, supabaseFetch } = require("./_auth");
const { adminErrorMessage, audit, fetchJson, packagePayload, readJson } = require("./_admin");

function idFromRequest(req, body = {}) {
  const url = new URL(req.url, "http://road-news.local");
  return String(body.id || url.searchParams.get("id") || "").trim();
}

async function activeUserPackageCount(packageId) {
  const response = await supabaseFetch(
    `/rest/v1/user_packages?package_id=eq.${encodeURIComponent(packageId)}&is_active=eq.true&select=id`,
    { method: "HEAD", headers: { Prefer: "count=exact" } },
  );
  return Number((response.headers.get("content-range") || "0/0").split("/")[1] || 0);
}

async function writePackage(path, options, payload) {
  try {
    return await fetchJson(path, { ...options, body: JSON.stringify(payload) });
  } catch (error) {
    if (!/max_users|column|schema|PGRST/i.test(error.message || "")) throw error;
    const { max_users, ...legacyPayload } = payload;
    return fetchJson(path, { ...options, body: JSON.stringify(legacyPayload) });
  }
}

module.exports = async function handler(req, res) {
  if (!["POST", "PATCH", "DELETE"].includes(req.method)) {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const account = await requireAdmin(req);
    assertWritableEnvironment();
    const body = req.method === "DELETE" ? {} : await readJson(req);
    const packageId = idFromRequest(req, body);

    if (req.method === "POST") {
      const payload = packagePayload(body);
      const created = await writePackage("/rest/v1/packages?select=id", {
        method: "POST",
        headers: { Prefer: "return=representation" },
      }, payload);
      const id = created?.[0]?.id || null;
      await audit(account, "create_package", "package", id || payload.name, payload);
      json(res, 200, { ok: true, id });
      return;
    }

    if (!packageId) throw new Error("Pacote nao informado.");

    if (req.method === "PATCH") {
      const payload = body.name ? packagePayload(body) : { is_active: body.is_active === true || body.is_active === "true" };
      await writePackage(`/rest/v1/packages?id=eq.${encodeURIComponent(packageId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
      }, payload);
      await audit(account, payload.is_active === false ? "deactivate_package" : "update_package", "package", packageId, payload);
      json(res, 200, { ok: true });
      return;
    }

    const linkedUsers = await activeUserPackageCount(packageId);
    if (linkedUsers > 0) {
      throw new Error("Este pacote possui usuarios vinculados e nao pode ser excluido.");
    }
    await supabaseFetch(`/rest/v1/packages?id=eq.${encodeURIComponent(packageId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    await audit(account, "delete_package", "package", packageId, {});
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
