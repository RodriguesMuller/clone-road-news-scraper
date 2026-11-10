const { json, monthStartIso, requireManager, supabaseFetch } = require("./_auth");
const { adminErrorMessage, audit, clientSeatsUsed, fetchJson, maskCpf, readJson } = require("./_admin");

function clientIdFromRequest(req, body = {}) {
  const url = new URL(req.url, "http://road-news.local");
  return String(body.id || body.client_id || url.searchParams.get("id") || "").trim();
}

function clientPayload(body = {}, partial = false) {
  const payload = {};
  if (!partial || Object.hasOwn(body, "company_name")) {
    const companyName = String(body.company_name || "").trim();
    if (!companyName) throw new Error("Informe o nome do cliente ou empresa.");
    payload.company_name = companyName;
  }
  if (!partial || Object.hasOwn(body, "status")) {
    const status = String(body.status || "active").trim();
    if (!["active", "inactive", "blocked"].includes(status)) throw new Error("Status de cliente invalido.");
    payload.status = status;
  }
  if (!partial || Object.hasOwn(body, "notes")) payload.notes = String(body.notes || "").trim() || null;
  // Pacote do cliente: todos os usuários da empresa herdam recursos e limites (o consumo é de cada um).
  if (Object.hasOwn(body, "package_id")) payload.package_id = String(body.package_id || "").trim() || null;
  return payload;
}

// Valida o pacote do cliente: precisa estar ativo e comportar os usuários que a empresa já tem.
async function assertClientPackage(packageId, clientId) {
  if (!packageId) return;
  const rows = await fetchJson(`/rest/v1/packages?id=eq.${encodeURIComponent(packageId)}&is_active=eq.true&select=id,max_users&limit=1`);
  if (!rows?.length) throw new Error("Pacote nao encontrado ou inativo.");
  const maxUsers = Number(rows[0].max_users || 0);
  if (clientId && maxUsers > 0 && await clientSeatsUsed(clientId) > maxUsers) {
    throw new Error(`Este pacote permite ${maxUsers} usuario(s) e o cliente ja tem mais usuarios ativos.`);
  }
}

function clientPackageColumnError(error) {
  if (/package_id/i.test(error.message || "") && /column|schema|PGRST/i.test(error.message || "")) {
    return new Error("Rode scripts/supabase_client_package.sql no Supabase para habilitar o pacote do cliente.");
  }
  return error;
}

// Todos os eventos de uso do mês, em páginas de 1000 (o Supabase limita cada resposta a 1000
// linhas; antes vinham no máximo 1000, e o consumo do painel de gestão ficava subcontado).
const USAGE_PAGE = 1000;
const USAGE_MAX_PAGES = 20;
async function monthUsageEvents(monthStart) {
  const rows = [];
  for (let page = 0; page < USAGE_MAX_PAGES; page += 1) {
    const batch = await fetchJson(`/rest/v1/usage_events?select=*&created_at=gte.${monthStart}&order=created_at.desc,id.desc&limit=${USAGE_PAGE}&offset=${page * USAGE_PAGE}`);
    rows.push(...(batch || []));
    if (!batch || batch.length < USAGE_PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function publicUser(profile = {}) {
  const { cpf, phone, ...safe } = profile;
  return {
    ...safe,
    cpf_masked: maskCpf(cpf),
    has_phone: Boolean(phone),
  };
}

async function writeClient(req, account) {
  const body = await readJson(req);
  const clientId = clientIdFromRequest(req, body);

  if (req.method === "POST") {
    const payload = clientPayload(body);
    await assertClientPackage(payload.package_id, null);
    if (!payload.package_id) delete payload.package_id;
    const created = await fetchJson("/rest/v1/clients?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    }).catch((error) => { throw clientPackageColumnError(error); });
    const id = created?.[0]?.id || null;
    await audit(account, "create_client", "client", id || payload.company_name, { status: payload.status });
    return { ok: true, id };
  }

  if (!clientId) throw new Error("Cliente nao informado.");
  const existing = await fetchJson(`/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}&select=id,company_name,status&limit=1`);
  if (!existing?.length) throw new Error("Cliente nao encontrado.");
  const payload = clientPayload(body, true);
  if (!Object.keys(payload).length) throw new Error("Nenhuma alteracao informada.");
  await assertClientPackage(payload.package_id, clientId);
  await supabaseFetch(`/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  }).catch((error) => { throw clientPackageColumnError(error); });
  await audit(account, payload.status && payload.status !== "active" ? "deactivate_client" : "update_client", "client", clientId, {
    status: payload.status || existing[0].status,
    ...(Object.hasOwn(payload, "package_id") ? { package_id: payload.package_id } : {}),
  });
  return { ok: true, id: clientId };
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST", "PATCH"].includes(req.method)) {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const account = await requireManager(req);
    if (req.method !== "GET") {
      json(res, 200, await writeClient(req, account));
      return;
    }

    const monthStart = encodeURIComponent(monthStartIso());
    const [profiles, clients, packages, userPackages, usage, logs] = await Promise.all([
      fetchJson("/rest/v1/profiles?select=*&order=created_at.desc"),
      fetchJson("/rest/v1/clients?select=*&order=company_name.asc"),
      fetchJson("/rest/v1/packages?select=*&order=name.asc"),
      fetchJson("/rest/v1/user_packages?select=*&order=created_at.desc"),
      monthUsageEvents(monthStart),
      fetchJson("/rest/v1/audit_logs?select=*&order=created_at.desc&limit=200"),
    ]);
    const visibleProfiles = account.isAdmin ? (profiles || []) : (profiles || []).filter((profile) => profile.role !== "admin");
    const visibleUserIds = new Set(visibleProfiles.map((profile) => profile.id));
    json(res, 200, {
      users: visibleProfiles.map(publicUser),
      clients: clients || [],
      packages: packages || [],
      userPackages: (userPackages || []).filter((item) => visibleUserIds.has(item.user_id)),
      usage: usage.rows.filter((item) => visibleUserIds.has(item.user_id)),
      usage_truncated: usage.truncated,
      logs: account.isAdmin ? (logs || []) : [],
    });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) });
  }
};
