import { createClientFromRequest } from "npm:@base44/sdk";

// The single gateway a collaborator (editor) uses to view and act on
// someone else's board. Session/Node/NodeEdge/Utterance/NodeNote RLS stays
// owner-only by design (see the security-scan fix that closed public create
// access on these entities) — a collaborator can never read these tables
// directly, only through this function's own access check, via service
// role. Returns a full board snapshot rather than an ops-log replay: a
// collaborator's client polls this on an interval instead of subscribing to
// realtime, which only ever runs within the subscriber's own RLS and can't
// be extended to someone else's rows without reopening exactly what was
// just locked down.
//
// This is deliberately owner/editor only. Read-only sharing (anyone with a
// link, no account needed) is a completely separate, unauthenticated path —
// see get-shared-board — since it has a different security model entirely
// (a public token instead of a logged-in identity) and doesn't belong mixed
// into this function's auth-required flow.
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

    const db = base44.asServiceRole.entities;
    const session = await db.Session.get(session_id).catch(() => null);
    if (!session) {
      return Response.json({ error: "Board not found" }, { status: 404 });
    }

    let role: "owner" | "editor" | null = null;
    if (session.owner_email && session.owner_email === user.email) {
      role = "owner";
    } else {
      const collabs = await db.Collaborator.filter(
        { session_id, collaborator_email: user.email },
        "-created_date",
        1,
      );
      if (collabs.length > 0) {
        role = "editor";
      }
    }

    if (!role) {
      return Response.json(
        { error: "You don't have access to this board." },
        { status: 403 },
      );
    }

    const [nodes, utterances, notes, edgesRaw] = await Promise.all([
      db.Node.filter({ session_id }, "created_date", 2000),
      db.Utterance.filter({ session_id }, "start_ms", 3000),
      db.NodeNote.filter({ session_id }, "-created_date", 1000),
      db.NodeEdge.filter({}, "created_date", 3000),
    ]);
    const nodeIds = new Set(nodes.map((n: { id: string }) => n.id));
    const edges = edgesRaw.filter(
      (e: { from_node_id: string; to_node_id: string }) =>
        nodeIds.has(e.from_node_id) || nodeIds.has(e.to_node_id),
    );

    // Strip fields a non-owner has no reason to see (Recall webhook auth token).
    const { webhook_token: _wt, ...safeSession } = session;

    return Response.json({ role, session: safeSession, nodes, edges, utterances, notes });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
