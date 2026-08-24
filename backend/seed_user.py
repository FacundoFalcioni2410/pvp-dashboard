"""Idempotently seed the initial local administrator.

Only the salted scrypt hash is stored here. Running this module never changes an
existing account, including an existing inactive account.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

try:
    from .database import ensure_catalog
    from .security import ensure_security_tables, seed_user_with_hash
except ImportError:
    from database import ensure_catalog
    from security import ensure_security_tables, seed_user_with_hash


USERNAME = "admin"
PASSWORD_HASH = (
    "scrypt$32768$8$1$5e0841a6e1ac286a866e00f5a832896f$"
    "ddc5562d60726c6bbd56f00c915d994e356396e88ef1eb4ce4f862106c16310c"
)


def seed_default_user() -> bool:
    return seed_user_with_hash(USERNAME, PASSWORD_HASH)


def main() -> None:
    ensure_catalog()
    ensure_security_tables()
    created = seed_default_user()
    if created:
        print(f"Seeded user '{USERNAME}'.")
    else:
        print(f"User '{USERNAME}' already exists; no changes made.")


if __name__ == "__main__":
    main()
