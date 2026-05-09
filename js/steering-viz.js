/**
 * steering-viz.js -- Interactive steering visualization for DRVLA website
 *
 * Displays side-by-side baseline/steered videos with synced XYZ trajectory
 * charts for two steering features (F128, F1902). SVG charts overlay all
 * tasks for the selected feature; task tabs switch which videos are shown.
 *
 * Self-contained IIFE. Expects:
 *   <div id="steering-viz"></div>
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  var VIDEO_FPS = 10;
  var CHART_W = 280;
  var CHART_H = 160;
  var CHART_PAD = { top: 20, right: 12, bottom: 28, left: 42 };
  var AXIS_LABELS = ['Delta X', 'Delta Y', 'Delta Z'];

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  // Dataset registry: maps dataset key -> { jsonPath, videoDir(fid) -> path-prefix, label }
  var DATASETS = {
    droid: {
      label: 'DROID (real robot)',
      jsonPath: 'data/steering/steering_data_droid.json',
      videoDir: function (fid) { return 'data/steering/f' + fid + '_droid'; },
    },
    libero: {
      label: 'LIBERO (simulation)',
      jsonPath: 'data/steering/steering_data.json',
      videoDir: function (fid) { return 'data/steering/f' + fid; },
    }
  };
  var DATASET_ORDER = ['droid', 'libero'];

  var state = {
    dataset: 'droid',     // default to DROID
    featureId: null,      // resolved on first render from dataset's feature_order[0]
    taskIdx: 0,
    playing: false,
    currentStep: 0,
    speed: 1.0
  };

  // steeringDataByDataset[key] is null until loaded, then the parsed JSON.
  var steeringDataByDataset = { droid: null, libero: null };
  var baselineVideo = null;
  var steeredVideo = null;
  var rafId = null;

  function steeringData() { return steeringDataByDataset[state.dataset]; }

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------

  function loadDataset(dsKey, callback) {
    if (steeringDataByDataset[dsKey]) {
      callback(steeringDataByDataset[dsKey]);
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', DATASETS[dsKey].jsonPath);
    xhr.onload = function () {
      if (xhr.status === 200) {
        var parsed;
        try { parsed = JSON.parse(xhr.responseText); }
        catch (e) { callback(null, 'JSON parse error in ' + dsKey + ': ' + e.message); return; }
        steeringDataByDataset[dsKey] = parsed;
        callback(parsed, null);
      } else {
        callback(null, 'HTTP ' + xhr.status + ' fetching ' + DATASETS[dsKey].jsonPath);
      }
    };
    xhr.onerror = function () { callback(null, 'Network error fetching ' + DATASETS[dsKey].jsonPath); };
    xhr.send();
  }

  // ------------------------------------------------------------------
  // Utility
  // ------------------------------------------------------------------

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function getFeature() {
    var feature = steeringData().features[state.featureId];
    if (feature === undefined) {
      throw new Error(
        '[steering-viz] Unknown featureId "' + state.featureId + '". ' +
        'Valid IDs: ' + Object.keys(steeringData().features).join(', ')
      );
    }
    return feature;
  }

  function getTask() {
    var feature = getFeature();
    var task = feature.tasks[state.taskIdx];
    if (task === undefined) {
      throw new Error(
        '[steering-viz] taskIdx ' + state.taskIdx + ' out of bounds for feature "' +
        state.featureId + '" (has ' + feature.tasks.length + ' tasks).'
      );
    }
    return task;
  }

  function maxStepsForTask(task) {
    return Math.max(task.baseline.eef_delta.length, task.steered.eef_delta.length);
  }

  // ------------------------------------------------------------------
  // Scale computation (global across all tasks for stable y-axes)
  // ------------------------------------------------------------------

  function computeScales(feature, axisIdx) {
    var yMin = Infinity, yMax = -Infinity;
    var maxX = steeringData().max_plot_steps;

    for (var ti = 0; ti < feature.tasks.length; ti++) {
      var task = feature.tasks[ti];
      var arrays = [task.baseline.eef_delta, task.steered.eef_delta];
      for (var ai = 0; ai < arrays.length; ai++) {
        var arr = arrays[ai];
        for (var s = 0; s < arr.length; s++) {
          var v = arr[s][axisIdx];
          if (v < yMin) yMin = v;
          if (v > yMax) yMax = v;
        }
      }
    }

    // Add a 10% margin
    var yRange = yMax - yMin;
    if (yRange < 0.001) yRange = 0.1;
    yMin -= yRange * 0.1;
    yMax += yRange * 0.1;

    var plotW = CHART_W - CHART_PAD.left - CHART_PAD.right;
    var plotH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

    return {
      yMin: yMin,
      yMax: yMax,
      maxX: maxX,
      xScale: function (step) { return CHART_PAD.left + (step / maxX) * plotW; },
      yScale: function (val) { return CHART_PAD.top + (1 - (val - yMin) / (yMax - yMin)) * plotH; }
    };
  }

  // ------------------------------------------------------------------
  // SVG path builder
  // ------------------------------------------------------------------

  function buildPathD(deltaArray, axisIdx, scales) {
    var d = '';
    for (var i = 0; i < deltaArray.length; i++) {
      var x = scales.xScale(i);
      var y = scales.yScale(deltaArray[i][axisIdx]);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }
    return d;
  }

  // ------------------------------------------------------------------
  // SVG chart builder
  // ------------------------------------------------------------------

  function buildChartSVG(axisIdx, feature) {
    var scales = computeScales(feature, axisIdx);
    var plotW = CHART_W - CHART_PAD.left - CHART_PAD.right;
    var plotH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

    var svg = '<svg class="sv-chart" viewBox="0 0 ' + CHART_W + ' ' + CHART_H + '" preserveAspectRatio="xMidYMid meet">';

    // Background
    svg += '<rect x="' + CHART_PAD.left + '" y="' + CHART_PAD.top + '" width="' + plotW + '" height="' + plotH + '" fill="#fafafa" rx="2"/>';

    // Y-axis ticks (5 ticks)
    var nTicks = 5;
    for (var t = 0; t <= nTicks; t++) {
      var yVal = scales.yMin + (scales.yMax - scales.yMin) * (t / nTicks);
      var yPos = scales.yScale(yVal);
      // Grid line
      svg += '<line x1="' + CHART_PAD.left + '" y1="' + yPos.toFixed(1) + '" x2="' + (CHART_PAD.left + plotW) + '" y2="' + yPos.toFixed(1) + '" stroke="#e0e0e0" stroke-width="0.5"/>';
      // Tick label
      svg += '<text x="' + (CHART_PAD.left - 4) + '" y="' + (yPos + 3).toFixed(1) + '" class="sv-tick-label" text-anchor="end">' + yVal.toFixed(2) + '</text>';
    }

    // X-axis ticks
    var xTicks = [0, 50, 100, 150, 200, 250, 300];
    for (var xi = 0; xi < xTicks.length; xi++) {
      var xPos = scales.xScale(xTicks[xi]);
      svg += '<line x1="' + xPos.toFixed(1) + '" y1="' + CHART_PAD.top + '" x2="' + xPos.toFixed(1) + '" y2="' + (CHART_PAD.top + plotH) + '" stroke="#e0e0e0" stroke-width="0.5"/>';
      svg += '<text x="' + xPos.toFixed(1) + '" y="' + (CHART_H - 6) + '" class="sv-tick-label" text-anchor="middle">' + xTicks[xi] + '</text>';
    }

    // Steering onset line (only shown when steering starts after step 0)
    if (feature.start_step > 0) {
      var onsetX = scales.xScale(feature.start_step);
      svg += '<line x1="' + onsetX.toFixed(1) + '" y1="' + CHART_PAD.top + '" x2="' + onsetX.toFixed(1) + '" y2="' + (CHART_PAD.top + plotH) + '" class="sv-onset-line"/>';
      svg += '<text x="' + (onsetX + 2).toFixed(1) + '" y="' + (CHART_PAD.top + 10) + '" class="sv-onset-label">steer</text>';
    }

    // Trajectory paths for each task
    for (var ti = 0; ti < feature.tasks.length; ti++) {
      var task = feature.tasks[ti];
      var color = task.color;

      // Baseline (solid)
      var bPath = buildPathD(task.baseline.eef_delta, axisIdx, scales);
      svg += '<path d="' + bPath + '" class="sv-baseline-path" stroke="' + color + '"/>';

      // Steered (dashed)
      var sPath = buildPathD(task.steered.eef_delta, axisIdx, scales);
      svg += '<path d="' + sPath + '" class="sv-steered-path" stroke="' + color + '"/>';
    }

    // Cursor line (initially hidden)
    svg += '<line x1="' + CHART_PAD.left + '" y1="' + CHART_PAD.top + '" x2="' + CHART_PAD.left + '" y2="' + (CHART_PAD.top + plotH) + '" class="sv-cursor-line" data-axis="' + axisIdx + '" style="display:none"/>';

    // Title
    svg += '<text x="' + (CHART_W / 2) + '" y="14" class="sv-chart-title" text-anchor="middle">' + AXIS_LABELS[axisIdx] + '</text>';

    // Transparent scrub overlay
    svg += '<rect x="' + CHART_PAD.left + '" y="' + CHART_PAD.top + '" width="' + plotW + '" height="' + plotH + '" class="sv-scrub-overlay" data-axis="' + axisIdx + '"/>';

    svg += '</svg>';
    return svg;
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  function renderFeatureToggle(feature) {
    var html = '<div class="viz-toggle sv-feature-toggle">';
    var featureIds = steeringData().feature_order || Object.keys(steeringData().features);
    for (var i = 0; i < featureIds.length; i++) {
      var fid = featureIds[i];
      var f = steeringData().features[fid];
      var isActive = fid === state.featureId;
      var isMem = f.classification === 'memorized';
      var cls = 'viz-toggle-btn';
      if (isActive) cls += isMem ? ' viz-toggle-btn--active-mem' : ' viz-toggle-btn--active';
      html += '<button class="' + cls + '" data-fid="' + fid + '">F' + fid + ' (' + f.short_label + ')</button>';
    }
    html += '</div>';
    return html;
  }

  function renderTaskTabs(feature) {
    var html = '<div class="fv-tabs sv-task-tabs">';
    for (var i = 0; i < feature.tasks.length; i++) {
      var cls = i === state.taskIdx ? 'fv-tab fv-tab--active' : 'fv-tab';
      html += '<button class="' + cls + '" data-task-idx="' + i + '">' + feature.tasks[i].name + '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderDescription(feature) {
    if (!feature.description) return '';
    return '<p class="sv-description">' + feature.description + '</p>';
  }

  function renderDatasetToggle() {
    // Wrapping div is display:block so the inline-flex toggle below sits on
    // its own line, above the feature toggle.
    var html = '<div style="display:block; margin-bottom:12px;">';
    html += '<div class="viz-toggle sv-dataset-toggle">';
    for (var i = 0; i < DATASET_ORDER.length; i++) {
      var k = DATASET_ORDER[i];
      var isActive = k === state.dataset;
      var cls = 'viz-toggle-btn' + (isActive ? ' viz-toggle-btn--active' : '');
      html += '<button class="' + cls + '" data-dataset="' + k + '">' + DATASETS[k].label + '</button>';
    }
    html += '</div></div>';
    return html;
  }

  function renderVideoPair(feature, task) {
    var fid = state.featureId;
    var basePath = DATASETS[state.dataset].videoDir(fid) + '/' + task.id;

    function successTag(s) {
      if (s === null || s === undefined) return '';
      return s ? ' <span class="sv-success">(success)</span>' : ' <span class="sv-fail">(fail)</span>';
    }
    var baseLabel = 'Baseline' + successTag(task.baseline.success);
    var steeredLabel = 'Steered alpha=' + feature.alpha + successTag(task.steered.success);

    var html = '<div class="sv-video-pair">';

    html += '<div class="sv-video-col">';
    html += '<p class="sv-video-label">' + baseLabel + '</p>';
    html += '<video id="sv-baseline-video" muted playsinline data-src="' + basePath + '_baseline.mp4"></video>';
    html += '</div>';

    html += '<div class="sv-video-col">';
    html += '<p class="sv-video-label">' + steeredLabel + '</p>';
    html += '<video id="sv-steered-video" muted playsinline data-src="' + basePath + '_steered.mp4"></video>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  function renderVideoControls() {
    var task = getTask();
    var totalSteps = maxStepsForTask(task);
    var speedLabel = state.speed === 0.5 ? '0.5x' : state.speed === 1 ? '1x' : '2x';

    var html = '<div class="sv-controls">';
    html += '<button class="sv-btn" id="sv-play-btn">' + (state.playing ? 'Pause' : 'Play') + '</button>';
    html += '<button class="sv-btn sv-btn-small" id="sv-speed-btn">' + speedLabel + '</button>';
    html += '<span class="sv-step-label" id="sv-step-label">Step <span id="sv-step-num">0</span> / ' + totalSteps + '</span>';
    html += '</div>';
    return html;
  }

  function renderCharts(feature) {
    var html = '<div class="sv-charts">';
    for (var i = 0; i < 3; i++) {
      html += '<div class="sv-chart-wrapper">' + buildChartSVG(i, feature) + '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderLegend(feature) {
    var html = '<div class="sv-legend">';
    for (var i = 0; i < feature.tasks.length; i++) {
      var t = feature.tasks[i];
      html += '<div class="sv-legend-item">';
      html += '<svg width="36" height="12"><line x1="0" y1="6" x2="14" y2="6" stroke="' + t.color + '" stroke-width="2"/><line x1="20" y1="6" x2="36" y2="6" stroke="' + t.color + '" stroke-width="2" stroke-dasharray="4 2"/></svg>';
      html += '<span>' + t.name + '</span>';
      html += '</div>';
    }
    html += '<div class="sv-legend-item sv-legend-note">';
    html += '<span>solid = baseline, dashed = steered</span>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // ------------------------------------------------------------------
  // Main render
  // ------------------------------------------------------------------

  function render() {
    var container = document.getElementById('steering-viz');
    if (!container) { console.error('[steering-viz] #steering-viz container not found in DOM'); return; }
    if (!steeringData()) { console.error('[steering-viz] render() called before steering data for ' + state.dataset + ' loaded'); return; }
    // Resolve featureId/taskIdx if invalid for the current dataset (e.g. after toggle)
    var allFeatures = steeringData().features;
    if (!state.featureId || !allFeatures[state.featureId]) {
      var featOrder = steeringData().feature_order || Object.keys(allFeatures);
      state.featureId = featOrder[0];
      state.taskIdx = 0;
    } else if (state.taskIdx >= allFeatures[state.featureId].tasks.length) {
      state.taskIdx = 0;
    }

    var feature = getFeature();
    var task = getTask();

    var html = '';
    html += renderDatasetToggle();
    html += renderFeatureToggle(feature);
    html += renderTaskTabs(feature);
    html += renderDescription(feature);
    html += renderVideoPair(feature, task);
    html += renderVideoControls();
    html += renderCharts(feature);
    html += renderLegend(feature);

    container.innerHTML = html;

    attachEventHandlers();
    setupVideoSync();
  }

  // ------------------------------------------------------------------
  // Event handlers
  // ------------------------------------------------------------------

  function attachEventHandlers() {
    var container = document.getElementById('steering-viz');

    // Dataset toggle
    var dsBtns = container.querySelectorAll('.sv-dataset-toggle .viz-toggle-btn');
    for (var di = 0; di < dsBtns.length; di++) {
      dsBtns[di].addEventListener('click', function (e) {
        var newDs = e.target.dataset.dataset;
        if (newDs === state.dataset) return;
        stopPlayback();
        state.dataset = newDs;
        // Reset feature/task — render() will resolve them from the new dataset's order
        state.featureId = null;
        state.taskIdx = 0;
        state.currentStep = 0;
        loadDataset(newDs, function (data, err) {
          if (!data) {
            console.error('[steering-viz] failed loading dataset ' + newDs + ': ' + err);
            return;
          }
          render();
        });
      });
    }

    // Feature toggle
    var featureBtns = container.querySelectorAll('.sv-feature-toggle .viz-toggle-btn');
    for (var fi = 0; fi < featureBtns.length; fi++) {
      featureBtns[fi].addEventListener('click', function (e) {
        var fid = e.target.dataset.fid;
        if (fid !== state.featureId) {
          stopPlayback();
          state.featureId = fid;
          state.taskIdx = 0;
          state.currentStep = 0;
          render();
        }
      });
    }

    // Task tabs
    var taskBtns = container.querySelectorAll('.sv-task-tabs .fv-tab');
    for (var ti = 0; ti < taskBtns.length; ti++) {
      taskBtns[ti].addEventListener('click', function (e) {
        var idx = parseInt(e.target.dataset.taskIdx, 10);
        if (idx !== state.taskIdx) {
          stopPlayback();
          state.taskIdx = idx;
          state.currentStep = 0;
          render();
        }
      });
    }

    // Play/Pause
    var playBtn = document.getElementById('sv-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', togglePlayPause);
    }

    // Speed
    var speedBtn = document.getElementById('sv-speed-btn');
    if (speedBtn) {
      speedBtn.addEventListener('click', cycleSpeed);
    }

    // Chart scrubbing (click/drag + wheel)
    var overlays = container.querySelectorAll('.sv-scrub-overlay');
    for (var oi = 0; oi < overlays.length; oi++) {
      overlays[oi].addEventListener('mousedown', startScrub);
      overlays[oi].addEventListener('touchstart', startScrub, { passive: false });
      overlays[oi].addEventListener('wheel', onChartWheel, { passive: false });
    }
  }

  // ------------------------------------------------------------------
  // Video sync
  // ------------------------------------------------------------------

  function setupVideoSync() {
    baselineVideo = document.getElementById('sv-baseline-video');
    steeredVideo = document.getElementById('sv-steered-video');

    if (!baselineVideo || !steeredVideo) {
      console.error('[steering-viz] Video elements not found after render. baseline=' + baselineVideo + ' steered=' + steeredVideo);
      return;
    }

    // Fetch videos as blobs so the entire file is in memory for instant seeking
    var videos = [baselineVideo, steeredVideo];
    var loaded = 0;
    videos.forEach(function (video) {
      var url = video.dataset.src;
      fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
        // Revoke previous blob URL if any
        if (video._blobUrl) URL.revokeObjectURL(video._blobUrl);
        video._blobUrl = URL.createObjectURL(blob);
        video.src = video._blobUrl;
        video.playbackRate = state.speed;
        loaded++;
        if (loaded === 2) {
          seekToStep(state.currentStep);
        }
      });
    });
  }

  function togglePlayPause() {
    if (!baselineVideo || !steeredVideo) return;

    if (state.playing) {
      stopPlayback();
    } else {
      state.playing = true;
      baselineVideo.play();
      steeredVideo.play();
      rafId = requestAnimationFrame(animLoop);
    }
    updatePlayButton();
  }

  function stopPlayback() {
    state.playing = false;
    if (baselineVideo) baselineVideo.pause();
    if (steeredVideo) steeredVideo.pause();
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    updatePlayButton();
  }

  function updatePlayButton() {
    var btn = document.getElementById('sv-play-btn');
    if (btn) btn.textContent = state.playing ? 'Pause' : 'Play';
  }

  function cycleSpeed() {
    if (state.speed === 0.5) state.speed = 1;
    else if (state.speed === 1) state.speed = 2;
    else state.speed = 0.5;

    if (baselineVideo) baselineVideo.playbackRate = state.speed;
    if (steeredVideo) steeredVideo.playbackRate = state.speed;

    var btn = document.getElementById('sv-speed-btn');
    if (btn) btn.textContent = state.speed === 0.5 ? '0.5x' : state.speed === 1 ? '1x' : '2x';
  }

  function animLoop() {
    if (!state.playing) return;

    if (baselineVideo) {
      var step = Math.floor(baselineVideo.currentTime * VIDEO_FPS);
      var task = getTask();
      var maxStep = maxStepsForTask(task);
      step = clamp(step, 0, maxStep - 1);
      state.currentStep = step;
      updateCursor(step);
    }

    // Check if videos ended
    if (baselineVideo && baselineVideo.ended && steeredVideo && steeredVideo.ended) {
      stopPlayback();
      return;
    }

    rafId = requestAnimationFrame(animLoop);
  }

  function seekToStep(step) {
    var task = getTask();
    var maxStep = maxStepsForTask(task);
    step = clamp(step, 0, maxStep - 1);
    state.currentStep = step;

    var time = step / VIDEO_FPS;
    if (baselineVideo) baselineVideo.currentTime = time;
    if (steeredVideo) steeredVideo.currentTime = time;

    updateCursor(step);
  }

  function updateCursor(step) {
    var feature = getFeature();

    // Update step label
    var stepNum = document.getElementById('sv-step-num');
    if (stepNum) stepNum.textContent = step;

    // Update cursor lines on all charts
    var cursors = document.querySelectorAll('.sv-cursor-line');
    for (var ci = 0; ci < cursors.length; ci++) {
      var cursor = cursors[ci];
      var axisIdx = parseInt(cursor.dataset.axis, 10);
      var scales = computeScales(feature, axisIdx);
      var x = scales.xScale(step);
      cursor.setAttribute('x1', x.toFixed(1));
      cursor.setAttribute('x2', x.toFixed(1));
      cursor.style.display = '';
    }
  }

  // ------------------------------------------------------------------
  // Chart scrubbing
  // ------------------------------------------------------------------

  function startScrub(e) {
    e.preventDefault();
    stopPlayback();

    var overlay = e.currentTarget;
    var svg = overlay.closest('svg');
    var feature = getFeature();
    var axisIdx = parseInt(overlay.dataset.axis, 10);
    var scales = computeScales(feature, axisIdx);

    function getStepFromEvent(ev) {
      var pt = svg.createSVGPoint();
      var clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      var clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      pt.x = clientX;
      pt.y = clientY;
      var svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
      var plotW = CHART_W - CHART_PAD.left - CHART_PAD.right;
      var ratio = (svgPt.x - CHART_PAD.left) / plotW;
      return Math.round(clamp(ratio, 0, 1) * scales.maxX);
    }

    var step = getStepFromEvent(e);
    seekToStep(step);

    function onMove(ev) {
      ev.preventDefault();
      var s = getStepFromEvent(ev);
      seekToStep(s);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  function onChartWheel(e) {
    e.preventDefault();
    stopPlayback();
    // Scroll up (negative deltaY) = step forward, scroll down = step backward
    var delta = e.deltaY > 0 ? -3 : 3;
    var newStep = state.currentStep + delta;
    var task = getTask();
    var maxStep = maxStepsForTask(task);
    seekToStep(clamp(newStep, 0, maxStep - 1));
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------

  function init() {
    var container = document.getElementById('steering-viz');
    if (!container) return;

    // Load the default dataset first; preload the other in the background so
    // toggling is instant.
    loadDataset(state.dataset, function (data, err) {
      if (!data) {
        console.error('[steering-viz] ' + err);
        container.innerHTML = '<p style="color: #e53e3e;">Failed to load steering data (' + state.dataset + '): ' + (err || 'unknown error') + '</p>';
        return;
      }
      render();
      // Prefetch the other dataset
      for (var i = 0; i < DATASET_ORDER.length; i++) {
        var k = DATASET_ORDER[i];
        if (k !== state.dataset) loadDataset(k, function () {});
      }
    });
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
