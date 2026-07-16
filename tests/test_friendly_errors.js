const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { getFriendlyErrorMessage } = require("../public/error-utils");
const { adminErrorMessage } = require("../api/_admin");

const fallback = "Não foi possível concluir a ação. Tente novamente.";

assert.equal(getFriendlyErrorMessage(new Error("Invalid login credentials")), "E-mail ou senha incorretos.");
assert.equal(getFriendlyErrorMessage('{"error":{"message":"email_exists"}}'), "Este e-mail já está cadastrado.");
assert.equal(getFriendlyErrorMessage(new Error("new row violates row-level security policy")), "Você não tem permissão para realizar esta ação.");
assert.equal(getFriendlyErrorMessage(new Error("User is inactive")), "Seu acesso está inativo. Contate o administrador.");
assert.equal(getFriendlyErrorMessage(new Error("refresh token expired")), "Este link expirou. Solicite um novo convite.");
assert.equal(getFriendlyErrorMessage(new Error("Failed to fetch")), "Não foi possível conectar ao servidor. Tente novamente.");
assert.equal(getFriendlyErrorMessage(new Error("relation public.profiles does not exist")), fallback);
assert.equal(getFriendlyErrorMessage(new Error("SUPABASE_SERVICE_ROLE_KEY missing")), fallback);
assert.equal(getFriendlyErrorMessage(new Error("Unknown low-level failure")), fallback);
assert.equal(getFriendlyErrorMessage("Pacote atualizado com sucesso."), "Pacote atualizado com sucesso.");

assert.equal(adminErrorMessage(new Error("SUPABASE_SERVICE_ROLE_KEY nao configurada")), "Nao foi possivel concluir a acao. Tente novamente.");
assert.equal(adminErrorMessage(new Error('{"message":"permission denied for table profiles"}')), "Você não tem permissão para realizar esta ação.");
assert.equal(adminErrorMessage(new Error("Unknown internal failure")), "Nao foi possivel concluir a acao. Tente novamente.");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
for (const functionName of ["setViewMode", "toggleViewMode", "canAccessAdminView", "shouldShowAdminNavigation"]) {
  const matches = html.match(new RegExp(`function ${functionName}\\(`, "g")) || [];
  assert.equal(matches.length, 1, `${functionName} deve possuir uma unica definicao`);
}
assert.ok(!/\b(?:window\.)?prompt\s*\(/.test(html), "o frontend nao deve usar prompt nativo");
assert.ok(html.includes('id="userEditModal"'), "o modal profissional de edicao deve existir");
assert.ok(html.includes('mainTabs.hidden = true'), "a navegacao administrativa superior deve permanecer oculta");
assert.ok(html.includes("color-scheme: dark"), "os selects devem respeitar o tema escuro");

console.log("friendly errors and phase 1 UI guards ok");
