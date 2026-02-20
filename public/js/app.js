// ============================================================
// F@H Stats Dashboard - Main Application Logic
// Team: FreilaufendeOnlineFuzzies (#240890)
//
// Core module that orchestrates the dashboard: fetches team/member
// data, renders KPI cards, builds the sortable/searchable leaderboard,
// computes fun/statistical insights, and coordinates lazy-loading of
// feature tabs (Analytics, Rankings, Extras).
// Depends on: utils.js (must be loaded first)
// ============================================================

/** @type {{ team: object|null, members: Array, sortColumn: string, sortAsc: boolean, refreshInterval: number|null }} Global application state. */
const APP = {
  team: null,
  members: [],
  sortColumn: 'score',
  sortAsc: false,
  refreshInterval: null,
};

/** Prevents duplicate event listener registration on refresh. */
let listenersInitialized = false;

/** Tracks which tabs have already been initialized to enable lazy loading. */
const tabInitialized = { 'tab-overview': true, 'tab-rankings': false, 'tab-analytics': false, 'tab-extras': false };

/**
 * Lazily initializes tab content on first activation. Calls the
 * appropriate init functions for charts, heatmaps, rivals, etc.
 * @param {string} tabId - The tab panel ID (e.g. 'tab-analytics').
 */
function initTabContent(tabId) {
  if (tabInitialized[tabId]) return;
  tabInitialized[tabId] = true;

  if (tabId === 'tab-analytics') {
    if (typeof initCharts === 'function' && window._dashboardData) {
      initCharts(window._dashboardData);
    }
    if (typeof initHeatmapSelector === 'function' && window._dashboardData) {
      initHeatmapSelector(window._dashboardData.members);
    }
    if (typeof initConstellation === 'function') initConstellation();
    if (typeof initActivityFeed === 'function') initActivityFeed();
    if (typeof initGlobalContext === 'function') initGlobalContext();
    // Resize charts after they become visible
    setTimeout(function() {
      if (typeof chartInstances !== 'undefined') {
        Object.values(chartInstances).forEach(function(c) { if (c && c.resize) c.resize(); });
      }
    }, 100);
  }

  if (tabId === 'tab-rankings') {
    if (typeof initRivals === 'function') initRivals();
    if (typeof initMonthly === 'function') initMonthly();
    if (typeof initSeason === 'function') initSeason();
  }

  if (tabId === 'tab-extras') {
    if (typeof initExtrasFeatures === 'function' && window._dashboardData) {
      initExtrasFeatures(window._dashboardData.team, window._dashboardData.members);
    }
    if (typeof initAchievementBoard === 'function') initAchievementBoard();
    if (typeof initChallenges === 'function') initChallenges();
    if (typeof initWeather === 'function') initWeather();
    if (typeof initCertificate === 'function') initCertificate();
    if (typeof initExportFeatures === 'function') initExportFeatures();
    if (typeof initMilestoneChronology === 'function') initMilestoneChronology();
    if (typeof initCompare === 'function') initCompare();
  }
}

// ---- Utilities (shared via utils.js) ----

// ---- Animated Counter ----

/**
 * Animates a numeric counter from 0 to the target value with easeOutCubic easing.
 * Large numbers are automatically abbreviated (M, B). Respects prefers-reduced-motion.
 * @param {HTMLElement} el - The DOM element whose textContent will be updated.
 * @param {number} target - The final numeric value to count up to.
 * @param {number} [duration=2000] - Animation duration in milliseconds.
 * @param {string} [prefix=''] - Text to prepend (e.g. '#').
 * @param {string} [suffix=''] - Text to append.
 */
function animateCounter(el, target, duration = 2000, prefix = '', suffix = '') {
  // Skip animation if user prefers reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (target >= 1e9) el.textContent = prefix + (target / 1e9).toFixed(1) + ' B' + suffix;
    else if (target >= 1e6) el.textContent = prefix + (target / 1e6).toFixed(1) + ' M' + suffix;
    else el.textContent = prefix + formatNumber(target) + suffix;
    return;
  }
  const start = performance.now();
  const initial = 0;

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const current = Math.floor(initial + (target - initial) * eased);

    if (target >= 1e9) {
      el.textContent = prefix + (current / 1e9).toFixed(1) + ' B' + suffix;
    } else if (target >= 1e6) {
      el.textContent = prefix + (current / 1e6).toFixed(1) + ' M' + suffix;
    } else if (target >= 1e3) {
      el.textContent = prefix + formatNumber(current) + suffix;
    } else {
      el.textContent = prefix + current + suffix;
    }

    if (progress < 1) requestAnimationFrame(update);
    else {
      // Final precise value
      if (target >= 1e9) el.textContent = prefix + (target / 1e9).toFixed(1) + ' B' + suffix;
      else if (target >= 1e6) el.textContent = prefix + (target / 1e6).toFixed(1) + ' M' + suffix;
      else el.textContent = prefix + formatNumber(target) + suffix;
    }
  }
  requestAnimationFrame(update);
}

