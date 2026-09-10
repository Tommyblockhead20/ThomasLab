import { FISH_SPECIES } from '../fishing/fish-data.js';
import { SONG_DOWNVOTE_REASONS } from '../fishing/song-votes.js';

const speciesNames = new Map(FISH_SPECIES.map((species) => [
  species.canonicalId ?? species.id,
  species.name
]));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const labelForSpecies = (id) => speciesNames.get(id)
  ?? String(id).split(/[_-]/).map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ');
export class SongFeedbackDashboard {
  constructor(multiplayer) {
    this.multiplayer = multiplayer;
    this.isOpen = false;
    this.results = [];
    this.sort = 'lowest';
    this.showHistory = false;
    this.root = document.createElement('section');
    this.root.className = 'song-feedback-dashboard';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'song-feedback-dashboard-title');
    this.root.innerHTML = `<header><div><small>DEVELOPER VIEW</small><h2 id="song-feedback-dashboard-title">Song Feedback</h2></div><button type="button" data-song-dashboard-close>CLOSE <kbd>Esc</kbd></button></header>
      <div class="song-dashboard-toolbar"><label>SORT <select data-song-dashboard-sort><option value="lowest">Lowest Approval</option><option value="dislikes">Most Dislikes</option><option value="votes">Most Votes</option><option value="species">Species Name</option></select></label><label><input type="checkbox" data-song-dashboard-history> SHOW HISTORICAL REVISIONS</label><button type="button" data-song-dashboard-refresh>REFRESH</button></div>
      <p class="song-dashboard-status" aria-live="polite">Open the dashboard to load durable results.</p>
      <div class="song-dashboard-table-wrap"><table><thead><tr><th>Species</th><th>Song ID</th><th>Revision</th><th>👍</th><th>👎</th><th>Total</th><th>Approval</th>${SONG_DOWNVOTE_REASONS.map(({ label }) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody></tbody></table></div>`;
    document.querySelector('#game-shell')?.appendChild(this.root);
    this.status = this.root.querySelector('.song-dashboard-status');
    this.body = this.root.querySelector('tbody');
    this.onClick = (event) => {
      if (event.target.closest('[data-song-dashboard-close]')) this.close();
      if (event.target.closest('[data-song-dashboard-refresh]')) void this.refresh();
    };
    this.onChange = (event) => {
      if (event.target.matches('[data-song-dashboard-sort]')) this.sort = event.target.value;
      if (event.target.matches('[data-song-dashboard-history]')) this.showHistory = event.target.checked;
      this.render();
    };
    this.onKeyDown = (event) => {
      if (!this.isOpen || event.code !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
    };
    this.onAggregate = (event) => {
      const aggregate = event.detail;
      const index = this.results.findIndex((entry) => entry.speciesId === aggregate.speciesId
        && Number(entry.songRevision) === Number(aggregate.songRevision));
      if (index >= 0) this.results[index] = aggregate; else this.results.push(aggregate);
      if (this.isOpen) this.render();
    };
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('change', this.onChange);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.multiplayer.addEventListener('songvoteaggregate', this.onAggregate);
  }

  async open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.root.hidden = false;
    document.body.classList.add('song-feedback-dashboard-open');
    document.exitPointerLock?.();
    await this.refresh();
  }

  close() {
    this.isOpen = false;
    this.root.hidden = true;
    document.body.classList.remove('song-feedback-dashboard-open');
  }

  toggle() { return this.isOpen ? this.close() : this.open(); }

  async refresh() {
    this.status.textContent = 'Loading durable vote totals…';
    try {
      this.results = await this.multiplayer.requestSongVoteResults();
      this.status.textContent = this.results.length
        ? `${this.results.length} species/revision result${this.results.length === 1 ? '' : 's'} loaded.`
        : 'No durable song votes have been recorded yet.';
      this.render();
    } catch {
      this.status.textContent = 'Song feedback storage is unavailable. Configure DATABASE_URL on the server.';
      this.render();
    }
  }

  visibleResults() {
    let rows = [...this.results];
    if (!this.showHistory) {
      const latest = new Map();
      for (const row of rows) {
        const previous = latest.get(row.speciesId);
        if (!previous || Number(row.songRevision) > Number(previous.songRevision)) latest.set(row.speciesId, row);
      }
      rows = [...latest.values()];
    }
    const sorters = {
      lowest: (a, b) => Number(a.approvalPercent) - Number(b.approvalPercent) || Number(b.totalVotes) - Number(a.totalVotes),
      dislikes: (a, b) => Number(b.downVotes) - Number(a.downVotes) || Number(a.approvalPercent) - Number(b.approvalPercent),
      votes: (a, b) => Number(b.totalVotes) - Number(a.totalVotes) || Number(a.approvalPercent) - Number(b.approvalPercent),
      species: (a, b) => labelForSpecies(a.speciesId).localeCompare(labelForSpecies(b.speciesId)) || Number(b.songRevision) - Number(a.songRevision)
    };
    return rows.sort(sorters[this.sort] ?? sorters.lowest);
  }

  render() {
    const rows = this.visibleResults();
    this.body.innerHTML = rows.length ? rows.map((entry) => `<tr><th>${escapeHtml(labelForSpecies(entry.speciesId))}<small>${escapeHtml(entry.speciesId)}</small></th><td><code>${escapeHtml(entry.songId)}</code></td><td>${Number(entry.songRevision) || 1}</td><td>${Number(entry.upVotes) || 0}</td><td>${Number(entry.downVotes) || 0}</td><td>${Number(entry.totalVotes) || 0}</td><td>${Math.round(Number(entry.approvalPercent) || 0)}%</td>${SONG_DOWNVOTE_REASONS.map(({ id }) => `<td>${Number(entry.downvoteReasons?.[id]) || 0}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${7 + SONG_DOWNVOTE_REASONS.length}">No results to display.</td></tr>`;
  }

  destroy() {
    this.close();
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('change', this.onChange);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.multiplayer.removeEventListener('songvoteaggregate', this.onAggregate);
    this.root.remove();
  }
}
