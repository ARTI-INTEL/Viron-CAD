/**
 * landing.js  Ultimate CAD landing page interactions
 * Uses Discord OAuth for login/signup and persists the returned user session.
 */

(function () {
  'use strict';

  /* ── Storage helpers ─────────────────────────────────────── */
  function set(key, val) { try { localStorage.setItem(key, val); } catch (_) {} }
  function get(key)      { try { return localStorage.getItem(key); } catch (_) { return null; } }

  function clearAuthQueryParams() {
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  function persistOAuthSession(params) {
    set('cad_user_id', params.get('iduser') || '');
    set('cad_username', params.get('username') || '');
    set('cad_discord_id', params.get('discord_id') || '');
    set('cad_join_date', params.get('created_at') || '');
    set('cad_token', params.get('token') || '');
  }

  function showAuthError(message) {
    const banner = document.createElement('div');
    banner.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:1.125rem',
      'transform:translateX(-50%)',
      'z-index:9999',
      'background:#3a1414',
      'border:0.0625rem solid #ff6b6b',
      'color:#ffd8d8',
      'padding:0.75rem 1rem',
      'border-radius:0.75rem',
      'font-size:0.8125rem',
      'font-family:Inter,sans-serif',
      'max-width:32.5rem',
      'text-align:center',
      'box-shadow:0 0.5rem 1.25rem rgba(0,0,0,.3)',
    ].join(';');

    banner.textContent = message;
    document.body.appendChild(banner);

    setTimeout(function () {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }, 7000);
  }

  function handleOAuthReturn() {
    const params = new URLSearchParams(window.location.search);

    if (params.get('auth_success') === '1') {
      persistOAuthSession(params);
      clearAuthQueryParams();
      window.location.href = 'dashboard.html';
      return;
    }

    const authError = params.get('auth_error');
    if (!authError) return;

    const errorMap = {
      discord_authorization_denied: 'Discord authorization was canceled.',
      missing_authorization_code: 'Discord authorization did not return a code.',
      discord_token_exchange_failed: 'Could not verify your Discord login. Please try again.',
      discord_profile_fetch_failed: 'Could not fetch your Discord profile. Please try again.',
      discord_oauth_failed: 'Discord login failed due to a server error. Please try again.',
    };

    showAuthError(errorMap[authError] || 'Discord login failed. Please try again.');
    clearAuthQueryParams();
  }

  /* ── Element references ─────────────────────────────────── */
  const nav           = document.getElementById('landing-nav');
  const btnLogin      = document.getElementById('btn-discord-login');
  const btnGetStarted = document.getElementById('btn-get-started');
  const btnLearnMore  = document.getElementById('btn-learn-more');
  const featureCards  = document.querySelectorAll('.feature-card');
  const statNumbers   = document.querySelectorAll('.stat-item__number');

  handleOAuthReturn();

  /* ── If already logged in, nav button says "Dashboard" ───── */
  if (get('cad_user_id')) {
    btnLogin.textContent = 'Dashboard';
  }

  /* ── Navbar scroll shadow ───────────────────────────────── */
  window.addEventListener('scroll', function () {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  function goToDiscordAuth() {
    window.location.href = '/auth/discord/login';
  }

  /* ── Button navigation ──────────────────────────────────── */
  btnLogin.addEventListener('click', function () {
    if (get('cad_user_id')) {
      window.location.href = 'dashboard.html';
    } else {
      goToDiscordAuth();
    }
  });

  btnGetStarted.addEventListener('click', function () {
    if (get('cad_user_id')) {
      window.location.href = 'dashboard.html';
    } else {
      goToDiscordAuth();
    }
  });

  btnLearnMore.addEventListener('click', function () {
    const features = document.getElementById('features');
    if (features) features.scrollIntoView({ behavior: 'smooth' });
  });

  /* ── Intersection Observer: feature cards ───────────────── */
  const cardObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      const card  = entry.target;
      const delay = Array.from(featureCards).indexOf(card) * 100;
      setTimeout(function () { card.classList.add('visible'); }, delay);
      cardObserver.unobserve(card);
    });
  }, { threshold: 0.12 });

  featureCards.forEach(function (card) { cardObserver.observe(card); });

  /* ── Stat counter animation ─────────────────────────────── */
  function animateCounter(el) {
    const target   = parseInt(el.getAttribute('data-target'), 10);
    const duration = 1200;
    const startTime = performance.now();

    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  const statsObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      animateCounter(entry.target);
      statsObserver.unobserve(entry.target);
    });
  }, { threshold: 0.5 });

  statNumbers.forEach(function (el) { statsObserver.observe(el); });
})();
