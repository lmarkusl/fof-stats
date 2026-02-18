// ============================================================
// F@H Team Stats - Chart.js Visualizations
// Loaded after Chart.js 4.x CDN. Exposes global initCharts(data).
// ============================================================

// ---- Chart.js Defaults ----
Chart.defaults.color = '#444444';
Chart.defaults.font.family = "'Courier New', 'Courier', monospace";
Chart.defaults.plugins.legend.labels.usePointStyle = true;
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  Chart.defaults.animation.duration = 0;
} else {
  Chart.defaults.animation.duration = 1500;
}
Chart.defaults.animation.easing = 'easeOutQuart';

// ---- Helpers (escapeHtml, formatScore, formatNumber, getTier from utils.js) ----

function formatNumberShort(n) {
  if (n == null) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (abs >= 1e9)  return (n / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6)  return (n / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3)  return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

function generateGradient(ctx, color1, color2, horizontal) {
  const chart = ctx.chart;
  const area = chart.chartArea;
  if (!area) return color1;
  let gradient;
  if (horizontal) {
    gradient = ctx.createLinearGradient(area.left, 0, area.right, 0);
  } else {
    gradient = ctx.createLinearGradient(0, area.bottom, 0, area.top);
  }
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}

function tooltipConfig() {
  return {
    backgroundColor: '#ffffff',
    borderColor: '#808080',
    borderWidth: 1,
    cornerRadius: 0,
    titleColor: '#1a1a1a',
    bodyColor: '#444444',
    titleFont: { weight: 'bold', size: 11, family: "'Courier New', monospace" },
    bodyFont: { size: 10, family: "'Courier New', monospace" },
    padding: 8,
    displayColors: true,
    usePointStyle: true,
  };
}

const RAINBOW = [
  '#0000cc', '#cc0000', '#008800', '#cc8800', '#6600aa',
  '#008080', '#994400', '#0066cc', '#884422', '#336633',
  '#660066', '#006666', '#993300', '#003399', '#666600',
];

// ---- Chart Instance Tracking (prevents memory leaks) ----

const chartInstances = {};

function destroyChart(key) {
  if (chartInstances[key]) {
    chartInstances[key].destroy();
    delete chartInstances[key];
  }
}

function storeChart(key, chart) {
  chartInstances[key] = chart;
}

// ---- Chart Builders ----

function ensureCanvas(containerId, ariaLabel) {
  destroyChart(containerId);
  const container = document.getElementById(containerId);
  if (!container) return null;
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.id = containerId + '-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', ariaLabel || 'Chart');
  container.appendChild(canvas);
  return canvas;
}

function buildParetoChart(members) {
  const canvas = ensureCanvas('chart-distribution', 'Pareto-Diagramm: Kumulative Score-Verteilung nach Mitglied');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const sorted = [...members].sort((a, b) => b.score - a.score);
  const totalScore = sorted.reduce((s, m) => s + m.score, 0);

  // Top 15 individually, rest grouped
  const top = sorted.slice(0, 15);
  const rest = sorted.slice(15);
  const restScore = rest.reduce((s, m) => s + m.score, 0);

  const labels = top.map(m => m.name);
  const scores = top.map(m => m.score);
  if (rest.length > 0) {
    labels.push('Andere (' + rest.length + ')');
    scores.push(restScore);
  }

  // Cumulative %
  let cumulative = 0;
  const cumulativePct = scores.map(s => {
    cumulative += s;
    return (cumulative / totalScore) * 100;
  });

  // Bar gradient colors (dark blue to teal)
  const barColors = scores.map((_, i) => {
    const ratio = i / (scores.length - 1 || 1);
    const r = Math.round(0   + ratio * (0   - 0));
    const g = Math.round(0   + ratio * (128 - 0));
    const b = Math.round(204 + ratio * (128 - 204));
    return `rgb(${r}, ${g}, ${b})`;
  });

  storeChart('chart-distribution', new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Score',
          data: scores,
          backgroundColor: barColors,
          borderRadius: 0,
          borderSkipped: false,
          yAxisID: 'y',
          order: 2,
        },
        {
          label: 'Cumulative %',
          data: cumulativePct,
          type: 'line',
          borderColor: '#cc0000',
          backgroundColor: 'rgba(204,0,0,0.1)',
          pointBackgroundColor: '#cc0000',
          pointBorderColor: '#cc0000',
          pointRadius: 3,
          borderWidth: 2,
          fill: false,
          tension: 0,
          yAxisID: 'y1',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          ...tooltipConfig(),
          callbacks: {
            label(item) {
              if (item.dataset.yAxisID === 'y1') {
                return 'Cumulative: ' + item.parsed.y.toFixed(1) + '%';
              }
              return item.dataset.label + ': ' + formatNumberShort(item.parsed.y);
            },
          },
        },
        legend: { display: true },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 25,
            font: { size: 10 },
          },
          grid: { display: false },
        },
        y: {
          position: 'left',
          title: { display: true, text: 'Score' },
          ticks: { callback: v => formatNumberShort(v) },
          grid: { color: 'rgba(0, 0, 0, 0.06)' },
        },
        y1: {
          position: 'right',
          min: 0,
          max: 100,
          title: { display: true, text: 'Cumulative %' },
          ticks: { callback: v => v + '%' },
          grid: { drawOnChartArea: false },
        },
      },
    },
  }));
}

