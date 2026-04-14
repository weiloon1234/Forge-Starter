# =============================================================================
# Stage 1: Frontend build
# =============================================================================
FROM node:22-alpine AS frontend

WORKDIR /app

# Install shared dependencies (React types for components)
COPY Forge-Starter/frontend/shared/package.json /app/frontend/shared/package.json
RUN cd /app/frontend/shared && npm install

# Install admin portal dependencies
COPY Forge-Starter/frontend/admin/package.json /app/frontend/admin/package.json
RUN cd /app/frontend/admin && npm install

# Install user portal dependencies
COPY Forge-Starter/frontend/user/package.json /app/frontend/user/package.json
RUN cd /app/frontend/user && npm install

# Copy shared components (must come before portals — they import from @shared)
COPY Forge-Starter/frontend/shared/ /app/frontend/shared/

# Copy full frontend source
COPY Forge-Starter/frontend/admin/ /app/frontend/admin/
COPY Forge-Starter/frontend/user/ /app/frontend/user/

# Create public directories for build output
RUN mkdir -p /app/public/admin /app/public/user

# Accept VITE_* build args — add new ones here as needed
ARG VITE_API_URL
ARG VITE_APP_NAME
ARG VITE_APP_ENV
ARG VITE_APP_URL
ARG VITE_WS_URL
ARG VITE_STORAGE_URL

# Set as ENV so Vite picks them up during build
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_APP_NAME=${VITE_APP_NAME}
ENV VITE_APP_ENV=${VITE_APP_ENV}
ENV VITE_APP_URL=${VITE_APP_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_STORAGE_URL=${VITE_STORAGE_URL}

# Build admin portal (outputs to /app/public/admin via vite outDir)
RUN cd /app/frontend/admin && npm run build

# Build user portal (outputs to /app/public/user via vite outDir)
RUN cd /app/frontend/user && npm run build

# =============================================================================
# Stage 2: Backend build
# =============================================================================
FROM rust:1.83-bookworm AS backend

ARG BINARY_NAME=app

WORKDIR /build

# Copy Forge framework and starter project
COPY Forge/ /build/Forge/
COPY Forge-Starter/ /build/Forge-Starter/

# Copy frontend build output from stage 1
COPY --from=frontend /app/public/ /build/Forge-Starter/public/

# Build the release binary
RUN cd /build/Forge-Starter && cargo build --release

# Generate LLM-friendly API docs (docs/api/)
RUN cd /build/Forge-Starter && cargo run --release -- docs:api

# =============================================================================
# Stage 3: Artifact collection
# =============================================================================
FROM debian:bookworm-slim AS artifact

# ARG must be re-declared in each stage
ARG BINARY_NAME=app

COPY --from=backend /build/Forge-Starter/target/release/${BINARY_NAME} /artifact/${BINARY_NAME}
COPY --from=backend /build/Forge-Starter/public/ /artifact/public/
COPY --from=backend /build/Forge-Starter/config/ /artifact/config/
COPY --from=backend /build/Forge-Starter/locales/ /artifact/locales/
COPY --from=backend /build/Forge-Starter/templates/ /artifact/templates/
COPY --from=backend /build/Forge-Starter/docs/api/ /artifact/docs/api/

CMD ["echo", "Build artifact ready"]
