import { createClientFromRequest } from "npm:@base44/sdk";
import { sendEmail } from "../../shared/resend.ts";
import { EMAIL_TEMPLATES } from "../../shared/emailTemplates.ts";

const MAX_COLLABORATORS = 3;

// Owner-only: invites another Tackly user (by email) onto a board as a
// full-parity collaborator. The Collaborator row is written regardless of
// whether that email has an account yet — the invite email still goes out
// either way, and get-board-access resolves access the moment they sign up
// under the same address. Goes through service role (not a direct frontend
// Collaborator.create()) specifically so the max-3 cap can be enforced
// server-side — RLS alone can't count existing rows.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { session_id, collaborator_email } = await req.json();
    if (!session_id || !collaborator_email || typeof collaborator_email !== "string") {
      return Response.json(
        { error: "session_id and collaborator_email are required" },
        { status: 400 },
      );
    }
    const email = collaborator_email.trim();

    const db = base44.asServiceRole.entities;
    const session = await db.Session.get(session_id).catch(() => null);
    if (!session) {
      return Response.json({ error: "Board not found" }, { status: 404 });
    }
    if (session.owner_email !== user.email) {
      return Response.json(
        { error: "Only the board's owner can invite collaborators." },
        { status: 403 },
      );
    }
    if (email.toLowerCase() === user.email.toLowerCase()) {
      return Response.json(
        { error: "You already own this board." },
        { status: 400 },
      );
    }

    const existing = await db.Collaborator.filter({ session_id }, "-created_date", 50);
    if (existing.some((c: { collaborator_email: string }) => c.collaborator_email.toLowerCase() === email.toLowerCase())) {
      return Response.json(
        { error: `${email} is already a collaborator on this board.` },
        { status: 400 },
      );
    }
    if (existing.length >= MAX_COLLABORATORS) {
      return Response.json(
        { error: `This board already has the maximum of ${MAX_COLLABORATORS} collaborators.` },
        { status: 400 },
      );
    }

    const collaborator = await db.Collaborator.create({
      session_id,
      owner_email: user.email,
      collaborator_email: email,
      session_title: session.title || "",
      invited_at: new Date().toISOString(),
    });

    const accountExists = (
      await db.User.filter({ email }, "-created_date", 1)
    ).length > 0;

    let emailSent = false;
    try {
      const { subject, html } = EMAIL_TEMPLATES.board_invite.render({
        inviter_email: user.email,
        board_title: session.title || "a Tackly board",
        invite_url: `https://tackly.co/app/board/${session_id}?invited=1&title=${encodeURIComponent(session.title || "")}`,
      });
      await sendEmail(email, subject, html);
      emailSent = true;
    } catch {
      // Invite still counts even if the email send fails (e.g. secret not
      // configured) — the collaborator row is what actually grants access.
    }

    return Response.json({ collaborator, account_exists: accountExists, email_sent: emailSent });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
