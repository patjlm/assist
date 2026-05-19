"""Per-user preferences storage."""

from __future__ import annotations

import json
import re
from pathlib import Path

from .models import UserPreferences

USERS_DIR = Path("data/users")


def _user_dir(email: str) -> Path:
    safe = re.sub(r"[^\w.@-]", "_", email.lower())
    return USERS_DIR / safe


def get_preferences(email: str) -> UserPreferences:
    p = _user_dir(email) / "preferences.json"
    if p.exists():
        return UserPreferences.model_validate_json(p.read_text())
    return UserPreferences()


def set_preferences(email: str, prefs: UserPreferences) -> UserPreferences:
    d = _user_dir(email)
    d.mkdir(parents=True, exist_ok=True)
    (d / "preferences.json").write_text(
        json.dumps(prefs.model_dump(mode="json"), indent=2)
    )
    return prefs
