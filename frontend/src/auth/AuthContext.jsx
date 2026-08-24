/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch("/auth/me")
      .then(async (response) => {
        if (active && response.ok) setUser((await response.json()).user);
      })
      .finally(() => { if (active) setLoading(false); });
    const unauthorized = () => setUser(null);
    window.addEventListener("pvp:unauthorized", unauthorized);
    return () => {
      active = false;
      window.removeEventListener("pvp:unauthorized", unauthorized);
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const response = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "No se pudo iniciar sesión");
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try { await apiFetch("/auth/logout", { method: "POST" }); } finally { setUser(null); }
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const response = await apiFetch("/auth/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "No se pudo cambiar la contraseña");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
