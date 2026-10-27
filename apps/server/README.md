# Express Server

Production-ready Express server with TypeScript, serving both API endpoints and the React frontend from a single domain.

## Architecture

This server serves:
1. **REST API** at `/api/v1/*`
2. **Health check** at `/health`
3. **React application** at all other routes (SPA)

### Middleware Stack (Order Matters!)

```typescript
1. Security (helmet, cors, hpp, rate limiting)
2. Request ID (for distributed tracing)
3. HTTP Logger (pino-http)
4. Body Parser (JSON, URL-encoded)
5. Cookie Parser
6. API Routes (/api/v1/*)
7. Static Files (React build from /public)
8. SPA Fallback (index.html for client-side routing)
9. 404 Handler
10. Error Handler
```

**Why this order:**
- Security must be first (before any response is written)
- API routes must be before static files (to prevent shadowing)
- SPA fallback must be after API routes but before 404 handler
- Error handler must always be last

---

## Directory Structure

```
apps/server/
├── src/
│   ├── config/          # Environment & database config
│   ├── features/        # Feature modules (auth, campaigns, etc.)
│   ├── middleware/      # Express middleware
│   │   ├── static.middleware.ts    # ⭐ Static file serving (NEW)
│   │   ├── security.middleware.ts
│   │   ├── error.middleware.ts
│   │   └── ...
│   ├── lib/             # Utilities (logger, etc.)
│   ├── routes/          # Route registration
│   ├── app.ts           # Express app factory
│   └── index.ts         # Server entry point
├── scripts/
│   └── copy-client-build.js        # ⭐ Build script (NEW)
├── public/              # React build (auto-generated, git-ignored)
│   ├── index.html
│   └── assets/
├── dist/                # Compiled TypeScript (git-ignored)
├── package.json
├── tsconfig.json
└── .env
```

---

## Static File Serving

### Overview

The server serves the built React application from the `/public` directory. This directory is automatically generated during the build process.

### How It Works

1. **During Build**: 
   ```bash
   npm run build
   ```
   - Compiles TypeScript to `dist/`
   - Runs `postbuild` script
   - Copies `apps/client/dist` → `apps/server/public`

2. **At Runtime**:
   ```typescript
   // Serve static assets (JS, CSS, images)
   app.use(serveStaticFiles());
   
   // Serve index.html for non-API routes (React Router)
   app.use(serveSpaFallback());
   ```

### Middleware Details

#### `serveStaticFiles()`

Serves static assets from `/public` with optimized cache headers:

- **Immutable assets** (JS, CSS with hashes): Cache for 1 year
- **index.html**: Never cache (always fetch fresh)
- **Other assets**: Default browser caching

**Key Features:**
- Gracefully handles missing `/public` directory (development mode)
- Logs warning if public directory not found
- Returns no-op middleware if build doesn't exist

#### `serveSpaFallback()`

Serves `index.html` for all non-API routes to support React Router.

**Rules:**
- ✅ Serves `index.html` for routes like `/dashboard`, `/login`, etc.
- ❌ Skips API routes (`/api/*`)
- ❌ Skips health check (`/health`)
- ❌ Skips if public directory doesn't exist

**Example:**
```
GET /dashboard         → index.html (React Router handles /dashboard)
GET /api/v1/campaigns  → API handler (not caught by fallback)
GET /health            → Health check handler
GET /nonexistent       → 404 handler
```

---

## Build Process

### Standard Build

```bash
npm run build
```

This runs:
1. `tsc --project tsconfig.build.json` - Compile TypeScript
2. `postbuild` hook - Copy React build to `/public`

### Manual Steps

If you need to run steps individually:

```bash
# Build server only
npm run build --workspace=apps/server

# Copy client build manually
node apps/server/scripts/copy-client-build.js
```

---

## Development

### Local Development (Separate Servers)

```bash
# Terminal 1: Backend (with hot reload)
cd apps/server
npm run dev

# Terminal 2: Frontend (with hot reload)
cd apps/client
npm run dev
```

- Backend: `http://localhost:5000`
- Frontend: `http://localhost:5173` (proxies `/api/*` to backend)

### Local Development (Production Mode)

Test the production setup locally:

```bash
# Build everything
npm run build

# Start server (serves both API and frontend)
cd apps/server
npm start
```

Visit `http://localhost:5000` to see the full application.

---

## Environment Variables

Create `apps/server/.env`:

