# PixelShare Back

NestJS backend (Fastify adapter, Bun runtime) for PixelShare. Auth: JWT + Argon2id, Drizzle ORM on PostgreSQL, Sharp thumbnails, Google OAuth, Resend email.

## Quick start

### 1. Install deps

```bash
bun install
```

### 2. Env

Copy template, edit values:

```bash
cp .env-template .env
```

Min: `DATABASE_URL`, `JWT_SECRET`, `STORAGE_PATH`.

### 3. Database

```bash
bun run db:generate   # generate migration from schema
bun run db:migrate    # apply migrations
```

### 4. Run dev

```bash
bun run dev
```

API: `http://localhost:3001/api`
Swagger: `http://localhost:3001/swagger` (dev only)
Health: `GET /api/health`

### 5. Run prod

```bash
bun run start
```

Or build standalone bundle:

```bash
bun run build
NODE_ENV=production bun dist/main.js
```

## Auth

- `POST /api/auth/register` — email + password (Argon2id hash) + name + optional role
- `POST /api/auth/login` — returns `{ accessToken, refreshToken, expiresIn, user }`
- `POST /api/auth/refresh` — rotate access token
- `GET /api/auth/me` — current JWT user (needs Bearer token)

Non-`@Public()` routes need `Authorization: Bearer <accessToken>`.

## OAuth (Google)

- `GET /api/oauth/providers` — list enabled providers
- `GET /api/oauth/google/start` — redirect to Google
- `GET /api/oauth/google/callback?code=...` — exchange code, return tokens

Add provider: drop file `src/modules/oauth/providers/<name>.ts` exporting `OAuthProvider`, register in `src/modules/oauth/oauth.registry.ts`.

## Layout

```
src/
  main.ts                          # bootstrap (Nest + Fastify)
  app.module.ts                    # wires everything, applies JwtAuthGuard globally
  modules/
    auth/ account/ libraries/ photos/ stars/ oauth/ health/
  providers/
    drizzle/                       # DrizzleService with reusable queries
    resend/                        # Resend email wrapper
  shared/
    jwt.strategy.ts jwt-auth.guard.ts roles.guard.ts
    public.decorator.ts roles.decorator.ts current-user.decorator.ts
    password.util.ts types.ts
```