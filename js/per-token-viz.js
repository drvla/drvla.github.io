/**
 * per-token-viz.js -- Interactive per-token SAE feature heatmap viewer
 *
 * Self-contained IIFE. Expects:
 *   <div id="per-token-viz"></div>
 *
 * Reuses .image-strip and .heatmap-* classes from activation-viz for
 * consistent visual style. Adds viridis coloring and per-token grouping.
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  var CONTAINER_ID = 'per-token-viz';
  var DATA_PATH = 'data/per_token/per_token_data.json';

  var BENCHMARKS = {
    libero: { label: 'LIBERO', framePath: 'data/per_token/libero' },
    droid:  { label: 'DROID',  framePath: 'data/per_token/droid' }
  };

  var HEATMAP_CELLS = 60;

  // ------------------------------------------------------------------
  // Viridis colormap LUT (256 entries, RGB 0-255)
  // ------------------------------------------------------------------

  var VIRIDIS = (function () {
    // 32 anchor points sampled from matplotlib viridis (dark purple -> teal -> yellow)
    var anchors = [
      [68,1,84],[71,13,96],[72,24,106],[72,35,116],
      [71,46,124],[69,56,130],[66,65,134],[62,74,137],
      [58,84,140],[54,93,141],[50,101,142],[46,109,142],
      [43,117,142],[40,125,142],[37,132,142],[34,140,141],
      [31,148,140],[30,156,137],[32,163,134],[37,171,130],
      [46,179,124],[58,186,118],[72,193,110],[88,199,101],
      [108,205,90],[127,211,78],[147,215,65],[168,219,52],
      [192,223,37],[213,226,26],[234,229,26],[253,231,37]
    ];
    var lut = [];
    for (var i = 0; i < 256; i++) {
      var t = i / 255 * (anchors.length - 1);
      var lo = Math.floor(t);
      var hi = Math.min(lo + 1, anchors.length - 1);
      var frac = t - lo;
      lut.push([
        Math.round(anchors[lo][0] + (anchors[hi][0] - anchors[lo][0]) * frac),
        Math.round(anchors[lo][1] + (anchors[hi][1] - anchors[lo][1]) * frac),
        Math.round(anchors[lo][2] + (anchors[hi][2] - anchors[lo][2]) * frac)
      ]);
    }
    return lut;
  })();

  function viridisRgb(value, vmin, vmax) {
    if (vmax <= vmin) return 'rgb(68,1,84)';
    var t = (value - vmin) / (vmax - vmin);
    t = Math.max(0, Math.min(1, t));
    var idx = Math.round(t * 255);
    var c = VIRIDIS[idx];
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  var state = {
    benchmark: 'libero',
    normalize: false,
    hoverStep: -1
  };

  var dataCache = null;

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------

  function loadData(callback) {
    if (dataCache) {
      callback(dataCache, null);
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', DATA_PATH);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          dataCache = JSON.parse(xhr.responseText);
          callback(dataCache, null);
        } catch (e) {
          callback(null, 'JSON parse error: ' + e.message);
        }
      } else {
        callback(null, 'HTTP error ' + xhr.status + ' loading ' + DATA_PATH);
      }
    };
    xhr.onerror = function () {
      callback(null, 'Network error loading ' + DATA_PATH);
    };
    xhr.send();
  }

  // ------------------------------------------------------------------
  // Tooltip (shared singleton)
  // ------------------------------------------------------------------

  var tooltip = null;

  function getTooltip() {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'viz-tooltip';
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }

  function showTooltip(x, y, html) {
    var tt = getTooltip();
    tt.innerHTML = html;
    tt.classList.add('visible');
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
  }

  function hideTooltip() {
    var tt = getTooltip();
    tt.classList.remove('visible');
  }

  // ------------------------------------------------------------------
  // Build flat row list
  // ------------------------------------------------------------------

  function buildRows(benchData) {
    var rows = [];
    for (var ti = 0; ti < benchData.tokens.length; ti++) {
      var token = benchData.tokens[ti];
      for (var fi = 0; fi < token.features.length; fi++) {
        rows.push({
          tokenLabel: token.label,
          tokenType: token.type,
          featureId: token.features[fi].id,
          activations: token.features[fi].activations,
          isFirstForToken: fi === 0,
          tokenIndex: ti
        });
      }
    }
    return rows;
  }

  // ------------------------------------------------------------------
  // Rendering -- reuses .image-strip and .heatmap-* classes
  // ------------------------------------------------------------------

  function render() {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    loadData(function (allData, err) {
      if (!allData) {
        container.innerHTML = '<p style="color:#e53e3e;font-weight:bold;">Failed to load per-token data: ' + err + '</p>';
        return;
      }

      var benchData = allData[state.benchmark];
      if (!benchData) {
        var foundKeys = Object.keys(allData).join(', ') || '(none)';
        container.innerHTML = '<p style="color:#e53e3e;font-weight:bold;">'
          + 'ERROR: Benchmark key "' + state.benchmark + '" missing from per_token_data.json. '
          + 'Found keys: ' + foundKeys + '</p>';
        return;
      }

      var rows = buildRows(benchData);
      var sampledFrames = benchData.sampled_frame_indices;
      var separatorAfterRow = benchData.separator_after_row;
      var featureColors = benchData.feature_colors;
      var benchConfig = BENCHMARKS[state.benchmark];

      // Compute global max for normalization
      var globalMax = 0;
      if (!state.normalize) {
        for (var gi = 0; gi < rows.length; gi++) {
          var gActs = rows[gi].activations;
          for (var gj = 0; gj < gActs.length; gj++) {
            if (gActs[gj] > globalMax) globalMax = gActs[gj];
          }
        }
        if (globalMax === 0) globalMax = 1;
      }

      var html = '';

      // Benchmark toggle
      html += '<div class="viz-toggle">';
      var benchKeys = ['libero', 'droid'];
      for (var bi = 0; bi < benchKeys.length; bi++) {
        var bk = benchKeys[bi];
        var active = bk === state.benchmark ? ' viz-toggle-btn--active' : '';
        html += '<button class="viz-toggle-btn' + active + '" data-pt-bench="' + bk + '">'
          + BENCHMARKS[bk].label + '</button>';
      }
      html += '</div>';

      // Task label
      html += '<p class="viz-task-label">"' + benchData.task + '" (' + benchData.num_timesteps + ' steps)</p>';

      // Feature legend
      html += '<div class="viz-legend">';
      var sortedFids = Object.keys(featureColors).sort(function (a, b) {
        return parseInt(a) - parseInt(b);
      });
      for (var li = 0; li < sortedFids.length; li++) {
        var fid = sortedFids[li];
        var fcolor = featureColors[fid];
        html += '<div class="viz-legend-item">';
        html += '<span class="viz-legend-swatch" style="background:' + fcolor + '"></span>';
        html += 'F' + fid;
        html += '</div>';
      }
      html += '</div>';

      // Image strip -- reuse .image-strip exactly
      html += '<div class="image-strip">';
      for (var si = 0; si < sampledFrames.length; si++) {
        var fIdx = sampledFrames[si];
        var fPad = String(fIdx);
        while (fPad.length < 3) fPad = '0' + fPad;
        var imgSrc = benchConfig.framePath + '/frame_' + fPad + '.jpg';
        html += '<div class="image-strip-frame" data-pt-frame-idx="' + fIdx + '">';
        html += '<img src="' + imgSrc + '" alt="t=' + fIdx + '" loading="lazy" />';
        html += '<span class="frame-label">t=' + fIdx + '</span>';
        html += '</div>';
      }
      html += '</div>';

      // Heatmap rows -- reuse .heatmap-container / .heatmap-row / .heatmap-label / .heatmap-bar / .heatmap-cell
      var numCells = Math.min(HEATMAP_CELLS, benchData.num_timesteps);

      html += '<div class="heatmap-container" id="pt-heatmap">';
      for (var ri = 0; ri < rows.length; ri++) {
        var row = rows[ri];
        var acts = row.activations;
        var colorKey = String(row.featureId);
        if (!(colorKey in featureColors)) {
          throw new Error('[per-token-viz] Feature ID ' + row.featureId
            + ' not found in featureColors. Keys: ' + Object.keys(featureColors).join(', '));
        }
        var color = featureColors[colorKey];

        // Separator between image and text token sections
        if (ri === separatorAfterRow + 1) {
          html += '<div class="pt-sep"></div>';
        }

        // Compute vmax for this row
        var vmax;
        if (state.normalize) {
          vmax = 0;
          for (var ai = 0; ai < acts.length; ai++) {
            if (acts[ai] > vmax) vmax = acts[ai];
          }
          if (vmax === 0) vmax = 1;
        } else {
          vmax = globalMax;
        }

        // Label: token name on the left, feature ID on the right
        var tokenSpan = row.isFirstForToken
          ? '<span class="pt-token-name">' + row.tokenLabel + '</span>'
          : '<span class="pt-token-name"></span>';
        var fidSpan = '<span class="pt-fid" style="color:' + color + '">F' + row.featureId + '</span>';

        html += '<div class="heatmap-row">';
        html += '<div class="heatmap-label pt-label">' + tokenSpan + fidSpan + '</div>';
        html += '<div class="heatmap-bar">';

        for (var ci = 0; ci < numCells; ci++) {
          var startT = Math.floor(ci * acts.length / numCells);
          var endT = Math.floor((ci + 1) * acts.length / numCells);
          var sum = 0;
          for (var t = startT; t < endT; t++) {
            sum += acts[t];
          }
          var avg = sum / (endT - startT);
          var bgColor = viridisRgb(avg, 0, vmax);

          html += '<div class="heatmap-cell" style="background:' + bgColor + ';"'
            + ' data-pt-token="' + row.tokenLabel + '"'
            + ' data-pt-fid="' + row.featureId + '"'
            + ' data-pt-start="' + startT + '"'
            + ' data-pt-end="' + (endT - 1) + '"'
            + ' data-pt-avg="' + avg.toFixed(4) + '"'
            + '></div>';
        }

        html += '</div></div>';
      }
      html += '</div>';

      // Normalize toggle
      html += '<div class="pt-normalize">';
      html += '<label><input type="checkbox" id="pt-normalize-cb"'
        + (state.normalize ? ' checked' : '') + ' /> Normalize rows</label>';
      html += '</div>';

      container.innerHTML = html;
      attachEvents(container, rows, benchData);
    });
  }

  // ------------------------------------------------------------------
  // Event handlers
  // ------------------------------------------------------------------

  function attachEvents(container, rows, benchData) {
    // Benchmark toggle
    container.addEventListener('click', function (e) {
      var btn = e.target;
      if (btn.hasAttribute('data-pt-bench')) {
        var newBench = btn.getAttribute('data-pt-bench');
        if (newBench !== state.benchmark) {
          state.benchmark = newBench;
          state.hoverStep = -1;
          render();
        }
      }
    });

    // Normalize toggle
    var cb = document.getElementById('pt-normalize-cb');
    if (cb) {
      cb.addEventListener('change', function () {
        state.normalize = cb.checked;
        render();
      });
    }

    // Heatmap cell tooltips
    var cells = container.querySelectorAll('.heatmap-cell');
    for (var i = 0; i < cells.length; i++) {
      cells[i].addEventListener('mouseenter', function (e) {
        var cell = e.target;
        var tokenLabel = cell.getAttribute('data-pt-token');
        var featureId = cell.getAttribute('data-pt-fid');
        var startT = cell.getAttribute('data-pt-start');
        var endT = cell.getAttribute('data-pt-end');
        var avg = cell.getAttribute('data-pt-avg');

        if (!tokenLabel) return; // not a per-token cell

        var stepText = startT === endT ? 't=' + startT : 't=' + startT + '-' + endT;
        var ttHtml = '<strong>' + tokenLabel + '</strong>: F' + featureId
          + '<br>' + stepText
          + '<br>act=' + parseFloat(avg).toFixed(3);
        var rect = cell.getBoundingClientRect();
        showTooltip(rect.left + rect.width / 2, rect.top, ttHtml);
      });
      cells[i].addEventListener('mouseleave', hideTooltip);
    }

    // Cursor line + frame highlight on heatmap hover
    var heatmap = document.getElementById('pt-heatmap');
    if (heatmap) {
      heatmap.addEventListener('mousemove', function (e) {
        // Find the .heatmap-bar under cursor to compute fraction
        var bar = e.target.closest('.heatmap-bar');
        if (!bar) {
          // Maybe hovering on the container between rows
          clearFrameHighlight();
          removeCursorLine();
          return;
        }
        var barRect = bar.getBoundingClientRect();
        var fraction = (e.clientX - barRect.left) / barRect.width;
        fraction = Math.max(0, Math.min(1, fraction));
        var step = Math.round(fraction * (benchData.num_timesteps - 1));

        if (step !== state.hoverStep) {
          state.hoverStep = step;
          highlightNearestFrame(step, benchData.sampled_frame_indices);
        }

        // Draw cursor line on all bars
        updateCursorLines(heatmap, fraction);
      });

      heatmap.addEventListener('mouseleave', function () {
        clearFrameHighlight();
        removeCursorLine();
        state.hoverStep = -1;
      });
    }
  }

  function highlightNearestFrame(step, sampledFrames) {
    clearFrameHighlight();
    var bestIdx = 0;
    var bestDist = Math.abs(step - sampledFrames[0]);
    for (var i = 1; i < sampledFrames.length; i++) {
      var dist = Math.abs(step - sampledFrames[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    var frameEls = document.querySelectorAll('#per-token-viz .image-strip-frame');
    if (frameEls[bestIdx]) {
      frameEls[bestIdx].querySelector('img').style.borderColor = '#d69e2e';
    }
  }

  function clearFrameHighlight() {
    var imgs = document.querySelectorAll('#per-token-viz .image-strip-frame img');
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].style.borderColor = 'transparent';
    }
  }

  function updateCursorLines(heatmap, fraction) {
    removeCursorLine();
    var bars = heatmap.querySelectorAll('.heatmap-bar');
    for (var i = 0; i < bars.length; i++) {
      var line = document.createElement('div');
      line.className = 'pt-cursor-line';
      line.style.position = 'absolute';
      line.style.left = (fraction * 100) + '%';
      line.style.top = '0';
      line.style.bottom = '0';
      line.style.width = '1px';
      line.style.background = 'rgba(255,255,255,0.8)';
      line.style.boxShadow = '0 0 2px rgba(0,0,0,0.5)';
      line.style.pointerEvents = 'none';
      line.style.zIndex = '10';
      bars[i].appendChild(line);
    }
  }

  function removeCursorLine() {
    var existing = document.querySelectorAll('.pt-cursor-line');
    for (var i = 0; i < existing.length; i++) {
      existing[i].parentNode.removeChild(existing[i]);
    }
  }

  // ------------------------------------------------------------------
  // Initialization
  // ------------------------------------------------------------------

  function init() {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) {
      console.error('[per-token-viz] Container #' + CONTAINER_ID + ' not found');
      return;
    }
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
