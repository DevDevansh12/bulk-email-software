# Bulk Email SaaS Platform

Production-grade full-stack SaaS application with TypeScript monorepo architecture.

## 🚀 Quick Links

- **[Quick Start Guide](./QUICKSTART.md)** - Get started in 5 minutes
- **[Deployment Guide](./DEPLOYMENT.md)** - Production deployment to Hostinger
- **[Server Documentation](./apps/server/README.md)** - Backend architecture details

---

## Stack

| Layer          | Technology                                |
| -------------- | ----------------------------------------- |
| Frontend       | React 18, Vite 5, TypeScript, TailwindCSS |
| Backend        | Node.js 20, Express 4, TypeScript         |
| Database       | Supabase (PostgreSQL)                     |
| Authentication | JWT + Supabase Auth                       |
| Email          | Nodemailer (SMTP)                         |
| Messaging      | WhatsApp Business API                     |
| Logging        | Pino                                      |
| Linting        | ESLint 9, Prettier                        |
| Git hooks      | Husky, lint-staged                        |

---

## Deployment Architecture

This application is designed for **single-domain deployment** where both the React frontend and Express backend are served from the same server.

```
https://mamotechnolabs.in
├── /                      → React Application
├── /dashboard             → React Route
├── /api/v1/*              → Express API
└── /health                → Health Check
```

**Benefits:**

- ✅ No CORS issues
- ✅ Simplified deployment
- ✅ Single server to manage
- ✅ No subdomain configuration needed
- ✅ React Router works seamlessly

---

## Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Supabase account (for database and authentication)
- SMTP credentials (for email campaigns)
- WhatsApp Business API credentials (optional)

---

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

#### Client (`apps/client/.env`)

```bash
cd apps/client
cp .env.example .env
```

Edit with your values:

```env
# Development: http://localhost:5000
# Production: Leave empty for same-domain deployment
VITE_API_URL=http://localhost:5000

VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

#### Server (`apps/server/.env`)

```bash
cd apps/server
cp .env.example .env
```

Edit with your values:

```env
NODE_ENV=production
PORT=5000
API_VERSION=v1

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

JWT_SECRET=your_secure_random_secret
# ... (see .env.example for all variables)
```

### 3. Initialize Git Hooks

```bash
npm run prepare
```

---

## Development

### Option 1: Separate Servers (Recommended for Development)

```bash
# Start both client and server with hot reload
npm run dev
```

- Frontend: `http://localhost:5173` (Vite dev server)
- Backend: `http://localhost:5000` (Express API)

### Option 2: Single Server (Production Mode Locally)

```bash
# Build and run in production mode
npm run build
npm start
```

- Everything: `http://localhost:5000`

---

## Build for Production

```bash
npm run build
```

This command:

1. ✅ Builds shared packages (`@saas/shared`)
2. ✅ Builds React client → `apps/client/dist`
3. ✅ Copies React build → `apps/server/public`
4. ✅ Builds Express server → `apps/server/dist`

After building, start the server:

```bash
npm start
```

Visit `http://localhost:5000` to see both frontend and backend running from one server.

---

## Available Scripts

| Script              | Description                         |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Start client + server in watch mode |
| `npm run build`     | Build all packages for production   |
| `npm start`         | Start production server             |
| `npm run lint`      | Lint all workspaces                 |
| `npm run lint:fix`  | Auto-fix lint issues                |
| `npm run format`    | Format all files with Prettier      |
| `npm run typecheck` | TypeScript check all workspaces     |

### Workspace-Specific Scripts

```bash
# Server only
npm run dev --workspace=apps/server
npm run build --workspace=apps/server

# Client only
npm run dev --workspace=apps/client
npm run build --workspace=apps/client

# Shared packages
npm run build --workspace=packages/shared
```

---

## Project Structure

```
bulk-email-saas/
├── apps/
│   ├── client/                    # React frontend
│   │   ├── src/
│   │   │   ├── components/        # Reusable UI components
│   │   │   ├── features/          # Feature modules (auth, etc.)
│   │   │   ├── pages/             # Page components
│   │   │   ├── lib/               # API clients and utilities
│   │   │   └── routes/            # React Router configuration
│   │   ├── dist/                  # Build output (git-ignored)
│   │   └── package.json
│   │
│   └── server/                    # Express backend
│       ├── src/
│       │   ├── config/            # Environment and database config
│       │   ├── features/          # Feature modules (auth, campaigns, etc.)
│       │   ├── middleware/        # Express middleware
│       │   ├── routes/            # Route registration
│       │   ├── lib/               # Utilities (logger, etc.)
│       │   ├── app.ts             # Express app factory
│       │   └── index.ts           # Server entry point
│       ├── scripts/
│       │   └── copy-client-build.js   # Build script
│       ├── dist/                  # Compiled TypeScript (git-ignored)
│       ├── public/                # React build (git-ignored)
│       └── package.json
│
├── packages/
│   └── shared/                    # Shared types and utilities
│       └── src/
│
├── package.json                   # Root workspace configuration
├── QUICKSTART.md                  # Quick start guide
├── DEPLOYMENT.md                  # Production deployment guide
└── README.md                      # This file
```

