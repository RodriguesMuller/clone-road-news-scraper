const assert = require("node:assert/strict");
const {
  inviteRedirectUrl,
  publicAppUrl,
  renderInviteEmail,
  sendInviteEmail,
  senderAddress,
} = require("../lib/invite-email");

async function main() {
  assert.equal(publicAppUrl({ APP_URL: "https://road-news.example/" }), "https://road-news.example");
  assert.equal(publicAppUrl({ VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "road-news.example" }), "https://road-news.example");
  assert.equal(inviteRedirectUrl({ APP_URL: "https://road-news.example" }), "https://road-news.example/accept-invite");
  assert.equal(publicAppUrl({ NODE_ENV: "development" }), "http://localhost:3000");
  assert.throws(
    () => publicAppUrl({ VERCEL: "1", APP_URL: "http://localhost:3000" }),
    /localhost/,
  );

  const content = renderInviteEmail({
    name: "Ana <Teste>",
    email: "ana@example.com",
    role: "manager",
    companyName: "Transportes & Cia",
    inviteUrl: "https://road-news.example/accept-invite?token=abc&mode=invite",
  });
  assert.equal(content.subject, "Convite para acessar o Road News");
  assert.match(content.html, /Você foi convidado para acessar o Road News/);
  assert.match(content.html, /Ana &lt;Teste&gt;/);
  assert.match(content.html, /Transportes &amp; Cia/);
  assert.match(content.html, /Gestor/);
  assert.doesNotMatch(content.html, /You've been invited|powered by Supabase/i);

  let request = null;
  const result = await sendInviteEmail({
    name: "Ana",
    email: "ana@example.com",
    role: "client",
    companyName: "Empresa",
    inviteUrl: "https://road-news.example/accept-invite",
  }, {
    env: {
      RESEND_API_KEY: "re_test",
      INVITE_EMAIL_FROM: "acesso@example.com",
    },
    idempotencyKey: "invite-test",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ id: "email_test" }) };
    },
  });
  assert.equal(result.id, "email_test");
  assert.equal(senderAddress({ INVITE_EMAIL_FROM: "acesso@example.com" }), "Road News <acesso@example.com>");
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.options.headers["Idempotency-Key"], "invite-test");
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.to[0], "ana@example.com");
  assert.equal(payload.from, "Road News <acesso@example.com>");

  await assert.rejects(
    sendInviteEmail({ email: "ana@example.com" }, { env: {}, fetchImpl: async () => ({ ok: true }) }),
    /nao esta configurado/,
  );
  console.log("invite flow ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
