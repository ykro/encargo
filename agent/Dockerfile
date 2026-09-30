# Encargo agent: FastAPI + ADK + headless Chromium (Playwright).
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project
RUN uv run playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY encargo ./encargo
RUN uv sync --frozen --no-dev
ENV PORT=8080
CMD ["sh", "-c", "uv run --no-sync uvicorn encargo.api:app --host 0.0.0.0 --port ${PORT}"]
