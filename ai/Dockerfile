FROM python:3.13-slim AS base
WORKDIR /app

# Install uv
RUN pip install --no-cache-dir uv

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen --no-dev

# Copy source
COPY src ./src

# Production
FROM python:3.13-slim AS production
WORKDIR /app
COPY --from=base /app .
COPY --from=base /usr/local/bin/uv /usr/local/bin/uv

EXPOSE 8001
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src
CMD ["uv", "run", "--no-dev", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
