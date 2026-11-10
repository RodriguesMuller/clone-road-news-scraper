// Central de Evento: encerrar/reabrir pela gestão (api/news-summary.js, action "event-status").
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { createFakeSupabase, loadApi, call } = require("./helpers/fake_supabase");

const ROOT = path.resolve(__dirname, "..");

function setup() {
  const fake = createFakeSupabase({
    users: { adm: { id: "u-adm" }, cli: { id: "u-cli" } },
    profiles: [
      { id: "u-adm", role: "admin", status: "active", client_id: null },
      { id: "u-cli", role: "client", status: "active", client_id: null },
    ],
  });
  fake.db.platform_events.push({
    id: "ev-1", event_type: "major_logistics_event", severity: "critical", status: "resolved",
    message: "Paralisação no Porto de Santos", created_at: "2026-07-13T12:00:00Z", resolved_at: "2026-07-15T12:45:00Z",
    metadata: { operational_status: "encerrado", ended_on: "2026-07-14", history: [] },
  });
  const api = loadApi(ROOT, fake);
  const setStatus = (token, operational_status) => call(api("news-summary.js"), {
    method: "POST", token, body: { action: "event-status", event_id: "ev-1", operational_status },
  });
  return { fake, setStatus, event: () => fake.db.platform_events[0] };
}

test("reabrir apaga a data de encerramento antiga; encerrar grava a nova", async () => {
  const { setStatus, event } = setup();
  assert.equal((await setStatus("adm", "em_andamento")).status, 200);
  assert.equal(event().status, "open");
  assert.equal(event().resolved_at, null);
  assert.equal(event().metadata.ended_on, undefined, "reaberto não pode mostrar 'Encerramento: 14/07'");
  assert.equal(event().metadata.status_confirmed_by, "platform_manager");

  assert.equal((await setStatus("adm", "encerrado")).status, 200);
  assert.equal(event().status, "resolved");
  assert.ok(event().metadata.ended_at, "encerramento registrado");
  assert.equal(event().metadata.history.length, 2);
});

test("cliente não altera o status de um evento", async () => {
  const { setStatus, event } = setup();
  const res = await setStatus("cli", "em_andamento");
  assert.notEqual(res.status, 200);
  assert.equal(event().status, "resolved");
});
