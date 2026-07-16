const { appEnvironment, authSettingValue, isAuthEnabled, isReadOnlyEnvironment, json } = require("./_auth");

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
  });
};
