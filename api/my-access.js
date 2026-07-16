const { featureFlagEnabled, featureRule, featureUsage, json, requireAccount } = require("./_auth");
const { adminErrorMessage } = require("./_admin");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const account = await requireAccount(req);
    const profile = account.profile || {};
    const pkg = account.activePackage?.packages || null;
    const usage = !account.authEnabled
      ? { news: 0, ai: 0, pdf: 0 }
      : {
          news: await featureUsage(account.user.id, "news_query"),
          ai: await featureUsage(account.user.id, "ai_summary_individual"),
          pdf: await featureUsage(account.user.id, "pdf_generated"),
        };
    const limits = {
      monthly_news_limit: Number(pkg?.monthly_news_limit || 0),
      monthly_ai_summary_limit: Number(pkg?.monthly_ai_summary_limit || 0),
      monthly_pdf_limit: Number(pkg?.monthly_pdf_limit || 0),
    };
    const hasNewsQuota = limits.monthly_news_limit > usage.news && limits.monthly_news_limit > 0;
    const hasAiQuota = limits.monthly_ai_summary_limit > usage.ai && limits.monthly_ai_summary_limit > 0;
    const hasPdfQuota = limits.monthly_pdf_limit > usage.pdf && limits.monthly_pdf_limit > 0;
    const individualRule = featureRule("ai_summary_individual");
    const weeklyRule = featureRule("ai_summary_weekly");
    const mapRule = featureRule("map_access");
    const unlimited = Boolean(account.isPrivileged);

    json(res, 200, {
      role: profile.role || "client",
      status: profile.status || "inactive",
      email: profile.email || account.user?.email || "",
      full_name: profile.full_name || "",
      client_id: profile.client_id || null,
      company_name: profile.company_name || "",
      package_id: account.activePackage?.package_id || null,
      package_name: pkg?.name || null,
      has_active_package: Boolean(pkg),
      is_unlimited: unlimited,
      can_query_news: unlimited || (Boolean(pkg) && hasNewsQuota),
      can_access_map: unlimited || (Boolean(pkg) && featureFlagEnabled(pkg, mapRule)),
      can_generate_individual_summary: unlimited || (Boolean(pkg) && featureFlagEnabled(pkg, individualRule) && hasAiQuota),
      can_generate_image: unlimited || (Boolean(pkg) && featureFlagEnabled(pkg, individualRule) && hasAiQuota),
      can_generate_weekly_summary: unlimited || (Boolean(pkg) && featureFlagEnabled(pkg, weeklyRule) && hasAiQuota),
      can_generate_pdf: unlimited || (Boolean(pkg) && hasPdfQuota),
      limits,
      usage_this_month: usage,
    });
  } catch (error) {
    json(res, 403, { error: adminErrorMessage(error) || "Acesso nao autorizado." });
  }
};
