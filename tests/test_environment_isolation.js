const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const auth = require("../api/_auth");
const authConfig = require("../api/auth-config");

function request() {
  const req = Readable.from([]);
  req.method = "GET";
  req.headers = {};
  return req;
}

function recorder() {
  return {
    statusCode: 200,
    body: "",
    setHeader() {},
    end(value) { this.body = String(value || ""); },
  };
}

async function main() {
  assert.equal(auth.SUPABASE_URL, "");
  assert.equal(auth.SUPABASE_ANON_KEY, "");
  assert.throws(() => auth.assertSupabaseConfigured(), /nao configurado/);

  const res = recorder();
  await authConfig(request(), res);
  const config = JSON.parse(res.body);
  assert.equal(config.supabaseConfigured, false);
  assert.equal(config.supabaseUrl, "");
  assert.equal(config.supabaseAnonKey, "");

  const root = path.join(__dirname, "..");
  const files = ["api/_auth.js", "api/weekly-summary.js", "public/index.html"];
  const productionProjectRef = "vdyilgbqxnrwqgoairat";
  for (const file of files) {
    const contents = fs.readFileSync(path.join(root, file), "utf8");
    assert.ok(!contents.includes(productionProjectRef), `${file} referencia o Supabase de producao`);
  }

  console.log("environment isolation ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
