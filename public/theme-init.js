// Runs before first paint to apply the saved theme and avoid a flash of the wrong one.
(function () {
  var theme = 'system';
  var reduce = false;
  try {
    var s = JSON.parse(localStorage.getItem('pandaro.settings.v1') || 'null');
    if (s && (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system')) theme = s.theme;
    reduce = !!(s && s.reduceMotion);
  } catch {
    // Storage unavailable: use the system theme.
  }
  if (theme === 'system') {
    theme =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  }
  var root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-reduce-motion', reduce ? 'true' : 'false');
  root.style.colorScheme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#161816' : '#F7F3EA');
})();
