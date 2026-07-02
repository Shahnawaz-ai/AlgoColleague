(function() {
  // Check if consent is already given
  if (localStorage.getItem('algo_cookie_consent')) return;

  // Create styles
  const style = document.createElement('style');
  style.innerHTML = `
    .cookie-banner {
      position: fixed;
      bottom: 24px;
      left: 24px;
      max-width: 400px;
      background: rgba(10, 14, 26, 0.95);
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 16px;
      padding: 24px;
      z-index: 99999;
      font-family: 'Inter', sans-serif;
      transform: translateY(150%);
      transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .cookie-banner.show {
      transform: translateY(0);
    }
    .cookie-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .cookie-header svg {
      width: 24px;
      height: 24px;
      color: #8b5cf6;
    }
    .cookie-title {
      font-size: 16px;
      font-weight: 700;
      color: #f8fafc;
      font-family: 'Space Grotesk', sans-serif;
    }
    .cookie-text {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .cookie-text a {
      color: #818cf8;
      text-decoration: underline;
    }
    .cookie-actions {
      display: flex;
      gap: 12px;
    }
    .cookie-btn {
      flex: 1;
      padding: 10px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }
    .cookie-accept {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
    }
    .cookie-accept:hover {
      box-shadow: 0 4px 12px rgba(99,102,241,.4);
    }
    .cookie-decline {
      background: rgba(255,255,255,0.06);
      color: #f8fafc;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .cookie-decline:hover {
      background: rgba(255,255,255,0.1);
    }
  `;
  document.head.appendChild(style);

  // Create banner
  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.innerHTML = `
    <div class="cookie-header">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"></path></svg>
      <div class="cookie-title">We value your privacy</div>
    </div>
    <div class="cookie-text">
      We use cookies (including Google AdSense and DoubleClick DART cookies) to enhance your browsing experience, serve personalized ads or content, and analyze our traffic. By clicking "Accept All", you consent to our use of cookies as outlined in our <a href="/privacy.html">Privacy Policy</a>.
    </div>
    <div class="cookie-actions">
      <button class="cookie-btn cookie-decline" id="cookieDecline">Decline</button>
      <button class="cookie-btn cookie-accept" id="cookieAccept">Accept All</button>
    </div>
  `;
  document.body.appendChild(banner);

  // Show banner with delay
  setTimeout(() => {
    banner.classList.add('show');
  }, 1000);

  // Event Listeners
  document.getElementById('cookieAccept').addEventListener('click', () => {
    localStorage.setItem('algo_cookie_consent', 'accepted');
    banner.classList.remove('show');
    setTimeout(() => banner.remove(), 600);
    // Initialize AdSense script or analytics here if needed
  });

  document.getElementById('cookieDecline').addEventListener('click', () => {
    localStorage.setItem('algo_cookie_consent', 'declined');
    banner.classList.remove('show');
    setTimeout(() => banner.remove(), 600);
  });
})();
