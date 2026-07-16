const { json, monthlyUsage, requireAccount } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const account = await requireAccount(req);
    const profile = account.profile || {};
    const pkg = account.activePackage?.packages || null;
    const isPrivileged = account.isPrivileged;
    const usage = isPrivileged || !account.authEnabled
      ? { news: 0, ai: 0, pdf: 0 }
      : {
          news: await monthlyUsage(account.user.id, "news_view"),
          ai: await monthlyUsage(account.user.id, ["ai_summary", "image_generation", "weekly_summary"]),
          pdf: await monthlyUsage(account.user.id, "pdf_generation"),
        };
    const limits = {
      monthly_news_limit: Number(pkg?.monthly_news_limit || 0),
      monthly_ai_summary_limit: Number(pkg?.monthly_ai_summary_limit || 0),
      monthly_pdf_limit: Number(pkg?.monthly_pdf_limit || 0),
    };
    const hasAiQuota = isPrivileged || (limits.monthly_ai_summary_limit > usage.ai);
    const hasPdfQuota = isPrivileged || (limits.monthly_pdf_limit > usage.pdf);

    json(res, 200, {
      role: profile.role || "client",
      status: profile.status || "inactive",
      email: profile.email || account.user?.email || "",
      full_name: profile.full_name || "",
      company_name: profile.company_name || "",
      package_name: pkg?.name || null,
      can_access_map: isPrivileged || Boolean(pkg?.can_access_map),
      can_generate_image: isPrivileged || (Boolean(pkg?.can_generate_image) && hasAiQuota),
      can_generate_weekly_summary: isPrivileged || (Boolean(pkg?.can_generate_weekly_summary) && hasAiQuota),
      can_generate_pdf: isPrivileged || hasPdfQuota,
      limits,
      usage_this_month: usage,
    });
  } catch (error) {
    json(res, 403, { error: error.message || "Acesso nao autorizado." });
  }
};
