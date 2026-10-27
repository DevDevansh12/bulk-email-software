# 🔒 Production Security Deployment Checklist

This checklist ensures your Bulk Email Platform is securely deployed to production.

## ✅ PRE-DEPLOYMENT CHECKLIST

### 1. Environment Variables

#### Backend (`apps/server/.env`)
- [ ] Set `NODE_ENV=production`
- [ ] Update `CLIENT_URL` to production domain(s) with `https://`
- [ ] Update `SERVER_URL` to production API domain with `https://`
- [ ] Verify Supabase credentials are for production project
- [ ] Rotate `SUPABASE_SERVICE_ROLE_KEY` if it was ever committed or exposed
- [ ] Set `LOG_LEVEL=info` or `LOG_LEVEL=warn` (not `debug`)
- [ ] Generate new `CRON_SECRET` using: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Configure production SMTP credentials
- [ ] Set `ENABLE_SWAGGER=false` for security

#### Frontend (`apps/client/.env`)
- [ ] Set `VITE_API_URL` to production backend domain with `https://`
- [ ] Verify `VITE_SUPABASE_URL` points to production Supabase project
- [ ] Verify `VITE_SUPABASE_ANON_KEY` is production anon key (safe to expose)

### 2. HTTPS / SSL Configuration

Choose ONE option based on your hosting provider:

#### Option A: nginx with Let's Encrypt
```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run

# nginx config example
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # Proxy to Node.js backend
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Serve frontend static files
    location / {
        root /var/www/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

#### Option B: AWS Application Load Balancer (ALB)
1. **Create ALB**:
   - Navigate to EC2 → Load Balancers → Create
   - Choose Application Load Balancer
   - Add HTTPS listener (port 443)
   
2. **Add SSL Certificate**:
   - Use AWS Certificate Manager (ACM)
   - Request certificate for your domain
   - Add certificate to ALB HTTPS listener
   
3. **Configure Target Group**:
   - Protocol: HTTP
   - Port: 5000 (your Node.js server)
   - Health check path: `/api/v1/health`
   
4. **Security Group**:
   - Inbound: 443 (HTTPS) from 0.0.0.0/0
   - Inbound: 80 (HTTP) from 0.0.0.0/0 (redirect to HTTPS)
   - Outbound: 5000 to backend instances
   
5. **Express trust proxy** (already configured):
   ```typescript
   if (env.NODE_ENV === 'production') {
     app.set('trust proxy', 1);
   }
   ```

#### Option C: Cloudflare
1. **Add domain to Cloudflare**:
   - Sign up at cloudflare.com
   - Add your domain
   - Update nameservers at domain registrar
   
2. **SSL Settings**:
   - SSL/TLS → Overview → Set to "Full (strict)"
   - Edge Certificates → Always Use HTTPS: ON
   
3. **DNS Configuration**:
   - Add A record: `yourdomain.com` → Your server IP (proxied ☁️)
   - Add CNAME: `www` → `yourdomain.com` (proxied ☁️)
   
4. **Firewall Rules** (optional):
   - Create rule to allow only Cloudflare IPs
   - Block direct IP access to your server

#### Option D: Hostinger with cPanel
1. **AutoSSL**:
   - Navigate to cPanel → Security → SSL/TLS Status
   - Enable AutoSSL for your domain
   
2. **Node.js App Setup**:
   - Setup Node.js app in cPanel
   - Set application root to `apps/server`
   - Set application startup file to `dist/apps/server/src/index.js`
   - Add environment variables in cPanel interface
   
3. **Reverse Proxy** (automatic):
   - Hostinger automatically configures Apache/nginx
   - Your app runs on internal port (e.g., 5000)
   - Public access via https://yourdomain.com

### 3. Database Security (Supabase)

- [ ] **Production Supabase Project**: Use separate project from development
- [ ] **RLS Enabled**: Verify all tables have RLS enabled (see Phase 7 audit)
- [ ] **Rotate Service Role Key**: If it was ever exposed in Phase 2
- [ ] **Database Backups**: Enable automatic backups in Supabase dashboard
- [ ] **API Settings**:
  - [ ] Disable anonymous sign-ups if not needed
  - [ ] Configure email templates (confirmation, password reset)
  - [ ] Set up custom SMTP for Supabase Auth emails (optional)

### 4. CORS Validation

Test CORS with production domain:
```bash
# Should succeed (your production domain)
curl -H "Origin: https://yourdomain.com" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS \
     https://api.yourdomain.com/api/v1/auth/login

# Should fail (unauthorized origin)
curl -H "Origin: https://malicious-site.com" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS \
     https://api.yourdomain.com/api/v1/auth/login
