FROM oven/bun:1-alpine
WORKDIR /app

RUN addgroup -S pixelshare && adduser -S pixelshare -G pixelshare

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
COPY package.json ./

RUN mkdir -p /storage && chown pixelshare:pixelshare /storage
USER pixelshare

EXPOSE 3001
CMD ["sh", "-c", "bun run db:migrate && bun run start"]
