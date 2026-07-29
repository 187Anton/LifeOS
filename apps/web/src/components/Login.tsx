import { useState, type FormEvent } from "react";

interface LoginProps {
  error: string | null;
  pending: boolean;
  onLogin: (password: string) => Promise<void>;
}

export const Login = ({ error, pending, onLogin }: LoginProps) => {
  const [password, setPassword] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onLogin(password);
    setPassword("");
  };

  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">
          <span />
        </div>
        <p className="eyebrow">ANTON LIFE OS</p>
        <h1 id="login-title">Dein Alltag. An einem ruhigen Ort.</h1>
        <p className="login-lede">
          Kalender, Projekte und persönliche Routinen bleiben lokal verbunden –
          nachvollziehbar und unter deiner Kontrolle.
        </p>
        <div className="local-note">
          <span className="status-dot" />
          <span>Lokaler Betrieb · keine Cloud erforderlich</span>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="login-form-title">
        <div>
          <p className="eyebrow">WILLKOMMEN ZURÜCK</p>
          <h2 id="login-form-title">Lokal anmelden</h2>
          <p>
            Verwende das Passwort, das du mit dem Bootstrap-Befehl gesetzt hast.
          </p>
        </div>

        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="password">Lokales Passwort</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={1}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
            required
          />
          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}
          <button className="primary-button login-button" disabled={pending}>
            {pending ? "Anmeldung läuft …" : "Anmelden"}
          </button>
        </form>

        <p className="privacy-copy">
          Das Passwort wird nur an deine lokale API gesendet und nicht im
          Browser gespeichert.
        </p>
      </section>
    </main>
  );
};
