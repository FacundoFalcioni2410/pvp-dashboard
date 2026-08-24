import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

try:
    from .database import ensure_catalog
    from .security import create_user, ensure_security_tables
except ImportError:
    from database import ensure_catalog
    from security import create_user, ensure_security_tables


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or reset the dashboard administrator")
    parser.add_argument("username", help="Administrator username")
    parser.add_argument("--reset", action="store_true", help="Reset an existing user's password")
    args = parser.parse_args()

    password = getpass.getpass("Password: ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match")

    ensure_catalog()
    ensure_security_tables()
    try:
        create_user(args.username, password, replace=args.reset)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    print(f"User '{args.username.strip()}' is ready.")


if __name__ == "__main__":
    main()
