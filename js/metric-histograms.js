/**
 * metric-histograms.js -- Interactive metric histograms for the Feature Classification section
 *
 * Renders a 3-row x 4-col grid of SVG histograms (LIBERO / DROID / OpenVLA x 4 metrics).
 * Each histogram shows bar chart, mean/median lines, and tooltips on hover.
 * A toggle switches between models (rows). Clicking a bar shows the count.
 *
 * Self-contained IIFE -- expects a <div id="metric-histograms-container"> in the page.
 */

(function () {
  'use strict';

  var DATA_URL = 'data/features/metric_histograms.json';

  // Layout
  var CHART_W = 240;
  var CHART_H = 150;
  var PAD = { top: 8, right: 12, bottom: 38, left: 46 };
  var INNER_W = CHART_W - PAD.left - PAD.right;
  var INNER_H = CHART_H - PAD.top - PAD.bottom;

  var MODEL_ORDER = ['LIBERO', 'DROID', 'OpenVLA'];
  var METRIC_ORDER = ['episode_coverage', 'mean_onset_count', 'mean_active_act_magnitude', 'mean_relative_run_length'];
  var METRIC_LABELS = {
    episode_coverage: 'Episode Coverage',
    mean_onset_count: 'Mean Onset Count',
    mean_active_act_magnitude: 'Mean Activation Magnitude',
    mean_relative_run_length: 'Relative Run Length'
  };

  // State
  var container = null;
  var vizData = null;
  var tooltip = null;

  // ── Tooltip ──────────────────────────────────────────────────────────────

  function getTooltip() {
    if (!tooltip) {
      tooltip = document.querySelector('.viz-tooltip');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'viz-tooltip';
        document.body.appendChild(tooltip);
      }
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

  // ── SVG Helpers ──────────────────────────────────────────────────────────

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (var k in attrs) {
        el.setAttribute(k, attrs[k]);
      }
    }
    return el;
  }

  function fmtNum(v, d) {
    return Number(v).toFixed(d);
  }

  // ── Axis tick helpers ────────────────────────────────────────────────────

  function niceTicksX(min, max, count) {
    var range = max - min;
    if (range === 0) return [min];
    var step = range / (count - 1);
    // Round step to nice number
    var mag = Math.pow(10, Math.floor(Math.log10(step)));
    var residual = step / mag;
    var niceStep;
    if (residual <= 1.5) niceStep = 1 * mag;
    else if (residual <= 3) niceStep = 2 * mag;
    else if (residual <= 7) niceStep = 5 * mag;
    else niceStep = 10 * mag;

    var ticks = [];
    var start = Math.ceil(min / niceStep) * niceStep;
    for (var v = start; v <= max + niceStep * 0.001; v += niceStep) {
      ticks.push(v);
    }
    return ticks;
  }

  function niceTicksY(max, count) {
    if (max === 0) return [0];
    var step = max / count;
    var mag = Math.pow(10, Math.floor(Math.log10(step)));
    var residual = step / mag;
    var niceStep;
    if (residual <= 1.5) niceStep = 1 * mag;
    else if (residual <= 3) niceStep = 2 * mag;
    else if (residual <= 7) niceStep = 5 * mag;
    else niceStep = 10 * mag;

    var ticks = [];
    for (var v = 0; v <= max; v += niceStep) {
      ticks.push(Math.round(v));
    }
    if (ticks[ticks.length - 1] < max) {
      ticks.push(ticks[ticks.length - 1] + Math.round(niceStep));
    }
    return ticks;
  }

  // ── Render one histogram as SVG DOM element ──────────────────────────────

  function renderHistogramSVG(histData, color, metricKey, modelName, isTopRow) {
    var counts = histData.counts;
    var edges = histData.bin_edges;
    var meanVal = histData.mean;
    var medianVal = histData.median;
    var nBins = counts.length;

    var xMin = edges[0];
    var xMax = edges[edges.length - 1];
    var xRange = xMax - xMin;
    if (xRange === 0) xRange = 1;

    var yMax = 0;
    for (var i = 0; i < nBins; i++) {
      if (counts[i] > yMax) yMax = counts[i];
    }
    if (yMax === 0) yMax = 1;
    // Add 10% headroom
    var yLimit = Math.ceil(yMax * 1.1);

    function xScale(v) { return PAD.left + ((v - xMin) / xRange) * INNER_W; }
    function yScale(v) { return PAD.top + INNER_H - (v / yLimit) * INNER_H; }

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + CHART_W + ' ' + CHART_H,
      width: '100%',
      style: 'max-width:' + CHART_W + 'px;display:block;'
    });

    // Background
    svg.appendChild(svgEl('rect', {
      x: 0, y: 0, width: CHART_W, height: CHART_H,
      fill: 'transparent'
    }));

    // Y-axis line
    svg.appendChild(svgEl('line', {
      x1: PAD.left, y1: PAD.top,
      x2: PAD.left, y2: PAD.top + INNER_H,
      stroke: '#ccc', 'stroke-width': 1
    }));

    // X-axis line
    svg.appendChild(svgEl('line', {
      x1: PAD.left, y1: PAD.top + INNER_H,
      x2: PAD.left + INNER_W, y2: PAD.top + INNER_H,
      stroke: '#ccc', 'stroke-width': 1
    }));

    // Y ticks
    var yTicks = niceTicksY(yLimit, 4);
    for (var yi = 0; yi < yTicks.length; yi++) {
      var yy = yScale(yTicks[yi]);
      // Grid line
      svg.appendChild(svgEl('line', {
        x1: PAD.left, y1: yy,
        x2: PAD.left + INNER_W, y2: yy,
        stroke: '#eee', 'stroke-width': 0.5
      }));
      // Label
      var yLabel = svgEl('text', {
        x: PAD.left - 4, y: yy + 3,
        'text-anchor': 'end',
        'font-size': '8', fill: '#888',
        'font-family': 'var(--font)'
      });
      yLabel.textContent = yTicks[yi];
      svg.appendChild(yLabel);
    }

    // X ticks
    var xTicks = niceTicksX(xMin, xMax, 5);
    for (var xi = 0; xi < xTicks.length; xi++) {
      var xx = xScale(xTicks[xi]);
      if (xx < PAD.left || xx > PAD.left + INNER_W) continue;
      var xLabel = svgEl('text', {
        x: xx, y: PAD.top + INNER_H + 12,
        'text-anchor': 'middle',
        'font-size': '8', fill: '#888',
        'font-family': 'var(--font)'
      });
      // Format: drop trailing zeros for clean display
      var xText = xTicks[xi] % 1 === 0 ? String(xTicks[xi]) : fmtNum(xTicks[xi], 2);
      xLabel.textContent = xText;
      svg.appendChild(xLabel);
    }

    // X-axis label
    var xAxisLabel = svgEl('text', {
      x: PAD.left + INNER_W / 2, y: CHART_H - 2,
      'text-anchor': 'middle',
      'font-size': '9', fill: '#666',
      'font-family': 'var(--font)'
    });
    xAxisLabel.textContent = METRIC_LABELS[metricKey];
    svg.appendChild(xAxisLabel);

    // Column title (only on top row)
    if (isTopRow) {
      var title = svgEl('text', {
        x: PAD.left + INNER_W / 2, y: PAD.top - 1,
        'text-anchor': 'middle',
        'font-size': '10', fill: 'var(--text)',
        'font-family': 'var(--font)',
        'font-weight': '700'
      });
      title.textContent = METRIC_LABELS[metricKey];
      svg.appendChild(title);
    }

    // Bars
    for (var bi = 0; bi < nBins; bi++) {
      var bx = xScale(edges[bi]);
      var bw = xScale(edges[bi + 1]) - bx;
      var bh = (counts[bi] / yLimit) * INNER_H;
      var by = PAD.top + INNER_H - bh;

      var bar = svgEl('rect', {
        x: bx, y: by, width: Math.max(bw - 0.5, 0.5), height: bh,
        fill: color, opacity: '0.85',
        'data-count': counts[bi],
        'data-lo': fmtNum(edges[bi], 3),
        'data-hi': fmtNum(edges[bi + 1], 3)
      });
      bar.style.cursor = 'pointer';
      bar.style.transition = 'opacity 0.1s';

      (function (b) {
        b.addEventListener('mouseenter', function (e) {
          b.setAttribute('opacity', '1');
          var rect = b.getBoundingClientRect();
          var html = '<strong>' + modelName + '</strong><br>'
            + METRIC_LABELS[metricKey] + ': ' + b.dataset.lo + ' - ' + b.dataset.hi + '<br>'
            + 'Count: <strong>' + b.dataset.count + '</strong>';
          showTooltip(rect.left + rect.width / 2, rect.top, html);
        });
        b.addEventListener('mouseleave', function () {
          b.setAttribute('opacity', '0.85');
          hideTooltip();
        });
      })(bar);

      svg.appendChild(bar);
    }

    // Mean line
    var meanX = xScale(meanVal);
    svg.appendChild(svgEl('line', {
      x1: meanX, y1: PAD.top,
      x2: meanX, y2: PAD.top + INNER_H,
      stroke: '#333', 'stroke-width': 1.5,
      'stroke-dasharray': '6 3'
    }));

    // Median line
    var medianX = xScale(medianVal);
    svg.appendChild(svgEl('line', {
      x1: medianX, y1: PAD.top,
      x2: medianX, y2: PAD.top + INNER_H,
      stroke: '#333', 'stroke-width': 1.5,
      'stroke-dasharray': '2 2'
    }));

    // Legend (mean + median text)
    var legendY = PAD.top + 10;
    var legendX = PAD.left + INNER_W - 2;

    // Mean text
    var meanText = svgEl('text', {
      x: legendX, y: legendY,
      'text-anchor': 'end',
      'font-size': '7.5', fill: '#555',
      'font-family': 'var(--font)'
    });
    meanText.textContent = '--- Mean: ' + fmtNum(meanVal, 3);
    svg.appendChild(meanText);

    // Median text
    var medText = svgEl('text', {
      x: legendX, y: legendY + 10,
      'text-anchor': 'end',
      'font-size': '7.5', fill: '#555',
      'font-family': 'var(--font)'
    });
    medText.textContent = '... Median: ' + fmtNum(medianVal, 3);
    svg.appendChild(medText);

    return svg;
  }

  // ── Full render ──────────────────────────────────────────────────────────

  function render() {
    if (!container || !vizData) return;

    container.innerHTML = '';

    var grid = document.createElement('div');
    grid.className = 'mh-grid';
    container.appendChild(grid);

    for (var ri = 0; ri < MODEL_ORDER.length; ri++) {
      var modelName = MODEL_ORDER[ri];
      var modelData = vizData.models[modelName];
      if (!modelData) continue;

      // Row label
      var rowLabel = document.createElement('div');
      rowLabel.className = 'mh-row-label';
      rowLabel.textContent = modelName;
      grid.appendChild(rowLabel);

      // 4 charts
      for (var ci = 0; ci < METRIC_ORDER.length; ci++) {
        var metricKey = METRIC_ORDER[ci];
        var histData = modelData.histograms[metricKey];
        if (!histData) continue;

        var cell = document.createElement('div');
        cell.className = 'mh-cell';

        var svg = renderHistogramSVG(
          histData, modelData.color, metricKey, modelName, ri === 0
        );
        cell.appendChild(svg);
        grid.appendChild(cell);
      }
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  function init() {
    container = document.getElementById('metric-histograms-container');
    if (!container) return;

    container.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div><p>Loading histogram data...</p></div>';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', DATA_URL);
    xhr.onload = function () {
      if (xhr.status === 200) {
        vizData = JSON.parse(xhr.responseText);
        render();
      } else {
        container.innerHTML = '<p style="color:#e53e3e;">Failed to load histogram data.</p>';
      }
    };
    xhr.onerror = function () {
      container.innerHTML = '<p style="color:#e53e3e;">Network error loading histogram data.</p>';
    };
    xhr.send();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
