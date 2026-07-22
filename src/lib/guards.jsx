import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-periwinkle" />
    </div>
  );
}

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;
  if (!user) {
    return (
      <Navigate to="/login" state={{ returnTo: location.pathname }} replace />
    );
  }
  return children;
}

export function RequireAdmin({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" state={{ returnTo: "/admin" }} replace />;
  if (user.role !== "admin") return <Navigate to="/app" replace />;
  return children;
}
