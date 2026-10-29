"""Lead Center maintenance commands.

    uv run python -m app.devtools status
    uv run python -m app.devtools reset-sandbox [--with-sample]
    uv run python -m app.devtools reset-user-data [--mode activity|all] [--yes]

reset-user-data is a dry run unless --yes is given. With --yes it first writes a manual backup to
data/backups/ and aborts if that backup fails. Close Lead Center before running it.
"""

import argparse
import os
import sys


def _use_profile(profile: str) -> None:
    os.environ["LEAD_CENTER_PROFILE"] = profile
    if profile == "sandbox":
        os.environ.pop("LEAD_CENTER_DATABASE_PATH", None)


def _summary(db) -> str:
    from sqlalchemy import func, select

    from app.models import LeadRecord, ManualReview, OSMBusiness, OutreachEvent

    states = dict(db.execute(select(OSMBusiness.record_state, func.count()).group_by(OSMBusiness.record_state)).all())
    return (
        f"  businesses: {sum(states.values())} {states}\n"
        f"  reviews: {db.scalar(select(func.count()).select_from(ManualReview))}"
        f"  leads: {db.scalar(select(func.count()).select_from(LeadRecord))}"
        f"  outreach events: {db.scalar(select(func.count()).select_from(OutreachEvent))}"
    )


def read_status(path) -> str:
    """Read-only: opens the database with mode=ro, never migrates or writes (safe while Lead Center runs)."""
    import sqlite3

    con = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    try:
        states = dict(con.execute("select record_state, count(*) from osm_businesses group by 1").fetchall())
        count = lambda table: con.execute(f"select count(*) from {table}").fetchone()[0]  # noqa: E731
        version = con.execute("select version_num from alembic_version").fetchone()
        return "\n".join(
            [
                f"  schema: {version[0] if version else 'none'}",
                f"  businesses: {sum(states.values())} {states}",
                f"  reviews: {count('manual_reviews')}  leads: {count('lead_records')}  outreach events: {count('outreach_events')}",
            ]
        )
    finally:
        con.close()


def cmd_status(args) -> None:
    _use_profile(args.profile)
    from app.config import get_settings

    settings = get_settings()
    print(f"profile: {settings.profile}\ndatabase: {settings.database_file}")
    if not settings.database_file.exists():
        print("  (database does not exist yet)")
        return
    print(read_status(settings.database_file))


def cmd_reset_sandbox(args) -> None:
    _use_profile("sandbox")
    from app.config import get_settings

    settings = get_settings()
    assert settings.profile == "sandbox" and not settings.is_user_database
    for suffix in ("", "-wal", "-shm"):
        path = settings.database_file.with_name(settings.database_file.name + suffix)
        path.unlink(missing_ok=True)

    from app.database import SessionLocal
    from app.migrate import upgrade_to_head
    from app.seed.loader import sync_seed_data

    upgrade_to_head()
    with SessionLocal() as db:
        sync_seed_data(db)
        if args.with_sample:
            from sqlalchemy import select

            from app.models import Location, Sector
            from app.services.discovery import default_provider, run_discovery

            sector = db.scalar(select(Sector).where(Sector.name == "Beauty / Aesthetics"))
            location = db.scalar(select(Location).where(Location.name == "Kadıköy"))
            run = run_discovery(db, default_provider(), sector, location)
            print(f"sample discovery: {run.result_count} businesses (cache={run.from_cache}) error={run.error}")
        print(f"sandbox reset: {settings.database_file}\n{_summary(db)}")


def cmd_reset_user_data(args) -> None:
    _use_profile("user")
    from app.config import get_settings
    from app.database import SessionLocal
    from app.migrate import upgrade_to_head
    from app.services.backup.service import create_backup
    from app.services.maintenance import apply_reset, plan_reset

    settings = get_settings()
    if not settings.database_file.exists():
        sys.exit(f"No database at {settings.database_file}; nothing to reset.")
    upgrade_to_head()
    with SessionLocal() as db:
        plan = plan_reset(db, args.mode)
        print(f"database: {settings.database_file}\ncurrent contents:\n{_summary(db)}\n")
        print(f"reset mode '{args.mode}' would delete: {plan.counts}")
        if args.mode == "activity":
            print(f"and return {plan.businesses_reset} business(es) to the review queue (OSM data is kept)")
        if not args.yes:
            print("\nDRY RUN — nothing changed. Re-run with --yes to apply (a backup is written first).")
            return
        backup = create_backup(manual=True)  # raises -> aborts before anything is deleted
        print(f"backup written: data/backups/{backup.name}")
        apply_reset(db, args.mode)
        print(f"reset complete.\n{_summary(db)}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.devtools", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("status", help="show which database a profile uses and what it contains")
    p.add_argument("--profile", choices=["user", "sandbox"], default="user")
    p.set_defaults(func=cmd_status)

    p = sub.add_parser("reset-sandbox", help="recreate the disposable sandbox database")
    p.add_argument("--with-sample", action="store_true", help="import Kadıköy + Beauty (Overpass cache or one live query)")
    p.set_defaults(func=cmd_reset_sandbox)

    p = sub.add_parser("reset-user-data", help="reset the REAL database (dry run unless --yes)")
    p.add_argument("--mode", choices=["activity", "all"], default="activity")
    p.add_argument("--yes", action="store_true", help="actually apply the reset (after a backup)")
    p.set_defaults(func=cmd_reset_user_data)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
