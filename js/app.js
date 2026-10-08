import { state, subscribe, refresh, load, applyRecurring } from './store.js';
import { $, $$, monthFmt, monthKey, toast, wireDialog } from './ui.js';
import { openTxDialog, openScan, setMakeRecurringHandler } from './txform.js';
import { renderHome } from './view-home.js';
import { renderStats } from './view-stats.js';
import { renderPlan, openRecurringDialog } from './view-plan.js';
import { applyTheme } from './settings.js';

const views = { home: renderHome, stats: renderStats, plan: renderPlan };

function render() {
  $('#monthLabel').textContent = monthFmt.format(state.month);
  $('#nextMonth').disabled = monthKey(state.month) >= monthKey(new Date());
  for (const [name] of Object.entries(views)) $(`#view-${name}`).hidden = name !== state.tab;
  for (const btn of $$('.tabbar button')) btn.classList.toggle('active', btn.dataset.tab === state.tab);
  views[state.tab]();
}

subscribe(render);

function shiftMonth(delta) {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + delta, 1);
  refresh();
}

$('#prevMonth').addEventListener('click', () => shiftMonth(-1));
$('#nextMonth').addEventListener('click', () => shiftMonth(1));
$('#monthLabel').addEventListener('click', () => {
  const now = new Date();
  state.month = new Date(now.getFullYear(), now.getMonth(), 1);
  refresh();
});

for (const btn of $$('.tabbar button')) {
  btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab;
    refresh();
    window.scrollTo({ top: 0 });
  });
}

// Swipe left/right on the content to change the month
let touchStart = null;
document.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  touchStart = e.target.closest('dialog, .chart-box, input, .scroll') ? null : { x: t.clientX, y: t.clientY };
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) {
    if (dx < 0 && $('#nextMonth').disabled) return;
    shiftMonth(dx < 0 ? 1 : -1);
  }
}, { passive: true });

$('#scanBtn').addEventListener('click', openScan);
$('#addBtn').addEventListener('click', () => openTxDialog());
wireDialog($('#amountDialog'));

setMakeRecurringHandler((tx) => {
  const [y, m, d] = tx.date.split('-').map(Number);
  const next = new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()));
  const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  openRecurringDialog({ type: tx.type, name: tx.note, amount: tx.amount, category: tx.category, interval: 'monthly', startDate: iso });
});

// Charts depend on the width
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => state.tab === 'stats' && render(), 200);
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  applyTheme();
  render();
});

// When the app comes back to the foreground on a new day, book due recurring entries
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  const created = await applyRecurring();
  if (created.length) {
    refresh();
    toast(`🔁 ${created.length} Fixkosten-Buchung${created.length > 1 ? 'en' : ''} angelegt`);
  }
});

async function init() {
  applyTheme();
  try {
    const created = await load();
    if (created.length) toast(`🔁 ${created.length} Fixkosten-Buchung${created.length > 1 ? 'en' : ''} automatisch angelegt`);
  } catch (err) {
    toast(`Daten konnten nicht geladen werden: ${err.message}`);
  }
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
