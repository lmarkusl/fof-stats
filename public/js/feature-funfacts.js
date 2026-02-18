// ============================================================
// Feature: PREDICT.EXE - Fun-Facts & Prognosen Ticker
// Rotating card showing "Tipp des Tages" style fun facts and
// team insights with prev/next buttons and auto-rotation.
// Generates facts client-side from window._dashboardData or
// fetches from /api/funfacts if available.
// Container: #funfacts-ticker
// Called via initFunFacts(). Depends on: utils.js
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.ff-card { font-family: "Courier New", monospace; background: #0c0c0c; border: 2px inset #404040; color: #f0f0e8; }',
    '.ff-titlebar { display: flex; align-items: center; justify-content: space-between; padding: 4px 10px; background: #000080; color: #ffffff; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; }',
    '.ff-titlebar-btns { display: flex; gap: 4px; }',
    '.ff-titlebar-btn { width: 14px; height: 14px; background: #c0c0c0; border: 1px outset #e0e0e0; font-size: 0.6rem; text-align: center; line-height: 12px; cursor: default; }',
    '.ff-body { padding: 16px; min-height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }',
    '.ff-icon { font-size: 1.8rem; margin-bottom: 8px; }',
    '.ff-category { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; padding: 2px 10px; margin-bottom: 8px; }',
    '.ff-cat-statistik { color: #00ccff; border: 1px solid #00ccff; background: #001a2a; }',
    '.ff-cat-rekord { color: #ffff00; border: 1px solid #ffff00; background: #1a1a00; }',
    '.ff-cat-prognose { color: #cc44ff; border: 1px solid #cc44ff; background: #1a0a2a; }',
    '.ff-cat-vergleich { color: #00ff88; border: 1px solid #00ff88; background: #001a0a; }',
    '.ff-cat-funfact { color: #ff8844; border: 1px solid #ff8844; background: #1a0a00; }',
    '.ff-title { font-size: 0.9rem; font-weight: 700; color: #ffffff; margin-bottom: 6px; }',
    '.ff-text { font-size: 0.8rem; color: #aaaaaa; line-height: 1.5; max-width: 400px; }',
    '.ff-text-highlight { color: #00ff00; font-weight: 700; }',
    '.ff-controls { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px 10px; background: #1a1a1a; border-top: 1px solid #333; }',
    '.ff-nav-btn { padding: 4px 14px; font-family: "Courier New", monospace; font-size: 0.75rem; font-weight: 700; background: #1a1a1a; color: #00ff00; border: 1px solid #00ff00; cursor: pointer; }',
    '.ff-nav-btn:hover { background: #0a2a0a; }',
    '.ff-nav-btn:active { border-style: inset; }',
    '.ff-nav-btn:disabled { color: #333; border-color: #333; cursor: default; }',
    '.ff-counter { font-size: 0.7rem; color: #666; min-width: 60px; text-align: center; }',
    '.ff-auto-indicator { font-size: 0.6rem; color: #444; }',
    '.ff-auto-indicator.active { color: #00ff00; }',
    '.ff-status-bar { display: flex; align-items: center; justify-content: space-between; padding: 3px 10px; background: #c0c0c0; color: #000000; font-size: 0.6rem; font-weight: 700; }',
    '.ff-loading, .ff-empty { text-align: center; padding: 24px; font-family: "Courier New", monospace; font-size: 0.8rem; color: #808080; }',
    '@media (max-width: 768px) {',
    '  .ff-body { padding: 12px; min-height: 100px; }',
    '  .ff-title { font-size: 0.8rem; }',
    '  .ff-text { font-size: 0.75rem; }',
    '}',
    '@media (max-width: 480px) {',
    '  .ff-icon { font-size: 1.4rem; }',
    '  .ff-controls { gap: 8px; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/** Current fact index. */
var _ffCurrentIndex = 0;

/** Array of all facts. */
var _ffFacts = [];

/** Auto-rotation timer ID. */
var _ffAutoTimer = null;

/** Auto-rotation active flag. */
var _ffAutoActive = true;

/**
 * Initializes the Fun Facts ticker.
 */
function initFunFacts() {
  var container = document.getElementById('funfacts-ticker');
  if (!container) return;

  container.innerHTML = '<div class="ff-loading">C:\\FOF\\PREDICT.EXE wird geladen...</div>';

  // Try API first, then fall back to client-side generation
  fetch('/api/funfacts')
    .then(function(res) {
      if (!res.ok) throw new Error('API not available');
      return res.json();
    })
    .then(function(data) {
      _ffFacts = data.facts || [];
      if (_ffFacts.length === 0) throw new Error('No facts');
      _ffCurrentIndex = 0;
      renderFunFactsShell(container);
    })
    .catch(function() {
      // Generate facts client-side from dashboard data
      _ffFacts = generateFunFacts();
      _ffCurrentIndex = 0;
      renderFunFactsShell(container);
    });
}

/**
 * Generates fun facts from available dashboard data.
 * @returns {Array<{icon: string, title: string, text: string, category: string}>}
 */
function generateFunFacts() {
  var data = window._dashboardData;
  var facts = [];

  if (!data || !data.team || !data.members) {
    facts.push({
      icon: '?',
      title: 'Warte auf Daten...',
      text: 'Die Dashboard-Daten werden noch geladen. Bitte spaeter erneut versuchen.',
      category: 'funfact'
    });
    return facts;
  }

  var team = data.team;
  var members = data.members;
  var n = members.length;

  if (n === 0) return facts;

  var sorted = members.slice().sort(function(a, b) { return b.score - a.score; });
  var totalScore = team.score || 0;
  var totalWUs = team.wus || 0;

  // Fact: Team Score as time
  var yearsEquiv = Math.floor(totalScore / (365.25 * 24 * 3600));
  facts.push({
    icon: '#',
    title: 'Score = Sekunden?',
    text: 'Wenn jeder Punkt eine Sekunde waere, haette das Team ' + formatNumber(yearsEquiv) + ' Jahre an Rechenzeit beigesteuert!',
    category: 'funfact'
  });

  // Fact: Top contributor dominance
  if (sorted[0]) {
    var topPct = ((sorted[0].score / totalScore) * 100).toFixed(1);
    facts.push({
      icon: '@',
      title: 'Top Contributor',
      text: sorted[0].name + ' steuert ' + topPct + '% des gesamten Team-Scores bei (' + formatScore(sorted[0].score) + ' Punkte).',
      category: 'statistik'
    });
  }

  // Fact: Average score per member
  var avgScore = Math.round(totalScore / n);
  facts.push({
    icon: '~',
    title: 'Durchschnitt',
    text: 'Im Schnitt hat jedes Mitglied ' + formatScore(avgScore) + ' Punkte beigesteuert. Der Median liegt ' +
      (sorted[Math.floor(n / 2)].score < avgScore ? 'deutlich darunter' : 'aehnlich hoch') + '.',
    category: 'statistik'
  });

  // Fact: Efficiency champion
  var withEff = members.filter(function(m) { return m.wus > 0; }).map(function(m) {
    return { name: m.name, eff: Math.round(m.score / m.wus), wus: m.wus };
  }).sort(function(a, b) { return b.eff - a.eff; });
  if (withEff[0]) {
    facts.push({
      icon: '!',
      title: 'Effizienz-Champion',
      text: withEff[0].name + ' erzielt ' + formatNumber(withEff[0].eff) + ' Punkte pro Work Unit - die hoechste Effizienz im Team!',
      category: 'rekord'
    });
  }

  // Fact: Score spread
  if (sorted.length >= 2) {
    var highest = sorted[0].score;
    var lowest = sorted[sorted.length - 1].score;
    var ratio = lowest > 0 ? Math.round(highest / lowest) : 0;
    if (ratio > 1) {
      facts.push({
        icon: '%',
        title: 'Score-Spreizung',
        text: 'Der groesste Score ist ' + formatNumber(ratio) + 'x so hoch wie der kleinste. Das entspricht einem Verhaeltnis von ' +
          formatScore(highest) + ' zu ' + formatScore(lowest) + '.',
        category: 'statistik'
      });
    }
  }

  // Fact: 80/20 rule
  var target80 = totalScore * 0.8;
  var cumSum = 0;
  var count80 = 0;
  for (var i = 0; i < sorted.length; i++) {
    cumSum += sorted[i].score;
    count80++;
    if (cumSum >= target80) break;
  }
  var pct80 = ((count80 / n) * 100).toFixed(1);
  facts.push({
    icon: '$',
    title: 'Pareto-Prinzip',
    text: 'Nur ' + pct80 + '% der Mitglieder (' + count80 + ' von ' + n + ') erzeugen 80% des gesamten Team-Scores.',
    category: 'statistik'
  });

  // Fact: Protein simulation estimate
  var proteinsSimulated = Math.round(totalWUs * 0.8);
  facts.push({
    icon: '&',
    title: 'Forschungs-Impact',
    text: 'Das Team hat ca. ' + formatNumber(proteinsSimulated) + ' Proteinfaltungen simuliert. Jede einzelne hilft bei der Erforschung von Krankheiten wie Alzheimer und Krebs.',
    category: 'funfact'
  });

  // Fact: Prediction - next team milestone
  var nextMilestones = [100e9, 200e9, 300e9, 350e9, 400e9, 500e9, 1e12];
  for (var m = 0; m < nextMilestones.length; m++) {
    if (totalScore < nextMilestones[m]) {
      var remaining = nextMilestones[m] - totalScore;
      var label = formatScore(nextMilestones[m]);
      facts.push({
        icon: '>',
        title: 'Naechster Meilenstein',
        text: 'Bis ' + label + ' Score fehlen noch ' + formatScore(remaining) + ' Punkte. Gemeinsam schaffen wir das!',
        category: 'prognose'
      });
      break;
    }
  }

  // Fact: Tier distribution
  var tiers = {};
  members.forEach(function(m) {
    var t = getTier(m.score).name;
    tiers[t] = (tiers[t] || 0) + 1;
  });
  var tierStr = Object.keys(tiers).map(function(t) { return (tiers[t] || 0) + 'x ' + t; }).join(', ');
  facts.push({
    icon: '*',
    title: 'Tier-Verteilung',
    text: 'Die Tier-Aufteilung im Team: ' + tierStr + '. Steigt auf, Folder!',
    category: 'statistik'
  });

  // Fact: CPU years equivalent
  var cpuYears = Math.round(totalScore / (8760 * 1000));
  facts.push({
    icon: '=',
    title: 'CPU-Jahre',
    text: 'Der Team-Score entspricht etwa ' + formatNumber(cpuYears) + ' CPU-Jahren Rechenzeit auf einem einzelnen Prozessorkern.',
    category: 'vergleich'
  });

  // Fact: Energy consumption
  var energyKwh = Math.round(totalWUs * 0.2);
  facts.push({
    icon: '+',
    title: 'Energie-Einsatz',
    text: 'Geschaetzter Stromverbrauch: ca. ' + formatNumber(energyKwh) + ' kWh. Das sind rund ' + formatNumber(Math.round(energyKwh / 3500)) + ' durchschnittliche deutsche Haushalte fuer ein Jahr.',
    category: 'vergleich'
  });

  // Fact: Member count context
  if (n >= 50) {
    facts.push({
      icon: '^',
      title: 'Starkes Team',
      text: 'Mit ' + n + ' Mitgliedern gehoert FreilaufendeOnlineFuzzies zu den groesseren F@H Teams weltweit!',
      category: 'funfact'
    });
  }

  // Shuffle facts for variety
  for (var s = facts.length - 1; s > 0; s--) {
    var j = Math.floor(Math.random() * (s + 1));
    var tmp = facts[s];
    facts[s] = facts[j];
    facts[j] = tmp;
  }

  return facts;
}

/**
 * Renders the Fun Facts shell with navigation.
 * @param {HTMLElement} container - The #funfacts-ticker element.
 */
function renderFunFactsShell(container) {
  if (_ffFacts.length === 0) {
    container.innerHTML = '<div class="ff-empty">Keine Fun Facts verfuegbar.</div>';
    return;
  }

  var html = '';
  html += '<div class="ff-card">';

  // Title bar
  html += '<div class="ff-titlebar">';
  html += '<span>C:\\FOF\\PREDICT.EXE - Tipp des Tages</span>';
  html += '<div class="ff-titlebar-btns">';
  html += '<div class="ff-titlebar-btn">_</div>';
  html += '<div class="ff-titlebar-btn">X</div>';
  html += '</div>';
  html += '</div>';

  // Body (will be updated by showFact)
  html += '<div class="ff-body" id="ff-body"></div>';

  // Controls
  html += '<div class="ff-controls">';
  html += '<button class="ff-nav-btn" id="ff-prev">&lt;&lt; ZURUECK</button>';
  html += '<span class="ff-counter" id="ff-counter">1/' + _ffFacts.length + '</span>';
  html += '<button class="ff-nav-btn" id="ff-next">WEITER &gt;&gt;</button>';
  html += '</div>';

  // Status bar
  html += '<div class="ff-status-bar">';
  html += '<span id="ff-auto-status" class="ff-auto-indicator active">AUTO-ROTATION: AN</span>';
  html += '<span>' + _ffFacts.length + ' Fakten geladen</span>';
  html += '</div>';

  html += '</div>';

  container.innerHTML = html;

  // Show first fact
  showFact(_ffCurrentIndex);

  // Wire up navigation
  var prevBtn = document.getElementById('ff-prev');
  var nextBtn = document.getElementById('ff-next');

  if (prevBtn) {
    prevBtn.addEventListener('click', function() {
      stopAutoRotation();
      _ffCurrentIndex = (_ffCurrentIndex - 1 + _ffFacts.length) % _ffFacts.length;
      showFact(_ffCurrentIndex);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function() {
      stopAutoRotation();
      _ffCurrentIndex = (_ffCurrentIndex + 1) % _ffFacts.length;
      showFact(_ffCurrentIndex);
    });
  }

  // Start auto-rotation
  startAutoRotation();
}

/**
 * Displays a specific fact by index.
 * @param {number} idx - Fact index.
 */
function showFact(idx) {
  var body = document.getElementById('ff-body');
  var counter = document.getElementById('ff-counter');
  if (!body || idx < 0 || idx >= _ffFacts.length) return;

  var fact = _ffFacts[idx];
  var catClass = 'ff-cat-' + (fact.category || 'funfact');

  var html = '';
  html += '<div class="ff-icon">' + escapeHtml(fact.icon || '?') + '</div>';
  html += '<span class="ff-category ' + catClass + '">' + escapeHtml(fact.category || 'INFO') + '</span>';
  html += '<div class="ff-title">' + escapeHtml(fact.title || 'Fun Fact') + '</div>';
  html += '<div class="ff-text">' + escapeHtml(fact.text || '') + '</div>';

  body.innerHTML = html;

  if (counter) {
    counter.textContent = (idx + 1) + '/' + _ffFacts.length;
  }
}

/**
 * Starts the auto-rotation timer (every 8 seconds).
 */
function startAutoRotation() {
  if (_ffAutoTimer) clearInterval(_ffAutoTimer);
  _ffAutoActive = true;

  _ffAutoTimer = setInterval(function() {
    _ffCurrentIndex = (_ffCurrentIndex + 1) % _ffFacts.length;
    showFact(_ffCurrentIndex);
  }, 8000);

  var statusEl = document.getElementById('ff-auto-status');
  if (statusEl) {
    statusEl.textContent = 'AUTO-ROTATION: AN';
    statusEl.classList.add('active');
  }
}

/**
 * Stops the auto-rotation timer.
 */
function stopAutoRotation() {
  if (_ffAutoTimer) {
    clearInterval(_ffAutoTimer);
    _ffAutoTimer = null;
  }
  _ffAutoActive = false;

  var statusEl = document.getElementById('ff-auto-status');
  if (statusEl) {
    statusEl.textContent = 'AUTO-ROTATION: AUS';
    statusEl.classList.remove('active');
  }
}
