import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Check, Copy, Link2, Loader2, Share2, Trash2, Users, X } from "lucide-react";

const Collaborator = base44.entities.Collaborator;
const Session = base44.entities.Session;

function randomToken() {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Owner-only board sharing config — a clickable text link (not a full
// button, per request) next to the AI Assistant button, opening a dropdown
// with two independent things: a livestream watch-link (view-only, only
// works while the session is still active) and Collaborate (up to 3 named,
// full-parity collaborators). Both live entirely client-side against
// existing owner-scoped RLS + the invite-collaborator function — no new
// backend needed for the livestream link itself since Session.update is
// already owner-permitted.
export function ShareDropdown({ session, onSessionChange }) {
  const [open, setOpen] = useState(false);
  const [collaborators, setCollaborators] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [removingId, setRemovingId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    Collaborator.filter({ session_id: session.id }, "-invited_at", 10)
      .then(setCollaborators)
      .catch(() => setCollaborators([]));
  }, [open, session.id]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const liveUrl = session.livestream_token
    ? `${window.location.origin}/app/board/${session.id}?live=${session.livestream_token}`
    : null;

  const createLink = async () => {
    setCreatingLink(true);
    try {
      const token = randomToken();
      await Session.update(session.id, { livestream_token: token });
      onSessionChange({ ...session, livestream_token: token });
    } catch {
      // best-effort — the button just stays available to retry
    } finally {
      setCreatingLink(false);
    }
  };

  const copyLink = async () => {
    if (!liveUrl) return;
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard access denied — link is still visible to select manually
    }
  };

  const invite = async (e) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    setInviteError("");
    try {
      const res = await base44.functions.invoke("invite-collaborator", {
        session_id: session.id,
        collaborator_email: email,
      });
      setCollaborators((prev) => [res.data.collaborator, ...(prev || [])]);
      setInviteEmail("");
    } catch (err) {
      setInviteError(err.response?.data?.error || err.message || "Couldn't send that invite.");
    } finally {
      setInviting(false);
    }
  };

  const removeCollaborator = async (collab) => {
    setRemovingId(collab.id);
    try {
      await Collaborator.delete(collab.id);
      setCollaborators((prev) => prev.filter((c) => c.id !== collab.id));
    } catch {
      // best-effort; stays in the list if it failed
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
      >
        <Share2 className="h-3.5 w-3.5" />
        Livestream / Share
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-2xl border-2 border-ink bg-paper-raised p-4 shadow-brutal animate-fade-up">
          <div>
            <div className="flex items-center gap-2 text-ink">
              <Link2 className="h-4 w-4" />
              <p className="text-sm font-bold">Livestream</p>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              Anyone with this link (and a Tackly account) can watch live, read-only — it stops
              working the moment this session ends.
            </p>
            {liveUrl ? (
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  readOnly
                  value={liveUrl}
                  onClick={(e) => e.target.select()}
                  className="h-8 flex-1 truncate rounded-lg border border-line bg-paper px-2 text-xs text-ink-soft"
                />
                <button
                  onClick={copyLink}
                  title="Copy link"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-paper-raised text-ink shadow-brutal-sm transition-transform hover:-translate-y-px"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            ) : (
              <button
                onClick={createLink}
                disabled={creatingLink}
                className="mt-2 flex h-8 items-center gap-1.5 rounded-lg border-2 border-ink bg-paper-raised px-3 text-xs font-semibold text-ink shadow-brutal-sm transition-transform hover:-translate-y-px disabled:opacity-50"
              >
                {creatingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                Create watch link
              </button>
            )}
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <div className="flex items-center gap-2 text-ink">
              <Users className="h-4 w-4" />
              <p className="text-sm font-bold">Collaborate</p>
              <span className="text-xs text-ink-faint">({collaborators?.length ?? 0}/3)</span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              Full access, same as you — talking is one-at-a-time, so it's clear whose turn it is.
              Has to be another Tackly account.
            </p>

            {collaborators === null ? (
              <p className="mt-2 text-xs text-ink-faint">Loading…</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {collaborators.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-paper px-2.5 py-1.5"
                  >
                    <span className="truncate text-xs text-ink">{c.collaborator_email}</span>
                    <button
                      onClick={() => removeCollaborator(c)}
                      disabled={removingId === c.id}
                      title="Remove"
                      className="shrink-0 text-ink-faint hover:text-note-coral-edge disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {(collaborators?.length ?? 0) < 3 && (
              <form onSubmit={invite} className="mt-2 flex items-center gap-1.5">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="their@email.com"
                  disabled={inviting}
                  className="h-8 flex-1 rounded-lg border border-line bg-paper px-2.5 text-xs placeholder:text-ink-faint focus:border-periwinkle disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="h-8 shrink-0 rounded-lg bg-periwinkle px-3 text-xs font-semibold text-white transition-colors hover:bg-periwinkle-deep disabled:opacity-50"
                >
                  {inviting ? "Inviting…" : "Invite"}
                </button>
              </form>
            )}
            {inviteError && (
              <p className="mt-1.5 flex items-start gap-1 text-xs text-note-coral-edge">
                <X className="mt-0.5 h-3 w-3 shrink-0" />
                {inviteError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
