# ============================================================
# Stage 1: deps — install only production dependencies
# ============================================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests first to leverage layer caching
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# ============================================================
# Stage 2: builder — install ALL deps (including dev) and
#           run any build steps (lint, etc.) if needed
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Copy the full source
COPY . .

# ============================================================
# Stage 3: runner — lean production image
# ============================================================
FROM node:20-alpine AS runner

# Use non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 appuser

WORKDIR /app

# Copy production deps from deps stage
COPY --from=deps --chown=appuser:nodejs /app/node_modules ./node_modules

# Copy application source
COPY --chown=appuser:nodejs . .

USER appuser

# Expose the port the app listens on (overridable via PORT env var)
EXPOSE 3000

# Health-check so Docker/orchestrators know when the app is ready
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Use the production start script
CMD ["node", "src/index.js"]