// ---- KPI Cards ----

/**
 * Populates the four main KPI cards (score, WUs, member count, rank)
 * with animated counter values.
 * @param {{ score: number, wus: number, rank: number }} team - Team summary data.
 * @param {Array} members - Team members array (used for count).
 */
function populateKPIs(team, members) {
  const scoreEl = document.getElementById('kpi-score');
  const wusEl = document.getElementById('kpi-wus');
  const membersEl = document.getElementById('kpi-members');
  const rankEl = document.getElementById('kpi-rank');

  if (scoreEl) animateCounter(scoreEl, team.score);
  if (wusEl) animateCounter(wusEl, team.wus);
  if (membersEl) animateCounter(membersEl, members.length);
  if (rankEl) animateCounter(rankEl, team.rank, 1500, '#');
}

// ---- Leaderboard ----

/**
 * Builds the leaderboard table rows from a sorted member list. Each row
 * shows rank, tier badge, linked name, score, WUs, efficiency, and
 * a contribution bar relative to the team total.
 * @param {Array<{ name: string, score: number, wus: number }>} members - Sorted member list to display.
 * @param {number} teamScore - Total team score (for contribution percentage).
 */
function buildLeaderboard(members, teamScore) {
  const tbody = document.getElementById('leaderboard-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  members.forEach((m, i) => {
    const tier = getTier(m.score);
    const efficiency = m.wus > 0 ? Math.round(m.score / m.wus) : 0;
    const contribution = ((m.score / teamScore) * 100);
    const contributionWidth = Math.max(contribution, 0.5);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="rank-cell">${i + 1}</td>
      <td><span class="tier-badge ${tier.name.toLowerCase()}">${tier.icon} ${tier.name}</span></td>
      <td class="name-cell">
        <a href="/donor/${encodeURIComponent(m.name)}">${escapeHtml(m.name)}</a>
      </td>
      <td class="num-cell">${formatScore(m.score)}</td>
      <td class="num-cell">${formatNumber(m.wus)}</td>
      <td class="num-cell">${formatScore(efficiency)}</td>
      <td>
        <div class="contribution-cell">
          <div class="contribution-bar">
            <div class="contribution-bar-fill" style="width:${Math.min(contributionWidth * 3, 100)}%"></div>
          </div>
          <span class="contribution-pct">${contribution.toFixed(1)}%</span>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const visEl = document.getElementById('visible-count');
  const totEl = document.getElementById('total-count');
  if (visEl) visEl.textContent = members.length;
  if (totEl) totEl.textContent = APP.members.length;
}

/**
 * Sorts the global member list by the given column and re-renders the
 * leaderboard. Toggles sort direction if the same column is clicked again.
 * @param {string} column - Column key ('score', 'wus', 'name', 'efficiency', 'contribution').
 */
function sortMembers(column) {
  if (APP.sortColumn === column) {
    APP.sortAsc = !APP.sortAsc;
  } else {
    APP.sortColumn = column;
    APP.sortAsc = false;
  }

  const sorted = [...getFilteredMembers()].sort((a, b) => {
    let va, vb;
    if (column === 'efficiency') {
      va = a.wus > 0 ? a.score / a.wus : 0;
      vb = b.wus > 0 ? b.score / b.wus : 0;
    } else if (column === 'contribution') {
      va = a.score;
      vb = b.score;
    } else {
      va = a[column];
      vb = b[column];
    }
    if (typeof va === 'string') return APP.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    return APP.sortAsc ? va - vb : vb - va;
  });

  buildLeaderboard(sorted, APP.team.score);
  updateSortIndicators(column);
}

/**
 * Updates CSS classes on table headers to reflect the active sort column and direction.
 * @param {string} active - The currently sorted column key.
 */
function updateSortIndicators(active) {
  document.querySelectorAll('#leaderboard-table th[data-sort]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === active) {
      th.classList.add(APP.sortAsc ? 'sort-asc' : 'sort-desc');
    }
  });
}

