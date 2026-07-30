import { Check, Link2, Trash2, Users } from "lucide-react";
import { LogoMark } from "@/components/Logo";

const MOCK_COLLABORATOR_EMAIL = "priya@acme.com";
const MOCK_SHARE_URL = "tackly.co/shared/8f2a91c3e6";

// Static mock of a real board header + its opened ShareDropdown (see
// ShareDropdown.jsx), frozen on the exact moment this section is selling:
// session tackled, one collaborator already invited, link already minted.
// Every control is decorative — no handlers, nothing actually copies or
// deletes anything.
export function ShareBoardPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-ink bg-paper-raised shadow-brutal">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <LogoMark className="h-5 w-5 shrink-0" />
          <span className="truncate text-sm font-medium text-ink">Q3 roadmap sync</span>
          <span className="hidden shrink-0 rounded-full border border-line bg-paper-sunken px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-faint sm:inline">
            Tackled
          </span>
        </div>
        <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-paper-sunken px-2.5 text-sm font-medium text-ink">
          <Users className="h-3.5 w-3.5" />
          Share
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 text-ink">
          <Users className="h-4 w-4" />
          <p className="text-sm font-bold">Collaborate</p>
          <span className="text-xs text-ink-faint">(1/3)</span>
        </div>
        <p className="mt-1 text-xs text-ink-soft">
          Full access, same as you — talking is one-at-a-time, so it's clear whose turn it is.
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-paper px-2.5 py-1.5">
          <span className="truncate text-xs text-ink">{MOCK_COLLABORATOR_EMAIL}</span>
          <Trash2 className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <div className="flex items-center gap-2 text-ink">
            <Link2 className="h-4 w-4" />
            <p className="text-sm font-bold">Share link</p>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            Read-only. Works for anyone with the link, no Tackly account needed.
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="h-8 flex-1 truncate rounded-lg border border-line bg-paper px-2 text-xs leading-8 text-ink-soft">
              {MOCK_SHARE_URL}
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-paper-raised text-ink shadow-brutal-sm">
              <Check className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
