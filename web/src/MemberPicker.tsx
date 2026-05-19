import { useEffect, useRef, useState } from "react";
import { api, type User } from "./api";

interface MemberPickerProps {
  members: string[];
  ownerEmail?: string;
  onChange: (members: string[]) => void;
}

export default function MemberPicker({
  members,
  ownerEmail,
  onChange,
}: MemberPickerProps) {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [input, setInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.users.list().then(setAllUsers);
  }, []);

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  const userByEmail = new Map(allUsers.map((u) => [u.email, u]));

  const suggestions = allUsers.filter((u) => {
    if (u.email === ownerEmail) return false;
    if (members.includes(u.email)) return false;
    if (!input) return true;
    const q = input.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q)
    );
  });

  function addMember(email: string) {
    const normalized = email.trim().toLowerCase();
    if (normalized && !members.includes(normalized) && normalized !== ownerEmail) {
      onChange([...members, normalized]);
    }
    setInput("");
    setShowDropdown(false);
  }

  function removeMember(email: string) {
    onChange(members.filter((m) => m !== email));
  }

  return (
    <div className="members-section">
      <span className="field-label">Members</span>
      {ownerEmail && (
        <div className="member-owner">
          {(() => {
            const u = userByEmail.get(ownerEmail);
            return u?.picture ? (
              <img src={u.picture} className="member-avatar" alt="" referrerPolicy="no-referrer" />
            ) : null;
          })()}
          <span className="member-email">
            {userByEmail.get(ownerEmail)?.name || ownerEmail}
          </span>
          <span className="owner-badge">owner</span>
        </div>
      )}
      {members.map((email) => {
        const u = userByEmail.get(email);
        return (
          <div key={email} className="member-row">
            {u?.picture && (
              <img src={u.picture} className="member-avatar" alt="" referrerPolicy="no-referrer" />
            )}
            <span className="member-email">{u?.name || email}</span>
            <button
              className="remove-member"
              onClick={() => removeMember(email)}
              aria-label={`Remove ${email}`}
            >
              &times;
            </button>
          </div>
        );
      })}
      <div className="add-member-row" ref={wrapperRef}>
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Add member..."
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (suggestions.length > 0) {
                addMember(suggestions[0].email);
              } else if (input.includes("@")) {
                addMember(input);
              }
            }
            if (e.key === "Escape") {
              setShowDropdown(false);
            }
          }}
        />
        {showDropdown && (input || suggestions.length > 0) && (
          <div className="member-suggestions">
            {suggestions.map((u) => (
              <button
                key={u.email}
                className="member-suggestion"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addMember(u.email)}
              >
                {u.picture && (
                  <img src={u.picture} className="member-avatar" alt="" referrerPolicy="no-referrer" />
                )}
                <span className="suggestion-name">{u.name || u.email}</span>
                {u.name && <span className="suggestion-email">{u.email}</span>}
              </button>
            ))}
            {suggestions.length === 0 && input.includes("@") && (
              <button
                className="member-suggestion"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addMember(input)}
              >
                <span className="suggestion-name">Invite {input}</span>
              </button>
            )}
            {suggestions.length === 0 && !input.includes("@") && (
              <div className="suggestion-empty">No matching users</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
