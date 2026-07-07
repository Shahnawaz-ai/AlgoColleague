const express = require('express');
const router = express.Router();
const linkedInAPI = require('../linkedin-api');
const { getSetting, setSetting, logActivity } = require('../db');

// Check if credentials exist
router.get('/credentials', (req, res) => {
  const clientId = getSetting('linkedin_client_id');
  const clientSecret = getSetting('linkedin_client_secret');
  res.json({
    configured: !!(clientId && clientSecret)
  });
});

// Save Developer App credentials
router.post('/credentials', (req, res) => {
  const { clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'Client ID and Secret are required' });
  }
  setSetting('linkedin_client_id', clientId.trim());
  setSetting('linkedin_client_secret', clientSecret.trim());
  logActivity('config_updated', 'system', null, 'LinkedIn API credentials updated');
  res.json({ success: true });
});

// Get the OAuth login URL
router.get('/url', (req, res) => {
  try {
    const redirectUri = req.query.redirectUri;
    if (!redirectUri) return res.status(400).json({ error: 'redirectUri is required' });
    const url = linkedInAPI.getAuthorizationUrl(redirectUri);
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
router.get('/status', (req, res) => {
  const isAuthenticated = linkedInAPI.isTokenValid();
  const profile = isAuthenticated ? linkedInAPI.getProfile() : null;
  res.json({
    authenticated: isAuthenticated,
    profile,
    tokenExpiry: getSetting('linkedin_token_expiry') || '0',
  });
});

// Disconnect
router.post('/logout', (req, res) => {
  setSetting('linkedin_token', '');
  setSetting('linkedin_token_expiry', '0');
  setSetting('user_id', '');
  setSetting('user_name', '');
  setSetting('user_picture', '');
  logActivity('auth_logout', 'user', null, 'User disconnected LinkedIn account');
  res.json({ success: true });
});

module.exports = router;
