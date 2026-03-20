FROM node:24-slim

# Install Python 3.12, pip, git, curl
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv git curl \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY lib/ lib/
COPY artifacts/ artifacts/
COPY scripts/ scripts/
COPY tsconfig.json tsconfig.base.json ./
COPY production-start.sh ./

# Install Node.js dependencies
RUN pnpm install --frozen-lockfile

# Pre-install Python dependencies (avoids slow cold-start pip install)
RUN pip install --break-system-packages -r artifacts/python-agent/requirements.txt

# Build TypeScript + Vite frontend
RUN pnpm run build

EXPOSE 8080

CMD ["bash", "production-start.sh"]
