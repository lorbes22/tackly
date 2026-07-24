import { createPortal } from "react-dom";
import { PlanCards } from "@/components/PlanCards";
import { X } from "lucide-react";

// Logged-in users get plans as a popup rather than being navigated away
// from Settings to the public /plans page — same PlanCards grid either way.
// Portaled to document.body: Settings' root div carries animate-fade-up,
// whose "both" fill-mode leaves a permanent (non-none) transform on it once
// the animation ends — per the CSS spec that makes it the containing block
// for any `position: fixed` descendant, so without the portal this modal
// gets capped to Settings' own max-w-lg column instead of the viewport.
export function PlansModal({ onClose }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/40 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-2xl border-2 border-ink bg-paper-raised p-6 shadow-brutal animate-fade-up sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
              Plans &amp; pricing
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Free to start — 30 minutes of rambling a month, meetings included.
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <PlanCards className="mt-6" />
      </div>
    </div>,
    document.body
  );
}
