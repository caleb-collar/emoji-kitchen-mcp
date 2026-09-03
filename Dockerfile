# ==========================================
# Stage 1: Builder
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm and dependencies (including devDependencies needed for build)
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

# Copy build configuration, sources, and scripts
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

# Download bundled metadata and build TypeScript project
RUN node scripts/download-metadata.js
RUN pnpm build

# Prune devDependencies to keep production image minimal
RUN pnpm prune --prod

# ==========================================
# Stage 2: Production
# ==========================================
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    TRANSPORT=sse

# Switch to non-root user
USER node

# Copy runtime dependencies, compiled JavaScript, and pre-downloaded metadata
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/data ./data

# Expose SSE HTTP port
EXPOSE 3000

# Health check using Node 22 built-in fetch
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Default entrypoint for SSE mode
CMD ["node", "dist/index.js", "--sse"]
