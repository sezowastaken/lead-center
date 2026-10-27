"""Run Lead Center against the disposable SANDBOX database — for browser, E2E and manual testing.

    uv run python -m app.sandbox            # http://127.0.0.1:8001, data/sandbox/

The real app (LeadCenter.bat, port 8000, data/lead_center.db) is never touched.
"""

import os

# Must be set before any app module reads settings.
os.environ["LEAD_CENTER_PROFILE"] = "sandbox"
os.environ.pop("LEAD_CENTER_DATABASE_PATH", None)

import uvicorn  # noqa: E402

SANDBOX_PORT = int(os.environ.get("LEAD_CENTER_SANDBOX_PORT", "8001"))


def main() -> None:
    uvicorn.run("app.main:app", host="127.0.0.1", port=SANDBOX_PORT)


if __name__ == "__main__":
    main()
