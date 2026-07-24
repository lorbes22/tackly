import { createClientFromRequest } from "npm:@base44/sdk";

// Unauthenticated by design — this is the first step of the dynamic
// email-first auth flow (PLAN.md), called before the visitor has an
// account or session. Deliberately returns ONLY a boolean, nothing else
// about the account, to keep the standard "does this email exist" tradeoff
// (same one Slack/Notion/etc. accept for this exact UX) as narrow as
// possible — no name, no plan, no signup date.
Deno.serve(async (req) => {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return Response.json({ error: "email is required" }, { status: 400 });
    }

    // Trim only — not case-folding, since we don't want to assume Base44's
    // own storage/comparison normalizes case differently than a naive
    // lowercase here would; better to mirror whatever loginViaEmailPassword
    // itself already relies on (exact string as typed) than risk a mismatch.
    const base44 = createClientFromRequest(req);
    const matches = await base44.asServiceRole.entities.User.filter(
      { email: email.trim() },
      "-created_date",
      1,
    );
    return Response.json({ exists: matches.length > 0 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
