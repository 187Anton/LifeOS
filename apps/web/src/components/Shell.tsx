import type { ReactNode } from "react";

import { CalendarIcon, HomeIcon, LogOutIcon } from "./Icons";

export type View = "dashboard" | "calendar";

interface ShellProps {
  children: ReactNode;
  displayName: string;
  view: View;
  onViewChange: (view: View) => void;
  onLogout: () => void;
}

export const Shell = ({
  children,
  displayName,
  view,
  onViewChange,
  onLogout,
}: ShellProps) => (
  <div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark compact" aria-hidden="true">
          <span />
        </div>
        <div>
          <strong>Life OS</strong>
          <span>lokal & persönlich</span>
        </div>
      </div>

      <nav aria-label="Hauptnavigation" className="main-navigation">
        <button
          className={view === "dashboard" ? "nav-item active" : "nav-item"}
          onClick={() => onViewChange("dashboard")}
          aria-current={view === "dashboard" ? "page" : undefined}
        >
          <HomeIcon />
          <span>Übersicht</span>
        </button>
        <button
          className={view === "calendar" ? "nav-item active" : "nav-item"}
          onClick={() => onViewChange("calendar")}
          aria-current={view === "calendar" ? "page" : undefined}
        >
          <CalendarIcon />
          <span>Kalender</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <div
          className="profile-chip"
          aria-label={`Angemeldet als ${displayName}`}
        >
          <span className="avatar">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
          <span className="profile-name">{displayName}</span>
        </div>
        <button
          className="icon-button light"
          onClick={onLogout}
          aria-label="Abmelden"
        >
          <LogOutIcon />
        </button>
      </div>
    </aside>

    <div className="page-frame">
      <header className="mobile-header">
        <div className="sidebar-brand">
          <div className="brand-mark compact" aria-hidden="true">
            <span />
          </div>
          <strong>Life OS</strong>
        </div>
        <button
          className="icon-button"
          onClick={onLogout}
          aria-label="Abmelden"
        >
          <LogOutIcon />
        </button>
      </header>
      {children}
    </div>

    <nav aria-label="Mobile Hauptnavigation" className="mobile-navigation">
      <button
        className={view === "dashboard" ? "active" : ""}
        onClick={() => onViewChange("dashboard")}
        aria-current={view === "dashboard" ? "page" : undefined}
      >
        <HomeIcon />
        <span>Übersicht</span>
      </button>
      <button
        className={view === "calendar" ? "active" : ""}
        onClick={() => onViewChange("calendar")}
        aria-current={view === "calendar" ? "page" : undefined}
      >
        <CalendarIcon />
        <span>Kalender</span>
      </button>
    </nav>
  </div>
);
