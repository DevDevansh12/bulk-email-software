import 'dotenv/config';
import jwt from 'jsonwebtoken';

// Load secrets from environment variables (never hardcode)
const supabaseUrl = process.env['SUPABASE_URL'];
const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
const jwtSecret = process.env['SUPABASE_JWT_SECRET'];

if (!supabaseUrl || !supabaseKey || !jwtSecret) {
  console.error('Missing required environment variables. Ensure .env file is configured.');
  process.exit(1);
}

// TypeScript assertion - we know these are defined after the check above
const supabaseRestUrl = `${supabaseUrl}/rest/v1`;
const validKey = supabaseKey as string;
const validSecret = jwtSecret as string;

async function main() {
  // 1. Get user_id from latest campaign
  const campaignRes = await fetch(`${supabaseRestUrl}/campaigns?select=user_id&limit=1`, {
    headers: {
      'apikey': validKey,
      'Authorization': `Bearer ${validKey}`
    }
  });
  const campaigns = await campaignRes.json() as any[];
  if (campaigns.length === 0) {
    console.error('No campaigns found to get user_id');
    return;
  }
  const userId = campaigns[0].user_id;
  console.log('Using userId:', userId);

  // 2. Generate signed JWT
  const payload = {
    sub: userId,
    email: 'test@example.com',
    role: 'authenticated',
    app_metadata: { role: 'admin' },
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000)
  };
  const token = jwt.sign(payload, validSecret, { algorithm: 'HS256' });
  console.log('Generated Token:', token);

  // 3. Construct FormData
  const formData = new FormData();
  formData.append('subject', 'Test Immediate Campaign from Script');
  formData.append('fromName', 'Script Tester');
  formData.append('body', 'Hello {{name}}! This is a test email.');
  
  // Create a dummy CSV file blob
  const csvContent = 'email,name\nrecipient1@example.com,Recipient One\nrecipient2@example.com,Recipient Two\n';
  const csvBlob = new Blob([csvContent], { type: 'text/csv' });
  formData.append('csv', csvBlob, 'recipients.csv');

  // Add dummy attachment
  const attachmentContent = 'Hello, this is a test attachment content!';
  const attachmentBlob = new Blob([attachmentContent], { type: 'text/plain' });
  formData.append('attachments', attachmentBlob, 'test_attachment.txt');

  // 4. Send request to localhost:5000/api/v1/campaigns/send
  console.log('Sending request to local backend...');
  const sendRes = await fetch('http://localhost:5000/api/v1/campaigns/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  console.log('Response Status:', sendRes.status);
  console.log('Response Headers:', Object.fromEntries(sendRes.headers.entries()));

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    console.error('Failed to send:', errText);
    return;
  }

  // 5. Read response stream
  const body = sendRes.body;
  if (!body) {
    console.error('No response body');
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log('Stream finished.');
      break;
    }
    console.log('Chunk received:', decoder.decode(value));
  }
}

main().catch(err => console.error('Error:', err));
