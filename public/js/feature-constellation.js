// ============================================================
// Feature: Team Constellation (Netzwerk-Visualisierung)
// Renders an interactive canvas-based network visualization of
// team members as nodes with edges showing relationships.
// Nodes are sized by score and colored by tier/cluster.
// Fetches data from /api/constellation
// Container: #constellation-map
// Called via initConstellation(). Depends on: utils.js
// ============================================================

// Inject component-specific styles into <head>
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.cst-wrapper { position: relative; }',
    '.cst-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; padding: 8px 10px; background: var(--bg-surface, #f8f8f2); border: 1px solid var(--border-subtle, #c0c0c0); }',
    '.cst-control-label { font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #666); text-transform: uppercase; }',
    '.cst-btn { padding: 3px 10px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.7rem; font-weight: 700; background: #d4d4d4; border: 2px outset #e0e0e0; cursor: pointer; text-transform: uppercase; }',
    '.cst-btn:hover { background: #c0c0c0; }',
    '.cst-btn:active { border-style: inset; }',
    '.cst-btn.active { background: #a0a0e0; border-style: inset; color: #000080; }',
    '.cst-canvas-wrap { position: relative; border: 1px inset #c0c0c0; background: #1a1a2e; overflow: hidden; }',
    '.cst-canvas { display: block; width: 100%; cursor: grab; }',
    '.cst-canvas:active { cursor: grabbing; }',
    '.cst-tooltip { display: none; position: absolute; background: #2c2c2c; color: #f0f0e8; padding: 6px 10px; font-family: "Courier New", monospace; font-size: 0.7rem; border: 1px solid #555; pointer-events: none; z-index: 10; max-width: 250px; line-height: 1.4; }',
    '.cst-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; padding: 6px 10px; background: var(--bg-surface, #f8f8f2); border: 1px solid var(--border-subtle, #c0c0c0); }',
    '.cst-legend-item { display: flex; align-items: center; gap: 4px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.65rem; color: var(--text-muted, #666); }',
    '.cst-legend-dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); }',
    '.cst-clusters { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }',
    '.cst-cluster { padding: 8px 10px; background: #ffffff; border: 1px solid #d0d0d0; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; }',
    '.cst-cluster-name { font-weight: 700; color: var(--text-primary, #1a1a1a); }',
    '.cst-cluster-stats { font-size: 0.7rem; color: var(--text-muted, #666); margin-top: 2px; }',
    '.cst-cluster-members { font-size: 0.7rem; color: var(--text-secondary, #444); margin-top: 4px; word-break: break-word; }',
    '.cst-loading, .cst-empty { text-align: center; padding: 24px; font-family: var(--font-mono, "Courier New", monospace); font-size: 0.8rem; color: var(--text-muted, #666); }',
    '@media (max-width: 768px) {',
    '  .cst-controls { flex-direction: column; align-items: stretch; }',
    '  .cst-legend { flex-direction: column; gap: 4px; }',
    '}',
    '@media (max-width: 480px) {',
    '  .cst-cluster { font-size: 0.75rem; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

/** Tier colors for node rendering. */
var CST_TIER_COLORS = {
  legend: '#ff4444',
  elite: '#aa44ff',
  veteran: '#4488ff',
  regular: '#44cc44',
  newcomer: '#888888'
};

/** German tier labels. */
var CST_TIER_LABELS = {
  legend: 'Legende',
  elite: 'Elite',
  veteran: 'Veteran',
  regular: 'Stammgast',
  newcomer: 'Neuling'
};

/**
 * Initializes the Constellation network visualization.
 */
function initConstellation() {
  var container = document.getElementById('constellation-map');
  if (!container) return;

  container.innerHTML = '<div class="cst-loading">Lade Konstellation...</div>';

  fetch('/api/constellation')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      renderConstellation(container, data);
    })
    .catch(function(err) {
      console.error('[CONSTELLATION] Load failed:', err.message);
      container.innerHTML = '<div class="cst-empty">Fehler beim Laden der Konstellation.</div>';
    });
}

/**
 * Renders the constellation visualization with canvas and cluster info.
 * @param {HTMLElement} container - The #constellation-map element.
 * @param {object} data - API response with nodes, edges, clusters.
 */
