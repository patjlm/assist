# -- Stage 1: Build frontend --
FROM node:22-slim AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# -- Stage 2: Python runtime --
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-editable

COPY src/ src/
COPY --from=frontend /app/web/dist web/dist

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "assist.app:app", "--host", "0.0.0.0", "--port", "8000"]
