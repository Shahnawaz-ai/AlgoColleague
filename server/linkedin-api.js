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

  async getAuthorizationUrl(redirectUri) {
    const clientId = await getSetting('linkedin_client_id');
    const encRedirectUri = encodeURIComponent(redirectUri);
    const scopes = encodeURIComponent('openid profile email w_member_social');
    const state = Math.random().toString(36).substring(7);
    return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encRedirectUri}&state=${state}&scope=${scopes}`;
  }

  async exchangeCodeForToken(code, redirectUri, userId) {
    const clientId = await getSetting('linkedin_client_id');
    const clientSecret = await getSetting('linkedin_client_secret');

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

      await setUserSetting(userId, 'linkedin_token', token);
      await setUserSetting(userId, 'linkedin_token_expiry', expiry.toString());
      
      await logActivity('auth_login', 'user', userId, 'Successfully authenticated via LinkedIn OAuth');
      return true;
    } catch (error) {
      console.error('Token exchange failed:', error.response?.data || error.message);
      return false;
    }
  }

  async isTokenValid(userId) {
    const token = await getUserSetting(userId, 'linkedin_token');
    const expiryStr = await getUserSetting(userId, 'linkedin_token_expiry');
    const expiry = parseInt(expiryStr || '0');
    return !!token && expiry > Date.now();
  }

  async getProfile(userId) {
    return {
      id: await getUserSetting(userId, 'linkedin_profile_id'),
      name: await getUserSetting(userId, 'linkedin_name'),
      email: await getUserSetting(userId, 'linkedin_email'),
      picture: await getUserSetting(userId, 'linkedin_picture'),
      tokenExpiry: await getUserSetting(userId, 'linkedin_token_expiry'),
    };
  }

  async fetchAndStoreProfile(userId) {
    await this.throttle();
    const token = await getUserSetting(userId, 'linkedin_token');
    if (!token) return null;

    try {
      const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const profile = response.data;
      await setUserSetting(userId, 'linkedin_profile_id', profile.sub);
      await setUserSetting(userId, 'linkedin_name', profile.name);
      await setUserSetting(userId, 'linkedin_email', profile.email);
      await setUserSetting(userId, 'linkedin_picture', profile.picture || '');

      return await this.getProfile(userId);
    } catch (error) {
      console.error('Profile fetch failed:', error.response?.data || error.message);
      return null;
    }
  }

  async createTextPost(userId, content) {
    await this.throttle();
    const token = await getUserSetting(userId, 'linkedin_token');
    const profileId = await getUserSetting(userId, 'linkedin_profile_id');
    if (!token || !profileId) throw new Error('Not authenticated with LinkedIn');

    try {
      const payload = {
        author: `urn:li:person:${profileId}`,
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
      await logActivity('post_published', 'post', postId, `Text post published via OAuth for user ${userId}`);
      return { success: true, linkedinPostId: postId };
    } catch (error) {
      console.error('Post creation failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async createImagePost(userId, content, imagePaths) {
    throw new Error('Image posting is simplified and uses text fallback in this version.');
  }

  async getPostComments(userId, postUrn) { return []; }
  async replyToComment(userId, postUrn, commentUrn, replyText) { return { success: false }; }
  async getPostReactions(userId, postUrn) { return []; }
  async getPostAnalytics(userId, postUrn) { return null; }
}

module.exports = new LinkedInAPI();
