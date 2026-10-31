# Build stage: the full Go toolchain, discarded after the build.
# Images are pinned by digest as well as tag, so a re-pushed tag can't change what
# gets built. Dependabot proposes updates to both.
FROM golang:1.27.3-trixie@sha256:c65ecfe613b539ac74c62a4c3b2c27e8f8a6076384c8f27e8a3c0f3be17cc385 AS build

WORKDIR /src
# Download modules in their own layer, so code changes don't re-download them
COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .
# Set by the release workflow; plain builds report "dev"
ARG VERSION=dev
# Static binary (no libc needed at runtime), no local paths baked in, no debug info.
# go-git is pure Go, so there's no git binary to ship either.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /out/api .

# Runtime stage: distroless "static" has no shell, package manager, or libc. Just CA
# certificates, timezone data, and a nonroot user (UID 65532).
FROM gcr.io/distroless/static-debian13:nonroot@sha256:18f4cc26c9ffa7f20a359298be7deadac5c607c8e03a02b8119f1a5fc2f82c99

COPY --from=build /out/api /api
USER 65532:65532
# 8080: the API (for the web app). 9090: /healthz and /metrics (for the kubelet
# and Prometheus). The repository copies go in /data/repos, a volume.
EXPOSE 8080 9090
ENTRYPOINT ["/api"]
