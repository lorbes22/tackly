import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { LifeBuoy } from "lucide-react";

const SupportTicket = base44.entities.SupportTicket;

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    SupportTicket.list("-created_date", 200)
      .then((rows) => !cancelled && setTickets(rows))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleStatus = async (ticket) => {
    setBusyId(ticket.id);
    const next = ticket.status === "resolved" ? "open" : "resolved";
    try {
      await SupportTicket.update(ticket.id, { status: next });
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, status: next } : t)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-periwinkle-tint">
          <LifeBuoy className="h-5 w-5 text-periwinkle-deep" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Tickets</h1>
          <p className="text-ink-soft">Messages sent through the support page.</p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-periwinkle" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line py-14 text-center">
            <p className="font-medium text-ink">No tickets yet</p>
            <p className="mt-1 text-sm text-ink-soft">Support messages will show up here.</p>
          </div>
        ) : (
          tickets.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-line bg-paper-raised p-4 shadow-note"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-base font-bold text-ink">{t.subject}</p>
                  <p className="text-sm text-ink-soft">
                    {t.name} · <a href={`mailto:${t.email}`} className="hover:text-ink">{t.email}</a> ·{" "}
                    {formatDate(t.created_date)}
                  </p>
                </div>
                <button
                  onClick={() => toggleStatus(t)}
                  disabled={busyId === t.id}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors disabled:opacity-50 ${
                    t.status === "resolved"
                      ? "bg-note-mint text-ink"
                      : "bg-note-amber text-ink"
                  }`}
                >
                  {t.status || "open"}
                </button>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {t.message}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
