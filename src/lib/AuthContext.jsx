import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { base44 } from "@/api/base44Client";

const AuthContext = createContext({
  user: null,
  loading: true,
  refresh: async () => null,
  logout: () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      setUser(me ?? null);
      return me ?? null;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    base44.auth.logout(window.location.origin);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
