# Cron-Job.org Setup Guide

Complete configuration guide for integrating cron-job.org with your bulk email processing system.

---

## 🎯 Overview

This guide configures cron-job.org to trigger scheduled bulk email processing every minute via a secure API endpoint.

**Endpoint:** `POST /api/v1/cron/process`  
**Security:** Protected by `X-Cron-Secret` header authentication

---

## 🔧 Local Testing (Development)

### Test Endpoint URL
```
http://localhost:5000/api/v1/cron/process
```

### Test with PowerShell (Windows)
```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/v1/cron/process" `
  -Method POST `
  -Headers @{
    "Content-Type"="application/json"
    "X-Cron-Secret"="YOUR_LOCAL_CRON_SECRET_FROM_ENV_FILE"
  } `
  -Body '{"source":"cron-job.org"}' | Select-Object -ExpandProperty Content
```

### Test with curl (Linux/Mac/Git Bash)
```bash
curl -X POST http://localhost:5000/api/v1/cron/process \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: YOUR_LOCAL_CRON_SECRET_FROM_ENV_FILE" \
  -d '{"source":"cron-job.org"}'
```

### Expected Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Cron endpoint is working",
    "source": "cron-job.org",
    "timestamp": "2026-08-08T12:00:00.000Z"
  }
}
```

---

## 🚀 Production Configuration

### Step 1: Deploy Your Application

Ensure your application is deployed and accessible via HTTPS. Common deployment platforms:
- **Vercel**: `https://your-app.vercel.app`
- **Netlify**: `https://your-app.netlify.app`
- **AWS/EC2**: `https://your-domain.com`
- **Heroku**: `https://your-app.herokuapp.com`
- **DigitalOcean**: `https://your-domain.com`
- **Custom Domain**: `https://api.yourdomain.com`

### Step 2: Set Production Environment Variable

Add `CRON_SECRET` to your production environment:

**Generate a new production secret (NEVER reuse dev secret):**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Add to your hosting platform:**
- **Vercel**: Project Settings → Environment Variables → Add `CRON_SECRET`
- **Netlify**: Site Settings → Environment Variables → Add `CRON_SECRET`
- **Heroku**: Settings → Config Vars → Add `CRON_SECRET`
- **AWS/EC2**: Add to `.env` or use AWS Systems Manager Parameter Store
- **DigitalOcean**: App Settings → Environment Variables → Add `CRON_SECRET`

⚠️ **IMPORTANT**: Keep this secret secure. Never commit it to Git or expose it publicly.

### Step 3: Verify Production Endpoint

Test your production endpoint manually before configuring cron-job.org:

```bash
curl -X POST https://YOUR_PRODUCTION_DOMAIN/api/v1/cron/process \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: YOUR_PRODUCTION_CRON_SECRET" \
  -d '{"source":"manual-test"}'
```

You should receive a 200 OK response with the success message.

---

## 📋 Cron-Job.org Configuration

### Create New Cron Job

1. **Go to:** https://cron-job.org
2. **Sign up/Login** to your account
3. **Click:** "Create cronjob"

### Required Settings

Fill in the following fields EXACTLY as shown:

#### Basic Settings

| Field | Value |
|-------|-------|
| **Title** | `Bulk Email Processing` |
| **Address (URL)** | `https://YOUR_PRODUCTION_DOMAIN/api/v1/cron/process` |
| **Schedule** | `Every 1 minute` or configure custom schedule |

#### Request Settings

| Field | Value |
|-------|-------|
| **Request method** | `POST` |
| **Request body** | `{"source":"cron-job.org"}` |

#### Headers (Click "Add header" button)

**Header 1:**
- Name: `Content-Type`
- Value: `application/json`

**Header 2:**
- Name: `X-Cron-Secret`
- Value: `YOUR_PRODUCTION_CRON_SECRET` (paste your actual secret here)

#### Advanced Settings (Optional but Recommended)

| Field | Value |
|-------|-------|
| **Timeout** | `30 seconds` |
| **Follow redirects** | ✅ Enabled |
| **Save responses** | ✅ Enabled (for debugging) |
| **Notifications** | ✅ Notify on failure |

---

## 🕒 Schedule Recommendations

### Recommended Schedule
**Every 1 minute** - Ensures near real-time email processing for scheduled campaigns

### Alternative Schedules

- **Every 5 minutes**: `*/5 * * * *` - Balance between responsiveness and server load
- **Every 15 minutes**: `*/15 * * * *` - For lower volume systems
- **Every hour**: `0 * * * *` - For batch processing scenarios
- **Custom**: Configure based on your email volume and urgency requirements

---

## 🔒 Security Features

