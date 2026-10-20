(() => {
  const sidebar = document.querySelector('#sidebar');
  const groups = [...sidebar.children];
  const stage = document.querySelector('#staging-area');
  const heading = stage.previousElementSibling;
  const filters = groups.find(node => node.querySelector('#filterCheckboxes'));
  const add = groups.find(node => node.querySelector('#newFoodName'));
  const exports = groups.find(node => node.querySelector('#unifiedUpload'));
  const section = (label, nodes) => {
    const details = document.createElement('details');
    details.className = 'workspace-settings';
    const summary = document.createElement('summary');
    summary.textContent = label;
    const content = document.createElement('div');
    content.className = 'settings-content';
    content.append(...nodes);
    details.append(summary, content);
    return details;
  };
  sidebar.append(heading, stage, section('Filters & sorting', [filters]), section('Manage items & exports', [add, exports]));
  sidebar.querySelectorAll('.workspace-settings').forEach(details => details.addEventListener('toggle', () => {
    if (details.open) sidebar.querySelectorAll('.workspace-settings').forEach(other => { if (other !== details) other.open = false; });
  }));
  const count = document.createElement('span');
  count.className = 'staging-count';
  heading.append(count);
  const refresh = () => {
    count.textContent = `${stage.children.length} shown`;
    document.querySelectorAll('.header-toggle-group button').forEach(button => button.setAttribute('aria-pressed', button.classList.contains('active')));
  };
  new MutationObserver(refresh).observe(stage, { childList: true });
  refresh();
  document.querySelectorAll('.header-toggle-group button').forEach(button => button.addEventListener('click', refresh));
  document.querySelector('#btn-view-2d').textContent = '2D plot';
  document.querySelector('#btn-view-tier').textContent = 'Tier list';
  document.querySelector('#btn-view-analysis').textContent = 'Analysis';
  document.querySelector('.utility-actions button:last-child').textContent = 'Reset visible items';
  document.querySelector('#searchInput').setAttribute('aria-label', 'Search items');
  document.addEventListener('dragover', event => {
    const target = event.target.closest('.tier-dropzone,#staging-area,#plot-area');
    document.querySelectorAll('.drop-ready').forEach(node => { if (node !== target) node.classList.remove('drop-ready'); });
    target?.classList.add('drop-ready');
  });
  ['drop', 'dragend'].forEach(type => document.addEventListener(type, () => document.querySelectorAll('.drop-ready').forEach(node => node.classList.remove('drop-ready'))));

  const dialog = document.createElement('dialog');
  dialog.className = 'move-dialog';
  dialog.setAttribute('aria-labelledby', 'move-item-title');
  dialog.innerHTML = `<div class="dialog-top"><span>Move item</span><button type="button" class="dialog-close" aria-label="Close">×</button></div><h2 id="move-item-title"></h2><div class="move-choices"></div><div class="move-special"></div><details class="plot-choice"><summary>Place on the 2D plot</summary><form><div class="plot-fields"><label>Quality / X<input name="x" type="number" min="0" max="100" required></label><label>Value / Y<input name="y" type="number" min="0" max="100" required></label></div><button type="submit">Place on plot</button></form></details>`;
  document.body.append(dialog);
  let selectedId = null;
  const move = selection => {
    const id = selectedId;
    dialog.close();
    quickMoveFood(id, selection);
    requestAnimationFrame(() => {
      const item = document.getElementById(`food-${id}`);
      item?.focus({ preventScroll: true });
      item?.classList.add('settle');
      setTimeout(() => item?.classList.remove('settle'), 300);
    });
  };
  dialog.querySelector('.dialog-close').onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  dialog.querySelector('form').onsubmit = event => {
    event.preventDefault();
    move({ target: 'plot', x: Number(dialog.querySelector('[name=x]').value), y: Number(dialog.querySelector('[name=y]').value) });
  };
  window.RankThingsUI = { moveItem(id) {
    const food = foods.find(item => item.id === id);
    if (!food) return;
    selectedId = id;
    dialog.querySelector('h2').textContent = food.name;
    dialog.querySelector('.plot-choice').open = false;
    dialog.querySelector('[name=x]').value = food.x ?? 50;
    dialog.querySelector('[name=y]').value = food.y ?? 50;
    const choices = dialog.querySelector('.move-choices');
    choices.replaceChildren(...getActiveTierLetters().map(tier => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = tier; button.setAttribute('aria-label', `Move to tier ${tier}`);
      button.style.setProperty('--tier-color', getComputedStyle(document.querySelector(`[data-tier-letter="${tier}"] .tier-label`)).backgroundColor);
      button.onclick = () => move({ target: tier });
      return button;
    }));
    dialog.querySelector('.move-special').replaceChildren(...[['staging', 'Staging'], ['unsure', 'Unsure'], ...(currentDataset === 'outdoors' ? [] : [['havent', currentDataset === 'trips' ? "Haven’t done" : "Haven’t had"]])].map(([target, label]) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = () => move({ target }); return button;
    }));
    dialog.showModal();
  } };
})();
