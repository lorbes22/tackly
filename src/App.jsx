import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/lib/AuthContext";
import { RequireAdmin, RequireAuth } from "@/lib/guards";
import Landing from "@/pages/Landing";
import Login from "@/pages/auth/Login";
import Signup from "@/pages/auth/Signup";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import AppLayout from "@/layouts/AppLayout";
import Home from "@/pages/app/Home";
import Board from "@/pages/app/Board";
import NewSession from "@/pages/app/NewSession";
import SearchPage from "@/pages/app/SearchPage";
import SettingsPage from "@/pages/app/SettingsPage";
import AdminLayout from "@/layouts/AdminLayout";
import Overview from "@/pages/admin/Overview";
import UsersPage from "@/pages/admin/UsersPage";
import PlansPage from "@/pages/admin/PlansPage";
import EmailsPage from "@/pages/admin/EmailsPage";
import ConfigPage from "@/pages/admin/ConfigPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Canvas-first: the board fills the viewport, outside the app chrome */}
          <Route
            path="/app/board/:sessionId"
            element={
              <RequireAuth>
                <Board />
              </RequireAuth>
            }
          />

          <Route
            path="/app"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Home />} />
            <Route path="new" element={<NewSession />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Overview />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="plans" element={<PlansPage />} />
            <Route path="emails" element={<EmailsPage />} />
            <Route path="config" element={<ConfigPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
