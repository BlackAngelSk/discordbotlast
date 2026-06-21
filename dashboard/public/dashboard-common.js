(function () {
  function getThemeToggle() {
    return document.getElementById('themeToggle');
  }

  function applyTheme(theme) {
    var nextTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);

    // Update active state on theme switcher buttons
    document.querySelectorAll('.theme-switch-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.theme === nextTheme);
    });

    // Also update old dropdown items if they exist
    document.querySelectorAll('.theme-dropdown-item').forEach(function (item) {
      item.classList.toggle('active', item.dataset.theme === nextTheme);
    });

    return nextTheme;
  }

  function initThemeToggle() {
    var savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);

    // Handle theme switcher button clicks
    document.querySelectorAll('.theme-switch-btn').forEach(function (btn) {
      if (btn.dataset.bound === 'true') return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', function () {
        var theme = btn.dataset.theme || 'dark';
        applyTheme(theme);
        localStorage.setItem('theme', theme);
      });
    });

    // Handle old dropdown button (fallback)
    var toggle = getThemeToggle();
    if (toggle && toggle.dataset.bound !== 'true' && toggle.classList.contains('theme-selector-btn')) {
      toggle.dataset.bound = 'true';
      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        var dropdown = document.getElementById('themeDropdown');
        if (dropdown) {
          dropdown.classList.toggle('open');
        }
      });
    }

    // Handle old dropdown items (fallback)
    document.querySelectorAll('.theme-dropdown-item').forEach(function (item) {
      if (item.dataset.bound === 'true') return;
      item.dataset.bound = 'true';
      item.addEventListener('click', function () {
        var theme = item.dataset.theme || 'dark';
        applyTheme(theme);
        localStorage.setItem('theme', theme);
        var dropdown = document.getElementById('themeDropdown');
        if (dropdown) dropdown.classList.remove('open');
      });
    });

    // Close dropdown when clicking outside (fallback)
    if (!document._themeDropdownCloseBound) {
      document._themeDropdownCloseBound = true;
      document.addEventListener('click', function () {
        var dropdown = document.getElementById('themeDropdown');
        if (dropdown) dropdown.classList.remove('open');
      });
    }
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