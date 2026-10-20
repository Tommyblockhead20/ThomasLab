(() => {
  const app = document.getElementById('app');
  const left = document.querySelector('.left'), right = document.querySelector('.right');
  left.id = 'rulesPanel'; right.id = 'resultsPanel';
  const header = document.createElement('header'); header.className = 'workspace-header';
  const actions = document.createElement('div'); actions.className = 'workspace-actions';
  header.append(left.querySelector('.home-link'), left.querySelector('h1'), actions);
  document.body.prepend(header);
  const media = matchMedia('(max-width: 700px)');
  let mobilePanel = null;
  document.body.classList.toggle('results-hidden', innerWidth <= 1100);
  const panels = { rules: left, results: right };
  const buttons = {};
  const sync = () => {
    for (const [name, panel] of Object.entries(panels)) {
      const visible = media.matches ? mobilePanel === name : !document.body.classList.contains(`${name}-hidden`);
      panel.inert = !visible;
      buttons[name]?.setAttribute('aria-expanded', visible);
      document.body.classList.toggle(`panel-${name}`, media.matches && visible);
    }
  };
  for (const [name, panel] of Object.entries(panels)) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = name === 'rules' ? 'Rules' : 'Results';
    button.setAttribute('aria-controls', panel.id); buttons[name] = button; actions.append(button);
    button.onclick = () => {
      if (media.matches) mobilePanel = mobilePanel === name ? null : name;
      else document.body.classList.toggle(`${name}-hidden`);
      sync();
      if (media.matches && mobilePanel === name) panel.querySelector('.panel-close').focus();
    };
    const close = document.createElement('button'); close.type = 'button'; close.className = 'panel-close'; close.textContent = 'Done ×';
    close.onclick = () => { mobilePanel = null; sync(); button.focus(); };
    panel.prepend(close);
  }
  const scrim = document.createElement('button'); scrim.className = 'panel-scrim'; scrim.type = 'button'; scrim.tabIndex = -1; scrim.setAttribute('aria-label', 'Close panel');
  scrim.onclick = () => { const previous = mobilePanel; mobilePanel = null; sync(); buttons[previous]?.focus(); }; app.append(scrim);
  document.addEventListener('keydown', event => {
    if (!media.matches || !mobilePanel) return;
    if (event.key === 'Escape') { event.preventDefault(); scrim.click(); }
    if (event.key === 'Tab') {
      const focusable = [...panels[mobilePanel].querySelectorAll('button:not(:disabled),input:not(:disabled),select,summary,a[href]')].filter(node => node.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  media.addEventListener('change', () => { mobilePanel = null; sync(); }); sync();
  const weightsHeading = [...left.querySelectorAll('h2')].find(node => node.textContent === 'Optimization weights');
  const details = document.createElement('details'); details.className = 'weight-details';
  const summary = document.createElement('summary'); summary.textContent = 'Optimization weights'; details.append(summary);
  weightsHeading.before(details);
  let next = weightsHeading.nextElementSibling;
  while (next?.classList.contains('control')) { const after = next.nextElementSibling; details.append(next); next = after; }
  weightsHeading.remove();
  const updateRange = input => input.style.setProperty('--range-progress', `${(Number(input.value) - Number(input.min || 0)) / (Number(input.max || 100) - Number(input.min || 0)) * 100}%`);
  left.querySelectorAll('input[type=range]').forEach(input => {
    input.closest('.control')?.querySelector('label')?.setAttribute('for', input.id);
    updateRange(input); input.addEventListener('input', () => updateRange(input));
  });
  document.getElementById('reset').addEventListener('click', () => left.querySelectorAll('input[type=range]').forEach(updateRange));
  document.getElementById('k').setAttribute('aria-label', 'Number of states');
})();