function buildEfficiencyChart(members) {
  const canvas = ensureCanvas('chart-efficiency', 'Bubble-Chart: Effizienz (Punkte pro Work Unit) vs. Gesamtoutput');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const points = members
    .filter(m => m.wus > 0)
    .map(m => {
      const efficiency = m.score / m.wus;
      const tier = getTier(m.score);
      return {
        x: m.wus,
        y: efficiency,
        r: Math.max(4, Math.min(30, Math.sqrt(m.score / 1e8))),
        name: m.name,
        score: m.score,
        wus: m.wus,
        efficiency,
        color: tier.color,
        tierName: tier.name,
      };
    });

  storeChart('chart-efficiency', new Chart(ctx, {
    type: 'bubble',
    data: {
      datasets: [{
        label: 'Members',
        data: points,
        backgroundColor: points.map(p => p.color + '99'),
        borderColor: points.map(p => p.color),
        borderWidth: 1.5,
        hoverBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        tooltip: {
          ...tooltipConfig(),
          callbacks: {
            title(items) {
              const raw = items[0].raw;
              return raw.name + ' (' + raw.tierName + ')';
            },
            label(item) {
              const d = item.raw;
              return [
                'Score: ' + formatNumberShort(d.score),
                'Work Units: ' + formatNumberShort(d.wus),
                'Efficiency: ' + formatNumberShort(d.efficiency) + ' pts/WU',
              ];
            },
          },
        },
        legend: { display: false },
      },
      scales: {
        x: {
          type: 'logarithmic',
          title: { display: true, text: 'Work Units (log)' },
          ticks: { callback: v => formatNumberShort(v) },
          grid: { color: 'rgba(0, 0, 0, 0.06)' },
        },
        y: {
          title: { display: true, text: 'Points per Work Unit' },
          ticks: { callback: v => formatNumberShort(v) },
          grid: { color: 'rgba(0, 0, 0, 0.06)' },
        },
      },
    },
  }));
}

function buildContributionDoughnut(members, teamScore) {
  const canvas = ensureCanvas('chart-contribution', 'Doughnut-Chart: Anteil am Team-Score pro Mitglied');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const sorted = [...members].sort((a, b) => b.score - a.score);
  const top10 = sorted.slice(0, 10);
  const rest = sorted.slice(10);
  const restScore = rest.reduce((s, m) => s + m.score, 0);
  const total = teamScore || sorted.reduce((s, m) => s + m.score, 0);

  const labels = top10.map(m => m.name);
  const data = top10.map(m => m.score);
  if (rest.length > 0) {
    labels.push('Andere (' + rest.length + ' Mitglieder)');
    data.push(restScore);
  }

  const colors = data.map((_, i) => RAINBOW[i % RAINBOW.length]);

  // Center text plugin (instance-scoped)
  const centerTextPlugin = {
    id: 'doughnutCenterText',
    afterDraw(chart) {
      if (chart.canvas.id !== 'chart-contribution-canvas') return;
      const { ctx: c, chartArea: { top: t, bottom: b, left: l, right: r } } = chart;
      const cx = (l + r) / 2;
      const cy = (t + b) / 2;
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#1a1a1a';
      c.font = "bold 16px 'Courier New', monospace";
      c.fillText(formatNumberShort(total), cx, cy - 10);
      c.fillStyle = '#888888';
      c.font = "11px 'Courier New', monospace";
      c.fillText('Total Score', cx, cy + 12);
      c.restore();
    },
  };

  const isMobile = window.innerWidth < 768;
  storeChart('chart-contribution', new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#c0c0c0',
        borderWidth: 2,
        hoverOffset: 12,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '62%',
      plugins: {
        tooltip: {
          ...tooltipConfig(),
          callbacks: {
            label(item) {
              const pct = ((item.parsed / total) * 100).toFixed(1);
              return item.label + ': ' + formatNumberShort(item.parsed) + ' (' + pct + '%)';
            },
          },
        },
        legend: {
          position: isMobile ? 'bottom' : 'right',
          labels: {
            padding: 12,
            font: { size: 11 },
            generateLabels(chart) {
              const ds = chart.data.datasets[0];
              return chart.data.labels.map((label, i) => ({
                text: label,
                fillStyle: ds.backgroundColor[i],
                strokeStyle: ds.backgroundColor[i],
                hidden: false,
                index: i,
                pointStyle: 'circle',
              }));
            },
          },
        },
      },
    },
    plugins: [centerTextPlugin],
  }));
}

