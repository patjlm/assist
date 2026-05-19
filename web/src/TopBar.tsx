import { useEffect, useState } from "react";
import type { Realm, User } from "./api";

interface TopBarProps {
  user: User;
  realms: Realm[];
  activeRealm: Realm | null;
  onRealmChange: (realm: Realm) => void;
  onNewRealm: () => void;
  onEditRealm: () => void;
  onPreferences: () => void;
  onLogout: () => void;
  onToggleSidebar: () => void;
}

export default function TopBar({
  user,
  realms,
  activeRealm,
  onRealmChange,
  onNewRealm,
  onEditRealm,
  onPreferences,
  onLogout,
  onToggleSidebar,
}: TopBarProps) {
  const [hamburgerOpen, setHamburgerOpen] = useState(false);

  useEffect(() => {
    if (!hamburgerOpen) return;
    const handler = () => setHamburgerOpen(false);
    setTimeout(() => document.addEventListener("click", handler), 0);
    return () => document.removeEventListener("click", handler);
  }, [hamburgerOpen]);

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button
          className="sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          &#9776;
        </button>
        <select
          className="realm-select"
          aria-label="Select realm"
          value={activeRealm?.id ?? ""}
          onChange={(e) => {
            if (e.target.value === "__new__") {
              onNewRealm();
              e.target.value = activeRealm?.id ?? "";
              return;
            }
            const r = realms.find((r) => r.id === e.target.value);
            if (r) onRealmChange(r);
          }}
        >
          {realms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}{r.personal ? " (personal)" : ""}
            </option>
          ))}
          <option disabled>───────────</option>
          <option value="__new__">+ New realm...</option>
        </select>
        <button className="icon-btn" onClick={onEditRealm} aria-label="Edit realm">
          Edit
        </button>
      </div>
      <div className="top-bar-right">
        <div className="user-info">
          {user.picture && (
            <img src={user.picture} className="avatar" alt="" referrerPolicy="no-referrer" />
          )}
          <span className="user-name">{user.name || user.email}</span>
        </div>
        <div className="hamburger-wrapper">
          <button
            className="hamburger-btn"
            onClick={(e) => {
              e.stopPropagation();
              setHamburgerOpen(!hamburgerOpen);
            }}
            aria-label="Menu"
            aria-expanded={hamburgerOpen}
          >
            &#9776;
          </button>
          {hamburgerOpen && (
            <div className="dropdown-menu hamburger-menu" role="menu">
              <button role="menuitem" onClick={onPreferences}>
                Preferences
              </button>
              <button role="menuitem" onClick={onLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
