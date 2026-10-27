# Quick Reference - Post Cleanup

## 🚀 How to Start

### Development Mode
```bash
npm install
npm run dev
```
- Frontend: http://localhost:5173 (Vite dev server)
- Backend: http://localhost:5000 (Express API)

### Production Mode
```bash
npm run build
npm start
```
- Everything at: http://localhost:5000

---

## 📦 Build Commands

```bash
# Build everything (recommended)
npm run build

# Build specific packages
npm run build --workspace=packages/shared
npm run build --workspace=apps/client
npm run build --workspace=apps/server
```

---

## 🔧 What Was Fixed

### Critical Bug #1: @saas/shared Runtime Import
**Before:** `"main": "./src/index.ts"` ❌ (Node.js can't run .ts files)  
**After:** `"main": "./dist/index.js"` ✅ (Points to compiled JavaScript)  
**File:** `packages/shared/package.json`

### Critical Bug #2: Server Start Script
**Before:** `"start": "node dist/index.js"` ❌ (File doesn't exist)  
**After:** `"start": "node dist/apps/server/src/index.js"` ✅ (Correct path)  
**File:** `apps/server/package.json`

---

## 📁 Current Entry Points

### Development
- **Frontend:** `apps/client/src/main.tsx`
- **Backend:** `apps/server/src/index.ts` (run with tsx)

### Production
- **Frontend:** Served from `apps/server/public/`
- **Backend:** `apps/server/dist/apps/server/src/index.js`

---

## 🗂️ Build Output

```
packages/shared/dist/          # Shared package (compiled)
apps/client/dist/              # Frontend build (Vite)
apps/server/public/            # Copy of client/dist/ (served by Express)
apps/server/dist/              # Backend build (TypeScript)
  └── apps/server/src/         # Compiled backend code
```

---

## ✅ Verification

Test if everything works:

```bash
# 1. Test shared package import
cd apps/server
node -e "import('@saas/shared').then(m => console.log('✅ Works:', Object.keys(m).slice(0,3)))"

# 2. Test build
cd ../..
npm run build

# 3. Test start
npm start
# Should see: "🚀 Server listening on port 5000"
```

---

## 📝 Sample Files Location

Sample CSV files for testing:
- `/sample-clients.csv` → Served from `apps/client/public/`
- `/sample-whatsapp-clients.csv` → Served from `apps/client/public/`

Used in:
- `SendCampaignPage.tsx`
- `SendWhatsAppCampaignPage.tsx`

---

## 🚨 Common Issues

### Issue: "Cannot find module '@saas/shared'"
**Solution:** Rebuild the shared package
```bash
npm run build --workspace=packages/shared
```

### Issue: "Cannot find module dist/index.js"
**Solution:** The start script was fixed. Pull latest changes or update manually:
```json
// apps/server/package.json
"start": "node dist/apps/server/src/index.js"
```

### Issue: React routes return 404 on refresh
**Solution:** Rebuild to ensure server has the frontend
```bash
npm run build
```

### Issue: API CORS errors
**Solution:** In production, set `VITE_API_URL` to empty in `.env`
```env
VITE_API_URL=
```

---

## 📊 Space Savings

| Item | Size | Status |
|------|------|--------|
| temp_unzipped/ | ~175MB | ✅ Removed |
| supabase.zip | 240MB | ✅ Removed |
| dist.zip | 1MB | ✅ Removed |
| Root CSV files | <1MB | ✅ Removed |
| **Total Saved** | **~265MB** | ✅ |

---

## 🎯 Deployment Checklist

### Before Deploy
- [ ] Run `npm run build`
- [ ] Verify build succeeded
- [ ] Test locally with `npm start`
- [ ] Check environment variables

### Upload to Server
```
apps/server/dist/          (compiled backend)
apps/server/public/        (frontend files)
apps/server/package.json
apps/server/.env
node_modules/             (or run npm install on server)
```

### On Server
```bash
npm install --production
npm start
```

### Start Command
```bash
node dist/apps/server/src/index.js
```

Or with PM2:
```bash
pm2 start dist/apps/server/src/index.js --name bulk-email-app
```

---

## 📚 Related Docs

- `README.md` - Full project documentation
- `CHANGES.md` - Changelog
- `CLEANUP-SUMMARY.md` - Detailed cleanup report
- `apps/server/README.md` - Backend architecture

---

_Last Updated: December 2024_