function buildTierPyramid(members) {
  const canvas = ensureCanvas('chart-tiers', 'Balkendiagramm: Verteilung der Mitglieder nach Tier-Level');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const tiers = [
    { name: 'Diamond',  min: 100e9, color: '#0066cc' },
    { name: 'Platinum', min: 10e9,  color: '#6600aa' },
    { name: 'Gold',     min: 1e9,   color: '#cc8800' },
    { name: 'Silver',   min: 100e6, color: '#666666' },
    { name: 'Bronze',   min: 10e6,  color: '#994400' },
    { name: 'Copper',   min: 0,     color: '#884422' },
  ];

  const tierCounts = tiers.map(t => {
    const upper = tiers[tiers.indexOf(t) - 1];
    return members.filter(m => {
      if (upper) return m.score > t.min && m.score <= upper.min;
      return m.score > t.min;
    }).length;
  });

  storeChart('chart-tiers', new Chart(ctx, {
    type: 'bar',
    data: {
      labels: tiers.map(t => t.name),
      datasets: [{
        label: 'Members',
        data: tierCounts,
        backgroundColor: tiers.map(t => t.color + 'cc'),
        borderColor: tiers.map(t => t.color),
        borderWidth: 1.5,
        borderRadius: 0,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        tooltip: {
          ...tooltipConfig(),
          callbacks: {
            label(item) {
              return item.parsed.x + ' member' + (item.parsed.x !== 1 ? 's' : '');
            },
          },
        },
        legend: { display: false },
      },
      scales: {
        x: {
          title: { display: true, text: 'Number of Members' },
          ticks: { stepSize: 1 },
          grid: { color: 'rgba(0, 0, 0, 0.06)' },
        },
        y: {
          grid: { display: false },
        },
      },
    },
    plugins: [{
      id: 'barLabels',
      afterDatasetsDraw(chart) {
        const { ctx: c } = chart;
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const value = chart.data.datasets[0].data[i];
          if (value === 0) return;
          c.save();
          c.fillStyle = '#1a1a1a';
          c.font = "bold 12px 'Courier New', monospace";
          c.textAlign = 'left';
          c.textBaseline = 'middle';
          c.fillText(value, bar.x + 6, bar.y);
          c.restore();
        });
      },
    }],
  }));
}

