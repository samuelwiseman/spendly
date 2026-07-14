FROM node:20-bookworm-slim AS builder
WORKDIR /app
# better-sqlite3 has no prebuilt binary matching this image (detect-libc reports an
# empty libc on bookworm-slim), so it compiles from source and needs a toolchain.
# These stay in the builder stage only; the runner image remains slim.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
