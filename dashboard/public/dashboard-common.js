(function () {
  function getThemeToggle() {
    return document.getElementById('themeToggle');
  }

  function applyTheme(theme) {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    const toggle = getThemeToggle();
    if (toggle) {
      toggle.innerHTML = nextTheme === 'dark'
        ? '<i class="fas fa-sun"></i>'
        : '<i class="fas fa-moon"></i>';
    }
    return nextTheme;
  }

  function initThemeToggle() {
    const toggle = getThemeToggle();
    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);

    if (!toggle || toggle.dataset.bound === 'true') {
      return;
    }

    toggle.dataset.bound = 'true';
    toggle.addEventListener('click', function () {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
      localStorage.setItem('theme', nextTheme);
    });
  }

  function initMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuButton = document.getElementById('mobileMenuBtn');

    if (!sidebar || !overlay || !menuButton) {
      return;
    }

    if (menuButton.dataset.bound !== 'true') {
      menuButton.dataset.bound = 'true';
      menuButton.addEventListener('click', function () {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
      });
    }

    if (overlay.dataset.bound !== 'true') {
      overlay.dataset.bound = 'true';
      overlay.addEventListener('click', function () {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
  }

  function ensureToastContainer() {
    let container = document.getElementById('toasts');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toasts';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message, type) {
    const toastType = type || 'info';
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-xmark-circle',
      info: 'fa-circle-info',
      warning: 'fa-triangle-exclamation'
    };
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + toastType;
    toast.innerHTML = '<i class="fas ' + (icons[toastType] || icons.info) + '"></i> ' + message;
    container.appendChild(toast);
    setTimeout(function () {
      toast.remove();
    }, 3200);
  }

  function initPage() {
    initThemeToggle();
    initMobileSidebar();
  }

  window.dashboardUI = {
    applyTheme: applyTheme,
    initThemeToggle: initThemeToggle,
    initMobileSidebar: initMobileSidebar,
    initPage: initPage,
    showToast: showToast
  };
}());