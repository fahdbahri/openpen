FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy dependency files
COPY pyproject.toml requirements.txt ./

# Sync deps (reads pyproject.toml, falls back to requirements.txt)
RUN uv sync --system

# Copy source
COPY . .

EXPOSE 10000

CMD ["uv", "run", "python", "main.py"]
