import { createClientFromRequest } from "npm:@base44/sdk";

// TEMPORARY debugging function — admin-only, service-role dump of a session
// by title substring. Delete after use.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller || caller.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const { title_contains } = await req.json();
    if (!title_contains) {
      return Response.json({ error: "title_contains is required" }, { status: 400 });
    }

    const allSessions = await base44.asServiceRole.entities.Session.filter({}, "-created_date", 200);
    const matches = allSessions.filter((s: any) =>
      (s.title || "").toLowerCase().includes(String(title_contains).toLowerCase())
    );
    if (!matches.length) {
      return Response.json({ error: "no session found", searched: allSessions.length });
    }
    const session = matches[0];

    const [utterances, nodes, edges, ops] = await Promise.all([
      base44.asServiceRole.entities.Utterance.filter({ session_id: session.id }),
      base44.asServiceRole.entities.Node.filter({ session_id: session.id }),
      base44.asServiceRole.entities.NodeEdge.filter({ session_id: session.id }),
      base44.asServiceRole.entities.SessionOp.filter({ session_id: session.id }),
    ]);

    utterances.sort((a: any, b: any) => a.start_ms - b.start_ms);
    ops.sort((a: any, b: any) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());

    return Response.json({ session, utterances, nodes, edges, ops });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
