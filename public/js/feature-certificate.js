// feature-certificate.js - Certificate Generator

(function() {
  var style = document.createElement('style');
  style.textContent = `
    .cert-controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 16px; }
    .cert-field { display: flex; flex-direction: column; gap: 4px; }
    .cert-field label { font-size: 0.75rem; color: var(--text-secondary, #888); text-transform: uppercase; font-family: var(--font-mono, 'Courier New', monospace); }
    .cert-field select, .cert-field input { font-family: var(--font-mono, 'Courier New', monospace); padding: 6px 10px; background: var(--bg-primary, #f0f0e8); border: 2px inset #ccc; font-size: 0.85rem; }
    .cert-btn { font-family: var(--font-mono, 'Courier New', monospace); padding: 8px 16px; background: var(--accent-primary, #00cc66); color: #000; border: 2px outset #ccc; cursor: pointer; font-size: 0.85rem; font-weight: bold; }
    .cert-btn:hover { background: #00aa55; }
    .cert-preview { margin-top: 12px; text-align: center; }
    .cert-preview canvas { max-width: 100%; border: 2px solid var(--border-color, #ccc); }
  `;
  document.head.appendChild(style);
})();

function initCertificate() {
  var container = document.getElementById('certificate-section');
  if (!container) return;

  // Fetch members for dropdown
  fetch('/api/members')
    .then(function(r) { return r.json(); })
    .then(function(members) {
      var sorted = members.sort(function(a, b) { return b.score - a.score; });

      var milestones = [
        { value: '1000000', label: '1 Million Score' },
        { value: '10000000', label: '10 Millionen Score' },
        { value: '100000000', label: '100 Millionen Score' },
        { value: '1000000000', label: '1 Milliarde Score' },
        { value: '10000000000', label: '10 Milliarden Score' },
        { value: '100000000000', label: '100 Milliarden Score' },
      ];

      var html = '<div class="cert-controls">';
      html += '<div class="cert-field"><label>Mitglied</label><select id="cert-member">';
      sorted.forEach(function(m) {
        html += '<option value="' + escapeHtml(m.name) + '">' + escapeHtml(m.name) + ' (' + formatScore(m.score) + ')</option>';
      });
      html += '</select></div>';

      html += '<div class="cert-field"><label>Meilenstein</label><select id="cert-milestone">';
      milestones.forEach(function(ms) {
        html += '<option value="' + ms.value + '">' + ms.label + '</option>';
      });
      html += '</select></div>';

      html += '<button class="cert-btn" id="cert-generate">&#x1F4DC; Zertifikat erstellen</button>';
      html += '</div>';
      html += '<div class="cert-preview" id="cert-preview"></div>';

      container.innerHTML = html;

      document.getElementById('cert-generate').addEventListener('click', function() {
        var name = document.getElementById('cert-member').value;
        var milestone = document.getElementById('cert-milestone');
        var milestoneValue = milestone.value;
        var milestoneLabel = milestone.options[milestone.selectedIndex].text;
        generateCertificate(name, milestoneLabel, milestoneValue);
      });
    });
}

function generateCertificate(memberName, milestoneLabel, milestoneValue) {
  var canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  var ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, 1200, 800);

  // Outer border (gold)
  ctx.strokeStyle = '#cc8800';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, 1160, 760);

  // Inner border
  ctx.strokeStyle = '#cc8800';
  ctx.lineWidth = 2;
  ctx.strokeRect(35, 35, 1130, 730);

  // Corner decorations
  var corners = [[40, 40], [1155, 40], [40, 755], [1155, 755]];
  ctx.fillStyle = '#cc8800';
  corners.forEach(function(c) {
    ctx.fillRect(c[0] - 5, c[1] - 5, 10, 10);
  });

  // Header
  ctx.fillStyle = '#cc8800';
  ctx.font = 'bold 48px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ZERTIFIKAT', 600, 120);

  // Decorative line
  ctx.strokeStyle = '#cc8800';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(200, 140);
  ctx.lineTo(1000, 140);
  ctx.stroke();

  // Subtitle
  ctx.fillStyle = '#888888';
  ctx.font = '18px "Courier New", monospace';
  ctx.fillText('FOLDING@HOME ACHIEVEMENT', 600, 175);

  // Main text
  ctx.fillStyle = '#cccccc';
  ctx.font = '22px "Courier New", monospace';
  ctx.fillText('Hiermit wird bestaetigt, dass', 600, 260);

  // Member name
  ctx.fillStyle = '#00cc66';
  ctx.font = 'bold 36px "Courier New", monospace';
  ctx.fillText(memberName, 600, 320);

  // Milestone text
  ctx.fillStyle = '#cccccc';
  ctx.font = '22px "Courier New", monospace';
  ctx.fillText('den Meilenstein', 600, 390);

  ctx.fillStyle = '#ffcc00';
  ctx.font = 'bold 32px "Courier New", monospace';
  ctx.fillText(milestoneLabel, 600, 440);

  ctx.fillStyle = '#cccccc';
  ctx.font = '22px "Courier New", monospace';
  ctx.fillText('bei Folding@Home erreicht hat.', 600, 500);

  // Decorative line
  ctx.strokeStyle = '#cc8800';
  ctx.beginPath();
  ctx.moveTo(200, 540);
  ctx.lineTo(1000, 540);
  ctx.stroke();

  // Team info
  ctx.fillStyle = '#888888';
  ctx.font = '18px "Courier New", monospace';
  ctx.fillText('Team: FreilaufendeOnlineFuzzies (#240890)', 600, 590);

  // Date
  var now = new Date();
  var dateStr = now.toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillText('Ausgestellt am: ' + dateStr, 600, 630);

  // Footer
  ctx.fillStyle = '#555555';
  ctx.font = '14px "Courier New", monospace';
  ctx.fillText('foldingathome.org | Team #240890 | Distributed Computing for Science', 600, 720);

  // Show preview
  var preview = document.getElementById('cert-preview');
  if (preview) {
    preview.innerHTML = '';
    preview.appendChild(canvas);
  }

  // Download
  var link = document.createElement('a');
  link.download = 'fof-zertifikat-' + memberName.replace(/[^a-zA-Z0-9]/g, '_') + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}
