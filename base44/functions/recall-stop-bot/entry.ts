import { createClientFromRequest } from "npm:@base44/sdk";

// Ends a bot-live session: tells the Recall bot to leave the call and flips
// the session to "processing" so the board's catch-up pass finishes mapping
// and runs consolidation.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { session_id } = await req.json();
    if (!session_id) {
      return Response.json({ error: "session_id is required" }, { status: 400 });
    }

    // User-context read: RLS guarantees the caller owns this session
    const session = await base44.entities.Session.get(session_id);
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.bot_id) {
      const apiKey = Deno.env.get("RECALL_API_KEY");
      const region = Deno.env.get("RECALL_REGION") || "eu-central-1";
      if (apiKey) {
        // Best-effort: the bot also leaves on its own when the call ends
        await fetch(
          `https://${region}.recall.ai/api/v1/bot/${session.bot_id}/leave_call/`,
          { method: "POST", headers: { authorization: apiKey } },
        ).catch(() => {});
      }
    }

    await base44.entities.Session.update(session_id, {
      status: "processing",
      ended_at: new Date().toISOString(),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
