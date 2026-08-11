import { useState, type FormEvent } from "react";

export interface SetupPayload {
  displayName: string;
  password: string;
  calDavPassword: string;
  timezone: string;
}

interface SetupProps {
  error: string | null;
  pending: boolean;
  onSetup: (payload: SetupPayload) => Promise<void>;
}

export const Setup = ({ error, pending, onSetup }: SetupProps) => {
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [calDavPassword, setCalDavPassword] = useState("");
  const [calDavConfirmation, setCalDavConfirmation] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== passwordConfirmation) {
      setLocalError("Die beiden lokalen Passwörter stimmen nicht überein.");
      return;
    }
    if (calDavPassword !== calDavConfirmation) {
      setLocalError("Die beiden CalDAV-Passwörter stimmen nicht überein.");
      return;
    }
    setLocalError(null);
    await onSetup({
      displayName,
      password,
      calDavPassword,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
  };

  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="setup-title">
        <div className="brand-mark" aria-hidden="true">
          <span />
        </div>
        <p className="eyebrow">ANTON LIFE OS</p>
        <h1 id="setup-title">Dein Life OS. Lokal eingerichtet.</h1>
        <p className="login-lede">
          Lege einmalig dein persönliches Profil und zwei getrennte Zugänge an.
          Die Angaben bleiben in deiner lokalen SQLite-Datenbank.
        </p>
        <div className="local-note">
          <span className="status-dot" />
          <span>Keine Cloud · kein Terminal · keine Beispielinhalte</span>
        </div>
      </section>

      <section
        className="login-panel setup-panel"
        aria-labelledby="setup-form-title"
      >
        <div>
          <p className="eyebrow">ERSTER START</p>
          <h2 id="setup-form-title">Lokal einrichten</h2>
          <p>
            Das App-Passwort schützt die Oberfläche. Der getrennte CalDAV-
            Zugang ist später für Apple Kalender bestimmt.
          </p>
        </div>

        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="display-name">Anzeigename</label>
          <input
            id="display-name"
            name="displayName"
            autoComplete="name"
            maxLength={200}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={pending}
            required
          />

          <label htmlFor="setup-password">App-Passwort</label>
          <input
            id="setup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
            required
          />
          <p className="field-hint">Mindestens 12 Zeichen.</p>

          <label htmlFor="setup-password-confirmation">
            App-Passwort wiederholen
          </label>
          <input
            id="setup-password-confirmation"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
            disabled={pending}
            required
          />

          <label htmlFor="caldav-password">CalDAV-Passwort</label>
          <input
            id="caldav-password"
            name="calDavPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            value={calDavPassword}
            onChange={(event) => setCalDavPassword(event.target.value)}
            disabled={pending}
            required
          />
          <p className="field-hint">
            Verwende dafür ein anderes Passwort als für die App.
          </p>

          <label htmlFor="caldav-password-confirmation">
            CalDAV-Passwort wiederholen
          </label>
          <input
            id="caldav-password-confirmation"
            name="calDavPasswordConfirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            value={calDavConfirmation}
            onChange={(event) => setCalDavConfirmation(event.target.value)}
            disabled={pending}
            required
          />

          {localError || error ? (
            <p role="alert" className="form-error">
              {localError ?? error}
            </p>
          ) : null}
          <button className="primary-button login-button" disabled={pending}>
            {pending ? "Einrichtung läuft …" : "Life OS einrichten"}
          </button>
        </form>

        <p className="privacy-copy">
          Passwörter werden nur gehasht gespeichert. Die App legt keine
          Zugangsdaten im Browser-Speicher ab.
        </p>
      </section>
    </main>
  );
};