```

Expected response headers:
- `Access-Control-Allow-Origin: https://yourdomain.com`
- `Access-Control-Allow-Credentials: true`

### 5. Security Headers Validation

Test with [Security Headers](https://securityheaders.com/) or manually:
```bash
curl -I https://api.yourdomain.com/api/v1/health
```

Required headers in production:
- ✅ `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- ✅ `X-Content-Type-Options: nosniff`
- ✅ `X-Frame-Options: DENY`
- ✅ `X-DNS-Prefetch-Control: off`
- ✅ `Content-Security-Policy: ...` (see Helmet config)
- ❌ `X-Powered-By` (should be absent)

### 6. Rate Limiting

Test rate limiting:
```bash
# Send 101 requests rapidly (should trigger rate limit)
for i in {1..101}; do
  curl https://api.yourdomain.com/api/v1/health
done
```

Expected:
- First 100 requests: `200 OK`
- 101st request: `429 Too Many Requests`
- Response body: `{"success":false,"error":{"message":"Too many requests...","code":"RATE_LIMIT_EXCEEDED"}}`

### 7. Error Handling

Test error responses don't expose stack traces:
```bash
# Should return generic error without stack trace
curl -X POST https://api.yourdomain.com/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"invalid":"data"}'
```

Expected response:
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": { ... }
  }
}
```

❌ Should NOT contain: `"stack": "Error: ..."`

### 8. Secrets Management

- [ ] **Never commit secrets**: Verify `.gitignore` includes `.env`
- [ ] **Rotate exposed secrets**: Immediately rotate any secret that was committed
- [ ] **Use secret manager** (optional): AWS Secrets Manager, Vault, or Doppler
- [ ] **Environment isolation**: Production secrets never used in development

### 9. Monitoring & Logging

- [ ] **Log aggregation**: Set up CloudWatch, Datadog, or Sentry
- [ ] **Error tracking**: Configure Sentry or Rollbar for crash reports
- [ ] **Uptime monitoring**: Set up Pingdom, UptimeRobot, or StatusCake
- [ ] **Performance monitoring**: APM tool like New Relic or AppDynamics (optional)

### 10. Firewall & Network Security

- [ ] **Firewall rules**:
  - Allow: 443 (HTTPS) from anywhere
  - Allow: 80 (HTTP) from anywhere (redirect to HTTPS)
  - Allow: 22 (SSH) from your IP only
  - Deny: All other inbound traffic
  
- [ ] **Database firewall**: Supabase project restricted to your server IP (optional)
- [ ] **DDoS protection**: Cloudflare or AWS Shield
- [ ] **Disable unnecessary services**: Remove unused ports and services

## 🔄 POST-DEPLOYMENT VALIDATION

### 1. Health Check
```bash
curl https://api.yourdomain.com/api/v1/health
# Expected: {"status":"ok"}
```

### 2. Frontend Access
- [ ] Visit `https://yourdomain.com`
- [ ] No browser console errors
- [ ] No mixed content warnings (HTTP resources on HTTPS page)

### 3. Authentication Flow
- [ ] Register new user
- [ ] Login with credentials
- [ ] Access protected route
- [ ] Logout

### 4. Campaign Functionality
- [ ] Create email campaign
- [ ] Upload CSV
- [ ] Send test email
- [ ] Verify tracking links use HTTPS

### 5. Security Scan
Run automated security scan:
```bash
# Using OWASP ZAP (optional)
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://api.yourdomain.com
```

## 🚨 INCIDENT RESPONSE

### If a Secret is Exposed:

1. **Immediately rotate the secret**:
   - Supabase: Dashboard → Settings → API → Reset service role key
   - JWT: Generate new secret and update `SUPABASE_JWT_SECRET`
   - CRON: Generate new `CRON_SECRET`

2. **Revoke active sessions**:
   ```sql
   -- In Supabase SQL Editor
   DELETE FROM auth.sessions WHERE user_id IN (
     SELECT id FROM auth.users WHERE email = 'affected@user.com'
   );
   ```

3. **Review audit logs**:
   - Check Supabase dashboard for unauthorized access
   - Review server logs for suspicious activity

4. **Notify users** (if user data was accessed):
   - Follow GDPR/local regulations
   - Force password reset for affected users

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Production Checklist](https://supabase.com/docs/guides/platform/going-into-prod)
- [Node.js Security Checklist](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

## 🎯 Phase 8 Complete

Once all items are checked, your Bulk Email Platform is production-ready with:
- ✅ HTTPS/TLS encryption
- ✅ Strict CORS policy
- ✅ Comprehensive security headers
- ✅ Rate limiting
- ✅ No stack trace leakage
- ✅ Environment-specific configuration

**Ready for Phase 9 when you are.**
