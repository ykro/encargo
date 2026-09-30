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
    admin_token: str = field(default_factory=lambda: os.getenv("ADMIN_TOKEN", "dev-admin"))
    human_approval_token: str = field(default_factory=lambda: os.getenv("HUMAN_APPROVAL_TOKEN", ""))
    signer_mode: str = field(default_factory=lambda: os.getenv("SIGNER_MODE", "test"))
    platform_signing_jwk: str = field(default_factory=lambda: os.getenv("PLATFORM_SIGNING_JWK", ""))
    run_timeout_s: float = field(default_factory=lambda: float(os.getenv("RUN_TIMEOUT_S", "110")))
    browser_enabled: bool = field(default_factory=lambda: _flag("BROWSER_ENABLED", "1"))
    default_stores: list[str] = field(
        default_factory=lambda: [
            s.strip() for s in os.getenv("STORE_URLS", "http://localhost:3002,http://localhost:3001").split(",") if s.strip()
        ]
    )

    @property
    def profile_url(self) -> str:
        return f"{self.public_url}/.well-known/ucp"


def settings() -> Settings:
    return Settings()
