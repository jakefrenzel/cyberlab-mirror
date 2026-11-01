# Build stage: Node.js and pnpm, discarded after the build.
# Images are pinned by digest as well as tag, so a re-pushed tag can't change what
# gets built. Dependabot proposes updates to both.
FROM node:26.13.0-trixie@sha256:6d2c7d5d074bf72f81ddc252b4fbb5d625bc028eeda49cb4b8c2ff8eda1ee617 AS build

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /src
# pnpm at the version package.json names (packageManager), through corepack
RUN corepack enable
# Install in its own layer, so code changes don't reinstall. --frozen-lockfile:
# exactly what pnpm-lock.yaml records, with its integrity hashes, or the build fails.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# Type-checks and builds. output: "standalone" puts a self-contained server, with
# only the node_modules it needs, in .next/standalone.
RUN pnpm build

# Runtime stage: distroless Node.js 24 has no shell, package manager, or libc
# tools. Just node, CA certificates, and a nonroot user (UID 65532).
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:b8cec4b2f2126ff7bd034ec9ac207ffb3272667dfdc48376e3b035d3270549ba

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=65532:65532 /src/.next/standalone ./
# The standalone server doesn't copy the static assets; they're served from here
COPY --from=build --chown=65532:65532 /src/.next/static ./.next/static
USER 65532:65532
EXPOSE 3000
# The image's entrypoint is node
CMD ["server.js"]
