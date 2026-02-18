// ============================================================
// F@H Stats Dashboard - Easter Eggs
// Team: FreilaufendeOnlineFuzzies (#240890)
//
// Hidden features: Boot sequence, terminal emulator,
// BSOD (Konami Code), CRT scanline effect.
// ============================================================

// ---- 1. Boot Sequence Animation ----

function initBootSequence() {
  if (sessionStorage.getItem('fof-boot-done')) return;
  sessionStorage.setItem('fof-boot-done', '1');

  var lines = [
    'Checking RAM... 640K OK',
    'Loading FOF_STATS.SYS...',
    'Initializing NETWORK.DRV...',
    'Connecting to FAH API... OK',
    'C:\\FOF> STATS.EXE /ONLINE'
  ];

  var overlay = document.createElement('div');
  overlay.id = 'boot-overlay';
  overlay.setAttribute('style',
    'position:fixed;inset:0;z-index:99999;background:#000;display:flex;' +
    'align-items:flex-start;justify-content:flex-start;padding:40px;' +
    'font-family:"Courier New",Courier,monospace;font-size:1rem;' +
    'color:#c0c0c0;flex-direction:column;transition:opacity 0.5s ease;'
  );

  var output = document.createElement('div');
  overlay.appendChild(output);
  document.body.appendChild(overlay);

  var i = 0;
  var interval = setInterval(function() {
    if (i >= lines.length) {
      clearInterval(interval);
      setTimeout(function() {
        overlay.style.opacity = '0';
        setTimeout(function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 500);
      }, 400);
      return;
    }
    var line = document.createElement('div');
    line.textContent = lines[i];
    line.style.marginBottom = '4px';
    if (i === lines.length - 1) line.style.color = '#ffffff';
    output.appendChild(line);
    i++;
  }, 300);
}

// ---- 2. Terminal Easter Egg ----

