"""Realm management — directory-based multi-tenancy."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from .models import Realm

_VALID_REALM_ID = re.compile(r"^[0-9a-f]{12}$")

REALMS_DIR = Path("data/realms")


def _realm_dir(realm_id: str) -> Path:
    return REALMS_DIR / realm_id


def _realm_file(realm_id: str) -> Path:
    return _realm_dir(realm_id) / "realm.json"


def validate_realm_id(realm_id: str) -> None:
    if not _VALID_REALM_ID.match(realm_id):
        raise ValueError(f"invalid realm id: {realm_id}")


def get_realm(realm_id: str) -> Realm | None:
    validate_realm_id(realm_id)
    path = _realm_file(realm_id)
    if not path.exists():
        return None
    return Realm.model_validate_json(path.read_text())


def list_realms_for_user(email: str) -> list[Realm]:
    if not REALMS_DIR.exists():
        return []
    realms = []
    for d in REALMS_DIR.iterdir():
        if not d.is_dir():
            continue
        rf = d / "realm.json"
        if not rf.exists():
            continue
        realm = Realm.model_validate_json(rf.read_text())
        if realm.owner_email == email or email in realm.members:
            realms.append(realm)
    return sorted(realms, key=lambda r: r.created_at)


def create_realm(realm: Realm) -> Realm:
    validate_realm_id(realm.id)
    d = _realm_dir(realm.id)
    d.mkdir(parents=True, exist_ok=True)
    _realm_file(realm.id).write_text(
        json.dumps(realm.model_dump(mode="json"), indent=2)
    )
    return realm


def update_realm(realm_id: str, updates: dict) -> Realm | None:
    realm = get_realm(realm_id)
    if not realm:
        return None
    data = realm.model_dump(mode="json")
    allowed = {"name"}
    data.update({k: v for k, v in updates.items() if k in allowed and v is not None})
    updated = Realm.model_validate(data)
    _realm_file(realm_id).write_text(
        json.dumps(updated.model_dump(mode="json"), indent=2)
    )
    return updated


def delete_realm(realm_id: str) -> bool:
    validate_realm_id(realm_id)
    d = _realm_dir(realm_id)
    if not d.exists():
        return False
    shutil.rmtree(d)
    return True


def check_access(realm_id: str, email: str) -> bool:
    realm = get_realm(realm_id)
    if not realm:
        return False
    return realm.owner_email == email or email in realm.members


def ensure_personal_realm(email: str, name: str) -> Realm:
    for realm in list_realms_for_user(email):
        if realm.personal and realm.owner_email == email:
            return realm
    realm = Realm(name=f"{name}'s space", owner_email=email, personal=True)
    return create_realm(realm)