function buildRankDistribution(members) {
  const canvas = ensureCanvas('chart-ranks', 'Balkendiagramm: Verteilung der globalen Raenge');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const bins = [
    { label: '1 - 100',       min: 1,     max: 100 },
    { label: '101 - 500',     min: 101,   max: 500 },
    { label: '501 - 1K',      min: 501,   max: 1000 },
    { label: '1K - 5K',       min: 1001,  max: 5000 },
    { label: '5K - 10K',      min: 5001,  max: 10000 },
    { label: '10K - 50K',     min: 10001, max: 50000 },
    { label: '50K+',          min: 50001, max: Infinity },
  ];

  const counts = bins.map(b =>
    members.filter(m => m.rank != null && m.rank >= b.min && m.rank <= b.max).length
  );

  const gradientColors = [
    '#0000cc', '#003399', '#004488', '#336666', '#666666', '#884422', '#994400',
  ];

  storeChart('chart-ranks', new Chart(ctx, {
    type: 'bar',
    data: {
      labels: bins.map(b => b.label),
      datasets: [{
        label: 'Members',
        data: counts,
        backgroundColor: gradientColors.map(c => c + 'cc'),
        borderColor: gradientColors,
        borderWidth: 1.5,
        borderRadius: 0,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        tooltip: {
          ...tooltipConfig(),
          callbacks: {
            label(item) {
              return item.parsed.y + ' member' + (item.parsed.y !== 1 ? 's' : '');
            },
          },
        },
        legend: { display: false },
      },
      scales: {
        x: {
          title: { display: true, text: 'Global Rank Range' },
          grid: { display: false },
        },
        y: {
          title: { display: true, text: 'Number of Members' },
          ticks: { stepSize: 1 },
          grid: { color: 'rgba(0, 0, 0, 0.06)' },
        },
      },
    },
  }));
}

function buildHistoryChart(history) {
  const canvas = ensureCanvas('chart-monthly', 'Liniendiagramm: Historischer Score-Verlauf mit Zuwachs');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (history && history.length > 1) {
    const labels = history.map(d => d.date);
    const scores = history.map(d => d.score);
    const deltas = history.map(d => d.score_delta);

    storeChart('chart-monthly', new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Score',
            data: scores,
            borderColor: '#1a1a1a',
            backgroundColor: 'rgba(0,0,204,0.08)',
            pointBackgroundColor: '#1a1a1a',
            pointBorderColor: '#888888',
            pointRadius: 3,
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            yAxisID: 'y',
          },
          {
            label: 'Score Zuwachs',
            data: deltas,
            type: 'bar',
            backgroundColor: 'rgba(204,0,0,0.4)',
            borderColor: '#cc0000',
            borderWidth: 1,
            borderRadius: 0,
            yAxisID: 'y1',
            order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          tooltip: {
            ...tooltipConfig(),
            callbacks: {
              label(item) {
                if (item.dataset.yAxisID === 'y1')
                  return 'Zuwachs: +' + formatNumberShort(item.parsed.y);
                return 'Score: ' + formatNumberShort(item.parsed.y);
              },
            },
          },
          legend: { display: true },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 45, font: { size: 10 } },
          },
          y: {
            position: 'left',
            title: { display: true, text: 'Total Score' },
            ticks: { callback: v => formatNumberShort(v) },
            grid: { color: 'rgba(0, 0, 0, 0.06)' },
          },
          y1: {
            position: 'right',
            title: { display: true, text: 'Zuwachs pro Periode' },
            ticks: { callback: v => formatNumberShort(v) },
            grid: { drawOnChartArea: false },
          },
        },
      },
    }));
  } else {
    // Not enough data yet - show info message
    const infoPlugin = {
      id: 'earlyData',
      afterDraw(chart) {
        const { ctx: c, chartArea: { top: t, bottom: b, left: l, right: r } } = chart;
        const cx = (l + r) / 2;
        const cy = (t + b) / 2;
        c.save();
        c.textAlign = 'center';
        c.textBaseline = 'middle';

        c.fillStyle = '#888888';
        c.font = "48px sans-serif";
        c.fillText('\u{1F4C8}', cx, cy - 48);

        c.fillStyle = '#1a1a1a';
        c.font = "bold 18px 'Courier New', monospace";
        c.fillText('Daten werden gesammelt...', cx, cy + 4);

        c.fillStyle = '#888888';
        c.font = "13px 'Courier New', monospace";
        c.fillText('Trends erscheinen nach einigen Stunden.', cx, cy + 28);
        c.fillText('Snapshots werden stündlich gespeichert.', cx, cy + 48);
        c.restore();
      },
    };

    storeChart('chart-monthly', new Chart(ctx, {
      type: 'bar',
      data: { labels: [], datasets: [{ data: [] }] },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
      plugins: [infoPlugin],
    }));
  }
}

