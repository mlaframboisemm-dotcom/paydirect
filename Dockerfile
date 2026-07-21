FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
# Use npm install as a robust fallback in CI environments where `npm ci` can
# fail unexpectedly during container builds (ensures install works even when
# the environment or lockfile interaction is problematic).
RUN npm install --legacy-peer-deps --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install Python3, pip, and venv (using Debian precompiled packages)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# For runtime image, install only production deps. Use npm install fallback
# rather than `npm ci` to avoid intermittent CI/build issues.
RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

# Copy sovereigns banking hub (including Python backend), config, and fallbacks
COPY --from=builder /app/sovereigns-banking-hub ./sovereigns-banking-hub
COPY --from=builder /app/config ./config
COPY --from=builder /app/etransfers.json ./etransfers.json

# Create Python virtual environment and install dependencies inside it
# This avoids PEP 668 system-package-manager restrictions and utilizes precompiled wheels
COPY scripts/docker-venv-setup.sh /tmp/docker-venv-setup.sh
RUN chmod +x /tmp/docker-venv-setup.sh && /tmp/docker-venv-setup.sh

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
