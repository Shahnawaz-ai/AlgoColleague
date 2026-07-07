const express = require('express');
const router = express.Router();
const linkedInAPI = require('../linkedin-api');
const { getSetting, setSetting, logActivity } = require('../db');

// Check if credentials exist
router.get('/credentials', async (req, res) => {
  const clientId = await getSetting('linkedin_client_id');
  const clientSecret = await getSetting('linkedin_client_secret');
  res.json({
    configured: !!(clientId && clientSecret)
  });
});

// Save Developer App credentials
router.post('/credentials', async (req, res) => {
  const { clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'Client ID and Secret are required' });
  }
  await setSetting('linkedin_client_id', clientId.trim());
  await setSetting('linkedin_client_secret', clientSecret.trim());
  await logActivity('config_updated', 'system', null, 'LinkedIn API credentials updated');
  res.json({ success: true });
});

// Get the OAuth login URL
router.get('/url', async (req, res) => {
  try {
    const redirectUri = req.query.redirectUri;
    if (!redirectUri) return res.status(400).json({ error: 'redirectUri is required' });
    const url = await linkedInAPI.getAuthorizationUrl(redirectUri);
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Callback when user returns from LinkedIn
router.post('/callback', async (req, res) => {
  const { code, redirectUri } = req.body;
  if (!code) return res.status(400).json({ error: 'No authorization code provided' });
  if (!redirectUri) return res.status(400).json({ error: 'No redirectUri provided' });

  const success = await linkedInAPI.exchangeCodeForToken(code, redirectUri);
  if (success) {
    await linkedInAPI.fetchAndStoreProfile();
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to authenticate with LinkedIn' });
  }
});

// Check authentication status
router.get('/status', async (req, res) => {
  const isAuthenticated = await linkedInAPI.isTokenValid();
  const profile = isAuthenticated ? await linkedInAPI.getProfile() : null;
  const expiry = await getSetting('linkedin_token_expiry');
  res.json({
    authenticated: isAuthenticated,
    profile,
    tokenExpiry: expiry || '0',
  });
});

// Disconnect
router.post('/logout', async (req, res) => {
  await setSetting('linkedin_token', '');
  await setSetting('linkedin_token_expiry', '0');
  await setSetting('user_id', '');
  await setSetting('user_name', '');
  await setSetting('user_picture', '');
  await logActivity('auth_logout', 'user', null, 'User disconnected LinkedIn account');
  res.json({ success: true });
});

module.exports = router;
