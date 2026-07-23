import { createClientFromRequest } from "npm:@base44/sdk";
import { EMAIL_TEMPLATES } from "../../shared/emailTemplates.ts";

// Admin-only: list templates, or render one with its sample data for preview.
// Never sends anything — just returns HTML for an iframe.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller || caller.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const { template } = await req.json().catch(() => ({ template: null }));

    if (!template) {
      const list = Object.entries(EMAIL_TEMPLATES).map(([key, t]) => ({
        key,
        name: t.name,
        description: t.description,
      }));
      return Response.json({ templates: list });
    }

    const t = EMAIL_TEMPLATES[template];
    if (!t) {
      return Response.json({ error: "Unknown template" }, { status: 404 });
    }
    const { subject, html } = t.render(t.sampleData);
    return Response.json({ subject, html });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
