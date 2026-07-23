import { createClientFromRequest } from "npm:@base44/sdk";
import { sendEmail } from "../../shared/resend.ts";
import { EMAIL_TEMPLATES } from "../../shared/emailTemplates.ts";

// Frontend-triggerable send, scoped to exactly one template and the caller's
// own email — there's no user input beyond "send me the welcome email",
// which keeps this safe to call right after signup without any admin gate.
// Other templates (quota_warning, plan_confirmation) are sent directly from
// backend functions that already know the right recipient (process-session,
// the future Stripe webhook), not through this endpoint.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const template = EMAIL_TEMPLATES.welcome;
    const { subject, html } = template.render({
      first_name: (user.full_name || user.email.split("@")[0] || "there").split(" ")[0],
      app_url: "https://tackly.co/app",
    });

    await sendEmail(user.email, subject, html);
    return Response.json({ ok: true });
  } catch (error) {
    // Best-effort — never let a broken email send block signup.
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
