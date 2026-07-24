import { createClientFromRequest } from "npm:@base44/sdk";

// Pushes the auto-join toggle to Recall's Calendar V1 recording preferences
// (docs: calendar-v1-recording-preferences). Uses override_should_record
// rather than the granular record_* condition flags — that field is the one
// clearly documented as an unconditional force on/off, while the granular
// flags' combination logic (AND vs OR) isn't spelled out anywhere, so
// they're not safe to guess at for a simple "on/off" toggle.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { auto_join } = await req.json();
    if (typeof auto_join !== "boolean") {
      return Response.json({ error: "auto_join must be a boolean" }, { status: 400 });
    }

    const apiKey = Deno.env.get("RECALL_API_KEY");
    if (!apiKey) {
      return Response.json({ error: "RECALL_API_KEY is not configured" }, { status: 500 });
    }
    const region = Deno.env.get("RECALL_REGION") || "eu-central-1";

    const prefRes = await fetch(`https://${region}.recall.ai/api/v1/calendar/user/`, {
      method: "PUT",
      headers: { authorization: apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        external_id: user.id,
        preferences: { override_should_record: auto_join },
      }),
    });
    if (!prefRes.ok) {
      const detail = await prefRes.text();
      return Response.json(
        { error: `Recall preferences update failed (${prefRes.status}): ${detail.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const existing = await base44.entities.CalendarConnection.filter({}, "-created_date", 1);
    if (existing[0]) {
      await base44.entities.CalendarConnection.update(existing[0].id, { auto_join });
    } else {
      // Shouldn't normally happen (the frontend only shows this toggle once
      // connected), but keep the two records from silently drifting apart.
      await base44.entities.CalendarConnection.create({
        provider: "google",
        connected_at: new Date().toISOString(),
        auto_join,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
