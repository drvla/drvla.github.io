/**
 * manual-heatmap-viz.js -- Interactive token-feature heatmap viewer
 *
 * Self-contained IIFE. Expects:
 *   <div id="manual-heatmap-viz"></div>
 *
 * Groups rows by feature (each feature group shows all selected tokens).
 * Separators between feature groups. Single fixed DROID dataset.
 * Uses mh- CSS class prefix to avoid collision with pt- classes.
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  var CONTAINER_ID = 'manual-heatmap-viz';
  var DATA_PATH = 'data/per_token/manual_heatmap_data.json';
  var FRAME_PATH = 'data/per_token/manual_heatmap';

  var HEATMAP_CELLS = 60;

  // ------------------------------------------------------------------
  // Viridis colormap LUT (256 entries, RGB 0-255)
  // ------------------------------------------------------------------

  var VIRIDIS = (function () {
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
    if (vmax <= vmin) {
      console.error('[manual-heatmap-viz] viridisRgb called with vmax (' + vmax + ') <= vmin (' + vmin + ')');
      return 'rgb(68,1,84)';
    }
    var t = (value - vmin) / (vmax - vmin);
    t = Math.max(0, Math.min(1, t));
    var idx = Math.round(t * 255);
    var c = VIRIDIS[idx];
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  // ------------------------------------------------------------------
  // Feature color palette
  // ------------------------------------------------------------------

  var FEATURE_COLORS = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
  ];

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  var state = {
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
  // Rendering
  // ------------------------------------------------------------------

  function render() {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) {
      console.error('[manual-heatmap-viz] render() called but container #' + CONTAINER_ID + ' not found in DOM');
      return;
    }

    loadData(function (data, err) {
      if (!data) {
        container.innerHTML = '<p style="color:#e53e3e;font-weight:bold;">Failed to load manual heatmap data: ' + err + '</p>';
        return;
      }

      // Validate required fields
      var requiredFields = ['rows', 'sampled_frame_indices', 'separator_after_rows', 'feature_ids', 'task', 'num_timesteps'];
      for (var fi = 0; fi < requiredFields.length; fi++) {
        if (!(requiredFields[fi] in data)) {
          var msg = 'Missing required field in heatmap JSON: ' + requiredFields[fi];
          container.innerHTML = '<p style="color:#e53e3e;font-weight:bold;">' + msg + '</p>';
          console.error('[manual-heatmap-viz] ' + msg);
          return;
        }
      }

      var rows = data.rows;
      var sampledFrames = data.sampled_frame_indices;
      var separatorAfterRows = data.separator_after_rows;
      var featureIds = data.feature_ids;

      // Assign colors to feature IDs
      var featureColors = {};
      for (var fi = 0; fi < featureIds.length; fi++) {
        featureColors[featureIds[fi]] = FEATURE_COLORS[fi % FEATURE_COLORS.length];
      }

      var html = '';

      // Task label
      html += '<p class="viz-task-label">"' + data.task + '" (' + data.num_timesteps + ' steps)</p>';

      // Feature legend
      html += '<div class="viz-legend">';
      for (var li = 0; li < featureIds.length; li++) {
        var fid = featureIds[li];
        var fcolor = featureColors[fid];
        html += '<div class="viz-legend-item">';
        html += '<span class="viz-legend-swatch" style="background:' + fcolor + '"></span>';
        html += 'F' + fid;
        html += '</div>';
      }
      html += '</div>';

      // Image strip
      html += '<div class="image-strip mh-image-strip">';
      for (var si = 0; si < sampledFrames.length; si++) {
        var fIdx = sampledFrames[si];
        var fPad = String(fIdx);
        while (fPad.length < 3) fPad = '0' + fPad;
        var imgSrc = FRAME_PATH + '/frame_' + fPad + '.jpg';
        html += '<div class="image-strip-frame" data-mh-frame-idx="' + fIdx + '">';
        html += '<img src="' + imgSrc + '" alt="t=' + fIdx + '" loading="lazy" />';
        html += '<span class="frame-label">t=' + fIdx + '</span>';
        html += '</div>';
      }
      html += '</div>';

      // Compute vmax per feature (all rows with the same feature share one max)
      var featureVmax = {};
      for (var vi = 0; vi < rows.length; vi++) {
        var vFid = rows[vi].feature_id;
        var vActs = rows[vi].activations;
        if (!(vFid in featureVmax)) featureVmax[vFid] = 0;
        for (var vj = 0; vj < vActs.length; vj++) {
          if (vActs[vj] > featureVmax[vFid]) featureVmax[vFid] = vActs[vj];
        }
      }
      for (var vk in featureVmax) {
        if (featureVmax[vk] === 0) featureVmax[vk] = 1;
      }

      // Heatmap rows
      var numCells = Math.min(HEATMAP_CELLS, data.num_timesteps);

      html += '<div class="heatmap-container" id="mh-heatmap">';
      for (var ri = 0; ri < rows.length; ri++) {
        var row = rows[ri];
        var acts = row.activations;
        var color = featureColors[row.feature_id];

        // Separator between feature groups
        if (separatorAfterRows.indexOf(ri - 1) !== -1 && ri > 0) {
          html += '<div class="mh-sep"></div>';
        }

        var vmax = featureVmax[row.feature_id];

        // Label: token name + feature ID (both always visible)
        var tokenSpan = '<span class="mh-token-name">' + row.token_label + '</span>';
        var fidSpan = '<span class="mh-fid" style="color:' + color + '">F' + row.feature_id + '</span>';

        html += '<div class="heatmap-row">';
        html += '<div class="heatmap-label mh-label">' + tokenSpan + fidSpan + '</div>';
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
            + ' data-mh-token="' + row.token_label + '"'
            + ' data-mh-fid="' + row.feature_id + '"'
            + ' data-mh-start="' + startT + '"'
            + ' data-mh-end="' + (endT - 1) + '"'
            + ' data-mh-avg="' + avg.toFixed(4) + '"'
            + '></div>';
        }

        html += '</div></div>';
      }
      html += '</div>';

      container.innerHTML = html;
      attachEvents(container, rows, data);
    });
  }

  // ------------------------------------------------------------------
  // Event handlers
  // ------------------------------------------------------------------

  function attachEvents(container, rows, data) {
    // Heatmap cell tooltips
    var cells = container.querySelectorAll('#mh-heatmap .heatmap-cell');
    for (var i = 0; i < cells.length; i++) {
      cells[i].addEventListener('mouseenter', function (e) {
        var cell = e.target;
        var tokenLabel = cell.getAttribute('data-mh-token');
        var featureId = cell.getAttribute('data-mh-fid');
        var startT = cell.getAttribute('data-mh-start');
        var endT = cell.getAttribute('data-mh-end');
        var avg = cell.getAttribute('data-mh-avg');

        if (!tokenLabel) return;

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
    var heatmap = document.getElementById('mh-heatmap');
    if (heatmap) {
      heatmap.addEventListener('mousemove', function (e) {
        var bar = e.target.closest('.heatmap-bar');
        if (!bar) {
          clearFrameHighlight();
          removeCursorLine();
          return;
        }
        var barRect = bar.getBoundingClientRect();
        var fraction = (e.clientX - barRect.left) / barRect.width;
        fraction = Math.max(0, Math.min(1, fraction));
        var step = Math.round(fraction * (data.num_timesteps - 1));

        if (step !== state.hoverStep) {
          state.hoverStep = step;
          highlightNearestFrame(step, data.sampled_frame_indices);
        }

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
    var frameEls = document.querySelectorAll('#' + CONTAINER_ID + ' .image-strip-frame');
    if (frameEls[bestIdx]) {
      frameEls[bestIdx].querySelector('img').style.borderColor = '#d69e2e';
    }
  }

  function clearFrameHighlight() {
    var imgs = document.querySelectorAll('#' + CONTAINER_ID + ' .image-strip-frame img');
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].style.borderColor = 'transparent';
    }
  }

  function updateCursorLines(heatmap, fraction) {
    removeCursorLine();
    var bars = heatmap.querySelectorAll('.heatmap-bar');
    for (var i = 0; i < bars.length; i++) {
      var line = document.createElement('div');
      line.className = 'mh-cursor-line';
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
    var existing = document.querySelectorAll('.mh-cursor-line');
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
      console.error('[manual-heatmap-viz] Container #' + CONTAINER_ID + ' not found');
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
