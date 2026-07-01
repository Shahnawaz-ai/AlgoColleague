# 🚀 LinkedIn Automation Manager

A self-hosted LinkedIn automation dashboard for scheduling posts, managing connections, tracking analytics, and streamlining your LinkedIn presence.

![Built with Node.js](https://img.shields.io/badge/Node.js-18+-green)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Features

- 📅 **Scheduled Posting** — Queue posts with exact date/time, published automatically via LinkedIn API
- ✍️ **Post Composer** — Rich editor with live preview and character counter
- 📊 **Analytics Dashboard** — Track impressions, reactions, comments, and shares
- 📅 **Content Calendar** — Visual monthly view of your posting schedule
- 🤝 **Connection Manager** — One-click accept/decline for connection requests
- 💬 **Comment Management** — View and reply to comments across all posts
- 📝 **Template Library** — Pre-built templates for common LinkedIn post types
- 🤖 **Auto-Response Rules** — Set up keyword-triggered reply suggestions
- 🎨 **Premium UI** — Dark glassmorphism design with smooth animations

## 📋 Prerequisites

- **Node.js 18+** — [Download here](https://nodejs.org/)
- **LinkedIn Developer App** — [Create at linkedin.com/developers](https://www.linkedin.com/developers/)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd linkedin-manager
npm install
```

### 2. Configure LinkedIn API

1. Go to [linkedin.com/developers](https://www.linkedin.com/developers/) and create a new app
2. Under **Products**, request access to **"Share on LinkedIn"**
3. In the **Auth** tab, add the redirect URL:
   ```
   http://localhost:3000/api/auth/callback
   ```
4. Copy your **Client ID** and **Client Secret**
5. Update the `.env` file:
   ```
   LINKEDIN_CLIENT_ID=your_actual_client_id
   LINKEDIN_CLIENT_SECRET=your_actual_client_secret
   ```

### 3. Start the Server

```bash
npm start
```

The dashboard will open automatically at `http://localhost:3000`

### 4. Connect Your Account

1. Go to **Settings** in the dashboard
2. Click **"Connect LinkedIn Account"**
3. Authorize the app with LinkedIn
4. You're ready to go!

## 📁 Project Structure

```
linkedin-manager/
├── public/                  # Frontend (SPA)
│   ├── index.html           # App shell
│   ├── css/styles.css       # Design system
│   └── js/
│       ├── app.js           # Router, API client, utilities
│       └── pages/           # Page modules
│           ├── dashboard.js
│           ├── composer.js
│           ├── calendar.js
│           ├── analytics.js
│           ├── connections.js
│           ├── templates.js
│           └── settings.js
├── server/                  # Backend (Express)
│   ├── index.js             # Entry point
│   ├── db.js                # SQLite schema
│   ├── linkedin-api.js      # LinkedIn API client
│   ├── scheduler.js         # Cron job scheduler
│   └── routes/              # API routes
│       ├── auth.js
│       ├── posts.js
│       ├── templates.js
│       ├── analytics.js
│       ├── connections.js
│       └── comments.js
├── data/                    # SQLite DB & uploads (auto-created)
├── .env                     # Configuration
└── package.json
```

## 🔐 LinkedIn API Scopes

| Scope | Purpose |
|---|---|
| `openid` | User authentication |
| `profile` | Read user profile |
| `email` | Read user email |
| `w_member_social` | Create posts on behalf of user |

## ⚠️ Important Notes

- **Rate Limits**: The tool includes built-in rate limiting and exponential backoff to respect LinkedIn's API limits
- **Connection Requests**: Automated connection acceptance is against LinkedIn's ToS. This tool provides a manual-assist workflow (one-click accept/decline) instead
- **Token Expiry**: LinkedIn access tokens expire after 60 days. The tool will attempt to refresh automatically
- **Scheduled Posts**: Posts are checked every minute and published with randomized delays to appear natural

## 📜 License

MIT
