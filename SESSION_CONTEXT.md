# FluxBuy Backend — Session Context

## Project
NestJS + Prisma (PostgreSQL) backend called FluxBuy. Learning project — teacher/reviewer role only, no writing code for the user.

## Teaching Style
- Explain concepts simply before asking the user to implement
- Give hints when stuck, not solutions
- Review code after user writes it, point out bugs and improvements
- One concept at a time

## What's Been Built

### Auth
- `POST /auth/login` — local login with email + password
- `POST /auth/signup` — local signup, auto-logs in on success (returns tokens), triggers verification email via queue
- `GET /auth/verifyEmail?token=...` — verifies email, marks user as verified, deletes token (atomic transaction)
- `POST /auth/forgot-password` — accepts email via body, generates RESET_TOKEN, sends reset email via queue (silent failure if user not found)
- `POST /auth/resetPassword?token=...` — accepts new password in body, token in query, hashes password + resets atomically
- All return `{ user, accessToken, refreshToken }` for auth endpoints

### AuthService
- `localLogin`, `localSignup`, `verifyEmail`, `forgotPassword`, `resetPassword`
- Owns all `prisma.$transaction` calls — passes `tx` down to TokenService and UserService
- Injects `PrismaService` directly for transaction ownership

### Token
- `TokenService.generateTokens(id)` — generates access token (15m) and refresh token (TTL from env)
- `TokenService.verifyJwt(token)` — verifies JWT, used by JwtGuard
- `TokenService.generateVerificationToken(userId)` — deletes old VERIFICATION_TOKENs, generates randomBytes(32), stores SHA-256 hash in DB, returns raw token
- `TokenService.verifyVerificationToken(token, tx)` — hashes token, looks up by hash + type, checks expiry, deletes record, returns userId
- `TokenService.generateResetToken(userId)` — same pattern as verification token but type RESET_TOKEN, TTL from `PASSWORD_RESET_TOKEN_TTL_SECONDS`
- `TokenService.verifyResetToken(token, tx)` — same pattern as verifyVerificationToken but for RESET_TOKEN
- Access token payload: `{ sub: id, type: 'access' }`
- Refresh token is hashed with SHA-256 before storing in DB
- All token methods that mutate accept `tx: Prisma.TransactionClient` — transaction owned by AuthService

### User
- `UserService`: `getUserFromEmail`, `getUserFromEmailWithPassword`, `getUserFromId`, `createLocalUser`, `verifyUserEmail`, `updateUserPassword`
- All read queries omit password except `getUserFromEmailWithPassword`
- `verifyUserEmail(userId, tx)` — updates emailVerified: true, returns { id, emailVerified }
- `updateUserPassword(userId, hashedNewPassword, tx)` — updates password, omits password from return
- `GET /user/me` — protected route, returns current user

### Guards
- `JwtGuard` — verifies bearer token, calls `tokenService.verifyJwt`, checks `payload.type === 'access'`, sets `req.user = { id: payload.sub }`
- Lives in `src/guards/jwt.guard.ts`
- `GuardModule` — imports `TokenModule`, re-exports `TokenModule`, provides + exports `JwtGuard`
- Any module that needs `JwtGuard` imports `GuardModule`

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

### DTOs
- `LoginDto`, `SignupDto` — body
- `VerifyEmailDto` — query (`@IsString`, `@IsNotEmpty`)
- `ForgotPasswordDto` — body (`@IsEmail`)
- `ResetPasswordDto` — body (`@IsString`, `@MinLength(6)`)
- `ResetPasswordQueryDto` — query (`@IsString`, `@IsNotEmpty`)

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
- Login alerts via email (send email on new login from unknown device/location)
- Google OAuth via Passport
- Rate limiting with `@nestjs/throttler`
- Consider switching bcrypt → Argon2 for better signup throughput

## Key Decisions & Notes
- Verification/reset tokens: raw `randomBytes(32)` stored as SHA-256 hash in DB (not JWT)
- Transaction ownership pattern: `AuthService` owns `prisma.$transaction`, passes `tx: Prisma.TransactionClient` down to `TokenService` and `UserService`
- `GuardModule` must re-export `TokenModule` so modules using `@UseGuards(JwtGuard)` can resolve `TokenService`
- bcrypt cost 12 ≈ 300-400ms, libuv thread pool = 4 by default → ~10 signups/sec throughput ceiling on one server
- Two Redis connections exist: raw ioredis (RedisModule) + cache-manager (CacheModule) — intentional for now
- Query param DTOs: use `@Query() data: Dto` (no field name), global ValidationPipe handles it
- `forgotPassword` silently returns success even when email not found — security best practice to not leak user existence