function initTerminal() {
  var terminalOpen = false;
  var overlay = null;
  var inputEl = null;
  var outputEl = null;
  var matrixMode = false;

  function getTeamData() {
    return window._dashboardData || { team: null, members: [] };
  }

  function createTerminal() {
    overlay = document.createElement('div');
    overlay.id = 'terminal-overlay';
    overlay.setAttribute('style',
      'position:fixed;bottom:0;left:0;right:0;z-index:10000;' +
      'background:#000;border-top:2px solid #555;font-family:"Courier New",monospace;' +
      'font-size:0.85rem;color:#c0c0c0;max-height:50vh;display:flex;flex-direction:column;'
    );

    var header = document.createElement('div');
    header.setAttribute('style',
      'padding:4px 12px;background:#2c2c2c;border-bottom:1px solid #555;' +
      'display:flex;justify-content:space-between;align-items:center;' +
      'font-size:0.75rem;color:#aaa;flex-shrink:0;'
    );
    header.innerHTML = '<span>FOF Terminal v1.0</span>';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '[X]';
    closeBtn.setAttribute('style',
      'background:none;border:none;color:#aaa;cursor:pointer;' +
      'font-family:"Courier New",monospace;font-size:0.75rem;'
    );
    closeBtn.addEventListener('click', closeTerminal);
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    outputEl = document.createElement('div');
    outputEl.id = 'terminal-output';
    outputEl.setAttribute('style',
      'flex:1;overflow-y:auto;padding:8px 12px;white-space:pre-wrap;word-break:break-word;'
    );
    overlay.appendChild(outputEl);

    var inputRow = document.createElement('div');
    inputRow.setAttribute('style',
      'display:flex;align-items:center;padding:4px 12px 8px;flex-shrink:0;'
    );

    var prompt = document.createElement('span');
    prompt.textContent = 'C:\\FOF>';
    prompt.setAttribute('style', 'color:#fff;margin-right:6px;white-space:nowrap;');
    inputRow.appendChild(prompt);

    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.setAttribute('style',
      'flex:1;background:transparent;border:none;outline:none;' +
      'color:#fff;font-family:"Courier New",monospace;font-size:0.85rem;caret-color:#fff;'
    );
    inputEl.setAttribute('autocomplete', 'off');
    inputEl.setAttribute('spellcheck', 'false');
    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var cmd = inputEl.value.trim();
        inputEl.value = '';
        if (cmd) handleCommand(cmd);
      }
      if (e.key === 'Escape') {
        closeTerminal();
      }
    });
    inputRow.appendChild(inputEl);
    overlay.appendChild(inputRow);

    document.body.appendChild(overlay);
    terminalOpen = true;

    printLine('FOF Terminal v1.0 -- Type HELP for commands.');
    printLine('');

    setTimeout(function() { inputEl.focus(); }, 50);
  }

  function printLine(text) {
    if (!outputEl) return;
    var line = document.createElement('div');
    line.textContent = text;
    outputEl.appendChild(line);
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function handleCommand(raw) {
    printLine('C:\\FOF>' + raw);
    var parts = raw.trim().split(/\s+/);
    var cmd = parts[0].toUpperCase();
    var arg = parts.slice(1).join(' ');

    switch (cmd) {
      case 'DIR':
        cmdDir();
        break;
      case 'VER':
        printLine('FOF Stats v1.0.1 \u2014 Team #240890');
        break;
      case 'HELP':
        printLine('Available commands:');
        printLine('  DIR          List top 10 team members');
        printLine('  VER          Show version');
        printLine('  HELP         Show this help');
        printLine('  CLS          Clear terminal');
        printLine('  PING [name]  Open member profile');
        printLine('  COLOR 0A     Matrix mode (green)');
        printLine('  COLOR 07     Normal mode');
        printLine('  EXIT         Close terminal');
        break;
      case 'CLS':
        if (outputEl) outputEl.innerHTML = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'PING':
        if (!arg) {
          printLine('Usage: PING <member_name>');
        } else {
          printLine('Pinging ' + arg + '...');
          printLine('Opening profile...');
          window.location.href = '/donor/' + encodeURIComponent(arg);
        }
        break;
      case 'COLOR':
        cmdColor(arg.toUpperCase());
        break;
      case 'EXIT':
        closeTerminal();
        break;
      default:
        printLine("Bad command or file name: " + cmd);
        break;
    }
    printLine('');
  }

  function cmdDir() {
    var data = getTeamData();
    if (!data.members || data.members.length === 0) {
      printLine('No data loaded.');
      return;
    }
    var sorted = data.members.slice().sort(function(a, b) { return b.score - a.score; });
    var top10 = sorted.slice(0, 10);

    printLine(' Volume in drive C is FOF_STATS');
    printLine(' Directory of C:\\FOF\\MEMBERS');
    printLine('');
    printLine(' Name                    Score');
    printLine(' \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    top10.forEach(function(m, i) {
      var name = m.name.length > 22 ? m.name.substring(0, 22) : m.name;
      var pad = '                       '.substring(0, 23 - name.length);
      var score = typeof formatScore === 'function' ? formatScore(m.score) : String(m.score);
      printLine(' ' + name + pad + score);
    });
    printLine('');
    printLine('       ' + top10.length + ' file(s) listed');
  }

  function cmdColor(code) {
    if (code === '0A') {
      matrixMode = true;
      if (overlay) {
        overlay.style.color = '#00ff00';
        overlay.style.background = '#000';
        overlay.style.borderTopColor = '#00ff00';
      }
      if (inputEl) inputEl.style.color = '#00ff00';
      printLine('Matrix mode activated.');
    } else if (code === '07') {
      matrixMode = false;
      if (overlay) {
        overlay.style.color = '#c0c0c0';
        overlay.style.background = '#000';
        overlay.style.borderTopColor = '#555';
      }
      if (inputEl) inputEl.style.color = '#fff';
      printLine('Normal mode restored.');
    } else {
      printLine('Usage: COLOR 0A (matrix) or COLOR 07 (normal)');
    }
  }

  function openTerminal() {
    if (terminalOpen) return;
    createTerminal();
  }

  function closeTerminal() {
    if (!terminalOpen || !overlay) return;
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    inputEl = null;
    outputEl = null;
    terminalOpen = false;
    matrixMode = false;
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === '`' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      var tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (terminalOpen) {
        closeTerminal();
      } else {
        openTerminal();
      }
    }
    if (e.key === 'Escape' && terminalOpen) {
      closeTerminal();
    }
  });
}

// ---- 3. BSOD Easter Egg (Konami Code) ----