/** Attaches click handlers to sortable table headers in the leaderboard. */
function setupLeaderboardSort() {
  document.querySelectorAll('#leaderboard-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => sortMembers(th.dataset.sort));
    th.style.cursor = 'pointer';
  });
}

/**
 * Returns the currently filtered member list based on active-only checkbox and search query.
 * @returns {Array} Filtered members.
 */
function getFilteredMembers() {
  var members = APP.members;
  var activeOnly = document.getElementById('active-only-filter');
  if (activeOnly && activeOnly.checked) {
    members = members.filter(function(m) { return m.wus > 0; });
  }
  var input = document.getElementById('leaderboard-search');
  if (input && input.value) {
    var q = input.value.toLowerCase();
    members = members.filter(function(m) { return m.name.toLowerCase().indexOf(q) !== -1; });
  }
  return members;
}

/** Re-applies all leaderboard filters and re-renders. */
function applyLeaderboardFilters() {
  if (!APP.team) return;
  var filtered = getFilteredMembers();
  buildLeaderboard(filtered, APP.team.score);
}

/** Attaches the leaderboard search input handler for real-time name filtering. */
function setupSearch() {
  const input = document.getElementById('leaderboard-search');
  if (!input) return;
  input.addEventListener('input', function() {
    applyLeaderboardFilters();
  });
}

/** Attaches the active-only filter checkbox handler. */
function setupActiveFilter() {
  var cb = document.getElementById('active-only-filter');
  if (!cb) return;
  cb.addEventListener('change', function() {
    applyLeaderboardFilters();
  });
}

// ---- Fun Stats & Achievements ----

/**
 * Computes a set of fun/statistical insights about the team, including
 * Gini coefficient, 80/20 rule analysis, median vs mean ratio, efficiency
 * rankings, score spread, tier distribution, and more.
 * @param {{ score: number, wus: number }} team - Team summary data.
 * @param {Array<{ name: string, score: number, wus: number }>} members - All team members.
 * @returns {Array<{ icon: string, title: string, value: string, desc: string }>} Array of stat card objects.
 */
