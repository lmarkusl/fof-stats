// feature-export.js - Data Export and Forum Signature Generator

(function() {
  var style = document.createElement('style');
  style.textContent = `
    .export-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .export-card-content { padding: 4px 0; }
    .export-buttons { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .export-dl-btn { font-family: var(--font-mono, 'Courier New', monospace); padding: 8px 16px; border: 2px outset #ccc; cursor: pointer; font-size: 0.85rem; background: var(--bg-secondary, #e0e0d8); }
    .export-dl-btn:hover { background: var(--accent-primary, #00cc66); color: #000; }
    .sig-output { background: #1a1a1a; color: #00cc66; padding: 12px; font-family: var(--font-mono, 'Courier New', monospace); font-size: 0.8rem; border: 1px solid #333; white-space: pre-wrap; word-break: break-all; margin-top: 8px; max-height: 120px; overflow-y: auto; }
    .sig-format-tabs { display: flex; gap: 4px; margin-top: 12px; }
    .sig-tab { font-family: var(--font-mono, 'Courier New', monospace); padding: 6px 12px; border: 1px solid #ccc; cursor: pointer; font-size: 0.8rem; background: var(--bg-secondary, #e0e0d8); }
    .sig-tab.active { background: var(--accent-primary, #00cc66); color: #000; font-weight: bold; }
    .copy-btn { font-family: var(--font-mono, 'Courier New', monospace); padding: 6px 12px; border: 2px outset #ccc; cursor: pointer; font-size: 0.8rem; background: var(--bg-secondary, #e0e0d8); margin-top: 8px; }
    .copy-btn:hover { background: var(--accent-primary, #00cc66); color: #000; }
    .copy-btn.copied { background: #00cc66; color: #000; }
    @media (max-width: 768px) { .export-grid { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);
})();

function initExportFeatures() {
  initDataExport();
  initSignatureGenerator();
}

function initDataExport() {
  var container = document.getElementById('export-data-container');
  if (!container) return;

  var html = '<div class="export-card-content">';
  html += '<p style="color:var(--text-secondary);font-size:0.85rem;margin:0 0 8px">Team-Daten als Datei herunterladen</p>';
  html += '<div class="export-buttons">';
  html += '<button class="export-dl-btn" id="export-csv-btn">&#x1F4C4; CSV Export</button>';
  html += '<button class="export-dl-btn" id="export-json-btn">&#x1F4CB; JSON Export</button>';
  html += '</div>';
  html += '</div>';
  container.innerHTML = html;

  document.getElementById('export-csv-btn').addEventListener('click', function() {
    window.location.href = '/api/export/csv';
  });
  document.getElementById('export-json-btn').addEventListener('click', function() {
    window.location.href = '/api/export/json';
  });
}

function initSignatureGenerator() {
  var container = document.getElementById('signature-container');
  if (!container) return;

  // Fetch team data for signature
  Promise.all([
    fetch('/api/team').then(function(r) { return r.json(); }),
    fetch('/api/ppd').then(function(r) { return r.json(); }).catch(function() { return { team: { ppd_7d: 0 } }; })
  ]).then(function(results) {
    var team = results[0];
    var ppd = results[1].team || {};

    var sigs = {
      plain: '[Team FOF] Score: ' + formatScore(team.score) + ' | Rang: #' + team.rank + ' | Mitglieder: ' + (team.members || '?') + ' | PPD: ' + formatScore(ppd.ppd_7d || 0) + '\nFreilaufendeOnlineFuzzies | foldingathome.org/team/240890',
      bbcode: '[b][url=https://stats.foldingathome.org/team/240890]FreilaufendeOnlineFuzzies[/url][/b]\n[color=green]Score: ' + formatScore(team.score) + '[/color] | Rang: #' + team.rank + ' | PPD: ' + formatScore(ppd.ppd_7d || 0) + '\n[i]Fighting disease through distributed computing[/i]',
      html: '&lt;a href="https://stats.foldingathome.org/team/240890"&gt;&lt;b&gt;FreilaufendeOnlineFuzzies&lt;/b&gt;&lt;/a&gt; | Score: ' + formatScore(team.score) + ' | Rang: #' + team.rank + ' | PPD: ' + formatScore(ppd.ppd_7d || 0)
    };

    var html = '<div class="sig-format-tabs">';
    html += '<button class="sig-tab active" data-format="plain">Plain Text</button>';
    html += '<button class="sig-tab" data-format="bbcode">BBCode</button>';
    html += '<button class="sig-tab" data-format="html">HTML</button>';
    html += '</div>';
    html += '<div class="sig-output" id="sig-output">' + escapeHtml(sigs.plain) + '</div>';
    html += '<button class="copy-btn" id="sig-copy-btn">&#x1F4CB; In Zwischenablage kopieren</button>';
    container.innerHTML = html;

    var currentFormat = 'plain';

    container.querySelectorAll('.sig-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        container.querySelectorAll('.sig-tab').forEach(function(t) { t.classList.remove('active'); });
        this.classList.add('active');
        currentFormat = this.getAttribute('data-format');
        document.getElementById('sig-output').textContent = sigs[currentFormat];
      });
    });

    document.getElementById('sig-copy-btn').addEventListener('click', function() {
      var btn = this;
      navigator.clipboard.writeText(sigs[currentFormat]).then(function() {
        btn.textContent = '\u2705 Kopiert!';
        btn.classList.add('copied');
        setTimeout(function() {
          btn.textContent = '\uD83D\uDCCB In Zwischenablage kopieren';
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  });
}
