# Cron-Job.org Quick Reference Card

## 📋 Exact Settings to Enter

Copy and paste these values into cron-job.org configuration:

---

### Basic Information

**Title:**
```
Bulk Email Processing
```

**URL:**
```
https://YOUR_PRODUCTION_DOMAIN/api/v1/cron/process
```
*Replace `YOUR_PRODUCTION_DOMAIN` with your actual domain (e.g., `api.yourdomain.com` or `your-app.vercel.app`)*

---

### Request Configuration

**Request Method:**
```
POST
```

**Request Body:**
```json
{"source":"cron-job.org"}
```

---

### Headers (Add 2 headers)

**Header 1:**
```
Name:  Content-Type
Value: application/json
```

**Header 2:**
```
Name:  X-Cron-Secret
Value: [PASTE YOUR PRODUCTION CRON_SECRET HERE]
```
*⚠️ DO NOT use your development secret. Generate a new one for production.*

---

### Schedule

**Recommended:**
```
Every 1 minute
```

**Alternative (Every 5 minutes):**
```
*/5 * * * *
```

---

### Advanced Settings (Optional)

**Timeout:** `30 seconds`  
**Follow redirects:** ✅ Enabled  
**Save responses:** ✅ Enabled  
**Notifications:** ✅ Notify on failure  

---

## ✅ Pre-Configuration Checklist

Before configuring cron-job.org:

- [ ] Application deployed to production
- [ ] Production URL is accessible via HTTPS
- [ ] `CRON_SECRET` added to production environment variables
- [ ] Production server restarted/redeployed
- [ ] Manual test with curl/Postman returns 200 OK

---

## 🧪 Test Production Endpoint First

**PowerShell (Windows):**
```powershell
Invoke-WebRequest -Uri "https://YOUR_PRODUCTION_DOMAIN/api/v1/cron/process" `
  -Method POST `
  -Headers @{
    "Content-Type"="application/json"
    "X-Cron-Secret"="YOUR_PRODUCTION_CRON_SECRET"
  } `
  -Body '{"source":"manual-test"}' | Select-Object -ExpandProperty Content
```

**curl (Linux/Mac/Git Bash):**
```bash
curl -X POST https://YOUR_PRODUCTION_DOMAIN/api/v1/cron/process \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: YOUR_PRODUCTION_CRON_SECRET" \
  -d '{"source":"manual-test"}'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Cron endpoint is working",
    "source": "manual-test",
    "timestamp": "2026-08-08T12:00:00.000Z"
  }
}
```

---

## 🔑 Generate Production Secret

**Run this command to generate a secure secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Example output:**
```
a7f8e3d2c9b1a4f6e8d7c5b3a2f9e1d8c6b4a7f5e3d2c9b8a6f4e2d1c9b7a5f3
```

Use this value as your production `CRON_SECRET`.

---

## 🔒 Security Reminders

- ✅ Use HTTPS only (never HTTP in production)
- ✅ Never commit `CRON_SECRET` to Git
- ✅ Use different secrets for dev and production
- ✅ Keep your secret private and secure
- ✅ Rotate secrets every 90 days

---

## 📞 Support

For detailed setup instructions, troubleshooting, and monitoring guidance, see:
- **Full Guide:** `CRON-JOB-ORG-SETUP.md`
- **Local Testing:** `CRON-ENDPOINT-TEST.md`
