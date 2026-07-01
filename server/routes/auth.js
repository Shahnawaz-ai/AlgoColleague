const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const linkedInAPI = require('../linkedin-api');
const { getSetting, setSetting, logActivity } = require('../db');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');

// Helper: write/update .env file (preserving comments)
function writeEnv(updates) {
  try {
    let content = '';
    try { content = fs.readFileSync(ENV_PATH, 'utf8'); } catch { /* create new */ }
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^(${key}=).*$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `$1${value}`);
      } else {
        content += `\n${key}=${value}`;
      }
    }
    fs.writeFileSync(ENV_PATH, content, 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to write .env:', e.message);
    return false;
  }
}

// Check if LinkedIn credentials are configured
router.get('/configured', (req, res) => {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const configured = !!(
    clientId && clientId !== 'your_client_id_here' &&
    clientSecret && clientSecret !== 'your_client_secret_here'
  );
  res.json({ configured });
});

// Get current credentials (client ID only — never expose secret)
router.get('/credentials', (req, res) => {
  res.json({
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    configured: !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_ID !== 'your_client_id_here'),
  });
});

// Save credentials to .env and hot-reload
router.post('/credentials', (req, res) => {
  const { clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'clientId and clientSecret are required' });
  }

  const saved = writeEnv({
    LINKEDIN_CLIENT_ID: clientId.trim(),
    LINKEDIN_CLIENT_SECRET: clientSecret.trim(),
  });

  if (!saved) {
    return res.status(500).json({ error: 'Failed to save credentials to .env file. Check file permissions.' });
  }

  // Hot-reload into current process so OAuth works immediately without restart
  process.env.LINKEDIN_CLIENT_ID = clientId.trim();
  process.env.LINKEDIN_CLIENT_SECRET = clientSecret.trim();

  logActivity('credentials_saved', 'auth', null, 'LinkedIn credentials configured via UI');
  res.json({ success: true });
});

// Get authorization URL to initiate OAuth flow
router.get('/login', (req, res) => {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId || clientId === 'your_client_id_here') {
    return res.status(400).json({
      error: 'LinkedIn credentials not configured. Please complete the setup first.',
      needsSetup: true,
    });
  }
  const url = linkedInAPI.getAuthorizationUrl();
  res.json({ authUrl: url });
});

// OAuth callback handler
router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.redirect(`/connect?error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    return res.redirect('/connect?error=No%20authorization%20code%20received');
  }

  const result = await linkedInAPI.exchangeCodeForToken(code);

  if (result.success) {
    res.redirect('/connect?success=true');
  } else {
    res.redirect(`/connect?error=${encodeURIComponent(JSON.stringify(result.error))}`);
  }
});

// Check authentication status
router.get('/status', (req, res) => {
  const isAuthenticated = linkedInAPI.isTokenValid();
  const profile = isAuthenticated ? linkedInAPI.getProfile() : null;

  res.json({
    authenticated: isAuthenticated,
    profile,
    tokenExpiry: getSetting('token_expiry'),
  });
});

// Set subscription plan
router.post('/plan', (req, res) => {
  const { plan } = req.body;
  if (['starter', 'pro', 'agency'].includes(plan)) {
    setSetting('subscription_plan', plan);
    logActivity('plan_updated', 'system', null, `Subscription plan set to ${plan}`);
    return res.json({ success: true, plan });
  }
  res.status(400).json({ error: 'Invalid plan selected' });
});

// Logout / disconnect
router.post('/logout', (req, res) => {
  setSetting('access_token', '');
  setSetting('refresh_token', '');
  setSetting('token_expiry', '0');
  logActivity('auth_logout', 'user', null, 'User disconnected LinkedIn account');
  res.json({ success: true });
});

module.exports = router;
