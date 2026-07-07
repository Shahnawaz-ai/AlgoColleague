const axios = require('axios');
const { getSetting, setSetting, logActivity } = require('./db');

class LinkedInAPI {
  constructor() {
    this.rateLimitDelay = 1500;
    this.lastCallTime = 0;
  }

  async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.rateLimitDelay) {
      await new Promise(r => setTimeout(r, this.rateLimitDelay - elapsed));
    }
    this.lastCallTime = Date.now();
  }

  getAuthorizationUrl(redirectUri) {
    const clientId = getSetting('linkedin_client_id');
    const encRedirectUri = encodeURIComponent(redirectUri);
    const scopes = encodeURIComponent('openid profile email w_member_social');
    const state = Math.random().toString(36).substring(7);
    return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encRedirectUri}&state=${state}&scope=${scopes}`;
  }

  async exchangeCodeForToken(code, redirectUri) {
    const clientId = getSetting('linkedin_client_id');
    const clientSecret = getSetting('linkedin_client_secret');

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('redirect_uri', redirectUri);

    try {
      const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const token = response.data.access_token;
      const expiresIn = response.data.expires_in; // Usually 60 days
      const expiry = Date.now() + (expiresIn * 1000);

      setSetting('linkedin_token', token);
      setSetting('linkedin_token_expiry', expiry.toString());
      
      logActivity('auth_login', 'user', null, 'Successfully authenticated via LinkedIn OAuth');
      return true;
    } catch (error) {
      console.error('Token exchange failed:', error.response?.data || error.message);
      return false;
    }
  }

  isTokenValid() {
    const token = getSetting('linkedin_token');
    const expiry = parseInt(getSetting('linkedin_token_expiry') || '0');
    return !!token && expiry > Date.now();
  }

  getProfile() {
    return {
      id: getSetting('user_id'),
      name: getSetting('user_name'),
      email: getSetting('user_email'),
      picture: getSetting('user_picture'),
    };
  }

  async fetchAndStoreProfile() {
    await this.throttle();
    const token = getSetting('linkedin_token');
    if (!token) return null;

    try {
      const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const profile = response.data;
      setSetting('user_id', profile.sub);
      setSetting('user_name', profile.name);
      setSetting('user_email', profile.email);
      setSetting('user_picture', profile.picture || '');

      return this.getProfile();
    } catch (error) {
      console.error('Profile fetch failed:', error.response?.data || error.message);
      return null;
    }
  }

  async createTextPost(content) {
    await this.throttle();
    const token = getSetting('linkedin_token');
    const userId = getSetting('user_id');
    if (!token || !userId) throw new Error('Not authenticated');

    try {
      const payload = {
        author: `urn:li:person:${userId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: content },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };

      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json'
          }
        }
      );

      const postId = response.headers['x-restli-id'] || 'oauth_post_' + Date.now();
      logActivity('post_published', 'post', postId, `Text post published via OAuth`);
      return { success: true, linkedinPostId: postId };
    } catch (error) {
      console.error('Post creation failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async createImagePost(content, imagePaths) {
    throw new Error('Image posting is simplified and uses text fallback in this version.');
  }

  async getPostComments(postUrn) { return []; }
  async replyToComment(postUrn, commentUrn, replyText) { return { success: false }; }
  async getPostReactions(postUrn) { return []; }
  async getPostAnalytics(postUrn) { return null; }
}

module.exports = new LinkedInAPI();