function computeFunStats(team, members) {
  const totalScore = team.score;
  const totalWUs = team.wus;
  const topMember = members[0];
  const topContrib = ((topMember.score / totalScore) * 100).toFixed(1);

  // Gini coefficient: measures inequality of score distribution (0 = equal, 1 = one person has all)
  const n = members.length;
  const scores = members.map(m => m.score).sort((a, b) => a - b);
  let giniSum = 0;
  scores.forEach((s, i) => { giniSum += (2 * (i + 1) - n - 1) * s; });
  const gini = (giniSum / (n * scores.reduce((a, b) => a + b, 0))).toFixed(3);

  // Average efficiency
  const avgEfficiency = Math.round(totalScore / totalWUs);

  // Tiers count
  const tiers = {};
  members.forEach(m => {
    const t = getTier(m.score).name;
    tiers[t] = (tiers[t] || 0) + 1;
  });

  // Median score
  const median = scores[Math.floor(n / 2)];
  const mean = totalScore / n;
  const medianMeanRatio = (median / mean).toFixed(3);

  // 80/20 rule: what % of members produce 80% of score?
  const target80 = totalScore * 0.8;
  const sortedDesc = [...members].sort((a, b) => b.score - a.score);
  let cumSum = 0;
  let count80 = 0;
  for (const m of sortedDesc) {
    cumSum += m.score;
    count80++;
    if (cumSum >= target80) break;
  }
  const pct80 = ((count80 / n) * 100).toFixed(1);

  // Highest efficiency member
  const withEff = members.filter(m => m.wus > 0).map(m => ({ ...m, eff: m.score / m.wus }));
  const bestEff = withEff.sort((a, b) => b.eff - a.eff)[0];

  // Score as time: if 1 point = 1 second
  const totalSeconds = totalScore;
  const yearsEquiv = Math.floor(totalSeconds / (365.25 * 24 * 3600));

  // Score spread: ratio between highest and lowest
  const highScore = sortedDesc[0].score;
  const lowScore = sortedDesc[sortedDesc.length - 1].score;
  const spreadRatio = lowScore > 0 ? Math.round(highScore / lowScore) : Infinity;

  return [
    {
      icon: '\u{1F451}',
      title: 'Top Contributor',
      value: `${escapeHtml(topMember.name)} (${topContrib}%)`,
      desc: `${formatScore(topMember.score)} Punkte beigesteuert`
    },
    {
      icon: '\u26A1',
      title: 'Team-Effizienz',
      value: formatNumber(avgEfficiency) + ' Pts/WU',
      desc: 'Durchschnittliche Punkte pro Work Unit'
    },
    {
      icon: '\u{1F4CA}',
      title: 'Gini-Koeffizient',
      value: gini,
      desc: gini > 0.7 ? 'Hohe Konzentration: wenige Top-Folder dominieren' : 'Relativ ausgeglichene Verteilung'
    },
    {
      icon: '\u{1F4D0}',
      title: '80/20-Regel',
      value: `${pct80}% erzeugen 80% des Scores`,
      desc: `${count80} von ${n} Mitgliedern reichen fuer 80% der Punkte`
    },
    {
      icon: '\u{1F4C9}',
      title: 'Median vs. Mittelwert',
      value: `Ratio: ${medianMeanRatio}`,
      desc: `Median: ${formatScore(median)} | Mean: ${formatScore(Math.round(mean))}`
    },
    {
      icon: '\u{1F3AF}',
      title: 'Effizientester Folder',
      value: bestEff ? escapeHtml(bestEff.name) : '---',
      desc: bestEff ? `${formatScore(Math.round(bestEff.eff))} Pts/WU bei ${formatNumber(bestEff.wus)} WUs` : ''
    },
    {
      icon: '\u{1F4CF}',
      title: 'Score-Spreizung',
      value: `${formatNumber(spreadRatio)}:1`,
      desc: `Hoechster: ${formatScore(highScore)} | Niedrigster: ${formatScore(lowScore)}`
    },
    {
      icon: '\u23F1\uFE0F',
      title: 'Score = Sekunden?',
      value: formatNumber(yearsEquiv) + ' Jahre',
      desc: `${formatScore(totalScore)} Sekunden waeren ${formatNumber(yearsEquiv)} Jahre`
    },
    {
      icon: '\u{1F3C6}',
      title: 'Tier-Verteilung',
      value: `${tiers['Diamond'] || 0} Diamond, ${tiers['Platinum'] || 0} Platinum`,
      desc: `${tiers['Gold'] || 0} Gold, ${tiers['Silver'] || 0} Silver, ${tiers['Bronze'] || 0} Bronze, ${tiers['Copper'] || 0} Copper`
    },
    {
      icon: '\u{1F52C}',
      title: 'Forschungs-Impact',
      value: formatNumber(totalWUs) + ' Simulationen',
      desc: 'Beitrag zu Alzheimer-, Krebs- und COVID-Forschung'
    },
  ];
}

/**
 * Renders the fun stats / achievements grid into the DOM.
 * @param {Array<{ icon: string, title: string, value: string, desc: string }>} stats - Stat card data from computeFunStats.
 */
function renderAchievements(stats) {
  const grid = document.getElementById('achievements-grid');
  if (!grid) return;

  grid.innerHTML = stats.map(s => `
    <div class="card achievement-card">
      <div class="achievement-icon">${escapeHtml(s.icon)}</div>
      <div class="achievement-content">
        <div class="achievement-title">${escapeHtml(s.title)}</div>
        <div class="achievement-value">${escapeHtml(s.value)}</div>
        <div class="achievement-detail">${escapeHtml(s.desc)}</div>
      </div>
    </div>
  `).join('');
}

// ---- Loading States ----

/** Shows skeleton loading placeholders on KPI cards and the leaderboard table. */
function showLoading() {
  document.querySelectorAll('.kpi-value').forEach(el => el.classList.add('skeleton'));
  const tbody = document.getElementById('leaderboard-body');
  if (tbody) {
    tbody.innerHTML = Array(10).fill('').map(() => `
      <tr>
        <td><div class="skeleton skeleton-text"></div></td>
        <td><div class="skeleton skeleton-text"></div></td>
        <td><div class="skeleton skeleton-text" style="width:120px"></div></td>
        <td><div class="skeleton skeleton-text"></div></td>
        <td><div class="skeleton skeleton-text"></div></td>
        <td><div class="skeleton skeleton-text"></div></td>
        <td><div class="skeleton skeleton-text"></div></td>
      </tr>
    `).join('');
  }
}

