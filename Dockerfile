FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

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
RUN npm ci --omit=dev

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
RUN python3 -m venv /app/sovereigns-banking-hub/backend/venv && \
    /app/sovereigns-banking-hub/backend/venv/bin/pip install --upgrade pip && \
    /app/sovereigns-banking-hub/backend/venv/bin/pip install -r /app/sovereigns-banking-hub/backend/requirements.txt

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