// ---- Top Movers Chart ----

function buildMoversChart(movers) {
  const canvas = ensureCanvas('chart-movers', 'Balkendiagramm: Top Movers der letzten 7 Tage');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (!movers || movers.length === 0 || movers.every(m => m.score_gained === 0)) {
    const placeholder = {
      id: 'moversPlaceholder',
      afterDraw(chart) {
        const { ctx: c, chartArea: { top: t, bottom: b, left: l, right: r } } = chart;
        const cx = (l + r) / 2;
        const cy = (t + b) / 2;
        c.save();
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#888888';
        c.font = "40px sans-serif";
        c.fillText('\u{1F3C3}', cx, cy - 36);
        c.fillStyle = '#1a1a1a';
        c.font = "bold 16px 'Courier New', monospace";
        c.fillText('Top Movers erscheinen bald', cx, cy + 10);
        c.fillStyle = '#888888';
        c.font = "12px 'Courier New', monospace";
        c.fillText('Benötigt mind. 2 Tage Daten', cx, cy + 32);
        c.restore();
      },
    };
    storeChart('chart-movers', new Chart(ctx, {
      type: 'bar',
      data: { labels: [], datasets: [{ data: [] }] },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
      plugins: [placeholder],
    }));
    return;
  }

  const top10 = movers.filter(m => m.score_gained > 0).slice(0, 10);

  storeChart('chart-movers', new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10.map(m => m.name),
      datasets: [{
        label: 'Score Zuwachs (7 Tage)',
        data: top10.map(m => m.score_gained),
        backgroundColor: top10.map((_, i) => RAINBOW[i % RAINBOW.length] + 'cc'),
        borderColor: top10.map((_, i) => RAINBOW[i % RAINBOW.length]),
        borderWidth: 1.5,
        borderRadius: 0,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        tooltip: {
          ...tooltipConfig(),
          callbacks: {
            label(item) {
              return '+' + formatNumberShort(item.parsed.x) + ' Punkte';
            },
          },
        },
        legend: { display: false },
      },
      scales: {
        x: {
          title: { display: true, text: 'Score Zuwachs' },
          ticks: { callback: v => formatNumberShort(v) },
          grid: { color: 'rgba(0, 0, 0, 0.06)' },
        },
        y: { grid: { display: false } },
      },
    },
  }));
}

// ---- Lorenz Curve (Inequality) ----

function buildLorenzChart(members) {
  const canvas = ensureCanvas('chart-lorenz', 'Lorenz-Kurve: Score-Ungleichverteilung im Team');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const sorted = [...members].sort((a, b) => a.score - b.score);
  const totalScore = sorted.reduce((s, m) => s + m.score, 0);
  const n = sorted.length;

  // Build Lorenz curve data points
  let cumScore = 0;
  const lorenzData = [{ x: 0, y: 0 }];
  sorted.forEach((m, i) => {
    cumScore += m.score;
    lorenzData.push({
      x: ((i + 1) / n) * 100,
      y: (cumScore / totalScore) * 100,
    });
  });

  // Perfect equality line
  const equalityData = [{ x: 0, y: 0 }, { x: 100, y: 100 }];

  storeChart('chart-lorenz', new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Perfekte Gleichverteilung',
          data: equalityData,
          borderColor: '#c0c0c0',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          showLine: true,
          fill: false,
        },
        {
          label: 'Lorenz-Kurve (Team)',
          data: lorenzData,
          borderColor: '#0000cc',
          backgroundColor: 'rgba(0,0,204,0.1)',
          borderWidth: 2.5,
          pointRadius: 0,
          showLine: true,
          fill: true,
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        tooltip: {
          ...tooltipConfig(),
          callbacks: {
            label(item) {
              return item.parsed.x.toFixed(0) + '% der Member erzeugen ' + item.parsed.y.toFixed(1) + '% des Scores';
            },
          },
        },
        legend: { display: true },
      },
      scales: {
        x: {
          min: 0, max: 100,
          title: { display: true, text: '% der Mitglieder (aufsteigend)' },
          ticks: { callback: v => v + '%' },
          grid: { color: 'rgba(0, 0, 0, 0.06)' },
        },
        y: {
          min: 0, max: 100,
          title: { display: true, text: '% des Gesamt-Scores' },
          ticks: { callback: v => v + '%' },
          grid: { color: 'rgba(0, 0, 0, 0.06)' },
        },
      },
    },
  }));
}

