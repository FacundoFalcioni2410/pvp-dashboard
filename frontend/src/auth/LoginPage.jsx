import { useState } from "react";
import { useAuth } from "./AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message === "No user configured"
        ? "No hay un administrador configurado. Ejecutá el comando de creación de usuario del README."
        : err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-mark">PVP</div>
        <h1>Control de Precios</h1>
        <p>Ingresá con tu cuenta para acceder al dashboard.</p>
        <label>
          Usuario
          <input autoComplete="username" autoFocus maxLength={64} value={username}
            onChange={(event) => setUsername(event.target.value)} required />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" maxLength={1024} value={password}
            onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Verificando…" : "Iniciar sesión"}
        </button>
      </form>
    </main>
  );
}
