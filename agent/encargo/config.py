"""Settings from environment variables (documented in .env.example).

No model name lives in code: GEMINI_MODEL must come from the environment.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def _flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).lower() in {"1", "true", "yes"}


@dataclass(frozen=True)
class Settings:
    gemini_model: str = field(default_factory=lambda: os.getenv("GEMINI_MODEL", ""))
    mock_ai: bool = field(default_factory=lambda: _flag("MOCK_AI"))
    project: str = field(default_factory=lambda: os.getenv("GOOGLE_CLOUD_PROJECT", "ai-experiments-487722"))
    location: str = field(default_factory=lambda: os.getenv("GOOGLE_CLOUD_LOCATION", "global"))
    run_store: str = field(default_factory=lambda: os.getenv("RUN_STORE", "memory"))  # memory | firestore
    firestore_database: str = field(default_factory=lambda: os.getenv("FIRESTORE_DATABASE", "encargo"))
    public_url: str = field(default_factory=lambda: os.getenv("AGENT_PUBLIC_URL", "http://localhost:8000").rstrip("/"))
    # Fail closed: the "dev-admin" / "dev-stage" fallbacks exist only in test mode.
    admin_token: str = field(
        default_factory=lambda: os.getenv("ADMIN_TOKEN") or ("dev-admin" if os.getenv("SIGNER_MODE", "test") == "test" else "")
    )
    # Stage token: what an enrolled device (phone window) presents to start an errand
    # or reject a payment. Required in passkey mode; obtained through /configurar.
    stage_token: str = field(default_factory=lambda: os.getenv("STAGE_TOKEN", ""))
    human_approval_token: str = field(default_factory=lambda: os.getenv("HUMAN_APPROVAL_TOKEN", ""))
    # passkey: only a WebAuthn assertion approves a mandate (stage).
    # test: the bearer HUMAN_APPROVAL_TOKEN is accepted too (tests, local rehearsals).
    signer_mode: str = field(default_factory=lambda: os.getenv("SIGNER_MODE", "test"))
    passkey_rp_id: str = field(default_factory=lambda: os.getenv("PASSKEY_RP_ID", "localhost"))
    passkey_origin: str = field(default_factory=lambda: os.getenv("PASSKEY_ORIGIN", "http://localhost:3000").rstrip("/"))
    platform_signing_jwk: str = field(default_factory=lambda: os.getenv("PLATFORM_SIGNING_JWK", ""))
    run_timeout_s: float = field(default_factory=lambda: float(os.getenv("RUN_TIMEOUT_S", "110")))
    browser_enabled: bool = field(default_factory=lambda: _flag("BROWSER_ENABLED", "1"))
    default_stores: list[str] = field(
        default_factory=lambda: [
            s.strip() for s in os.getenv("STORE_URLS", "http://localhost:3002,http://localhost:3001").split(",") if s.strip()
        ]
    )

    @property
    def stage_required(self) -> bool:
        return self.signer_mode != "test"

    @property
    def profile_url(self) -> str:
        return f"{self.public_url}/.well-known/ucp"


def settings() -> Settings:
    return Settings()
