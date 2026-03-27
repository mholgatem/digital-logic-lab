// Cookie Utilities
function setCookie(name, value, days) {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

// Theme Management
const THEME_COOKIE = 'dll_theme';

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark');
    document.body.classList.remove('light');
    document.getElementById('darkModeToggle').checked = true;
  } else {
    document.body.classList.add('light');
    document.body.classList.remove('dark');
    document.getElementById('darkModeToggle').checked = false;
  }
}

function initTheme() {
  const savedTheme = getCookie(THEME_COOKIE) || 'dark';
  if (!getCookie(THEME_COOKIE)) setCookie(THEME_COOKIE, 'dark', 365);
  applyTheme(savedTheme);
}

// UI Initializations
document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  const settingsBtn = document.getElementById('settingsBtn');
  const settingsDialog = document.getElementById('settingsDialog');
  const closeSettings = document.getElementById('closeSettings');
  const darkModeToggle = document.getElementById('darkModeToggle');

  settingsBtn.addEventListener('click', () => {
    settingsDialog.classList.remove('hidden');
  });

  closeSettings.addEventListener('click', () => {
    settingsDialog.classList.add('hidden');
  });

  darkModeToggle.addEventListener('change', (e) => {
    const theme = e.target.checked ? 'dark' : 'light';
    applyTheme(theme);
    setCookie(THEME_COOKIE, theme, 365);
  });

  // Close dialog on backdrop click
  settingsDialog.addEventListener('click', (e) => {
    if (e.target === settingsDialog) {
      settingsDialog.classList.add('hidden');
    }
  });
});
