import os

# Tests never call a model, never touch Firestore and never open Chromium.
os.environ["MOCK_AI"] = "1"
os.environ["RUN_STORE"] = "memory"
os.environ["BROWSER_ENABLED"] = "0"
os.environ["HUMAN_APPROVAL_TOKEN"] = "human-test-token"
os.environ["SIGNER_MODE"] = "test"
os.environ["AGENT_PUBLIC_URL"] = "http://encargo.test"
os.environ["GEMINI_MODEL"] = os.environ.get("GEMINI_MODEL", "")