```env
# Server
NODE_ENV=production
PORT=5000
API_VERSION=v1

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Authentication
JWT_SECRET=your_secure_random_secret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Email
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_user
SMTP_PASS=your_password
SMTP_FROM=noreply@example.com

# WhatsApp
WHATSAPP_BUSINESS_ACCOUNT_ID=your_account_id
WHATSAPP_ACCESS_TOKEN=your_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
WHATSAPP_VERIFY_TOKEN=your_verify_token

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## API Routes

All API routes are prefixed with `/api/v1`:

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/auth/register` | User registration |
| `POST /api/v1/auth/login` | User login |
| `GET /api/v1/campaigns` | List campaigns |
| `POST /api/v1/campaigns` | Create campaign |
| `GET /api/v1/audiences` | List audiences |
| `GET /api/v1/analytics/dashboard` | Dashboard stats |
| `POST /api/v1/whatsapp/send` | Send WhatsApp message |
| `GET /health` | Health check |

See individual feature modules in `src/features/` for complete API documentation.

---

## Deployment

### Production Deployment

See [DEPLOYMENT.md](../../DEPLOYMENT.md) for full instructions.

**Quick Start:**

```bash
# 1. Build
npm run build

# 2. Set environment variables
cp .env.example .env
# Edit .env with production values

# 3. Start
npm start
```

### Process Management (PM2)

```bash
# Install PM2
npm install -g pm2

# Start server
pm2 start dist/index.js --name bulk-email-app

# Save PM2 config
pm2 save

# Setup auto-restart on reboot
pm2 startup
```

---

## Troubleshooting

### Issue: `public/` directory not found

**Cause**: Client build hasn't been copied yet.

**Solution**:
```bash
npm run build --workspace=apps/client
npm run postbuild --workspace=apps/server
```

### Issue: API routes return React app

**Cause**: Middleware order is incorrect.

**Solution**: Verify in `src/app.ts` that API routes are registered BEFORE static file middleware:
```typescript
app.use(registerRoutes);      // API routes first
app.use(serveStaticFiles());  // Then static files
app.use(serveSpaFallback());  // Then React fallback
```

### Issue: React routes return 404 on refresh

**Cause**: SPA fallback middleware not registered.

**Solution**: Ensure `serveSpaFallback()` is registered in `src/app.ts`.

### Issue: Static assets not caching

**Cause**: Cache headers not set correctly.

**Solution**: Check `src/middleware/static.middleware.ts` - should set:
- `Cache-Control: public, max-age=31536000, immutable` for hashed assets
- `Cache-Control: no-cache` for `index.html`

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run postbuild` | Copy client build (auto-runs after build) |
| `npm start` | Start production server |
| `npm run lint` | Lint TypeScript files |
| `npm run lint:fix` | Lint and auto-fix |
| `npm run typecheck` | Type-check without emitting files |

---

## Testing

### Manual Testing

1. **Health Check**:
   ```bash
   curl http://localhost:5000/health
   ```

2. **API Endpoint**:
   ```bash
   curl http://localhost:5000/api/v1/campaigns
   ```

3. **React App**:
   ```bash
   curl http://localhost:5000
   # Should return index.html
   ```

4. **React Router**:
   ```bash
   curl http://localhost:5000/dashboard
   # Should return index.html (not 404)
   ```

---

## ESM Compatibility

This server uses ES Modules (`"type": "module"` in `package.json`).

**Key differences from CommonJS:**

```typescript
// ❌ CommonJS (doesn't work)
const path = require('path');
const __dirname = __dirname;

// ✅ ESM (correct)
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

All imports must use `.js` extension:
```typescript
// ✅ Correct
import { logger } from './lib/logger.js';

// ❌ Wrong
import { logger } from './lib/logger';
```

---

## Security

### Built-in Protections

- **Helmet**: Security headers (XSS, clickjacking, etc.)
- **CORS**: Cross-origin request control
- **HPP**: HTTP parameter pollution protection
- **Rate Limiting**: Prevents brute force attacks
- **Compression**: Gzip response compression

### Best Practices

- Store secrets in `.env` (never commit)
- Use strong JWT secrets (64+ random characters)
- Enable `trust proxy` in production (already configured)
- Keep dependencies updated (`npm audit`)

---

## Monitoring

### Logs

Development:
```bash
npm run dev
# Pretty-printed logs with pino-pretty
```

Production:
```bash
npm start
# JSON logs (pipe to log aggregator)
```

### Health Check

```bash
curl http://localhost:5000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-08-05T10:00:00.000Z",
  "uptime": 12345,
  "environment": "production"
}
```

---

## Contributing

When adding new features:

1. **New API route**: Add to `src/features/<feature>/*.routes.ts`
2. **New middleware**: Add to `src/middleware/`
3. **Middleware order**: Update `src/app.ts` carefully (order matters!)
4. **Environment variable**: Add to `src/config/env.ts` and `.env.example`

---

## License

Proprietary - All rights reserved

---

## Support

For issues:
1. Check logs: `pm2 logs` or console output
2. Verify environment variables: `.env` file
3. Check middleware order: `src/app.ts`
4. Review [DEPLOYMENT.md](../../DEPLOYMENT.md)
