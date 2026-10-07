# Encargo agent: FastAPI + ADK + headless Chromium (Playwright).
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project
# Headless shell only (no full Chromium): smaller image, faster cold start; the agent never opens a window.
RUN uv run playwright install --with-deps --only-shell chromium && rm -rf /var/lib/apt/lists/*
COPY encargo ./encargo
RUN uv sync --frozen --no-dev
ENV PORT=8080
# Straight from the venv: skips uv's own start-up on every cold start.
CMD ["sh", "-c", "exec /app/.venv/bin/uvicorn encargo.api:app --host 0.0.0.0 --port ${PORT}"]
