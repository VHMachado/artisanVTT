# Production image for the Go broker (see main.go's package comment for the
# protocol this replaces). Multi-stage: build with the full Go toolchain,
# ship only the static binary on a minimal base.
FROM golang:1.23-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /out/broker .

FROM alpine:3.20

RUN adduser -D -u 1000 broker
WORKDIR /app
COPY --from=builder /out/broker ./broker

# DATA_DIR (accounts.json + backups/) is meant to be a mounted volume, owned
# by the same uid the binary runs as.
RUN mkdir -p /data && chown broker:broker /data
USER broker

ENV PORT=9420
ENV DATA_DIR=/data
EXPOSE 9420

ENTRYPOINT ["./broker"]
