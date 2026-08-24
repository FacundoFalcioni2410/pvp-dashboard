import { useState } from "react";
import { useAuth } from "./AuthContext";

export default function AccountPanel({ onClose }) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (next !== confirmation) return setError("Las contraseñas nuevas no coinciden");
    setSaving(true);
    setError("");
    try {
      await changePassword(current, next);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="account-overlay" onMouseDown={onClose}>
      <form className="account-panel" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="account-title"><h2>Cambiar contraseña</h2><button type="button" onClick={onClose}>×</button></div>
        <p>Usá al menos 14 caracteres y tres tipos entre mayúsculas, minúsculas, números y símbolos.</p>
        <label>Contraseña actual<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
        <label>Nueva contraseña<input type="password" autoComplete="new-password" minLength={14} value={next} onChange={(e) => setNext(e.target.value)} required /></label>
        <label>Repetir contraseña<input type="password" autoComplete="new-password" minLength={14} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <div className="account-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving}>{saving ? "Guardando…" : "Cambiar contraseña"}</button></div>
      </form>
    </div>
  );
}
