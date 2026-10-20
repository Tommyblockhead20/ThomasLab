(() => {
  const header = document.querySelector('header');
  header.prepend(document.querySelector('.home-link'));
  document.querySelector('.sub').textContent = 'Drag to explore · scroll or use the controls to zoom';
  const map = document.querySelector('#map');
  map.tabIndex = 0;
  map.setAttribute('aria-label', 'Map of places I have been. Use plus and minus to zoom, arrow keys to pan, and Home to reset.');
  const level = document.createElement('span');
  level.id = 'zoomLevel'; level.className = 'zoom-level'; level.textContent = '1.0×';
  level.setAttribute('aria-label', 'Zoom level');
  document.querySelector('#zout').after(level);
  for (const [id, label, text] of [['zin', 'Zoom in', '+'], ['zout', 'Zoom out', '−']]) {
    const button = document.getElementById(id); button.textContent = text; button.setAttribute('aria-label', label); button.title = label;
  }
  const legend = document.querySelector('.legend');
  const details = document.createElement('details'); details.className = 'legend-shell';
  const summary = document.createElement('summary'); summary.textContent = 'Map key';
  legend.replaceWith(details); details.append(summary, legend);
  details.open = !matchMedia('(max-width: 1000px)').matches;
  const status = document.querySelector('.status');
  const info = document.createElement('details'); info.className = 'map-info';
  const infoTitle = document.createElement('summary'); infoTitle.textContent = 'Map information';
  status.replaceWith(info); info.append(infoTitle, status);
})();
