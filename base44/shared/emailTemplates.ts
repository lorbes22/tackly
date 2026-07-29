// Themed transactional emails sent via Resend (base44/shared/resend.ts), distinct
// from Base44's own un-customizable OTP/reset-password emails. Each template is a
// pure function of sample or real data -> {subject, html}, so the same render path
// backs both real sends and the admin preview page (admin-preview-email function).

// Same mark as src/components/Logo.jsx's LogoMark / public/favicon.svg.
// Previously inlined as a base64 data URI specifically to avoid a hosted-
// asset dependency — but that's exactly why it never rendered: Gmail and
// most other webmail clients strip <img src="data:..."> entirely regardless
// of image format, as a spam/tracking precaution. Referencing the already-
// publicly-hosted file by absolute URL is the fix; it needs no data URI at
// all since the asset is already served from the production domain.
const LOGO_URL = "https://tackly.co/favicon.svg";

function layout(previewText: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tackly</title>
</head>
<body style="margin:0;padding:0;background:#F3F0EA;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F0EA;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E8E4DC;">
        <tr><td style="padding:32px 32px 0 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:9px;"><img src="${LOGO_URL}" width="32" height="32" alt="Tackly" style="display:block;border-radius:8px;"></td>
            <td style="font-size:21px;font-weight:800;letter-spacing:-0.01em;color:#26241F;">tackly</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:24px 32px 32px 32px;color:#26241F;font-size:15px;line-height:1.6;">
          ${bodyHtml}
        </td></tr>
      </table>
      <p style="margin-top:24px;color:#A39E93;font-size:12px;">
        Tackly · sent to you because you have an account at tackly.co
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#6466E9;border-radius:10px;">
    <a href="${href}" style="display:inline-block;padding:12px 24px;color:#FFFFFF;font-weight:700;font-size:14px;text-decoration:none;">${label}</a>
  </td></tr></table>`;
}

type Template = {
  name: string;
  description: string;
  sampleData: Record<string, string>;
  render: (data: Record<string, string>) => { subject: string; html: string };
};

export const EMAIL_TEMPLATES: Record<string, Template> = {
  welcome: {
    name: "Welcome",
    description: "Sent right after a new account verifies its email.",
    sampleData: { first_name: "there", app_url: "https://tackly.co/app" },
    render: (d) => ({
      subject: "You're in — let's map some thinking 🧠",
      html: layout(
        "Welcome to Tackly — your first map is minutes away.",
        `<p style="margin:0 0 12px 0;">Hey ${d.first_name}, welcome aboard!</p>
         <p style="margin:0 0 12px 0;">Tackly's whole job is to eavesdrop — with permission, we promise — on your talking, whether that's a solo ramble, a live meeting, or a transcript you paste in, and turn it into an actual map of ideas, decisions, and open questions.</p>
         <p style="margin:0 0 12px 0;">Hold the mic and start talking, or throw a transcript at it and watch the map build itself.</p>
         ${button(d.app_url, "Open Tackly")}
         <p style="margin:16px 0 0 0;color:#6E6A61;font-size:13px;">Free plan: 30 minutes of thinking-out-loud a month, no card needed.</p>`
      ),
    }),
  },
  quota_warning: {
    name: "Approaching plan limit",
    description: "Sent when a user is close to their monthly minute limit.",
    sampleData: {
      first_name: "there",
      used_minutes: "27",
      limit_minutes: "30",
      plan_name: "Free",
      upgrade_url: "https://tackly.co/app/settings",
    },
    render: (d) => ({
      subject: `Heads up — you're almost out of thinking room 🧠⏳`,
      html: layout(
        `You've used ${d.used_minutes} of ${d.limit_minutes} minutes this month.`,
        `<p style="margin:0 0 12px 0;">Hey ${d.first_name},</p>
         <p style="margin:0 0 12px 0;">You've used <strong>${d.used_minutes} of ${d.limit_minutes} minutes</strong> on your ${d.plan_name} plan this month. Once you hit the ceiling, Tackly stops listening until next month — or you upgrade, no pressure.</p>
         ${button(d.upgrade_url, "Review plans")}`
      ),
    }),
  },
  plan_confirmation: {
    name: "Plan upgraded",
    description: "Sent after a successful Stripe checkout / plan change.",
    sampleData: { first_name: "there", plan_name: "Plus", app_url: "https://tackly.co/app" },
    render: (d) => ({
      subject: `Welcome to the ${d.plan_name} club 🎉`,
      html: layout(
        `You're now on the ${d.plan_name} plan.`,
        `<p style="margin:0 0 12px 0;">Hey ${d.first_name},</p>
         <p style="margin:0 0 12px 0;">You're officially on the <strong>${d.plan_name}</strong> plan. Thanks for backing Tackly — your new limits are live right now, so go talk its ear off.</p>
         ${button(d.app_url, "Open Tackly")}`
      ),
    }),
  },
};
