# Testing the Cron Endpoint

## Endpoint Details

**URL:** `POST /api/v1/cron/process`  
**Authentication:** Requires `X-Cron-Secret` header

## Local Testing

### 1. Add CRON_SECRET to your .env file

```bash
# Add this to apps/server/.env
CRON_SECRET=your_secure_random_string_here
```

**Generate a secure secret:**
```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use any secure random string generator
```

### 2. Start the server

```bash
cd apps/server
npm run dev
```

Server will be running at: `http://localhost:5000`

### 3. Test with curl

**Valid Request (with correct secret):**
```bash
curl -X POST http://localhost:5000/api/v1/cron/process \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: your_secure_random_string_here"
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Cron endpoint is working"
  }
}
```

**Invalid Request (wrong secret):**
```bash
curl -X POST http://localhost:5000/api/v1/cron/process \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: wrong_secret"
```

**Expected Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": {
    "message": "Invalid cron secret",
    "statusCode": 401
  }
}
```

**Missing Secret Header:**
```bash
curl -X POST http://localhost:5000/api/v1/cron/process \
  -H "Content-Type: application/json"
```

**Expected Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": {
    "message": "Missing X-Cron-Secret header",
    "statusCode": 401
  }
}
```

### 4. Test with Postman/Insomnia

1. Create a new POST request
2. URL: `http://localhost:5000/api/v1/cron/process`
3. Headers:
   - `Content-Type: application/json`
   - `X-Cron-Secret: your_secure_random_string_here`
4. Send request

## Production Setup with cron-job.org

Once deployed, configure cron-job.org:

1. **URL:** `https://your-domain.com/api/v1/cron/process`
2. **Method:** POST
3. **Headers:** 
   - Name: `X-Cron-Secret`
   - Value: (your CRON_SECRET from production environment)
4. **Schedule:** Set your desired frequency (e.g., every 5 minutes, hourly, etc.)

## Security Notes

- ✅ CRON_SECRET is backend-only (never exposed to client)
- ✅ Endpoint returns 401 if secret is missing or incorrect
- ✅ Secret is validated before any processing occurs
- ✅ .env files are in .gitignore (secrets won't be committed)

## Next Steps

This endpoint currently returns a success message. In future steps, it will:
- Query scheduled campaigns from the database
- Process and send bulk emails
- Update campaign status and analytics