// ---- Score Distribution (Log Histogram) ----

function buildScoreDistribution(members) {
  const canvas = ensureCanvas('chart-scoredist', 'Histogramm: Score-Verteilung der Mitglieder (logarithmisch)');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Create logarithmic bins
  const bins = [
    { label: '< 1M',       min: 0,     max: 1e6 },
    { label: '1M - 10M',   min: 1e6,   max: 10e6 },
    { label: '10M - 100M', min: 10e6,  max: 100e6 },
    { label: '100M - 1B',  min: 100e6, max: 1e9 },
    { label: '1B - 10B',   min: 1e9,   max: 10e9 },
    { label: '10B - 100B', min: 10e9,  max: 100e9 },
    { label: '100B+',      min: 100e9, max: Infinity },
  ];

  const counts = bins.map(b =>
    members.filter(m => m.score >= b.min && m.score < b.max).length
  );

  const colors = [
    '#884422', '#994400', '#666666', '#cc8800', '#0066cc', '#6600aa', '#0000cc',
  ];

  storeChart('chart-scoredist', new Chart(ctx, {
    type: 'bar',
    data: {
      labels: bins.map(b => b.label),
      datasets: [{
        label: 'Anzahl Mitglieder',
        data: counts,
        backgroundColor: colors.map(c => c + 'bb'),
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        tooltip: {
          ...tooltipConfig(),
          callbacks: {
            label(item) {
              return item.parsed.y + ' Mitglieder';
            },
          },
        },
        legend: { display: false },
      },
      scales: {
        x: {
          title: { display: true, text: 'Score-Bereich' },
          grid: { display: false },
        },
        y: {
          title: { display: true, text: 'Anzahl' },
          ticks: { stepSize: 1 },
          grid: { color: 'rgba(0, 0, 0, 0.06)' },
        },
      },
    },
    plugins: [{
      id: 'distLabels',
      afterDatasetsDraw(chart) {
        const { ctx: c } = chart;
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const value = chart.data.datasets[0].data[i];
          if (value === 0) return;
          c.save();
          c.fillStyle = '#1a1a1a';
          c.font = "bold 11px 'Courier New', monospace";
          c.textAlign = 'center';
          c.textBaseline = 'bottom';
          c.fillText(value, bar.x, bar.y - 4);
          c.restore();
        });
      },
    }],
  }));
}

// ---- Main Entry Point ----

async function initCharts(data) {
  const members = data.members || [];
  const teamScore = data.team ? data.team.score : 0;

  buildParetoChart(members);
  buildEfficiencyChart(members);
  buildContributionDoughnut(members, teamScore);
  buildTierPyramid(members);
  buildRankDistribution(members);
  buildLorenzChart(members);
  buildScoreDistribution(members);

  // Fetch historical data for trend charts
  try {
    const [historyRes, moversRes] = await Promise.all([
      fetch('/api/history/team?period=daily&limit=90'),
      fetch('/api/history/movers?days=7'),
    ]);
    const history = historyRes.ok ? await historyRes.json() : [];
    const movers = moversRes.ok ? await moversRes.json() : [];

    buildHistoryChart(history);
    buildMoversChart(movers);
  } catch (err) {
    console.warn('History fetch failed:', err);
    buildHistoryChart(null);
    buildMoversChart(null);
  }
}