function initBSOD() {
  var konamiSequence = [
    'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
    'b', 'a'
  ];
  var konamiIndex = 0;

  function getTeamData() {
    return window._dashboardData || { team: null, members: [] };
  }

  function showBSOD() {
    var data = getTeamData();
    var team = data.team || {};
    var members = data.members || [];

    var score = typeof formatScore === 'function' && team.score ? formatScore(team.score) : (team.score || '???');
    var wus = typeof formatNumber === 'function' && team.wus ? formatNumber(team.wus) : (team.wus || '???');
    var count = members.length || '???';
    var rank = team.rank || '???';

    var overlay = document.createElement('div');
    overlay.id = 'bsod-overlay';
    overlay.setAttribute('style',
      'position:fixed;inset:0;z-index:99999;background:#0000AA;color:#ffffff;' +
      'font-family:"Courier New",Courier,monospace;padding:40px;display:flex;' +
      'flex-direction:column;justify-content:center;cursor:pointer;'
    );

    var title = document.createElement('div');
    title.setAttribute('style',
      'background:#c0c0c0;color:#0000AA;display:inline-block;padding:2px 12px;' +
      'font-weight:700;font-size:1.1rem;margin-bottom:24px;align-self:center;'
    );
    title.textContent = ' FreilaufendeOnlineFuzzies ';
    overlay.appendChild(title);

    var content = document.createElement('pre');
    content.setAttribute('style',
      'font-size:0.9rem;line-height:1.6;max-width:700px;margin:0 auto;white-space:pre-wrap;'
    );
    content.textContent =
      'A problem has been detected and FOF Stats has been\n' +
      'shut down to prevent damage to your productivity.\n\n' +
      'The problem seems to be caused by excessive folding.\n\n' +
      '*** STOP: 0x000000F0F (FOLDING_OVERFLOW)\n\n' +
      'TEAM_SCORE: ' + score + '\n' +
      'WORK_UNITS: ' + wus + '\n' +
      'MEMBERS:    ' + count + '\n' +
      'RANK:       #' + rank + '\n\n' +
      'If this is the first time you\'ve seen this screen,\n' +
      'keep folding. If this screen appears again, fold harder.\n\n' +
      'Technical information:\n' +
      '*** STOP: 0x000000F0F (0x' + Number(team.score || 0).toString(16).toUpperCase() +
      ', 0x' + Number(team.wus || 0).toString(16).toUpperCase() +
      ', 0x00000000, 0x00000000)\n\n' +
      'Press any key or click to continue...';
    overlay.appendChild(content);

    function dismiss() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', dismiss);
    }

    overlay.addEventListener('click', dismiss);
    document.addEventListener('keydown', dismiss);

    document.body.appendChild(overlay);
  }

  document.addEventListener('keydown', function(e) {
    var tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    var expected = konamiSequence[konamiIndex];
    if (e.key === expected || e.key.toLowerCase() === expected) {
      konamiIndex++;
      if (konamiIndex === konamiSequence.length) {
        konamiIndex = 0;
        showBSOD();
      }
    } else {
      konamiIndex = 0;
    }
  });
}

// ---- 4. CRT Scanline Effect ----

function initCRT() {
  var CRT_KEY = 'fof-crt-enabled';
  var styleEl = null;

  var crtCSS =
    '#crt-scanlines{' +
      'position:fixed;inset:0;z-index:9998;pointer-events:none;' +
      'background:repeating-linear-gradient(' +
        '0deg,' +
        'rgba(0,0,0,0.08) 0px,' +
        'rgba(0,0,0,0.08) 1px,' +
        'transparent 1px,' +
        'transparent 3px' +
      ');' +
      'animation:crtFlicker 4s infinite;' +
    '}' +
    '@keyframes crtFlicker{' +
      '0%,100%{opacity:1;}' +
      '92%{opacity:1;}' +
      '93%{opacity:0.8;}' +
      '94%{opacity:1;}' +
    '}';

  function enableCRT() {
    if (document.getElementById('crt-scanlines')) return;

    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.textContent = crtCSS;
      document.head.appendChild(styleEl);
    }

    var scanlines = document.createElement('div');
    scanlines.id = 'crt-scanlines';
    document.body.appendChild(scanlines);
  }

  function disableCRT() {
    var el = document.getElementById('crt-scanlines');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    if (styleEl && styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
      styleEl = null;
    }
  }

  function addToggleButton() {
    var footer = document.querySelector('.footer-content');
    if (!footer) return;

    var btn = document.createElement('button');
    btn.id = 'crt-toggle';
    btn.textContent = 'CRT';
    btn.setAttribute('title', 'Toggle CRT scanline effect');
    btn.setAttribute('style',
      'padding:4px 12px;font-family:"Courier New",monospace;font-size:0.7rem;' +
      'font-weight:700;background:#d4d4d4;border:2px outset #e0e0e0;' +
      'cursor:pointer;text-transform:uppercase;color:#1a1a1a;'
    );

    var active = localStorage.getItem(CRT_KEY) === '1';
    if (active) {
      btn.style.borderStyle = 'inset';
      btn.style.background = '#b0b0b0';
    }

    btn.addEventListener('click', function() {
      var isActive = localStorage.getItem(CRT_KEY) === '1';
      if (isActive) {
        localStorage.removeItem(CRT_KEY);
        disableCRT();
        btn.style.borderStyle = 'outset';
        btn.style.background = '#d4d4d4';
      } else {
        localStorage.setItem(CRT_KEY, '1');
        enableCRT();
        btn.style.borderStyle = 'inset';
        btn.style.background = '#b0b0b0';
      }
    });

    btn.addEventListener('mousedown', function() {
      btn.style.borderStyle = 'inset';
    });

    footer.appendChild(btn);
  }

  addToggleButton();

  if (localStorage.getItem(CRT_KEY) === '1') {
    enableCRT();
  }
}

// ---- Main Init ----

function initEasterEggs() {
  initBootSequence();
  initTerminal();
  initBSOD();
  initCRT();
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEasterEggs);
} else {
  initEasterEggs();
}
