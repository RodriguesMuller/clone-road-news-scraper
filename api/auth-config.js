const { isAuthEnabled, json } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }
  json(res, 200, { authEnabled: isAuthEnabled() });
};