function renderConstellation(container, data) {
  var nodes = data.nodes || [];
  var edges = data.edges || [];
  var clusters = data.clusters || [];

  if (nodes.length === 0) {
    container.innerHTML = '<div class="cst-empty">Keine Mitglieder-Daten vorhanden.</div>';
    return;
  }

  var html = '';
  html += '<div class="cst-wrapper">';

  // Controls
  html += '<div class="cst-controls">';
  html += '<span class="cst-control-label">Ansicht:</span>';
  html += '<button class="cst-btn active" data-cst-view="network">NETZWERK</button>';
  html += '<button class="cst-btn" data-cst-view="clusters">CLUSTER</button>';
  html += '</div>';

  // Canvas
  html += '<div class="cst-canvas-wrap" id="cst-canvas-wrap">';
  html += '<canvas id="cst-canvas" class="cst-canvas" width="800" height="500"></canvas>';
  html += '<div class="cst-tooltip" id="cst-tooltip"></div>';
  html += '</div>';

  // Legend
  html += '<div class="cst-legend">';
  var tierKeys = ['legend', 'elite', 'veteran', 'regular', 'newcomer'];
  for (var t = 0; t < tierKeys.length; t++) {
    html += '<div class="cst-legend-item">';
    html += '<div class="cst-legend-dot" style="background:' + CST_TIER_COLORS[tierKeys[t]] + ';"></div>';
    html += '<span>' + escapeHtml(CST_TIER_LABELS[tierKeys[t]]) + '</span>';
    html += '</div>';
  }
  html += '<div class="cst-legend-item">';
  html += '<div class="cst-legend-dot" style="background:transparent;border:1px dashed rgba(255,255,255,0.4);"></div>';
  html += '<span>Groesse = Score</span>';
  html += '</div>';
  html += '</div>';

  // Cluster list section (hidden by default)
  html += '<div id="cst-cluster-view" style="display:none;">';
  if (clusters.length > 0) {
    html += '<div class="cst-clusters">';
    for (var c = 0; c < clusters.length; c++) {
      var cl = clusters[c];
      html += '<div class="cst-cluster card">';
      html += '<div class="cst-cluster-name">' + escapeHtml(cl.name) + '</div>';
      html += '<div class="cst-cluster-stats">' + escapeHtml(String(cl.members.length)) + ' Mitglieder | Avg Score: ' + escapeHtml(formatScore(cl.avg_score || 0)) + '</div>';
      html += '<div class="cst-cluster-members">' + cl.members.map(function(m) { return escapeHtml(m); }).join(', ') + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';

  html += '</div>'; // cst-wrapper
  container.innerHTML = html;

  // View toggle handlers
  var viewBtns = container.querySelectorAll('.cst-btn[data-cst-view]');
  var canvasWrap = document.getElementById('cst-canvas-wrap');
  var clusterView = document.getElementById('cst-cluster-view');
  for (var v = 0; v < viewBtns.length; v++) {
    viewBtns[v].addEventListener('click', function() {
      for (var b = 0; b < viewBtns.length; b++) viewBtns[b].classList.remove('active');
      this.classList.add('active');
      var view = this.getAttribute('data-cst-view');
      if (view === 'network') {
        canvasWrap.style.display = '';
        clusterView.style.display = 'none';
      } else {
        canvasWrap.style.display = 'none';
        clusterView.style.display = '';
      }
    });
  }

  // Draw the network on canvas
  drawConstellationCanvas(nodes, edges);
}

/**
 * Draws the constellation network on the canvas using force-directed layout.
 * @param {Array} nodes - Node objects with id, name, score, tier, size, activity_level.
 * @param {Array} edges - Edge objects with source, target, type, weight.
 */
function drawConstellationCanvas(nodes, edges) {
  var canvas = document.getElementById('cst-canvas');
  var tooltip = document.getElementById('cst-tooltip');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var W = canvas.width;
  var H = canvas.height;

  // Position nodes using a simple circular + force-directed approach
  var nodeMap = {};
  for (var i = 0; i < nodes.length; i++) {
    var angle = (2 * Math.PI * i) / nodes.length;
    var radius = Math.min(W, H) * 0.35;
    nodeMap[nodes[i].id] = {
      x: W / 2 + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
      y: H / 2 + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
      node: nodes[i]
    };
  }

  // Simple force simulation (limited iterations)
  var iterations = 80;
  for (var iter = 0; iter < iterations; iter++) {
    var damping = 0.85;
    var repulsion = 2000;
    var attraction = 0.005;
    var centerForce = 0.01;

    // Repulsion between all nodes
    for (var i = 0; i < nodes.length; i++) {
      var ni = nodeMap[nodes[i].id];
      for (var j = i + 1; j < nodes.length; j++) {
        var nj = nodeMap[nodes[j].id];
        var dx = ni.x - nj.x;
        var dy = ni.y - nj.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var force = repulsion / (dist * dist);
        var fx = (dx / dist) * force;
        var fy = (dy / dist) * force;
        ni.vx += fx;
        ni.vy += fy;
        nj.vx -= fx;
        nj.vy -= fy;
      }
    }

    // Attraction along edges
    for (var e = 0; e < edges.length; e++) {
      var src = nodeMap[edges[e].source];
      var tgt = nodeMap[edges[e].target];
      if (!src || !tgt) continue;
      var dx = tgt.x - src.x;
      var dy = tgt.y - src.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var force = dist * attraction * (edges[e].weight || 0.5);
      src.vx += (dx / dist) * force;
      src.vy += (dy / dist) * force;
      tgt.vx -= (dx / dist) * force;
      tgt.vy -= (dy / dist) * force;
    }

    // Center gravity
    for (var i = 0; i < nodes.length; i++) {
      var n = nodeMap[nodes[i].id];
      n.vx += (W / 2 - n.x) * centerForce;
      n.vy += (H / 2 - n.y) * centerForce;
    }

    // Apply velocities
    for (var i = 0; i < nodes.length; i++) {
      var n = nodeMap[nodes[i].id];
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
      // Keep within bounds
      n.x = Math.max(30, Math.min(W - 30, n.x));
      n.y = Math.max(30, Math.min(H - 30, n.y));
    }
  }

  // Draw function
  function draw() {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    // Draw edges
    ctx.lineWidth = 1;
    for (var e = 0; e < edges.length; e++) {
      var src = nodeMap[edges[e].source];
      var tgt = nodeMap[edges[e].target];
      if (!src || !tgt) continue;
      var alpha = 0.15 + (edges[e].weight || 0.5) * 0.3;
      ctx.strokeStyle = 'rgba(100, 140, 200, ' + alpha + ')';
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();
    }

    // Draw nodes
    for (var i = 0; i < nodes.length; i++) {
      var nd = nodes[i];
      var pos = nodeMap[nd.id];
      var r = Math.max(4, Math.min(20, nd.size * 0.2));
      var color = CST_TIER_COLORS[nd.tier] || '#888888';

      // Glow for active members
      if (nd.activity_level > 0.5) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
      }

      // Node circle
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Node border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label for larger nodes
      if (r >= 8) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = "9px 'Courier New', monospace";
        ctx.textAlign = 'center';
        ctx.fillText(nd.name.substring(0, 12), pos.x, pos.y + r + 12);
      }
    }

    // Star field background decoration
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    for (var s = 0; s < 50; s++) {
      // Deterministic pseudo-random star positions
      var sx = ((s * 127 + 43) % W);
      var sy = ((s * 89 + 17) % H);
      ctx.fillRect(sx, sy, 1, 1);
    }
  }

  draw();

  // Tooltip on hover
  canvas.addEventListener('mousemove', function(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var mx = (e.clientX - rect.left) * scaleX;
    var my = (e.clientY - rect.top) * scaleY;

    var found = null;
    for (var i = 0; i < nodes.length; i++) {
      var pos = nodeMap[nodes[i].id];
      var r = Math.max(4, Math.min(20, nodes[i].size * 0.2));
      var dx = mx - pos.x;
      var dy = my - pos.y;
      if (dx * dx + dy * dy <= (r + 4) * (r + 4)) {
        found = nodes[i];
        break;
      }
    }

    if (found) {
      var tierLabel = CST_TIER_LABELS[found.tier] || found.tier;
      var tooltipText = found.name + '\n' +
        'Score: ' + formatScore(found.score) + '\n' +
        'WUs: ' + formatNumber(found.wus) + '\n' +
        'Tier: ' + tierLabel + '\n' +
        'Aktivitaet: ' + Math.round(found.activity_level * 100) + '%';
      if (found.joined_days_ago > 0) {
        tooltipText += '\nDabei seit: ' + found.joined_days_ago + ' Tagen';
      }

      tooltip.textContent = tooltipText;
      tooltip.style.whiteSpace = 'pre';
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX - canvas.parentElement.getBoundingClientRect().left + 14) + 'px';
      tooltip.style.top = (e.clientY - canvas.parentElement.getBoundingClientRect().top - 10) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', function() {
    tooltip.style.display = 'none';
  });
}
