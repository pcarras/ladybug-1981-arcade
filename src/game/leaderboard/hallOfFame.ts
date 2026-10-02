/**
 * Global Hall of Fame service and UI orchestration for Lady Bug Arcade.
 * Uses restful-api.dev cloud storage with localStorage offline fallback.
 */

export interface LeaderboardEntry {
  readonly name: string;
  readonly score: number;
  readonly level: number;
  readonly date?: string;
}

const HOF_API_URL = 'https://api.restful-api.dev/objects/ff808181a09d98f701a0fcaa2e1a61ad';
const LOCAL_HOF_KEY = 'ladybug_arcade_global_hof_cache';

const DEFAULT_SCORES: readonly LeaderboardEntry[] = [
  { name: 'ARCADE', score: 50000, level: 6, date: '1981-10-02' },
  { name: 'LADY', score: 35000, level: 4, date: '1981-10-02' },
  { name: 'PEDRO', score: 28000, level: 3, date: '2026-10-02' },
  { name: 'CHAMP', score: 20000, level: 2, date: '2026-10-02' },
  { name: 'RETRO', score: 15000, level: 2, date: '2026-10-02' },
  { name: 'NOOB', score: 8000, level: 1, date: '2026-10-02' },
];

export async function fetchGlobalLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(HOF_API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Network error');
    const json = await res.json();
    const scores = Array.isArray(json?.data?.scores) ? (json.data.scores as LeaderboardEntry[]) : [];
    if (scores.length > 0) {
      localStorage.setItem(LOCAL_HOF_KEY, JSON.stringify(scores));
      return scores;
    }
  } catch {
    // Read local cache if offline
  }

  try {
    const cached = localStorage.getItem(LOCAL_HOF_KEY);
    if (cached) {
      return JSON.parse(cached) as LeaderboardEntry[];
    }
  } catch {}

  return [...DEFAULT_SCORES];
}

export async function submitGlobalScore(name: string, score: number, level: number): Promise<LeaderboardEntry[]> {
  const cleanName = (name.trim().toUpperCase() || 'PLAYER').slice(0, 10);
  const newEntry: LeaderboardEntry = {
    name: cleanName,
    score: Math.max(0, Math.floor(score)),
    level: Math.max(1, Math.floor(level)),
    date: new Date().toISOString().split('T')[0],
  };

  const current = await fetchGlobalLeaderboard();
  current.push(newEntry);
  current.sort((a, b) => b.score - a.score);
  const trimmed = current.slice(0, 20);

  // Save to local cache immediately
  try {
    localStorage.setItem(LOCAL_HOF_KEY, JSON.stringify(trimmed));
  } catch {}

  // Push to cloud storage
  try {
    await fetch(HOF_API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'LadyBugHallOfFame',
        data: { scores: trimmed },
      }),
    });
  } catch (err) {
    console.warn('[LadyBug HOF] Could not sync with remote cloud:', err);
  }

  return trimmed;
}

export function setupHallOfFameUi(): void {
  const modal = document.getElementById('hall-of-fame-modal');
  const submitSection = document.getElementById('hof-submit-section');
  const finalScoreEl = document.getElementById('hof-final-score');
  const finalLevelEl = document.getElementById('hof-final-level');
  const nameInput = document.getElementById('player-name-input') as HTMLInputElement | null;
  const btnSubmit = document.getElementById('btn-submit-score');
  const btnClose = document.getElementById('btn-close-hof');
  const btnRanking = document.getElementById('btn-ranking');
  const loadingEl = document.getElementById('hof-loading');
  const tableEl = document.getElementById('hof-table');
  const tbodyEl = document.getElementById('hof-tbody');

  let pendingScore = 0;
  let pendingLevel = 1;

  async function renderTable(entries: LeaderboardEntry[]) {
    if (!tbodyEl || !tableEl || !loadingEl) return;
    loadingEl.classList.add('hidden');
    tableEl.classList.remove('hidden');
    tbodyEl.innerHTML = '';

    entries.slice(0, 10).forEach((entry, idx) => {
      const tr = document.createElement('tr');
      if (idx === 0) tr.classList.add('rank-gold');
      else if (idx === 1) tr.classList.add('rank-silver');
      else if (idx === 2) tr.classList.add('rank-bronze');

      tr.innerHTML = `
        <td class="col-rank">${idx + 1}</td>
        <td class="col-name">${escapeHtml(entry.name)}</td>
        <td class="col-score">${entry.score.toLocaleString()}</td>
        <td class="col-lvl">${entry.level}</td>
      `;
      tbodyEl.appendChild(tr);
    });
  }

  async function openModal(score?: number, level?: number) {
    if (!modal) return;
    modal.classList.remove('hidden');

    if (score && score > 0) {
      pendingScore = score;
      pendingLevel = level ?? 1;
      submitSection?.classList.remove('hidden');
      if (finalScoreEl) finalScoreEl.textContent = score.toLocaleString();
      if (finalLevelEl) finalLevelEl.textContent = `NÍVEL ${pendingLevel}`;
      if (nameInput) {
        nameInput.value = localStorage.getItem('ladybug_saved_player_name') || '';
        nameInput.focus();
      }
    } else {
      submitSection?.classList.add('hidden');
    }

    if (loadingEl && tableEl) {
      loadingEl.classList.remove('hidden');
      tableEl.classList.add('hidden');
    }

    const scores = await fetchGlobalLeaderboard();
    await renderTable(scores);
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add('hidden');
  }

  btnSubmit?.addEventListener('click', async () => {
    const name = nameInput?.value || 'PLAYER';
    localStorage.setItem('ladybug_saved_player_name', name);
    submitSection?.classList.add('hidden');
    if (loadingEl && tableEl) {
      loadingEl.classList.remove('hidden');
      tableEl.classList.add('hidden');
    }
    const updated = await submitGlobalScore(name, pendingScore, pendingLevel);
    await renderTable(updated);
  });

  nameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnSubmit?.click();
    }
  });

  btnClose?.addEventListener('click', () => {
    closeModal();
    // Start fresh game by simulating enter / space
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }));
  });

  btnRanking?.addEventListener('click', () => {
    void openModal();
  });

  window.addEventListener('ladybug-game-over', (event) => {
    const custom = event as CustomEvent<{ score: number; level: number }>;
    const score = custom.detail?.score ?? 0;
    const level = custom.detail?.level ?? 1;
    void openModal(score, level);
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
