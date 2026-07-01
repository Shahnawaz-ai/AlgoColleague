const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getSetting, setSetting, logActivity } = require('./db');

const LINKEDIN_API_BASE = 'https://api.linkedin.com';
const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2';
const API_VERSION = '202506';

class LinkedInAPI {
  constructor() {
    this.rateLimitDelay = 1000; // ms between API calls
    this.lastCallTime = 0;
  }

  // --- Rate Limiting ---
  async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.rateLimitDelay) {
      await new Promise(r => setTimeout(r, this.rateLimitDelay - elapsed));
    }
    this.lastCallTime = Date.now();
  }

  // --- Token Management ---
  getAccessToken() {
    return getSetting('access_token');
  }

  getRefreshToken() {
    return getSetting('refresh_token');
  }

  getTokenExpiry() {
    return getSetting('token_expiry');
  }

  isTokenValid() {
    const token = this.getAccessToken();
    const expiry = this.getTokenExpiry();
    if (!token || !expiry) return false;
    return Date.now() < parseInt(expiry, 10);
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.getAccessToken()}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': API_VERSION,
      'Content-Type': 'application/json',
    };
  }

  // --- OAuth 2.0 ---
  getAuthorizationUrl() {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
    const scopes = [
      'openid',
      'profile',
      'email',
      'w_member_social',
      'r_liteprofile',
    ].join(' ');

    return `${LINKEDIN_AUTH_URL}/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=linkedin_auth`;
  }

  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post(`${LINKEDIN_AUTH_URL}/accessToken`, null, {
        params: {
          grant_type: 'authorization_code',
          code,
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET,
          redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
        },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const { access_token, expires_in, refresh_token } = response.data;

      setSetting('access_token', access_token);
      setSetting('token_expiry', String(Date.now() + expires_in * 1000));
      if (refresh_token) {
        setSetting('refresh_token', refresh_token);
      }

      // Fetch and store user profile
      await this.fetchAndStoreProfile();

      logActivity('auth_login', 'user', null, 'Successfully authenticated with LinkedIn');
      return { success: true };
    } catch (error) {
      console.error('Token exchange failed:', error.response?.data || error.message);
      return { success: false, error: error.response?.data || error.message };
    }
  }

  async refreshAccessToken() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await axios.post(`${LINKEDIN_AUTH_URL}/accessToken`, null, {
        params: {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const { access_token, expires_in, refresh_token: newRefresh } = response.data;
      setSetting('access_token', access_token);
      setSetting('token_expiry', String(Date.now() + expires_in * 1000));
      if (newRefresh) setSetting('refresh_token', newRefresh);

      logActivity('auth_refresh', 'user', null, 'Token refreshed');
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error.response?.data || error.message);
      return false;
    }
  }

  // --- Profile ---
  async fetchAndStoreProfile() {
    await this.throttle();
    try {
      const response = await axios.get(`${LINKEDIN_API_BASE}/v2/userinfo`, {
        headers: this.getHeaders(),
      });
      const profile = response.data;
      setSetting('user_id', profile.sub);
      setSetting('user_name', profile.name);
      setSetting('user_email', profile.email);
      setSetting('user_picture', profile.picture || '');
      return profile;
    } catch (error) {
      console.error('Profile fetch failed:', error.response?.data || error.message);
      return null;
    }
  }

  getProfile() {
    return {
      id: getSetting('user_id'),
      name: getSetting('user_name'),
      email: getSetting('user_email'),
      picture: getSetting('user_picture'),
    };
  }

  // --- Posts ---
  async createTextPost(content) {
    await this.throttle();
    const userId = getSetting('user_id');
    if (!userId) throw new Error('User not authenticated');

    try {
      const response = await axios.post(
        `${LINKEDIN_API_BASE}/rest/posts`,
        {
          author: `urn:li:person:${userId}`,
          commentary: content,
          visibility: 'PUBLIC',
          distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        },
        { headers: this.getHeaders() }
      );

      const postId = response.headers['x-restli-id'] || response.headers['x-linkedin-id'];
      logActivity('post_published', 'post', postId, `Text post published`);
      return { success: true, linkedinPostId: postId };
    } catch (error) {
      console.error('Post creation failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async uploadImage(filePath) {
    await this.throttle();
    const userId = getSetting('user_id');

    // Step 1: Register the image upload
    const registerResponse = await axios.post(
      `${LINKEDIN_API_BASE}/rest/images?action=initializeUpload`,
      {
        initializeUploadRequest: {
          owner: `urn:li:person:${userId}`,
        },
      },
      { headers: this.getHeaders() }
    );

    const { uploadUrl, image } = registerResponse.data.value;

    // Step 2: Upload the binary image
    const imageData = fs.readFileSync(filePath);
    await axios.put(uploadUrl, imageData, {
      headers: {
        'Authorization': `Bearer ${this.getAccessToken()}`,
        'Content-Type': 'application/octet-stream',
      },
    });

    return image; // returns the image URN
  }

  async createImagePost(content, imagePaths) {
    await this.throttle();
    const userId = getSetting('user_id');
    if (!userId) throw new Error('User not authenticated');

    // Upload all images
    const imageUrns = [];
    for (const imgPath of imagePaths) {
      const urn = await this.uploadImage(imgPath);
      imageUrns.push(urn);
    }

    const postBody = {
      author: `urn:li:person:${userId}`,
      commentary: content,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    if (imageUrns.length === 1) {
      postBody.content = {
        media: {
          id: imageUrns[0],
          title: 'Image',
        },
      };
    } else if (imageUrns.length > 1) {
      postBody.content = {
        multiImage: {
          images: imageUrns.map(urn => ({ id: urn, altText: '' })),
        },
      };
    }

    try {
      const response = await axios.post(
        `${LINKEDIN_API_BASE}/rest/posts`,
        postBody,
        { headers: this.getHeaders() }
      );

      const postId = response.headers['x-restli-id'] || response.headers['x-linkedin-id'];
      logActivity('post_published', 'post', postId, `Image post published (${imageUrns.length} images)`);
      return { success: true, linkedinPostId: postId };
    } catch (error) {
      console.error('Image post creation failed:', error.response?.data || error.message);
      throw error;
    }
  }

  // --- Comments ---
  async getPostComments(postUrn) {
    await this.throttle();
    try {
      const response = await axios.get(
        `${LINKEDIN_API_BASE}/rest/socialActions/${encodeURIComponent(postUrn)}/comments`,
        { headers: this.getHeaders() }
      );
      return response.data.elements || [];
    } catch (error) {
      console.error('Fetch comments failed:', error.response?.data || error.message);
      return [];
    }
  }

  async replyToComment(postUrn, commentUrn, replyText) {
    await this.throttle();
    const userId = getSetting('user_id');
    try {
      const response = await axios.post(
        `${LINKEDIN_API_BASE}/rest/socialActions/${encodeURIComponent(postUrn)}/comments`,
        {
          actor: `urn:li:person:${userId}`,
          message: { text: replyText },
          parentComment: commentUrn,
        },
        { headers: this.getHeaders() }
      );
      logActivity('comment_reply', 'comment', commentUrn, `Replied to comment`);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Reply failed:', error.response?.data || error.message);
      throw error;
    }
  }

  // --- Reactions ---
  async getPostReactions(postUrn) {
    await this.throttle();
    try {
      const response = await axios.get(
        `${LINKEDIN_API_BASE}/rest/socialActions/${encodeURIComponent(postUrn)}/likes`,
        { headers: this.getHeaders() }
      );
      return response.data.elements || [];
    } catch (error) {
      console.error('Fetch reactions failed:', error.response?.data || error.message);
      return [];
    }
  }

  // --- Analytics ---
  async getPostAnalytics(postUrn) {
    await this.throttle();
    try {
      // Get social action counts
      const response = await axios.get(
        `${LINKEDIN_API_BASE}/rest/socialActions/${encodeURIComponent(postUrn)}`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Fetch analytics failed:', error.response?.data || error.message);
      return null;
    }
  }
}

module.exports = new LinkedInAPI();
