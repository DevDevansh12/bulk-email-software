# Environment Variables Security Guide

## ✅ Security Status: SECURED

This document outlines the environment variable security measures implemented in this project.

---

## 🔒 Environment Variable Rules

### Frontend (`apps/client/.env`)

**✅ SAFE to expose (public):**
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Public anon key (rate-limited, RLS-protected)
- `VITE_API_URL` - Backend API URL
- `VITE_APP_NAME` - Application name
- `VITE_APP_VERSION` - Application version

**❌ NEVER include in frontend .env:**
- `VITE_SUPABASE_SERVICE_ROLE_KEY` - Would bypass all RLS policies
- `VITE_SUPABASE_JWT_SECRET` - Would allow forging authentication tokens
- `VITE_SMTP_*` - SMTP credentials
- Any secrets, API keys, or private credentials

### Backend (`apps/server/.env`)

**🔐 Required secrets (keep private):**
- `SUPABASE_SERVICE_ROLE_KEY` - Full database access (bypasses RLS)
- `SUPABASE_JWT_SECRET` - Used to verify Supabase JWTs
- `SMTP_PASS` - SMTP server password
- `CRON_SECRET` - Cron job authentication secret
- `GEMINI_API_KEY` - AI service key (optional)
- `OPENAI_API_KEY` - AI service key (optional)
- `WHATSAPP_ACCESS_TOKEN` - Meta WhatsApp API token

**✅ Safe to share (non-sensitive):**
- `SUPABASE_URL` - Public project URL
- `SUPABASE_ANON_KEY` - Public anon key (same as frontend)
- `NODE_ENV` - Runtime environment
- `PORT` - Server port
- `CLIENT_URL` - Frontend URL for CORS

---

## 🛡️ Security Measures Implemented

### 1. Git Protection
- ✅ `.env` files excluded in `.gitignore`
- ✅ `.env.local` excluded in `.gitignore`
- ✅ `.env.*.local` excluded in `.gitignore`
- ✅ Verified: No `.env` files tracked by git

### 2. Code Hygiene
- ✅ **Fixed**: Removed hardcoded secrets from `apps/server/src/scratch_test_send.ts`
- ✅ All secrets loaded from environment variables
- ✅ No hardcoded API keys in source code
- ✅ Frontend never imports or references service role keys

### 3. Environment Validation
- ✅ Server validates required env vars on startup (`envalid`)
- ✅ Frontend validates Supabase config on client init
- ✅ Missing vars cause immediate startup failure

### 4. Documentation
- ✅ `.env.example` files provided for both apps
- ✅ Example files contain placeholders, not real secrets
- ✅ Clear comments indicate which vars are required

---

## 🚨 If Secrets Were Exposed

Based on the audit, the following secrets **were previously hardcoded** in `scratch_test_send.ts`:

### Action Required:

1. **Rotate Supabase Service Role Key:**
   - Go to: Supabase Dashboard → Project Settings → API
   - Click "Generate new service role key"
   - Update `apps/server/.env` with new key
   - Old key will be invalidated

2. **Rotate JWT Secret:**
   - Go to: Supabase Dashboard → Project Settings → API → JWT Settings
   - Click "Generate new JWT secret"
   - Update `apps/server/.env` with new secret
   - All existing user sessions will be invalidated (users must re-login)

3. **Verify Git History:**
   ```bash
   # Check if .env was ever committed
   git log --all --full-history -- "*/.env"
   
   # If found, consider the secrets compromised
   ```

4. **If Using Public GitHub/GitLab:**
   - Rotate all secrets immediately
   - Consider using GitHub's secret scanning alerts
   - Use environment variables in CI/CD instead of committing

---

## 📋 Setup Checklist for New Developers

1. Copy `.env.example` to `.env` in both apps:
   ```bash
   cp apps/server/.env.example apps/server/.env
   cp apps/client/.env.example apps/client/.env
   ```

2. Fill in real values in both `.env` files

3. Verify `.env` is not tracked:
   ```bash
   git status --ignored | grep .env
   ```

4. Never commit `.env` files:
   ```bash
   # If accidentally staged:
   git reset HEAD apps/server/.env
   git reset HEAD apps/client/.env
   ```

---

## 🔍 Regular Audits

Run these commands periodically to verify no secrets leaked:

```bash
# Check if .env is tracked
git ls-files | grep "\.env$"

# Verify .gitignore includes .env
cat .gitignore | grep "\.env"

# Check for hardcoded JWT tokens
grep -r "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\." --include="*.ts" --include="*.js" --exclude-dir=node_modules .

# Check for VITE_ prefixed secrets (should never exist)
grep -r "VITE_.*SECRET\|VITE_.*SERVICE_ROLE" --include="*.ts" --include="*.tsx" apps/client/
```

---

## 📚 References

- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/security)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

---

**Last Updated:** Phase 2 Security Audit - 2026-09-02
