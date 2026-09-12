/**
 * citation.js -- Copy-to-clipboard for the BibTeX citation block.
 *
 * Self-contained IIFE. Binds every [data-copy-target] button to the element
 * whose id it names.
 */

(function () {
  'use strict';

  function copyText(text, onDone) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { onDone(true); },
        function () { onDone(false); }
      );
      return;
    }
    // Fallback for browsers without the async clipboard API.
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    onDone(ok);
  }

  function bind(btn) {
    var targetId = btn.getAttribute('data-copy-target');
    var target = document.getElementById(targetId);
    if (!target) {
      console.error('[citation] No element with id "' + targetId + '" for copy button.');
      return;
    }
    btn.addEventListener('click', function () {
      copyText(target.textContent, function (ok) {
        var original = 'Copy';
        btn.textContent = ok ? 'Copied' : 'Copy failed';
        btn.classList.toggle('copied', ok);
        setTimeout(function () {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 1800);
      });
    });
  }

  function init() {
    var buttons = document.querySelectorAll('[data-copy-target]');
    for (var i = 0; i < buttons.length; i++) bind(buttons[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
