# Auth Module — API Reference

## Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/api/v1/auth/register` | Public | 5/hr | Create account |
| POST | `/api/v1/auth/login` | Public | 10/15m | Authenticate |
| POST | `/api/v1/auth/refresh` | Cookie | 20/15m | Rotate tokens |
| POST | `/api/v1/auth/logout` | Bearer | — | Revoke session |
| POST | `/api/v1/auth/logout-all` | Bearer | — | Revoke all sessions |
| GET | `/api/v1/auth/me` | Bearer | — | Get current user |
| POST | `/api/v1/auth/verify-email` | Public | 20/15m | Verify email |
| POST | `/api/v1/auth/resend-verification` | Public | 5/hr | Resend verification email |
| POST | `/api/v1/auth/forgot-password` | Public | 5/hr | Request reset link |
| POST | `/api/v1/auth/reset-password` | Public | 10/15m | Complete reset |
| POST | `/api/v1/auth/change-password` | Bearer | — | Change password |

---

## Token Architecture

```
┌────────────────────────────────────────────────────┐
│                     Client                         │
│                                                    │
│  Memory: accessToken (JWT, 15m)                   │
│  httpOnly Cookie: refreshToken (opaque, 7d)       │
│  Cookie Path: /api/v1/auth/refresh only           │
└───────────────────────┬────────────────────────────┘
                        │
          Authorization: Bearer <accessToken>
          Cookie: refreshToken=<raw_token>  (path-scoped)
                        │
┌───────────────────────▼────────────────────────────┐
│                     Server                         │
│                                                    │
│  authenticate middleware: verifies JWT             │
│  POST /refresh: rotates opaque refresh token       │
│  RefreshToken collection: stores SHA-256 hashes    │
└────────────────────────────────────────────────────┘
```

## Security Properties

| Property | Implementation |
|---|---|
| Password hashing | Supabase Auth (bcrypt by default) |
| Access token | HS256 JWT, configurable TTL, issuer/audience validated |
| Refresh token | Managed by Supabase Auth |
| Refresh token rotation | Handled by Supabase Auth on refresh |
| Reuse detection | Managed by Supabase Auth |
| Account lockout | Configurable in Supabase dashboard |
| Email enumeration | Forgot password / resend always return 200 |
| Credential timing | Handled by Supabase Auth |
| Cookie security | httpOnly, Secure (prod), SameSite=Strict, path-scoped |
| Sensitive fields | `select: false` on password, token fields |
| DB tokens | Only SHA-256 hashes stored — raw tokens never persisted |
| Session limit | Max 5 active refresh tokens per user |

## RBAC Usage

```typescript
import { authenticate, authorize, authorizeOwnerOrAdmin } from '../../middleware/auth.middleware.js';
import { UserRoles } from '@saas/shared';

// Require authentication only
router.get('/profile', authenticate, handler);

// Require specific role(s)
router.delete('/users/:id', authenticate, authorize(UserRoles.ADMIN, UserRoles.SUPER_ADMIN), handler);

// Allow owner or admin
router.patch('/users/:id', authenticate, authorizeOwnerOrAdmin(UserRoles.ADMIN), handler);
```

## Request / Response Examples

### POST /register
```json
// Request
{ "firstName": "Jane", "lastName": "Doe", "email": "jane@example.com", "password": "MyP@ss123!" }

// Response 201
{
  "success": true,
  "data": {
    "accessToken": "<jwt>",
    "expiresIn": 900,
    "user": { "id": "...", "email": "jane@example.com", "role": "member", "isEmailVerified": false, ... }
  }
}
// Set-Cookie: refreshToken=<raw>; HttpOnly; SameSite=Strict; Path=/api/v1/auth/refresh
```

### POST /login
```json
// Request
{ "email": "jane@example.com", "password": "MyP@ss123!" }
// Response 200 — same shape as register
```

### POST /refresh
```
// Sends the httpOnly cookie automatically (browser) or manually (mobile)
// Response 200 — new accessToken + new refreshToken cookie
```

### POST /forgot-password
```json
// Request
{ "email": "jane@example.com" }
// Response 200 (always, regardless of whether email exists)
{ "success": true, "data": { "message": "If an account with that email exists, a password reset link has been sent." } }
```

### Error responses
```json
// Validation failure
{ "success": false, "error": { "message": "Validation failed", "code": "VALIDATION_ERROR", "details": { "email": ["Invalid email address"], "password": ["Password must contain at least one uppercase letter"] } } }

// Account locked
{ "success": false, "error": { "message": "Account is temporarily locked. Try again in 28 minutes.", "code": "RATE_LIMIT_EXCEEDED" } }

// Expired token
{ "success": false, "error": { "message": "Access token expired. Please refresh your session.", "code": "UNAUTHORIZED" } }
```