/** Removes all skeleton loading placeholders from the page. */
function hideLoading() {
  document.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));
}

// ---- Data Fetching ----

/**
 * Fetches team summary and member list from the API in parallel.
 * @returns {Promise<{ team: object, members: Array }>} The team and members data.
 * @throws {Error} If either API call fails.
 */
async function fetchData() {
  const [teamRes, membersRes] = await Promise.all([
    fetch('/api/team'),
    fetch('/api/members')
  ]);

  if (!teamRes.ok || !membersRes.ok) {
    throw new Error('API-Fehler beim Laden der Daten');
  }

  const team = await teamRes.json();
  const members = await membersRes.json();

  return { team, members };
}

// ---- Auto Refresh ----

/** Sets up the auto-refresh toggle that reloads dashboard data every 5 minutes when enabled. */
function setupAutoRefresh() {
  const toggle = document.getElementById('auto-refresh');
  if (!toggle) return;

  toggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      APP.refreshInterval = setInterval(() => loadDashboard(true), 5 * 60 * 1000);
    } else {
      clearInterval(APP.refreshInterval);
    }
  });
}

// ---- Smooth Scroll Navigation ----

/** Attaches smooth-scroll behavior to all in-page anchor links. */
function setupNavigation() {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// ---- Period Selector for History Charts ----

/** Attaches click handlers to period buttons (daily/weekly) that fetch and rebuild the history chart. */
function setupPeriodButtons() {
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const period = btn.dataset.period;
      try {
        const res = await fetch(`/api/history/team?period=${period}&limit=90`);
        const history = res.ok ? await res.json() : [];
        if (typeof buildHistoryChart === 'function') {
          buildHistoryChart(history);
        }
      } catch (err) {
        console.error('[APP] Period switch failed:', err.message);
      }
    });
  });
}

// ---- Tracking Summary ----

/** Fetches and displays a summary of how long data has been tracked (days/hours, snapshot count). */
async function showTrackingSummary() {
  try {
    const res = await fetch('/api/history/summary');
    if (!res.ok) return;
    const summary = await res.json();

    const el = document.getElementById('data-timestamp');
    if (el && summary.tracking_since) {
      const since = new Date(summary.tracking_since + 'Z');
      const now = new Date();
      const diffH = Math.round((now - since) / (1000 * 60 * 60));
      const diffD = Math.round(diffH / 24);
      const timeStr = diffD > 0 ? `${diffD} Tagen` : `${diffH} Stunden`;

      el.textContent = `Tracking seit ${timeStr} \u00B7 ${summary.team_snapshots} Snapshots \u00B7 Aktualisiert: ${now.toLocaleString('de-DE')}`;
    }
  } catch (err) {
    // Silent fail
  }
}

// ---- Last Updated ----

/** Updates the data timestamp display with the current date/time in German locale. */
function updateTimestamp() {
  const el = document.getElementById('data-timestamp');
  if (el) {
    const now = new Date();
    el.textContent = `Zuletzt aktualisiert: ${now.toLocaleString('de-DE')}`;
  }
}

// ---- Main Init ----

/**
 * Main dashboard loader. Fetches data, populates KPIs, builds the leaderboard,
 * computes fun stats, and initializes all optional feature modules.
 * @param {boolean} [isRefresh=false] - If true, skips the loading skeleton (silent refresh).
 */
async function loadDashboard(isRefresh = false) {
  if (!isRefresh) showLoading();

  try {
    const { team, members } = await fetchData();
    APP.team = team;
    APP.members = members;
    window._dashboardData = { team, members };

    hideLoading();
    populateKPIs(team, members);
    // Apply active-only filter by default
    var displayMembers = getFilteredMembers();
    buildLeaderboard(displayMembers, team.score);
    if (!listenersInitialized) {
      setupLeaderboardSort();
      setupSearch();
      setupActiveFilter();
      listenersInitialized = true;
    }

    // Fun stats
    const funStats = computeFunStats(team, members);
    renderAchievements(funStats);

    // New features: Milestones + Rank Prediction
    if (typeof initMilestoneFeatures === 'function') {
      initMilestoneFeatures();
    }

    // Social: Streak + Member of the Week
    if (typeof initSocialFeatures === 'function') {
      initSocialFeatures();
    }

    // Profile: enable clickable names in leaderboard
    if (typeof initProfileFeatures === 'function' && !isRefresh) {
      initProfileFeatures();
    }


    // Team Score History Chart (Overview Tab)
    if (typeof initTeamOverviewChart === 'function') {
      initTeamOverviewChart();
    }

    // PPD: Points Per Day + Production Stats
    if (typeof initPPD === 'function') {
      initPPD();
    }

    updateTimestamp();
    showTrackingSummary();

  } catch (err) {
    console.error('[APP] Dashboard load error:', err.message);
    hideLoading();

    const main = document.querySelector('main') || document.body;
    const errDiv = document.createElement('div');
    errDiv.className = 'error-banner';
    errDiv.innerHTML = `
      <span>\u26A0\uFE0F Fehler beim Laden der Daten: ${escapeHtml(err.message)}</span>
      <button onclick="location.reload()">Erneut versuchen</button>
    `;
    main.prepend(errDiv);
  }
}

