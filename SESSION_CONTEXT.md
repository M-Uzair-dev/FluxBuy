# FluxBuy Backend — Session Context

## Project
NestJS + Prisma (PostgreSQL) backend called FluxBuy. Learning project — teacher/reviewer role only, no writing code for the user.

## Teaching Style
- Explain concepts simply before asking the user to implement
- Give hints when stuck, not solutions
- Review code after user writes it, point out bugs and improvements
- One concept at a time

## What's Been Built

### Auth — COMPLETE for this phase
- `POST /auth/login` — local login with email + password (Argon2id verify)
- `POST /auth/signup` — local signup, auto-logs in on success (returns tokens), triggers verification email via queue
- `GET /auth/verifyEmail?token=...` — verifies email, marks user as verified, deletes token (atomic transaction)
- `POST /auth/forgot-password` — accepts email via body, generates RESET_TOKEN, sends reset email via queue (silent failure if user not found)
- `POST /auth/resetPassword?token=...` — accepts new password in body, token in query, hashes password + resets atomically
- `POST /auth/rotate` — body `{ refreshToken }` (`RefreshDto`), returns new `{ accessToken, refreshToken }` via rotation (old refresh token deleted, reuse detection wipes all sessions if an already-rotated token is replayed)
- `GET /auth/google` — starts Google OAuth flow (`GoogleAuthGuard`)
- `GET /auth/google/callback` — Google redirects here; on success, generates tokens, stores them in Redis under a random `uid` (60s TTL), then 302-redirects the browser to `FRONTEND_URL/auth/google/:uid` via `@Res() res.redirect(...)`
- `GET /auth/tokens/:uid` — frontend exchanges the `uid` for `{ accessToken, refreshToken }`; Redis key is read with `getdel`-style (get + del) for one-time use, throws `UnauthorizedException` if missing/expired
- All return `{ user, accessToken, refreshToken }` for auth endpoints (rotate returns just the token pair)
- Global rate limiting via `@nestjs/throttler`: `ThrottlerGuard` registered as `APP_GUARD` in `AppModule` (after `JwtGuard`), default 100/min app-wide, `AuthController` overridden to 5/min, `/verifyEmail` stricter at 1/min

