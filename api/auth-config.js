const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  appEnvironment,
  authSettingValue,
  isAuthEnabled,
  isReadOnlyEnvironment,
  json,
} = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }
  json(res, 200, {
    authEnabled: isAuthEnabled(),
    mode: isAuthEnabled() ? "auth" : "demo",
    environment: appEnvironment(),
    readOnly: isReadOnlyEnvironment(),
    configuredValue: authSettingValue() ? "set" : "empty",
    supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
    // URL e chave publica podem ser usadas pelo cliente; a service role nunca sai do servidor.
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
  });
};