// Boot

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupAutoRefresh();
  setupPeriodButtons();
  if (typeof setupTeamOverviewButtons === 'function') setupTeamOverviewButtons();
  loadDashboard();

  // Uptime counter: updates HH:MM:SS display every second
  const bootTime = Date.now();
  setInterval(() => {
    const el = document.getElementById('uptime');
    if (!el) return;
    const diff = Date.now() - bootTime;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }, 1000);

  // Cosmetic random PID for the terminal-style UI
  const pidEl = document.getElementById('process-pid');
  if (pidEl) pidEl.textContent = Math.floor(Math.random() * 65535);
});

// ============================================================
// Tab System
// ============================================================

/**
 * Initializes the tab navigation system. Supports tab bar buttons,
 * nav links with data-tab attributes, URL hash routing, and
 * keyboard shortcuts (Alt+1..4).
 */
function initTabs() {
  var tabBtns = document.querySelectorAll('.tab-btn');
  var navLinks = document.querySelectorAll('.nav-links a[data-tab]');
  var panels = document.querySelectorAll('.tab-panel');
  var allTriggers = [];
  tabBtns.forEach(function(b) { allTriggers.push(b); });
  navLinks.forEach(function(b) { allTriggers.push(b); });

  /**
   * Switches to the specified tab: deactivates all panels/triggers,
   * activates the target, scrolls to the tab bar if needed, and
   * updates the URL hash.
   * @param {string} targetId - The tab panel ID to activate.
   */
  function switchTab(targetId) {
    // Deactivate all
    allTriggers.forEach(function(b) { b.classList.remove('active'); if (b.setAttribute) b.setAttribute('aria-selected', 'false'); });
    panels.forEach(function(p) { p.classList.remove('active'); });

    // Activate target
    var targetPanel = document.getElementById(targetId);
    if (targetPanel) targetPanel.classList.add('active');

    allTriggers.forEach(function(b) {
      if (b.getAttribute('data-tab') === targetId) {
        b.classList.add('active');
        if (b.setAttribute) b.setAttribute('aria-selected', 'true');
      }
    });

    // Scroll to tab bar if user has scrolled past it
    var tabBar = document.getElementById('tab-bar');
    if (tabBar) {
      var navHeight = 40;
      var tabBarTop = tabBar.getBoundingClientRect().top + window.scrollY - navHeight;
      if (window.scrollY > tabBarTop) {
        window.scrollTo({ top: tabBarTop, behavior: 'smooth' });
      }
    }

    // Lazy init tab content
    if (typeof initTabContent === 'function') initTabContent(targetId);

    // Update URL hash
    history.replaceState(null, '', '#' + targetId);
  }

  allTriggers.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var targetId = this.getAttribute('data-tab');
      if (targetId) switchTab(targetId);
    });
  });

  // Handle initial hash (validate against known tab IDs)
  var validTabs = ['tab-overview', 'tab-rankings', 'tab-analytics', 'tab-extras'];
  var hash = window.location.hash.replace('#', '');
  if (validTabs.indexOf(hash) !== -1) {
    switchTab(hash);
  }

  // Keyboard: Alt+1/2/3/4 for tabs
  document.addEventListener('keydown', function(e) {
    if (e.altKey && e.key >= '1' && e.key <= '4') {
      e.preventDefault();
      var tabs = ['tab-overview', 'tab-rankings', 'tab-analytics', 'tab-extras'];
      var idx = parseInt(e.key) - 1;
      if (tabs[idx]) switchTab(tabs[idx]);
    }
  });
}

// Init tabs after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTabs);
} else {
  initTabs();
}
