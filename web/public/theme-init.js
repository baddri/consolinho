// Pre-paint theme classes (UX.md §1), mirroring OCP's inline script in `public/index.html`: loaded as a blocking
// classic script from index.html's <head>, so the first frame already has the right theme and no light flash shows.
// A file, not inline: the CSP allows only same-origin scripts (ADR-0029). `src/shared/theme/ThemeProvider.tsx` owns
// the classes afterwards — keep the class names, storage key and media queries here in sync with it.
(function applyThemeClasses() {
  var root = globalThis.document.documentElement;
  var theme = 'system';
  try {
    theme = globalThis.localStorage.getItem('fleetconsole.theme') || 'system';
  } catch {
    // Storage blocked: follow the OS.
  }
  var media = function (query) {
    return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia(query).matches;
  };
  if (theme !== 'light' && theme !== 'dark') {
    theme = media('(prefers-color-scheme: dark)') ? 'dark' : 'light';
  }
  var moreContrast = media('(prefers-contrast: more)');
  root.classList.add('pf-v6-theme-felt');
  root.classList.toggle('pf-v6-theme-dark', theme === 'dark');
  root.classList.toggle('pf-v6-theme-glass', !moreContrast);
  root.classList.toggle('pf-v6-theme-high-contrast', moreContrast);
})();
