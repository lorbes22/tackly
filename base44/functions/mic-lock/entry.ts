import { createClientFromRequest } from "npm:@base44/sdk";

// Collaboration only: only one collaborator (owner included) can hold the
// mic at a time on a given session, so two people's audio never streams
// into the same Utterance pipeline at once. Claim on hold-to-talk press,
// release on release — mirrors the same press/release lifecycle the
// personal AssemblyAI billing-safety design already uses. STALE_MS is the
// same kind of defense-in-depth backstop as that flow's server-side
// max_session_duration_seconds: if a client crashes mid-hold without
// releasing, the lock frees itself rather than stranding everyone else.
//
// This is a best-effort claim, not a true compare-and-swap — two people
// pressing at the exact same instant could both read the lock as free in
// the same few milliseconds. Acceptable here: the failure mode is a brief
// overlap in who's talking, not a security or data-integrity issue, and a
// generic entity update doesn't give us a real atomic compare-and-swap to
// build on anyway.
const STALE_MS = 60_000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { session_id, action } = await req.json();
    if (!session_id || (action !== "claim" && action !== "release")) {
      return Response.json(
        { error: "session_id and action ('claim' | 'release') are required" },
        { status: 400 },
      );
    }

    const db = base44.asServiceRole.entities;
    const session = await db.Session.get(session_id).catch(() => null);
    if (!session) {
      return Response.json({ error: "Board not found" }, { status: 404 });
    }

    // Only the owner or an active collaborator may hold the mic — a public
    // read-only share link has no write access at all.
    const isOwner = session.owner_email && session.owner_email === user.email;
    if (!isOwner) {
      const collabs = await db.Collaborator.filter(
        { session_id, collaborator_email: user.email },
        "-created_date",
        1,
      );
      if (collabs.length === 0) {
        return Response.json(
          { error: "You don't have access to this board." },
          { status: 403 },
        );
      }
    }

    if (action === "release") {
      if (session.active_speaker_email === user.email) {
        await db.Session.update(session_id, {
          active_speaker_email: null,
          active_speaker_claimed_at: null,
        });
      }
      return Response.json({ released: true });
    }

    // action === "claim"
    const claimedAt = session.active_speaker_claimed_at
      ? new Date(session.active_speaker_claimed_at).getTime()
      : 0;
    const isStale = !claimedAt || Date.now() - claimedAt > STALE_MS;
    const heldByMe = session.active_speaker_email === user.email;

    if (!session.active_speaker_email || isStale || heldByMe) {
      await db.Session.update(session_id, {
        active_speaker_email: user.email,
        active_speaker_claimed_at: new Date().toISOString(),
      });
      return Response.json({ claimed: true });
    }

    return Response.json({
      claimed: false,
      active_speaker_email: session.active_speaker_email,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
