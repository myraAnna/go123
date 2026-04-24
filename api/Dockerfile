FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Production
FROM oven/bun:1-slim AS production
WORKDIR /app
COPY --from=base /app .

EXPOSE 3001
ENV NODE_ENV=production
CMD ["bun", "run", "start"]
