import type { ReactNode } from "react";

import {
  CalendarIcon,
  HomeIcon,
  LogOutIcon,
  StudyIcon,
  TaskIcon,
  WorkIcon,
  PlanIcon,
  ProjectIcon,
  KnowledgeIcon,
} from "./Icons";

export type View =
  | "dashboard"
  | "tasks"
  | "calendar"
  | "study"
  | "work"
  | "projects"
  | "knowledge"
  | "planning";

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
          className={view === "tasks" ? "nav-item active" : "nav-item"}
          onClick={() => onViewChange("tasks")}
          aria-current={view === "tasks" ? "page" : undefined}
        >
          <TaskIcon />
          <span>Aufgaben</span>
        </button>
        <button
          className={view === "study" ? "nav-item active" : "nav-item"}
          onClick={() => onViewChange("study")}
          aria-current={view === "study" ? "page" : undefined}
        >
          <StudyIcon />
          <span>Studium</span>
        </button>
        <button
          className={view === "work" ? "nav-item active" : "nav-item"}
          onClick={() => onViewChange("work")}
          aria-current={view === "work" ? "page" : undefined}
        >
          <WorkIcon />
          <span>Arbeit</span>
        </button>
        <button
          className={view === "projects" ? "nav-item active" : "nav-item"}
          onClick={() => onViewChange("projects")}
          aria-current={view === "projects" ? "page" : undefined}
        >
          <ProjectIcon />
          <span>Projekte</span>
        </button>
        <button
          className={view === "calendar" ? "nav-item active" : "nav-item"}
          onClick={() => onViewChange("calendar")}
          aria-current={view === "calendar" ? "page" : undefined}
        >
          <CalendarIcon />
          <span>Kalender</span>
        </button>
        <button
          className={view === "knowledge" ? "nav-item active" : "nav-item"}
          onClick={() => onViewChange("knowledge")}
          aria-current={view === "knowledge" ? "page" : undefined}
        >
          <KnowledgeIcon />
          <span>Wissen</span>
        </button>
        <button
          className={view === "planning" ? "nav-item active" : "nav-item"}
          onClick={() => onViewChange("planning")}
          aria-current={view === "planning" ? "page" : undefined}
        >
          <PlanIcon />
          <span>Planung</span>
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
        className={view === "tasks" ? "active" : ""}
        onClick={() => onViewChange("tasks")}
        aria-current={view === "tasks" ? "page" : undefined}
      >
        <TaskIcon />
        <span>Aufgaben</span>
      </button>
      <button
        className={view === "study" ? "active" : ""}
        onClick={() => onViewChange("study")}
        aria-current={view === "study" ? "page" : undefined}
      >
        <StudyIcon />
        <span>Studium</span>
      </button>
      <button
        className={view === "work" ? "active" : ""}
        onClick={() => onViewChange("work")}
        aria-current={view === "work" ? "page" : undefined}
      >
        <WorkIcon />
        <span>Arbeit</span>
      </button>
      <button
        className={view === "projects" ? "active" : ""}
        onClick={() => onViewChange("projects")}
        aria-current={view === "projects" ? "page" : undefined}
      >
        <ProjectIcon />
        <span>Projekte</span>
      </button>
      <button
        className={view === "calendar" ? "active" : ""}
        onClick={() => onViewChange("calendar")}
        aria-current={view === "calendar" ? "page" : undefined}
      >
        <CalendarIcon />
        <span>Kalender</span>
      </button>
      <button
        className={view === "knowledge" ? "active" : ""}
        onClick={() => onViewChange("knowledge")}
        aria-current={view === "knowledge" ? "page" : undefined}
      >
        <KnowledgeIcon />
        <span>Wissen</span>
      </button>
      <button
        className={view === "planning" ? "active" : ""}
        onClick={() => onViewChange("planning")}
        aria-current={view === "planning" ? "page" : undefined}
      >
        <PlanIcon />
        <span>Planung</span>
      </button>
    </nav>
  </div>
);
