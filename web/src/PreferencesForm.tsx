import { useState } from "react";
import type { Theme, UserPreferences } from "./api";

interface PreferencesFormProps {
  preferences: UserPreferences;
  oauthName: string;
  onSave: (prefs: UserPreferences) => void;
  onCancel: () => void;
}

export default function PreferencesForm({
  preferences,
  oauthName,
  onSave,
  onCancel,
}: PreferencesFormProps) {
  const [displayName, setDisplayName] = useState(preferences.display_name ?? "");
  const [theme, setTheme] = useState<Theme>(preferences.theme);

  function save() {
    onSave({
      theme,
      display_name: displayName.trim() || null,
    });
  }

  return (
    <div className="agent-form">
      <h2>Preferences</h2>

      <label className="field">
        <span className="field-label">Display name</span>
        <span className="field-hint">
          Override how your name appears to others. Leave blank to use your Google account name ({oauthName}).
        </span>
        <input
          placeholder={oauthName}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoFocus
        />
      </label>

      <label className="field">
        <span className="field-label">Theme</span>
        <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>

      <div className="form-actions">
        <button onClick={save}>Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
