import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Users } from "lucide-react";

const Plan = base44.entities.Plan;

export default function UsersPage() {
  const [users, setUsers] = useState(null);
  const [plans, setPlans] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res, p] = await Promise.all([
          base44.functions.invoke("admin-list-users", {}),
          Plan.list(),
        ]);
        if (!cancelled) {
          setUsers(res.data.users);
          setPlans(p);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || err.message || "Couldn't load users.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const planName = (planId) => {
    if (!planId) return "Free";
    return plans.find((p) => p.id === planId)?.name || "Free";
  };

  const handlePlanChange = async (userId, planId) => {
    setSavingId(userId);
    setError("");
    try {
      await base44.functions.invoke("admin-set-user-plan", { user_id: userId, plan_id: planId });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, plan_id: planId } : u)));
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Couldn't update that user's plan.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-periwinkle-tint">
          <Users className="h-5 w-5 text-periwinkle-deep" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Users</h1>
          <p className="text-ink-soft">Assign plans directly — useful for testing and support.</p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-note-coral px-3 py-2 text-sm text-ink" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-note">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs font-medium uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Plan</th>
            </tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr>
                <td className="px-4 py-6 text-ink-soft" colSpan={3}>
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-ink-soft" colSpan={3}>
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-ink">{u.email}</td>
                  <td className="px-4 py-3 capitalize text-ink-soft">{u.role || "user"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.plan_id || ""}
                      disabled={savingId === u.id}
                      onChange={(e) => handlePlanChange(u.id, e.target.value)}
                      className="h-9 rounded-lg border border-line bg-paper-raised px-2.5 text-sm text-ink disabled:opacity-50"
                    >
                      <option value="">Free</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <span className="ml-2 text-xs text-ink-faint">
                      {savingId === u.id ? "Saving…" : `(${planName(u.plan_id)})`}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
