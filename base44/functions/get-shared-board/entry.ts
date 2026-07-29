import { createClientFromRequest } from "npm:@base44/sdk";

// Public read-only board access — deliberately the ONE function in this app
// with no auth.me() check at all. Anyone with the token gets the board,
// logged in or not, matching the "share notes from a meeting with whoever
// was on it" use case even when they've never touched Tackly. Security
// rests entirely on the token being an unguessable per-session secret (not
// on the caller's identity), so this must never accept a session_id — the
// token IS the lookup key, exactly like a Google Doc "anyone with the link".
//
// The owner can only mint a token once the session has ended (enforced
// client-side in ShareDropdown, where public_share_token is created via a
// plain owner-scoped Session.update) — but this function itself doesn't
// re-check status, since a session that gets continued by voice after
// sharing should keep showing whatever's current, per product decision.
// public_share_revoked is the sole on/off switch, checked on every read.
Deno.serve(async (req) => {
  try {
    const { token } = await req.json();
    if (!token) {
      return Response.json({ error: "token is required" }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    const sessions = await db.Session.filter({ public_share_token: token }, "-created_date", 1);
    const session = sessions[0];
    if (!session || session.public_share_revoked) {
      return Response.json({ error: "This link isn't available." }, { status: 404 });
    }

    const session_id = session.id;
    const [nodes, utterances, notes, linksRaw, edgesRaw] = await Promise.all([
      db.Node.filter({ session_id }, "created_date", 2000),
      db.Utterance.filter({ session_id }, "start_ms", 3000),
      db.NodeNote.filter({ session_id }, "-created_date", 1000),
      db.NodeUtteranceLink.filter({}, "created_date", 5000),
      db.NodeEdge.filter({}, "created_date", 3000),
    ]);
    const n = nodes.filter((x: { hidden?: boolean }) => !x.hidden);
    const nodeIds = new Set(n.map((x: { id: string }) => x.id));
    const edges = edgesRaw.filter(
      (e: { from_node_id: string; to_node_id: string }) =>
        nodeIds.has(e.from_node_id) && nodeIds.has(e.to_node_id),
    );
    const links = linksRaw.filter((l: { node_id: string }) => nodeIds.has(l.node_id));

    // Strip anything a public, unauthenticated visitor has no reason to see.
    const { webhook_token: _wt, public_share_token: _pst, owner_email: _oe, ...rest } = session;

    return Response.json({
      session: rest,
      nodes: n,
      edges,
      utterances,
      notes,
      links,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
