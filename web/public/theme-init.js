// Pre-paint theme classes (UX.md §1), mirroring OCP's inline script in `public/index.html`: loaded as a blocking
// classic script from index.html's <head>, so the first frame already has the right theme and no light flash shows.
// A file, not inline: the CSP allows only same-origin scripts (ADR-0029). `src/shared/theme/ThemeProvider.tsx` owns
// the classes afterwards — keep the class names, storage keys/values and media queries here in sync with it.
(function applyThemeClasses() {
  var root = globalThis.document.documentElement;
  var theme = 'system';
  var contrast = 'system';
  try {
    theme = globalThis.localStorage.getItem('fleetconsole.theme') || 'system';
    contrast = globalThis.localStorage.getItem('fleetconsole.contrast') || 'system';
  } catch {
    // Storage blocked: follow the OS.
  }
  var media = function (query) {
    return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia(query).matches;
  };
  if (theme !== 'light' && theme !== 'dark') {
    theme = media('(prefers-color-scheme: dark)') ? 'dark' : 'light';
  }
  if (contrast !== 'glass' && contrast !== 'contrast') {
    contrast = media('(prefers-contrast: more)') ? 'contrast' : 'glass';
  }
  root.classList.add('pf-v6-theme-felt');
  root.classList.toggle('pf-v6-theme-dark', theme === 'dark');
  root.classList.toggle('pf-v6-theme-glass', contrast === 'glass');
  root.classList.toggle('pf-v6-theme-high-contrast', contrast === 'contrast');
})();
