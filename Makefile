.PHONY: backend frontend lint fmt format typecheck check web-lint web-typecheck

# ── Dev servers ──

backend:
	uv run uvicorn assist.app:app --reload --port 8000

frontend:
	cd web && npm run dev

# ── Python ──

lint:
	uv run ruff check src/

fmt:
	uv run ruff format --check src/

format:
	uv run ruff format src/
	uv run ruff check --fix src/

typecheck:
	uv run mypy src/

# ── Frontend ──

web-lint:
	cd web && npx eslint src/

web-typecheck:
	cd web && npx tsc -b --noEmit

# ── All ──

check: lint fmt typecheck web-lint web-typecheck
