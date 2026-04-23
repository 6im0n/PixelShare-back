# CLAUDE.md — PixelShare Back (Bun + NestJS Backend)

PixelShare backend repo. Self-hosted photo-sharing for photographers + models.

---

## Project Overview

PixelShare = self-hosted service. Photographers upload shooting sessions, invite clients to browse, star-rate, download. This repo = **NestJS backend on Fastify adapter, Bun runtime** (`PixelShare-back`). Frontend separate repo (`PixelShare-web`: Nuxt 3).

**License:** Open Source
**Deployment:** Docker Compose, single server (HTTP). TLS terminate by external Nginx reverse proxy.

---

## Architecture Philosophy

**Monolithic, lightweight, easy extend.** Core handle auth, users, permissions, file serving. Features = self-contained NestJS modules registered in `AppModule`.

- One codebase, one process — no microservices overhead
- Each module own controller + service + DTOs
- Shared utilities (guards, decorators, password util, types) imported from `src/shared/`
- Reusable DB queries live in `DrizzleService` (`src/providers/drizzle/drizzle.service.ts`) — other services inject it, never open new clients
- Add new feature = add module folder + export from `src/modules/index.ts` + import in `AppModule`
- one file one export max +/- 300 lines — no giant files if file size grows, split into multiple files in same folder (e.g. `oauth/providers/`)
- This app can have multiple users at the same time.
- Handle race conditions with database constraints and proper error handling.
- Prevent data loss with foreign keys and `ON DELETE CASCADE` (for example, deleting a library should also delete its photos and stars).

---

## Repository Structure

```
src/
  main.ts                          # Bootstrap — Nest + FastifyAdapter, ValidationPipe, Swagger, cookie/cors/multipart
  app.module.ts                    # Root module — wires all feature modules, applies JwtAuthGuard globally via APP_GUARD
  modules/
    index.ts                       # Barrel re-export of all feature modules
    auth/                          # register / login / refresh / me — JWT + Argon2id
    account/                       # /me + admin user CRUD
    libraries/                     # Library CRUD + grant/revoke client access
    photos/                        # Upload (multipart + Sharp thumb), list, delete, stream thumbnail/original
    stars/                         # Set/list star ratings + star history
    oauth/                         # Provider registry + controller + service (Google impl)
      providers/
        google.ts                  # Google OAuth provider
        # <new-provider>.ts        # Drop file here + register in oauth.registry.ts
    health/                        # GET /api/health — public, pings DB
  providers/
    drizzle/
      drizzle.module.ts            # @Global — exports DRIZZLE token + DrizzleService
      drizzle.provider.ts          # DRIZZLE factory from DATABASE_URL
      drizzle.service.ts           # Reusable queries (findUserByEmail, canAccessLibrary, requireLibrary, etc.)
      schema/
        client.ts                  # createDrizzleClient factory
        schema.ts                  # Drizzle tables (single source of truth)
    resend/
      resend.module.ts             # @Global
      resend.service.ts            # fetch-based wrapper, no-op when RESEND_API_KEY missing
  shared/
    jwt.strategy.ts                # Passport JWT strategy (Bearer header)
    jwt-auth.guard.ts              # Global guard, skips @Public() routes
    roles.guard.ts                 # Checks @Roles(...) metadata
    public.decorator.ts            # @Public() — opt route out of JwtAuthGuard
    roles.decorator.ts             # @Roles('admin', 'photographer', ...)
    current-user.decorator.ts      # @CurrentUser() — req.user injection
    password.util.ts               # argon2id hash + verify
    types.ts                       # UserRole, JwtPayload, AuthUser
storage/
  originals/<libraryId>/           # Uploaded files (never publicly accessible)
  thumbnails/<libraryId>/          # Sharp-generated .webp thumbnails
drizzle/                           # Generated migrations (drizzle-kit)
drizzle.config.ts
nest-cli.json
.env-template
```

---

## Stack

| Concern | Choice |
|---------|--------|
| Runtime | Bun |
| Framework | NestJS 11 on `@nestjs/platform-fastify` |
| Validation | `class-validator` + `ValidationPipe` (whitelist, forbidNonWhitelisted, transform) |
| Database | PostgreSQL + Drizzle ORM (`postgres-js`) |
| Auth | JWT (`@nestjs/jwt` + Passport JWT Bearer) + Argon2id password hash |
| OAuth | Custom provider registry — drop-in file per provider |
| File processing | Sharp (thumbnail generation at upload time) |
| Email | Resend API (fetch wrapper) |
| Package manager | Bun |

---

## Module Pattern

Each feature = NestJS module: controller + service + DTOs.

```ts
// src/modules/example/example.module.ts
import { Module } from '@nestjs/common';
import { ExampleController } from './example.controller';
import { ExampleService } from './example.service';

@Module({
  controllers: [ExampleController],
  providers: [ExampleService],
  exports: [ExampleService],
})
export class ExampleModule {}
```

Register in `src/modules/index.ts` barrel, then import in `AppModule`. DTOs use `class-validator` decorators — `ValidationPipe` handles transform + reject.

All routes **private by default** (global `JwtAuthGuard` via `APP_GUARD` in `AppModule`). Opt-out per route with `@Public()`. Role-gate with `@UseGuards(RolesGuard)` + `@Roles('admin')`.

