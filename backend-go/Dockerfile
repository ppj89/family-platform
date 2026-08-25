FROM golang:1.26.6-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/family-api ./cmd/api

FROM build AS test
RUN go test ./...

FROM alpine:3.22
RUN apk add --no-cache su-exec && addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /out/family-api /app/family-api
RUN mkdir -p /app/uploads /app/db-backup-control && chown -R app:app /app
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["sh", "-c", "chown -R app:app /app/uploads /app/db-backup-control && exec su-exec app /app/family-api"]
