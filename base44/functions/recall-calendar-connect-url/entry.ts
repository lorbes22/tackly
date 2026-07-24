import { createClientFromRequest } from "npm:@base44/sdk";

// Builds the Google OAuth URL for Recall's Calendar V1 integration (docs:
// calendar-v1-google-calendar). Recall's own callback does the code<->token
// exchange server-side (redirect_uri is Recall's domain, already registered
// in the Google Cloud project per Recall's setup steps 1-3), then bounces
// the browser back to success_url/error_url below — we never see a Google
// auth code ourselves, and never touch the Google client secret (that's
// uploaded once to Recall's own dashboard, not here).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = Deno.env.get("RECALL_API_KEY");
    if (!apiKey) {
      return Response.json({ error: "RECALL_API_KEY is not configured" }, { status: 500 });
    }
    const clientId = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
    if (!clientId) {
      return Response.json(
        { error: "GOOGLE_CALENDAR_CLIENT_ID is not configured" },
        { status: 500 },
      );
    }
    const region = Deno.env.get("RECALL_REGION") || "eu-central-1";

    // Mint a fresh calendar auth token (expires in 24h per Recall's docs —
    // no reason to persist it, just generate one whenever we need it).
    const authRes = await fetch(`https://${region}.recall.ai/api/v1/calendar/authenticate/`, {
      method: "POST",
      headers: { authorization: apiKey, "content-type": "application/json" },
      body: JSON.stringify({ user_id: user.id }),
    });
    const authBody = await authRes.text();
    if (!authRes.ok) {
      return Response.json(
        { error: `Recall calendar authenticate failed (${authRes.status}): ${authBody.slice(0, 300)}` },
        { status: 502 },
      );
    }
    // Field name isn't confirmed in Recall's (interactive-only) docs page —
    // logged here so a mismatch shows up immediately in `npx base44 logs`.
    console.log("recall-calendar-connect-url: authenticate response =", authBody);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(authBody);
    } catch {
      // fall through to the error below
    }
    const token = (parsed.token ?? parsed.auth_token ?? parsed.calendar_auth_token) as
      | string
      | undefined;
    if (!token) {
      return Response.json(
        { error: "Recall calendar authenticate response had no recognizable token field" },
        { status: 502 },
      );
    }

    const redirectUri = `https://${region}.recall.ai/api/v1/calendar/google_oauth_callback/`;
    const state = JSON.stringify({
      recall_calendar_auth_token: token,
      google_oauth_redirect_url: redirectUri,
      success_url: "https://tackly.co/app/settings?calendar=connected",
      error_url: "https://tackly.co/app/settings?calendar=error",
    });

    const params = new URLSearchParams({
      scope:
        "https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/userinfo.email",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      response_type: "code",
      state,
      redirect_uri: redirectUri,
      client_id: clientId,
    });

    return Response.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
