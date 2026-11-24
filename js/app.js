// ============================================================
// app.js — SPA Router & App Initialization
// ============================================================

const App = (() => {
  const pages = ['dashboard', 'reviewer', 'flashcards', 'quiz', 'progress', 'settings'];
  let currentPage = 'dashboard';

  function init() {
    applyTheme();
    setupRouter();
    setupMobileMenu();
    navigate(getHash() || 'dashboard');
  }

  function getHash() {
    return window.location.hash.replace('#', '').split('/')[0];
  }

  function getHashParam() {
    const parts = window.location.hash.replace('#', '').split('/');
    return parts[1] || null;
  }

  function navigate(page, param) {
    if (!pages.includes(page)) page = 'dashboard';
    currentPage = page;

    // Update hash without triggering extra event
    const hash = param ? `#${page}/${param}` : `#${page}`;
    if (window.location.hash !== hash) {
      history.pushState(null, '', hash);
    }

    // Hide all pages, show target
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add('active');

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navItem) navItem.classList.add('active');

    // Close mobile menu
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('open');

    // Call page-specific init
    switch (page) {
      case 'dashboard': Dashboard.render(); break;
      case 'reviewer': Reviewer.render(param); break;
      case 'flashcards': Flashcards.render(param); break;
      case 'quiz': Quiz.render(param); break;
      case 'progress': Progress.render(); break;
      case 'settings': Settings.render(); break;
    }
  }

  function setupRouter() {
    // Nav clicks
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.addEventListener('click', () => {
        navigate(item.dataset.page);
      });
    });

    // Handle back/forward
    window.addEventListener('popstate', () => {
      navigate(getHash() || 'dashboard', getHashParam());
    });
  }

  function setupMobileMenu() {
    const toggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (toggle) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
      });
    }
    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      });
    }
  }

  function applyTheme() {
    const settings = Storage.getSettings();
    document.documentElement.setAttribute('data-theme', settings.theme);
  }

  function toggleTheme() {
    const settings = Storage.getSettings();
    const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
    Storage.saveSettings({ theme: newTheme });
    document.documentElement.setAttribute('data-theme', newTheme);
  }

  // ---- Toast Notifications ----
  function toast(message, type = 'info') {
    const container = document.querySelector('.toast-container') || createToastContainer();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function createToastContainer() {
    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  }

  // ---- Modal Helpers ----
  function showModal(id) {
    document.getElementById(id)?.classList.add('active');
  }

  function hideModal(id) {
    document.getElementById(id)?.classList.remove('active');
  }

  return {
    init, navigate, getHashParam, toast, showModal, hideModal, applyTheme, toggleTheme, currentPage: () => currentPage,
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', App.init);
