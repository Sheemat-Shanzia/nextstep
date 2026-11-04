/**
 * theme.js  -  light / dark mode (bonus feature 15)
 * -----------------------------------------------------------------------
 * This file is loaded BLOCKING in <head> so the stored preference is applied
 * before the first paint (no white flash when a dark-mode user reloads).
 * Kept as a separate file because the strict Content-Security-Policy does not
 * allow inline scripts.
 */
(function () {
  var KEY = 'isms-theme';
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }

  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = stored || (prefersDark ? 'dark' : 'light');

  document.documentElement.setAttribute('data-bs-theme', theme);
})();