### Built-in Protection

✅ **Secret Key Authentication**: Only requests with valid `X-Cron-Secret` header are processed  
✅ **401 Unauthorized Response**: Invalid or missing secrets are rejected immediately  
✅ **Backend-only Secret**: Never exposed to frontend or client code  
✅ **Environment-based Configuration**: Different secrets for dev/staging/production  
✅ **HTTPS Required**: Production endpoint must use HTTPS  
✅ **Rate Limiting**: Server-level protection against excessive requests  

### Security Best Practices

1. **Never commit CRON_SECRET to Git** - Use environment variables only
2. **Use different secrets for each environment** - Dev, staging, and production
3. **Rotate secrets periodically** - Update every 90 days or on security events
4. **Monitor cron job logs** - Check for unauthorized access attempts
5. **Use HTTPS only** - Never expose endpoints over HTTP in production

---

## 🧪 Testing Checklist

Before going live with cron-job.org, verify:

- [ ] Production endpoint is accessible via HTTPS
- [ ] `CRON_SECRET` is set in production environment
- [ ] Manual curl/Postman test returns 200 OK
- [ ] Wrong secret returns 401 Unauthorized
- [ ] Missing secret returns 401 Unauthorized
- [ ] Request body is properly received
- [ ] Server logs show successful requests

---

## 📊 Monitoring & Debugging

### Expected Success Response

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Cron endpoint is working",
    "source": "cron-job.org",
    "timestamp": "2026-08-08T12:00:00.000Z"
  }
}
```

### Common Errors

#### 401 Unauthorized - Invalid Secret
```json
{
  "success": false,
  "error": {
    "message": "Invalid cron secret",
    "statusCode": 401
  }
}
```
**Solution**: Verify `X-Cron-Secret` header matches production `CRON_SECRET`

#### 401 Unauthorized - Missing Secret
```json
{
  "success": false,
  "error": {
    "message": "Missing X-Cron-Secret header",
    "statusCode": 401
  }
}
```
**Solution**: Add `X-Cron-Secret` header to cron-job.org configuration

#### 500 Internal Server Error - Secret Not Configured
```json
{
  "success": false,
  "error": {
    "message": "Cron secret not configured on server",
    "statusCode": 500
  }
}
```
**Solution**: Add `CRON_SECRET` environment variable to production server

#### 404 Not Found - Wrong URL
```json
{
  "success": false,
  "error": {
    "message": "Route not found: POST /api/cron/process",
    "code": "ROUTE_NOT_FOUND"
  }
}
```
**Solution**: Use correct URL with `/v1/` in path: `/api/v1/cron/process`

### Cron-Job.org Dashboard

After configuration, monitor your cron job in the dashboard:
- **Execution History**: View all executions with timestamps
- **Success Rate**: Track reliability metrics
- **Response Times**: Monitor performance
- **Failure Alerts**: Receive notifications on errors

---

## 🔄 Updating Configuration

### To Change Schedule
1. Go to cron-job.org dashboard
2. Edit your "Bulk Email Processing" job
3. Update the schedule settings
4. Save changes

### To Rotate Secret
1. Generate new secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Update production `CRON_SECRET` environment variable
3. Restart production server/redeploy
4. Update `X-Cron-Secret` header in cron-job.org
5. Test manually before saving

### To Temporarily Disable
1. Go to cron-job.org dashboard
2. Toggle "Enable" switch OFF for your job
3. Re-enable when ready

---

## 📖 Next Steps

Once cron-job.org is configured and testing successfully:

1. ✅ Monitor execution logs for 24 hours
2. ✅ Verify cron jobs run at expected intervals
3. ✅ Implement email processing logic (future step)
4. ✅ Add campaign scheduling functionality (future step)
5. ✅ Set up failure notifications
6. ✅ Configure backup monitoring (e.g., UptimeRobot)

---

## 🆘 Support

### Cron-Job.org Resources
- Documentation: https://docs.cron-job.org
- Support: https://cron-job.org/en/support/

### Application Logs
Check server logs for detailed error information:
```bash
# View production logs (adjust for your hosting platform)
heroku logs --tail              # Heroku
vercel logs                      # Vercel
netlify logs                     # Netlify
pm2 logs                         # PM2/DigitalOcean
```

---

## ✅ Production Readiness Confirmation

The cron endpoint is **production-ready** with:

- ✅ Secure header-based authentication
- ✅ Proper error handling with appropriate HTTP status codes
- ✅ Request logging for debugging
- ✅ Environment-based configuration
- ✅ JSON request/response format
- ✅ Compatible with cron-job.org requirements
- ✅ No hardcoded secrets or sensitive data exposure