---

## API Documentation

### Health Check

```
GET /health
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

### API Endpoints

All API routes are prefixed with `/api/v1`:

| Endpoint                      | Method | Description           |
| ----------------------------- | ------ | --------------------- |
| `/api/v1/auth/register`       | POST   | User registration     |
| `/api/v1/auth/login`          | POST   | User login            |
| `/api/v1/auth/logout`         | POST   | User logout           |
| `/api/v1/campaigns`           | GET    | List campaigns        |
| `/api/v1/campaigns`           | POST   | Create campaign       |
| `/api/v1/campaigns/:id`       | GET    | Get campaign details  |
| `/api/v1/audiences`           | GET    | List audiences        |
| `/api/v1/audiences`           | POST   | Create audience       |
| `/api/v1/analytics/dashboard` | GET    | Dashboard analytics   |
| `/api/v1/whatsapp/templates`  | GET    | WhatsApp templates    |
| `/api/v1/whatsapp/send`       | POST   | Send WhatsApp message |

See individual feature modules in `apps/server/src/features/` for detailed documentation.

---

## Project Conventions

- **Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by Husky)
- **Errors**: Always throw `AppError` / use `createError.*` factory methods
- **Logging**: Always use structured logging: `logger.info({ userId }, 'message')`
- **Responses**: Always use `sendSuccess()` / `sendCreated()` helpers
- **Feature modules**: Follow the modular pattern in `apps/server/src/features/`
- **ESM**: Use ES Modules (`.js` extensions in imports)

---

## Middleware Stack

The Express middleware is configured in a specific order (see `apps/server/src/app.ts`):

1. **Security** (helmet, cors, hpp, rate limiting)
2. **Request ID** (for distributed tracing)
3. **HTTP Logger** (pino-http)
4. **Body Parser** (JSON, URL-encoded)
5. **Cookie Parser**
6. **API Routes** (`/api/v1/*`)
7. **Static Files** (React build)
8. **SPA Fallback** (React Router catch-all)
9. **404 Handler**
10. **Error Handler**

**Order is critical** - API routes must come before static file serving to prevent shadowing.

---

## Features

### Email Campaigns

- Create and manage email campaigns
- CSV import for recipient lists
- Template editor
- Tracking pixels for open rates
- Link tracking

### WhatsApp Campaigns

- Send bulk WhatsApp messages
- Template management
- WhatsApp Business API integration
- Webhook handling for delivery status

### Analytics

- Campaign performance metrics
- Open rates and click rates
- Audience insights
- Dashboard visualizations

### Authentication

- JWT-based authentication
- Refresh token rotation
- Role-based access control
- Session management

---

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for detailed production deployment instructions for Hostinger Node.js App.

**Quick Deploy:**

```bash
# Build everything
npm run build

# Upload to server:
# - apps/server/dist/
# - apps/server/public/
# - apps/server/package.json
# - apps/server/.env

# On server:
npm install --production
npm start
```

---

## Monitoring

### Process Management

Use PM2 for production:

```bash
npm install -g pm2
pm2 start apps/server/dist/index.js --name bulk-email-app
pm2 save
pm2 startup
```

### Logs

```bash
# Development (pretty-printed)
npm run dev

# Production (JSON)
npm start

# With PM2
pm2 logs bulk-email-app
```

---

## Security

- ✅ Helmet security headers
- ✅ CORS protection
- ✅ Rate limiting
- ✅ HPP (HTTP Parameter Pollution) protection
- ✅ JWT authentication with refresh tokens
- ✅ Environment-based secrets
- ✅ Input validation with Zod
- ✅ SQL injection protection (Supabase prepared statements)

---

## Contributing

1. Follow the project conventions above
2. Write meaningful commit messages (Conventional Commits)
3. Run linting and type-checking before committing:
   ```bash
   npm run lint
   npm run typecheck
   ```
4. Test locally with `npm run build && npm start`

---

## Troubleshooting

### React routes return 404 on refresh

**Solution**: Rebuild to ensure `apps/server/public/` exists:

```bash
npm run build
```

### API requests fail with CORS errors

**Solution**: In production, ensure `VITE_API_URL` is empty (uses relative URLs).

### Build fails

**Solution**: Build step-by-step:

```bash
npm run build --workspace=packages/shared
npm run build --workspace=apps/client
npm run build --workspace=apps/server
```

### Port already in use

**Solution**: Change port in `apps/server/.env`:

```env
PORT=3000
```

---

## License

Proprietary - All rights reserved

---

## Support

- 📖 [Quick Start Guide](./QUICKSTART.md)
- 🚀 [Deployment Guide](./DEPLOYMENT.md)
- 🏗️ [Server Documentation](./apps/server/README.md)
- 🐛 Check logs: `pm2 logs` or console output
- 🔍 Review middleware order in `apps/server/src/app.ts`
  #   B u l k - e m a i l - s o f t w a r e 
   
   