---

## OAuth Provider Pattern

New OAuth provider = one file under `src/modules/oauth/providers/`, implementing `OAuthProvider` from `src/modules/oauth/oauth.types.ts`:

```ts
export type OAuthProvider = {
  name: string;
  authorizationUrl(args: { state; clientId; redirectUri }): string;
  exchangeCode(args: { code; clientId; clientSecret; redirectUri }): Promise<OAuthProfile>;
};
```

Register in `src/modules/oauth/oauth.registry.ts` (Map of providers). Credentials resolved from env `{NAME}_CLIENT_ID`, `{NAME}_CLIENT_SECRET`, `{NAME}_REDIRECT_URI`.

---

## User Roles & Permissions

| Role | Capabilities |
|------|-------------|
| `admin` | Full access — manage users, libraries, access rights, platform settings |
| `photographer` | Upload files, create libraries, grant clients access, manage star ratings |
| `client` | Browse granted libraries, rate photos (0–5 stars), download files |

Permission checks live in `DrizzleService` (`canAccessLibrary`, `isLibraryOwner`, `isLibraryClient`). Use these in services — never inline role checks. For role gating on routes, use `RolesGuard` + `@Roles(...)`.

---

## File Access Rules

**Files never accessible via public URL.** Backend stream originals + thumbnails through authenticated endpoints only.

- `GET /api/photos/:id/thumbnail` — returns `image/webp` (Sharp-generated at upload, 800px wide)
- `GET /api/photos/:id/original` — returns original bytes + `Content-Disposition: attachment`
- Both endpoints run `JwtAuthGuard` + `canAccessLibrary` before streaming
- Storage paths (`storage/originals/`, `storage/thumbnails/`) outside web root
- Max upload: 50 MiB (`@fastify/multipart` limit in `main.ts`)

### Thumbnail generation

Sharp run at upload time in `PhotosService.upload`. Thumbnails stored as `storage/thumbnails/<libraryId>/<photoId>.webp`. No on-demand resizing.

---

## Star Rating System

- **0–5 stars** (0 = unrated, delete row). Both photographer + client rate independently.
- Tables: `stars (photoId, userId, value)` current rating (upsert on change), `star_history` append-only log of every change
- `PUT /api/photos/:id/stars` — upsert star (value=0 deletes)
- `GET /api/photos/:id/stars` — ratings for photo + `myStars` + `photographerStars`
- `GET /api/libraries/:libraryId/stars` — all ratings in library

---

## Auth Flow

- `POST /api/auth/register` — email + password (Argon2id hash via `password.util.ts`) + name + optional role
- `POST /api/auth/login` — returns `{ accessToken, refreshToken, expiresIn, user }`
- `POST /api/auth/refresh` — rotate access token via refresh token (separate `JWT_REFRESH_SECRET` if set, else fallback to `JWT_SECRET`)
- `GET /api/auth/me` — current user (requires `Authorization: Bearer`)
- Access TTL default `15m`, refresh TTL default `30d` (override via `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL`)
- `JwtStrategy` (`src/shared/jwt.strategy.ts`) extracts Bearer, verifies signature, rejects `type !== 'access'`
- OAuth login follow same JWT issuance path via `AuthService.issue()`

---

## Environment Variables

See `.env-template`. Key vars:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret (access + fallback refresh) |
| `JWT_REFRESH_SECRET` | Optional separate refresh-token secret |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | TTL like `15m`, `30d` |
| `STORAGE_PATH` | Path to `storage/` directory |
| `PUBLIC_URL` | Public base URL (used in OAuth redirect fallback) |
| `CORS_ORIGIN` | Comma-separated allowlist |
| `BIND_HOST` / `PORT` | Listener bind (default `0.0.0.0:3001`) |
| `RESEND_API_KEY` / `RESEND_FROM` | Resend email config |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google OAuth |

---

## Deployment

```yaml
# docker-compose.yml (simplified)
services:
  api:   # PixelShare-back (Bun + NestJS/Fastify), exposes port 3001
  db:    # PostgreSQL
  web:   # PixelShare-web (Nuxt 3)
```

- No TLS in container — terminated upstream by Nginx
- `storage/` must mount as volume to persist files across restarts
- Run DB migrations at container startup: `bun run db:migrate`

---

## Development Notes

- Run dev server: `bun run dev` (watch mode)
- Run prod: `bun run start`
- Build bundle: `bun run build` → `dist/main.js`
- Generate migration: `bun run db:generate`
- Apply migrations: `bun run db:migrate`
- Typecheck: `bun run typecheck`
- Swagger at `/swagger` (dev only, disabled when `NODE_ENV=production`)
- All DTOs use `class-validator` — `ValidationPipe` strips unknown fields + rejects `forbidNonWhitelisted`
- Use `DrizzleService` helpers for shared queries — don't duplicate `findUserByEmail` / `canAccessLibrary` in every service
- Use `ConflictException` / `ForbiddenException` / `NotFoundException` / `BadRequestException` from `@nestjs/common` for error responses
- No comments explain *what* code does; only add when *why* non-obvious
- Mobile clients hit same API — no separate mobile endpoints
