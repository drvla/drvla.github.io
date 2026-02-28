/**
 * activation-viz.js -- Interactive activation visualization for DRVLA website
 *
 * Renders image strip + heatmap bars for SAE feature activations.
 * Single container with LIBERO/DROID benchmark toggle and episode tabs.
 *
 * Self-contained IIFE. Expects:
 *   <div id="activation-viz"></div>
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  var RAW_COLORS = ['#3478f6', '#e53e3e', '#38a169', '#d69e2e'];

  var HEATMAP_CELLS = 40; // number of cells per heatmap bar

  var BENCHMARKS = {
    libero: {
      label: 'LIBERO',
      episodes: [100, 745, 1000, 5],
      basePath: 'data/activations/libero'
    },
    droid: {
      label: 'DROID',
      episodes: [1437, 1125, 976, 1183],
      basePath: 'data/activations/droid'
    }
  };

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------

  var dataCache = {};

  function loadTraceData(benchmark, episodeId, callback) {
    var key = benchmark + '_' + episodeId;
    if (dataCache[key]) {
      callback(dataCache[key]);
      return;
    }
    var url = BENCHMARKS[benchmark].basePath + '/ep' + episodeId + '_traces.json';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.onload = function () {
      if (xhr.status === 200) {
        var data = JSON.parse(xhr.responseText);
        dataCache[key] = data;
        callback(data);
      } else {
        callback(null);
      }
    };
    xhr.onerror = function () { callback(null); };
    xhr.send();
  }

  // ------------------------------------------------------------------
  // Shared tooltip
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
  // Utility
  // ------------------------------------------------------------------

  function maxVal(arr) {
    var m = 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] > m) m = arr[i];
    }
    return m;
  }

  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return r + ', ' + g + ', ' + b;
  }

  // ------------------------------------------------------------------
  // Image Strip + Heatmap Renderer
  // ------------------------------------------------------------------

  function renderImageStrip(container, data, benchmark) {
    var basePath = BENCHMARKS[benchmark].basePath;
    var epId = data.episode_id;
    var featureKeys = Object.keys(data.features);
    var sampledFrames = data.sampled_frames;
    var numFrames = sampledFrames.length;

    // Image strip (main camera) -- images fill width equally
    var stripHTML = '<div class="image-strip">';
    for (var i = 0; i < numFrames; i++) {
      var fIdx = sampledFrames[i];
      var framePad = String(fIdx);
      while (framePad.length < 3) framePad = '0' + framePad;
      var imgSrc = basePath + '/ep' + epId + '/frame_' + framePad + '_main.jpg';
      stripHTML += '<div class="image-strip-frame" data-frame-idx="' + fIdx + '">';
      stripHTML += '<img src="' + imgSrc + '" alt="Frame ' + fIdx + '" loading="lazy" />';
      stripHTML += '<span class="frame-label">t=' + fIdx + '</span>';
      stripHTML += '</div>';
    }
    stripHTML += '</div>';

    // Heatmap bars with higher resolution
    var numCells = Math.min(HEATMAP_CELLS, data.length);
    var heatmapHTML = '<div class="heatmap-container">';
    for (var fi = 0; fi < featureKeys.length; fi++) {
      var fKey = featureKeys[fi];
      var feat = data.features[fKey];
      var values = feat.values;
      var fMax = maxVal(values);
      if (fMax === 0) fMax = 1;

      heatmapHTML += '<div class="heatmap-row">';
      heatmapHTML += '<div class="heatmap-label" style="color:' + RAW_COLORS[fi] + '">F' + fKey + '</div>';
      heatmapHTML += '<div class="heatmap-bar">';

      // Create evenly-spaced cells across the episode
      for (var ci = 0; ci < numCells; ci++) {
        var start = Math.floor(ci * data.length / numCells);
        var end = Math.floor((ci + 1) * data.length / numCells);

        // Average activation in this segment
        var sum = 0;
        var count = 0;
        for (var t = start; t < end; t++) {
          sum += values[t];
          count++;
        }
        var avg = count > 0 ? sum / count : 0;
        var intensity = avg / fMax;

        var bgColor = 'rgba(' + hexToRgb(RAW_COLORS[fi]) + ', ' + intensity.toFixed(3) + ')';
        heatmapHTML += '<div class="heatmap-cell" style="background:' + bgColor + ';" '
          + 'data-feature="' + fKey + '" data-label="' + feat.label + '" '
          + 'data-start="' + start + '" data-end="' + (end - 1) + '" '
          + 'data-avg="' + avg.toFixed(4) + '" data-fi="' + fi + '"></div>';
      }

      heatmapHTML += '</div></div>';
    }
    heatmapHTML += '</div>';

    container.innerHTML = stripHTML + heatmapHTML;

    // Tooltip on heatmap cells
    var cells = container.querySelectorAll('.heatmap-cell');
    for (var ci2 = 0; ci2 < cells.length; ci2++) {
      cells[ci2].addEventListener('mouseenter', function (e) {
        var cell = e.target;
        var html = '<strong style="color:' + RAW_COLORS[parseInt(cell.dataset.fi, 10)] + '">F' + cell.dataset.feature + ' (' + cell.dataset.label + ')</strong><br>'
          + 'Steps ' + cell.dataset.start + '-' + cell.dataset.end + '<br>'
          + 'Avg: ' + cell.dataset.avg;
        var rect = cell.getBoundingClientRect();
        showTooltip(rect.left + rect.width / 2, rect.top, html);
      });
      cells[ci2].addEventListener('mouseleave', hideTooltip);
    }
  }

  // ------------------------------------------------------------------
  // Main Panel Controller
  // ------------------------------------------------------------------

  function init() {
    var container = document.getElementById('activation-viz');
    if (!container) return;

    var state = {
      benchmark: 'libero',
      episodeIdx: 0
    };

    function render() {
      var config = BENCHMARKS[state.benchmark];
      var ep = config.episodes[state.episodeIdx];

      var html = '';

      // Benchmark toggle (LIBERO / DROID)
      html += '<div class="viz-toggle">';
      var benchKeys = ['libero', 'droid'];
      for (var bi = 0; bi < benchKeys.length; bi++) {
        var bk = benchKeys[bi];
        var active = bk === state.benchmark ? ' viz-toggle-btn--active' : '';
        html += '<button class="viz-toggle-btn' + active + '" data-bench="' + bk + '">' + BENCHMARKS[bk].label + '</button>';
      }
      html += '</div>';

      // Episode tabs
      html += '<div class="viz-episode-tabs">';
      for (var i = 0; i < config.episodes.length; i++) {
        var cls = i === state.episodeIdx ? 'viz-ep-tab viz-ep-tab--active' : 'viz-ep-tab';
        html += '<button class="' + cls + '" data-ep-idx="' + i + '">Episode ' + config.episodes[i] + '</button>';
      }
      html += '</div>';

      // Content area
      html += '<div id="viz-content">';
      html += '<div class="viz-loading"><div class="spinner"></div><p>Loading episode data...</p></div>';
      html += '</div>';

      container.innerHTML = html;

      // Attach benchmark toggle handlers
      var benchBtns = container.querySelectorAll('.viz-toggle-btn');
      for (var ti = 0; ti < benchBtns.length; ti++) {
        benchBtns[ti].addEventListener('click', function (e) {
          var newBench = e.target.dataset.bench;
          if (newBench !== state.benchmark) {
            state.benchmark = newBench;
            state.episodeIdx = 0;
            render();
          }
        });
      }

      // Attach episode tab handlers
      var epTabs = container.querySelectorAll('.viz-ep-tab');
      for (var ei = 0; ei < epTabs.length; ei++) {
        epTabs[ei].addEventListener('click', function (e) {
          var newIdx = parseInt(e.target.dataset.epIdx, 10);
          if (newIdx !== state.episodeIdx) {
            state.episodeIdx = newIdx;
            render();
          }
        });
      }

      // Load data and render content
      loadTraceData(state.benchmark, ep, function (data) {
        var contentDiv = document.getElementById('viz-content');
        if (!contentDiv) return;

        if (!data) {
          contentDiv.innerHTML = '<p style="color: #e53e3e;">Failed to load episode data.</p>';
          return;
        }

        // Task label + legend
        var featureKeys = Object.keys(data.features);
        var preHTML = '<p class="viz-task-label">Task: "' + data.task + '" (' + data.length + ' steps)</p>';
        preHTML += '<div class="viz-legend">';
        for (var fi = 0; fi < featureKeys.length; fi++) {
          var fKey = featureKeys[fi];
          var feat = data.features[fKey];
          preHTML += '<div class="viz-legend-item">';
          preHTML += '<span class="viz-legend-swatch" style="background:' + RAW_COLORS[fi] + '"></span>';
          preHTML += 'F' + fKey + ' (' + feat.label + ')';
          preHTML += '</div>';
        }
        preHTML += '</div>';

        contentDiv.innerHTML = preHTML + '<div id="viz-render"></div>';

        var renderTarget = document.getElementById('viz-render');
        renderImageStrip(renderTarget, data, state.benchmark);
      });
    }

    render();
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
