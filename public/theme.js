// Only the display preference is stored; no account data is read or transmitted.
(() => {
  const allowed = ['system', 'light', 'dark'];
  let preference = 'system';
  try { const saved = localStorage.getItem('webbit-theme'); if (allowed.includes(saved)) preference = saved; } catch {}
  const apply = value => { document.documentElement.dataset.theme = value; };
  apply(preference);
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('theme-select');
    if (!select) return;
    select.value = preference;
    select.addEventListener('change', () => {
      preference = allowed.includes(select.value) ? select.value : 'system';
      apply(preference);
      try { localStorage.setItem('webbit-theme', preference); } catch {}
    });
    window.addEventListener('storage', event => {
      if (event.key !== 'webbit-theme') return;
      preference = allowed.includes(event.newValue) ? event.newValue : 'system';
      select.value = preference; apply(preference);
    });
  });
})();