### AuthService
- `localLogin`, `localSignup`, `verifyEmail`, `forgotPassword`, `resetPassword`, `refreshTokens`, `googleLogin`, `getTokens`
- Owns all `prisma.$transaction` calls — passes `tx` down to TokenService and UserService
- Injects `PrismaService` directly for transaction ownership; injects `'REDIS_CLIENT'` and `ConfigService` for the Google OAuth one-time-code handoff
- `refreshTokens(refreshToken)` — thin pass-through to `tokenService.rotateTokens`
- `localLogin`/`localSignup`/`resetPassword` use `argon2.hash` / `argon2.verify` (Argon2id, default params) — **gotcha: `argon2.verify(hash, plain)`, hash first** (opposite of bcrypt's `compare(plain, hash)`)
- `googleLogin(googleUser)` — looks up by `googleId` (via UserService), falls back to email match (links existing account by setting `googleId`, does NOT change `loginType`), else creates new user with `loginType: 'GOOGLE'`, `emailVerified: true`; generates tokens, stores them in Redis (`tokens-uid-<randomUUID>`, `EX 60`), returns the frontend redirect URL (string) — does NOT call `prisma` directly, goes through UserService
- `getTokens(uid)` — reads + deletes the Redis key in one shot (one-time use), `JSON.parse`s and returns the token pair, or throws `UnauthorizedException` if missing/expired

### Token
- `TokenService.generateTokens(id)` — generates access token (15m) and refresh token (TTL from env)
- `TokenService.verifyJwt(token)` — verifies JWT, used by JwtGuard
- `TokenService.generateVerificationToken(userId)` — deletes old VERIFICATION_TOKENs, generates randomBytes(32), stores SHA-256 hash in DB, returns raw token
- `TokenService.verifyVerificationToken(token, tx)` — hashes token, looks up by hash + type, checks expiry, deletes record, returns userId
- `TokenService.generateResetToken(userId)` — same pattern as verification token but type RESET_TOKEN, TTL from `PASSWORD_RESET_TOKEN_TTL_SECONDS`
- `TokenService.verifyResetToken(token, tx)` — same pattern as verifyVerificationToken but for RESET_TOKEN
- `TokenService.rotateTokens(refreshToken)` — verifies JWT, looks up hash + `type: REFRESH_TOKEN`; if not found, calls `deleteAllRefreshTokens(decoded.sub)` (reuse detection — wipes all refresh tokens for that user) and throws; if expired, throws; otherwise deletes the old token + generates new tokens atomically in `prisma.$transaction`
- `TokenService.deleteAllRefreshTokens(userId)` — `deleteMany` where `type: REFRESH_TOKEN`
- `TokenService.cleanTokens()` — `@Interval(TOKEN_CLEANUP_CRON_INTERVAL_MS || 600000)`, deletes all `Token` rows (any type) where `expiresAt < now`
- `generateTokens(id, tx = this.prisma)` — now accepts optional `tx: Prisma.TransactionClient` so rotation can create the new refresh token in the same transaction as the old one's deletion
- Access token payload: `{ sub: id, type: 'access' }`
- Refresh token is hashed with SHA-256 before storing in DB
- All token methods that mutate accept `tx: Prisma.TransactionClient` — transaction owned by AuthService (or self-managed for `rotateTokens`)

### User
- `UserService`: `getUserFromEmail`, `getUserFromEmailWithPassword`, `getUserFromId`, `createLocalUser`, `verifyUserEmail`, `updateUserPassword`, `getUserFromGoogleId`, `updateUsersGoogleId`, `createGoogleUser`
- All read queries omit password except `getUserFromEmailWithPassword`
- `verifyUserEmail(userId, tx)` — updates emailVerified: true, returns { id, emailVerified }
- `updateUserPassword(userId, hashedNewPassword, tx)` — updates password, omits password from return
- `getUserFromGoogleId(googleId)` / `updateUsersGoogleId(userId, googleId)` / `createGoogleUser(name, email, googleId)` — Google OAuth helpers, all omit password; `updateUsersGoogleId` also sets `emailVerified: true`; `createGoogleUser` sets `emailVerified: true` (loginType left at schema default `LOCAL` — known minor inconsistency, not yet fixed)
- `GET /user/me` — protected route, returns current user

### Guards
- `JwtGuard` — verifies bearer token, calls `tokenService.verifyJwt`, checks `payload.type === 'access'`, sets `req.user = { id: payload.sub }`
- Lives in `src/guards/jwt.guard.ts`
- `GuardModule` — imports `TokenModule`, re-exports `TokenModule`, provides + exports `JwtGuard`
- Any module that needs `JwtGuard` imports `GuardModule`
- `GoogleAuthGuard` (`src/guards/google.guard.ts`) — `extends AuthGuard('google')`, used on `/auth/google` and `/auth/google/callback`
- `ThrottlerGuard` — registered globally via `APP_GUARD` in `AppModule` (after `JwtGuard`'s `APP_GUARD` entry)

### Decorators
- `CurrentUserId` param decorator — reads `req.user.id` from request

### Interceptors
- `ResponseInterceptor` (global) — wraps all success responses: `{ success: true, data: <response> }`

### Filters
- `GlobalExceptionFilter` (global) — catches all exceptions, returns `{ success: false, error: message }`
- `PrismaExceptionFilter` (global) — catches `PrismaClientKnownRequestError`, maps Prisma codes to HTTP responses
- Registered BEFORE GlobalExceptionFilter so it takes priority
- Codes handled: P2025 (404), P2002 (409), P2003 (400), P2000 (400)

### Validation
- `ValidationPipe` global with `whitelist: true`, `transform: true`
- Custom `exceptionFactory` returns `{ success: false, errors: { fieldName: [messages] } }`
- Query params validated via DTO classes with `@Query() data: SomeDto` (no field name in decorator)

### Google OAuth Strategy
- `GoogleStrategy` (`src/auth/strategies/google.strategy.ts`) — `PassportStrategy(Strategy, 'google')` from `passport-google-oauth20`
- Reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` via `ConfigService.getOrThrow` (works because `ConfigModule.forRoot({ isGlobal: true })`)
- `scope: ['email', 'profile']`
- `validate()` extracts `{ googleId, name, email, profileImage }` from the Google profile (`photos[0]?.value` guarded with `?.`) and calls `done(null, ...)` — this becomes `req.user` in the callback route
- `AuthModule` registers `PassportModule.register({ defaultStrategy: 'google' })` and provides `GoogleStrategy`

### DTOs
- `LoginDto`, `SignupDto` — body
- `VerifyEmailDto` — query (`@IsString`, `@IsNotEmpty`)
- `ForgotPasswordDto` — body (`@IsEmail`)
- `ResetPasswordDto` — body (`@IsString`, `@MinLength(6)`)
- `ResetPasswordQueryDto` — query (`@IsString`, `@IsNotEmpty`)
- `RefreshDto` — body (`@IsString`, `@IsNotEmpty`) — `refreshToken`
- `getTokensDto` — param (`uid`), used by `GET /auth/tokens/:uid`

### Redis
- `RedisModule` — global, custom provider with token `'REDIS_CLIENT'`, exposes raw `ioredis` instance
- Inject with `@Inject('REDIS_CLIENT') private readonly redis: Redis`
- `CacheModule` also registered globally (cache-manager-redis-yet) for simple key-value caching
- Both connect to `localhost:6379`

### Email / BullMQ
- `EmailModule` (`src/email/`) — `EmailService` with `sendEmail`, `sendVerificationEmail`, `sendResetEmail`
- `sendVerificationEmail(token, email, name)` — reads HTML template, replaces `{{verificationUrl}}` and `{{name}}`, sends via nodemailer
- `sendResetEmail(name, email, token)` — reads HTML template, replaces `{{resetUrl}}` and `{{name}}`, sends via nodemailer
- Templates at `src/email/templates/` — `verify-email.html`, `reset-password.html`
- `nest-cli.json` assets: `{ "include": "email/templates/**/*", "outDir": "dist/src/email" }`
- SMTP config via env: `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`
- `FRONTEND_URL` env var used to build links
- Workers at `src/workers/emailWorkers/` — `email.processor.ts` + `email.module.ts`
- `EmailProcessor` handles `send-verification` and `send-reset` job names, concurrency 10
- `BullModule.forRoot` in AppModule with Redis connection
- Bull Board UI at `/queues` — registered via `@bull-board/nestjs` + `@bull-board/express`

## Prisma Schema

### User model
- `id`, `name`, `email` (unique), `pfp?`, `bio?`, `password?`, `googleId?`
- `loginType`: enum `LOCAL | GOOGLE`, default `LOCAL`
- `emailVerified`: Boolean, default `false`

### Token model
- `id`, `tokenHash`, `expiresAt`, `type`, `userId` (FK to User)
- `type`: enum `REFRESH_TOKEN | RESET_TOKEN | VERIFICATION_TOKEN`

## File Structure
```
src/
  auth/
    dto/login.dto.ts
    dto/signup.dto.ts
    dto/verifyEmail.dto.ts
    dto/forgotPassword.dto.ts
    dto/resetPassword.dto.ts
    dto/resetPasswordQuery.dto.ts
    dto/refresh.dto.ts
    dto/getTokens.dto.ts
    strategies/google.strategy.ts
    auth.controller.ts
    auth.service.ts
    auth.module.ts
  user/
    user.controller.ts
    user.service.ts
    user.module.ts
  token/
    token.service.ts
    token.module.ts
  prisma/
    prisma.service.ts
    prisma.module.ts (Global)
  redis/
    redis.module.ts (Global, provides 'REDIS_CLIENT')
  guards/
    jwt.guard.ts
    google.guard.ts
    guard.module.ts
  email/
    email.service.ts
    email.module.ts
    templates/
      verify-email.html
      reset-password.html
  workers/
    emailWorkers/
      email.processor.ts
      email.module.ts
  interceptors/
    response.interceptor.ts
  filters/
    globalExceptionFilter.ts
    PrismaExceptionFilter.ts
  decorators/
    currentUser.decorator.ts
  main.ts
  app.module.ts
scripts/
  signup-flood.js
```

## Next Session Plan
**Auth phase is done.** Moving to the core FluxBuy domain: drop-based flash-sale marketplace (see project memory `project-fluxbuy-concept` for full pitch — products with quantity + scheduled drop time, everyone can buy the instant it goes live, fake/flaky payment service, stress-tested with simulated mass concurrency).

Approach for this phase, as agreed:
1. **Brainstorm** the data model and buy-flow design (Product, Drop, Order, Payment/Reservation entities; how stock decrement + payment limbo will work)
2. **Get concepts clear** — concurrency control options (pessimistic row locks vs optimistic concurrency vs atomic SQL decrement), stock reservation, idempotency, payment state machine
3. **Build a naive version first** (no special concurrency handling — deliberately)
4. **Break it** — stress test with concurrent requests (signup-flood.js style) to surface overselling/race conditions
5. **Reinforce it** — apply the proper concurrency/idempotency fixes and re-test

Optional/low-priority leftovers (not blocking, pick up opportunistically):
- Remove dead `Redirect` import from `@nestjs/common` in `auth.service.ts`
- `createGoogleUser` doesn't set `loginType: 'GOOGLE'` (defaults to `LOCAL`) — cosmetic inconsistency
- Login alerts via email (new login from unknown device/location)

## Key Decisions & Notes
- Verification/reset tokens: raw `randomBytes(32)` stored as SHA-256 hash in DB (not JWT)
- Transaction ownership pattern: `AuthService` owns `prisma.$transaction`, passes `tx: Prisma.TransactionClient` down to `TokenService` and `UserService`
- `GuardModule` must re-export `TokenModule` so modules using `@UseGuards(JwtGuard)` can resolve `TokenService`
- bcrypt cost 12 ≈ 300-400ms, libuv thread pool = 4 by default → ~10 signups/sec throughput ceiling on one server
- Two Redis connections exist: raw ioredis (RedisModule) + cache-manager (CacheModule) — intentional for now
- Query param DTOs: use `@Query() data: Dto` (no field name), global ValidationPipe handles it
- `forgotPassword` silently returns success even when email not found — security best practice to not leak user existence
- `ScheduleModule.forRoot()` registered in AppModule (`@nestjs/schedule`) — enables `@Cron`/`@Interval`/`@Timeout` on any provider app-wide, no per-module import needed
- `@Interval`/`@Cron` decorator arguments are evaluated at class-definition time (no `this`/DI available) — use `process.env` directly, not `ConfigService`, for these
- `TOKEN_CLEANUP_CRON_INTERVAL_MS` env var controls `TokenService.cleanTokens` interval (default 600000ms / 10min)
- Refresh tokens chosen over httpOnly cookies for multi-client support (Android etc.) — rotation + reuse detection is the mitigation for the resulting XSS exposure on web clients (standard OAuth2 public-client pattern)
- **Google OAuth callback redirect pattern**: the global `ResponseInterceptor` wraps every controller return value in `{ success, data }`, which breaks both raw JSON responses to a browser-redirected request AND Nest's `@Redirect()` decorator (it looks for a top-level `.url`, but the interceptor nests it under `.data`). Solution: `@Res() res: Response` (from `express`) in the callback route — this bypasses the interceptor entirely, call `res.redirect(url)` directly. Service returns the plain URL string; controller performs the redirect.
- **One-time-code token handoff** (OAuth best practice over putting tokens in query string/fragment): callback generates `randomUUID()`, stores `{ accessToken, refreshToken }` in Redis as `tokens-uid-<uid>` with `EX 60`, redirects browser to `FRONTEND_URL/auth/google/:uid`; frontend calls `GET /auth/tokens/:uid` which does get+del (one-time use) and returns the token pair as JSON
- **Argon2id over bcrypt**: switched for security (memory-hardness vs GPU cracking), NOT for throughput — Argon2 has the same libuv-threadpool throughput ceiling as bcrypt. `argon2.verify(hash, plain)` — hash argument first (opposite of bcrypt's `compare(plain, hash)`). No migration needed (local/learning DB, no real users to preserve).
- **`@nestjs/throttler` requires two pieces**: `ThrottlerModule.forRoot(...)` only configures limits — `@Throttle()` decorators are inert metadata unless `ThrottlerGuard` is also registered globally via `{ provide: APP_GUARD, useClass: ThrottlerGuard }` in `AppModule` providers. Default storage is in-memory (fine for single instance; would need Redis-backed storage for multi-instance). Fixed-window algorithm deemed sufficient for auth abuse protection — sliding window would require a custom `ThrottlerStorage` implementation (guard logic stays the same; storage layer owns the algorithm), not a custom guard.
