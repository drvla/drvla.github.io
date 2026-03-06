/**
 * feature-browser.js -- Feature browser with search, sort, filter, and pagination
 *
 * Loads feature metadata from data/features/pg5_metadata.json, then renders
 * a searchable, sortable, filterable grid of feature cards with expand/collapse
 * detail views including activation histograms.
 *
 * Self-contained IIFE -- expects a <div id="feature-browser-container"> in the page.
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Constants
  // ------------------------------------------------------------------

  const PAGE_SIZE = 24;
  const DEBOUNCE_MS = 300;
  const METADATA_URL = 'data/features/pg5_metadata.json';

  // Histogram bin edges (we skip the zero/near-zero bin)
  const HIST_BIN_EDGES = [0.001, 0.01, 0.1, 1, 2, 5, 10, 20, 50, 100];

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  const state = {
    features: [],       // all features from JSON
    filtered: [],       // after search / filter / sort
    sortBy: 'coverage',
    filterBy: 'all',    // 'all' | 'general' | 'memorized'
    searchQuery: '',
    page: 0,
    expandedId: null,
    expandedEpisodeId: null,  // which episode is expanded within the expanded feature
    loading: true,
    error: null
  };

  let container = null;

  // ------------------------------------------------------------------
  // Utility helpers
  // ------------------------------------------------------------------

  function fmt(v, d) {
    return Number(v).toFixed(d);
  }

  function pct(v) {
    return (v * 100).toFixed(1) + '%';
  }

  /**
   * Simple debounce wrapper.
   */
  function debounce(fn, ms) {
    let timer = null;
    return function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(ctx, args), ms);
    };
  }

  /**
   * Build an image path for a feature episode thumbnail.
   */
  function thumbPath(featureId, episodeId, timestep, camera) {
    return `data/features/images/${featureId}/ep${episodeId}_t${timestep}_${camera}.png`;
  }

  // ------------------------------------------------------------------
  // Browser trace cache and loader
  // ------------------------------------------------------------------

  const HEATMAP_CELLS = 40;
  const BROWSER_TRACE_BASE = 'data/features/traces/libero';
  const BROWSER_FRAMES_BASE = 'data/features/browser_frames/libero';
  const ACCENT_COLOR = '#3478f6';

  const browserTraceCache = {};

  function loadBrowserTrace(featureId, episodeId, callback) {
    var key = 'f' + featureId + '_ep' + episodeId;
    if (browserTraceCache[key]) {
      callback(browserTraceCache[key]);
      return;
    }
    var url = BROWSER_TRACE_BASE + '/f' + featureId + '/ep' + episodeId + '.json';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.onload = function () {
      if (xhr.status === 200) {
        var data = JSON.parse(xhr.responseText);
        browserTraceCache[key] = data;
        callback(data);
      } else {
        console.error('[feature-browser] Failed to load trace: ' + url + ' (HTTP ' + xhr.status + ')');
        callback(null);
      }
    };
    xhr.onerror = function () {
      console.error('[feature-browser] Network error loading trace: ' + url);
      callback(null);
    };
    xhr.send();
  }

  // ------------------------------------------------------------------
  // Shared tooltip (reuses .viz-tooltip singleton)
  // ------------------------------------------------------------------

  var fbTooltip = null;

  function getFbTooltip() {
    if (!fbTooltip) {
      // Reuse existing viz-tooltip if present, otherwise create one
      fbTooltip = document.querySelector('.viz-tooltip');
      if (!fbTooltip) {
        fbTooltip = document.createElement('div');
        fbTooltip.className = 'viz-tooltip';
        document.body.appendChild(fbTooltip);
      }
    }
    return fbTooltip;
  }

  function showFbTooltip(x, y, html) {
    var tt = getFbTooltip();
    tt.innerHTML = html;
    tt.classList.add('visible');
    tt.style.left = x + 'px';
    tt.style.top = y + 'px';
  }

  function hideFbTooltip() {
    var tt = getFbTooltip();
    tt.classList.remove('visible');
  }

  // ------------------------------------------------------------------
  // Expansion panel: heatmap helpers
  // ------------------------------------------------------------------

  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return r + ', ' + g + ', ' + b;
  }

  function maxVal(arr) {
    var m = 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] > m) m = arr[i];
    }
    return m;
  }

  /**
   * Render the expansion panel content: image strip + single-feature heatmap.
   */
  function renderExpansionPanel(panel, traceData, episodeData, featureId) {
    var epId = traceData.episode_id;
    var sampledFrames = traceData.sampled_frames;
    var values = traceData.values;
    var length = traceData.length;

    // Header
    var html = '<div class="fb-expansion-header">'
      + '<strong>Episode ' + epId + '</strong> &mdash; "' + (episodeData.task || '') + '" (' + length + ' steps)'
      + '</div>';

    // Image strip (shared frames from browser_frames directory)
    html += '<div class="image-strip">';
    for (var i = 0; i < sampledFrames.length; i++) {
      var fIdx = sampledFrames[i];
      var framePad = String(fIdx);
      while (framePad.length < 3) framePad = '0' + framePad;
      var imgSrc = BROWSER_FRAMES_BASE + '/ep' + epId + '/frame_' + framePad + '_main.jpg';
      html += '<div class="image-strip-frame" data-frame-idx="' + fIdx + '">';
      html += '<img src="' + imgSrc + '" alt="Frame ' + fIdx + '" loading="lazy" />';
      html += '<span class="frame-label">t=' + fIdx + '</span>';
      html += '</div>';
    }
    html += '</div>';

    // Single-feature heatmap bar
    var numCells = Math.min(HEATMAP_CELLS, length);
    var fMax = maxVal(values);
    if (fMax === 0) fMax = 1;
    var rgbStr = hexToRgb(ACCENT_COLOR);

    html += '<div class="heatmap-container">';
    html += '<div class="heatmap-row">';
    html += '<div class="heatmap-label" style="color:' + ACCENT_COLOR + '">F' + featureId + '</div>';
    html += '<div class="heatmap-bar">';

    for (var ci = 0; ci < numCells; ci++) {
      var start = Math.floor(ci * length / numCells);
      var end = Math.floor((ci + 1) * length / numCells);
      var sum = 0;
      var count = 0;
      for (var t = start; t < end; t++) {
        sum += values[t];
        count++;
      }
      var avg = count > 0 ? sum / count : 0;
      var intensity = avg / fMax;
      var bgColor = 'rgba(' + rgbStr + ', ' + intensity.toFixed(3) + ')';
      html += '<div class="heatmap-cell" '
        + 'style="background:' + bgColor + ';" '
        + 'data-feature="' + featureId + '" '
        + 'data-start="' + start + '" '
        + 'data-end="' + (end - 1) + '" '
        + 'data-avg="' + avg.toFixed(4) + '"'
        + '></div>';
    }

    html += '</div></div>';
    html += '</div>';

    panel.innerHTML = html;

    // Tooltip on heatmap cells
    var cells = panel.querySelectorAll('.heatmap-cell');
    for (var ci2 = 0; ci2 < cells.length; ci2++) {
      cells[ci2].addEventListener('mouseenter', function (e) {
        var cell = e.target;
        var ttHtml = '<strong style="color:' + ACCENT_COLOR + '">F' + cell.dataset.feature + '</strong><br>'
          + 'Steps ' + cell.dataset.start + '-' + cell.dataset.end + '<br>'
          + 'Avg: ' + cell.dataset.avg;
        var rect = cell.getBoundingClientRect();
        showFbTooltip(rect.left + rect.width / 2, rect.top, ttHtml);
      });
      cells[ci2].addEventListener('mouseleave', hideFbTooltip);
    }
  }

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------

  /**
   * Flatten a raw feature object so that stats fields are accessible
   * directly on the feature (e.g. feature.episode_coverage instead of
   * feature.stats.episode_coverage). Also normalise key names.
   */
  function flattenFeature(raw) {
    const s = raw.stats || {};
    const h = raw.histogram || {};
    return {
      feature_id: raw.id,
      classification: raw.classification,
      has_images: raw.has_images,
      human_label: raw.human_label || null,
      human_description: raw.human_description || null,
      episode_coverage: s.episode_coverage ?? 0,
      mean_onset_count: s.mean_onset_count ?? 0,
      mean_nonzero_activation: s.mean_nonzero_activation ?? 0,
      mean_relative_run_length: s.mean_relative_run_length ?? 0,
      mean_run_length: s.mean_run_length ?? 0,
      ep_mag_gini: s.ep_mag_gini ?? 0,
      num_active_episodes: s.num_active_episodes ?? 0,
      total_episodes: s.total_episodes ?? 0,
      mean_active_fraction: s.mean_active_fraction ?? 0,
      max_activation: h.global_max ?? 0,
      dead_ratio: s.num_active_episodes != null && s.total_episodes
        ? 1 - (s.num_active_episodes / s.total_episodes) : 0,
      activation_histogram: {
        bin_edges: h.bin_edges || [],
        counts: h.bin_counts || []
      },
      top_episodes: raw.top_episodes || []
    };
  }

  async function loadMetadata() {
    try {
      const resp = await fetch(METADATA_URL);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const rawFeatures = data.features || (Array.isArray(data) ? data : []);
      state.features = rawFeatures.map(flattenFeature);
      state.loading = false;
    } catch (err) {
      state.loading = false;
      state.error = 'Failed to load feature metadata: ' + err.message;
    }
  }

  // ------------------------------------------------------------------
  // Filtering, sorting, pagination
  // ------------------------------------------------------------------

  function applyFilters() {
    let list = state.features.slice();

    // -- Search by feature ID prefix --
    if (state.searchQuery.trim() !== '') {
      const q = state.searchQuery.trim();
      list = list.filter(f => String(f.feature_id).startsWith(q));
    }

    // -- Classification filter --
    if (state.filterBy === 'general') {
      list = list.filter(f => f.classification === 'general');
    } else if (state.filterBy === 'memorized') {
      list = list.filter(f => f.classification === 'memorized');
    }

    // -- Sort --
    const sorters = {
      coverage:   (a, b) => (b.episode_coverage ?? 0)         - (a.episode_coverage ?? 0),
      onsets:     (a, b) => (b.mean_onset_count ?? 0)          - (a.mean_onset_count ?? 0),
      activation: (a, b) => (b.mean_nonzero_activation ?? 0)   - (a.mean_nonzero_activation ?? 0),
      run_length: (a, b) => (b.mean_relative_run_length ?? 0)   - (a.mean_relative_run_length ?? 0),
      id:         (a, b) => (a.feature_id ?? 0)                - (b.feature_id ?? 0),
      human_label: (a, b) => {
        // Features with labels first, then by feature ID
        var aHas = a.human_label ? 1 : 0;
        var bHas = b.human_label ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        return (a.feature_id ?? 0) - (b.feature_id ?? 0);
      }
    };
    const sortFn = sorters[state.sortBy] || sorters.coverage;
    list.sort(sortFn);

    state.filtered = list;

    // Clamp page
    const maxPage = Math.max(0, Math.ceil(list.length / PAGE_SIZE) - 1);
    if (state.page > maxPage) state.page = maxPage;
  }

  function totalPages() {
    return Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  }

  function pageSlice() {
    const start = state.page * PAGE_SIZE;
    return state.filtered.slice(start, start + PAGE_SIZE);
  }

  // ------------------------------------------------------------------
  // Classification counts
  // ------------------------------------------------------------------

  function classCounts() {
    let general = 0;
    let memorized = 0;
    state.features.forEach(f => {
      if (f.classification === 'general') general++;
      else if (f.classification === 'memorized') memorized++;
    });
    return { general, memorized };
  }

  // ------------------------------------------------------------------
  // Rendering: controls
  // ------------------------------------------------------------------

  function renderControls() {
    const counts = classCounts();
    return `
      <div class="fb-controls">
        <div class="fb-controls-row">
          <div class="fb-search-wrap">
            <label for="fb-search" class="fb-label">Search by ID</label>
            <input type="text" id="fb-search" class="fb-search"
                   placeholder="Feature ID..." value="${state.searchQuery}" />
          </div>

          <div class="fb-sort-wrap">
            <label for="fb-sort" class="fb-label">Sort by</label>
            <select id="fb-sort" class="fb-sort">
              <option value="coverage"${state.sortBy === 'coverage' ? ' selected' : ''}>Coverage (high)</option>
              <option value="onsets"${state.sortBy === 'onsets' ? ' selected' : ''}>Onset Count (high)</option>
              <option value="activation"${state.sortBy === 'activation' ? ' selected' : ''}>Activation (high)</option>
              <option value="run_length"${state.sortBy === 'run_length' ? ' selected' : ''}>Run Length (high)</option>
              <option value="id"${state.sortBy === 'id' ? ' selected' : ''}>Feature ID</option>
              <option value="human_label"${state.sortBy === 'human_label' ? ' selected' : ''}>Human Label</option>
            </select>
          </div>

          <div class="fb-filter-wrap">
            <span class="fb-label">Filter</span>
            <div class="fb-radios">
              <label><input type="radio" name="fb-filter" value="all"${state.filterBy === 'all' ? ' checked' : ''} /> All</label>
              <label><input type="radio" name="fb-filter" value="general"${state.filterBy === 'general' ? ' checked' : ''} /> General</label>
              <label><input type="radio" name="fb-filter" value="memorized"${state.filterBy === 'memorized' ? ' checked' : ''} /> Memorized</label>
            </div>
          </div>
        </div>

        <div class="fb-stats-bar">
          Showing <strong>${state.filtered.length}</strong> of ${state.features.length} features.
          General: <strong>${counts.general}</strong> | Memorized: <strong>${counts.memorized}</strong>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------------
  // Rendering: badge
  // ------------------------------------------------------------------

  function badgeHTML(classification) {
    const isGeneral = classification === 'general';
    const color = isGeneral ? 'var(--clr-general, #22c55e)' : 'var(--clr-memorized, #f59e0b)';
    const label = isGeneral ? 'General' : 'Memorized';
    return `<span class="fb-badge" style="background:${color};color:#fff;padding:1px 8px;border-radius:10px;font-size:0.72rem;font-weight:600;">${label}</span>`;
  }

  // ------------------------------------------------------------------
  // Rendering: feature card (collapsed)
  // ------------------------------------------------------------------

  function renderCard(feature) {
    const fid = feature.feature_id;
    const isExpanded = state.expandedId === fid;

    // Compact stats row
    const statsRow = `
      <div class="fb-card-stats">
        <span>Coverage: <strong>${pct(feature.episode_coverage ?? 0)}</strong></span>
        <span>Onsets: <strong>${fmt(feature.mean_onset_count ?? 0, 1)}</strong></span>
        <span>Activation: <strong>${fmt(feature.mean_nonzero_activation ?? 0, 3)}</strong></span>
        <span>Run Length: <strong>${fmt(feature.mean_relative_run_length ?? 0, 2)}</strong></span>
      </div>`;

    // Thumbnail images (top 3 episodes, main camera only)
    let thumbsHTML = '';
    const topEps = (feature.top_episodes || []).slice(0, 3);
    if (feature.has_images && topEps.length > 0) {
      const imgs = topEps.map(ep =>
        `<img src="${thumbPath(fid, ep.episode_id, ep.timestep, 'main')}"
              alt="F${fid} ep${ep.episode_id}" loading="lazy" class="fb-thumb" />`
      ).join('');
      thumbsHTML = `<div class="fb-thumbs">${imgs}</div>`;
    } else if (topEps.length > 0) {
      const lines = topEps.map(ep =>
        `<div class="fb-ep-text">Ep ${ep.episode_id}, t=${ep.timestep} -- ${ep.task || ''}</div>`
      ).join('');
      thumbsHTML = `<div class="fb-ep-text-list">${lines}</div>`;
    }

    // Expanded detail
    let expandedHTML = '';
    if (isExpanded) {
      expandedHTML = renderExpandedDetail(feature);
    }

    const labelHTML = feature.human_label
      ? `<div class="fb-card-label">${feature.human_label}</div>`
      : '';

    return `
      <div class="fb-card${isExpanded ? ' fb-card--expanded' : ''}" data-fid="${fid}">
        <div class="fb-card-header">
          <span class="fb-card-title">Feature ${fid}</span>
          ${badgeHTML(feature.classification)}
        </div>
        ${labelHTML}
        ${statsRow}
        ${thumbsHTML}
        ${expandedHTML}
      </div>`;
  }

  // ------------------------------------------------------------------
  // Rendering: expanded detail
  // ------------------------------------------------------------------

  function renderExpandedDetail(feature) {
    const fid = feature.feature_id;

    // Full stats table
    const allStats = [
      ['Episode Coverage', pct(feature.episode_coverage ?? 0)],
      ['Mean Onset Count', fmt(feature.mean_onset_count ?? 0, 2)],
      ['Mean Nonzero Activation', fmt(feature.mean_nonzero_activation ?? 0, 4)],
      ['Rel. Run Length', fmt(feature.mean_relative_run_length ?? 0, 3)],
      ['Max Activation', fmt(feature.max_activation ?? 0, 4)],
      ['Classification', feature.classification]
    ];

    const statsTableRows = allStats.map(([k, v]) =>
      `<tr><td>${k}</td><td>${v}</td></tr>`
    ).join('');

    const statsTable = `
      <table class="fb-detail-table">
        <tbody>${statsTableRows}</tbody>
      </table>`;

    // Top 5 episodes with main + wrist images
    const topEps = (feature.top_episodes || []).slice(0, 5);
    let episodesHTML = '';
    if (topEps.length > 0) {
      const cards = topEps.map(ep => {
        const hasImg = feature.has_images;
        const isSelected = state.expandedEpisodeId === ep.episode_id;
        const selectedClass = isSelected ? ' fb-detail-ep--selected' : '';
        const imgHTML = hasImg ? `
          <div class="fb-detail-images">
            <img src="${thumbPath(fid, ep.episode_id, ep.timestep, 'main')}"
                 alt="Main camera" loading="lazy" />
            <img src="${thumbPath(fid, ep.episode_id, ep.timestep, 'wrist')}"
                 alt="Wrist camera" loading="lazy" />
          </div>` : '';
        return `
          <div class="fb-detail-ep fb-detail-ep--clickable${selectedClass}"
               data-episode-id="${ep.episode_id}"
               data-feature-id="${fid}">
            ${imgHTML}
            <div class="fb-detail-ep-meta">
              Ep ${ep.episode_id}, t=${ep.timestep} | Act: ${fmt(ep.activation ?? 0, 4)}
            </div>
            <div class="fb-detail-ep-task">${ep.task || ''}</div>
          </div>`;
      }).join('');
      episodesHTML = `<div class="fb-detail-episodes">${cards}</div>`;
    }

    const descriptionHTML = feature.human_description
      ? `<div class="fb-detail-section">
          <h4>Description</h4>
          <p class="fb-detail-description">${feature.human_description}</p>
        </div>`
      : '';

    return `
      <div class="fb-detail">
        ${descriptionHTML}
        <div class="fb-detail-section">
          <h4>Full Statistics</h4>
          ${statsTable}
        </div>
        <div class="fb-detail-section">
          <h4>Top Episodes</h4>
          ${episodesHTML}
          <div class="fb-expansion-panel" id="fb-expansion" style="display:none;"></div>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------------
  // Rendering: histogram (inline SVG)
  // ------------------------------------------------------------------

  /**
   * Renders a simple SVG bar chart of the activation distribution.
   * Uses log-scale bin edges and log10(count+1) for bar heights.
   *
   * The feature object is expected to have an `activation_histogram` field
   * with { bin_edges: [...], counts: [...] }. If missing, we fall back to
   * a placeholder message.
   */
  function renderHistogram(feature) {
    const hist = feature.activation_histogram;
    if (!hist || !hist.counts || hist.counts.length === 0) {
      return '<p class="fb-no-hist">No histogram data available for this feature.</p>';
    }

    const counts = hist.counts;
    const binEdges = hist.bin_edges || HIST_BIN_EDGES;

    // Skip the first bin (zero / near-zero activations) and trim empty trailing bins
    const startIdx = 1;
    var lastNonZero = counts.length - 1;
    while (lastNonZero > startIdx && (counts[lastNonZero] === 0 || counts[lastNonZero] == null)) {
      lastNonZero--;
    }
    const displayCounts = counts.slice(startIdx, lastNonZero + 1);
    const displayEdges  = binEdges.slice(startIdx, lastNonZero + 1);

    if (displayCounts.length === 0) {
      return '<p class="fb-no-hist">Insufficient histogram data.</p>';
    }

    // SVG dimensions
    const svgW = 480;
    const svgH = 180;
    const padL = 10;
    const padR = 10;
    const padT = 10;
    const padB = 40;
    const chartW = svgW - padL - padR;
    const chartH = svgH - padT - padB;

    const nBins = displayCounts.length;
    const barGap = 2;
    const barW = Math.max(4, (chartW - barGap * (nBins - 1)) / nBins);

    // Linear bar heights to show distributional differences between features
    const rawCounts = displayCounts.map(c => c ?? 0);
    const maxCount = Math.max(...rawCounts, 1);

    let bars = '';
    let labels = '';

    for (let i = 0; i < nBins; i++) {
      const x = padL + i * (barW + barGap);
      const h = (rawCounts[i] / maxCount) * chartH;
      const y = padT + chartH - h;

      bars += `<rect x="${x}" y="${y}" width="${barW}" height="${h}"
                     fill="var(--clr-accent, #6366f1)" rx="1" />`;

      // X-axis label
      const edgeLabel = i < displayEdges.length ? displayEdges[i] : '';
      labels += `<text x="${x + barW / 2}" y="${svgH - padB + 14}"
                       text-anchor="middle" font-size="9" fill="var(--clr-text-muted, #94a3b8)">${edgeLabel}</text>`;
    }

    // Baseline
    const baseline = `<line x1="${padL}" y1="${padT + chartH}"
                            x2="${padL + chartW}" y2="${padT + chartH}"
                            stroke="var(--clr-border, #334155)" stroke-width="1" />`;

    return `
      <svg class="fb-hist-svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" style="max-width:${svgW}px;">
        ${baseline}
        ${bars}
        ${labels}
        <text x="${svgW / 2}" y="${svgH - 2}" text-anchor="middle"
              font-size="10" fill="var(--clr-text-muted, #94a3b8)">Activation magnitude bin</text>
      </svg>`;
  }

  // ------------------------------------------------------------------
  // Rendering: pagination
  // ------------------------------------------------------------------

  function renderPagination() {
    const total = totalPages();
    if (total <= 1) return '';

    const current = state.page;
    let buttons = '';

    // Prev
    buttons += `<button class="fb-page-btn${current === 0 ? ' fb-page-btn--disabled' : ''}"
                        data-page="${current - 1}" ${current === 0 ? 'disabled' : ''}>Prev</button>`;

    // Page numbers -- show a window around the current page
    const windowSize = 3;
    let startPage = Math.max(0, current - windowSize);
    let endPage = Math.min(total - 1, current + windowSize);

    if (startPage > 0) {
      buttons += `<button class="fb-page-btn" data-page="0">1</button>`;
      if (startPage > 1) {
        buttons += `<span class="fb-page-ellipsis">...</span>`;
      }
    }

    for (let p = startPage; p <= endPage; p++) {
      const active = p === current ? ' fb-page-btn--active' : '';
      buttons += `<button class="fb-page-btn${active}" data-page="${p}">${p + 1}</button>`;
    }

    if (endPage < total - 1) {
      if (endPage < total - 2) {
        buttons += `<span class="fb-page-ellipsis">...</span>`;
      }
      buttons += `<button class="fb-page-btn" data-page="${total - 1}">${total}</button>`;
    }

    // Next
    buttons += `<button class="fb-page-btn${current === total - 1 ? ' fb-page-btn--disabled' : ''}"
                        data-page="${current + 1}" ${current === total - 1 ? 'disabled' : ''}>Next</button>`;

    return `<div class="fb-pagination">${buttons}</div>`;
  }

  // ------------------------------------------------------------------
  // Full render
  // ------------------------------------------------------------------

  function render() {
    if (!container) return;

    // Loading state
    if (state.loading) {
      container.innerHTML = `
        <div class="fb-loading">
          <div class="fb-spinner"></div>
          <p>Loading feature metadata...</p>
        </div>`;
      return;
    }

    // Error state
    if (state.error) {
      container.innerHTML = `<div class="fb-error"><p>${state.error}</p></div>`;
      return;
    }

    applyFilters();

    const cards = pageSlice().map(f => renderCard(f)).join('');

    container.innerHTML = `
      ${renderControls()}
      <div class="fb-grid">${cards}</div>
      ${renderPagination()}`;

    attachEventListeners();
  }

  // ------------------------------------------------------------------
  // Event listeners (re-attached after each render)
  // ------------------------------------------------------------------

  function attachEventListeners() {
    // Search input (debounced)
    const searchInput = container.querySelector('#fb-search');
    if (searchInput) {
      searchInput.addEventListener('input', debounce((e) => {
        state.searchQuery = e.target.value;
        state.page = 0;
        state.expandedId = null;
        render();
      }, DEBOUNCE_MS));

      // Preserve focus after re-render only if user was typing
      if (state.searchQuery) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
    }

    // Sort select
    const sortSelect = container.querySelector('#fb-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        state.page = 0;
        state.expandedId = null;
        render();
      });
    }

    // Filter radios
    const radios = container.querySelectorAll('input[name="fb-filter"]');
    radios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        state.filterBy = e.target.value;
        state.page = 0;
        state.expandedId = null;
        render();
      });
    });

    // Episode click within expanded detail (must be before card click)
    const epCards = container.querySelectorAll('.fb-detail-ep--clickable');
    epCards.forEach(epCard => {
      epCard.addEventListener('click', (e) => {
        e.stopPropagation();  // Prevent card toggle
        const epId = parseInt(epCard.dataset.episodeId, 10);
        const fid = parseInt(epCard.dataset.featureId, 10);

        if (state.expandedEpisodeId === epId) {
          // Collapse
          state.expandedEpisodeId = null;
          var panel = document.getElementById('fb-expansion');
          if (panel) {
            panel.style.display = 'none';
            panel.innerHTML = '';
          }
          epCard.classList.remove('fb-detail-ep--selected');
        } else {
          // Expand or switch
          state.expandedEpisodeId = epId;

          // Update selected state on all ep cards
          container.querySelectorAll('.fb-detail-ep--clickable').forEach(c => {
            c.classList.remove('fb-detail-ep--selected');
          });
          epCard.classList.add('fb-detail-ep--selected');

          // Find episode data from the feature
          var feature = state.features.find(f => f.feature_id === fid);
          if (!feature) {
            console.error('[feature-browser] Episode click: feature id=' + fid + ' not found in state.');
            return;
          }
          var episodeData = feature.top_episodes.find(ep => ep.episode_id === epId);
          if (!episodeData) {
            console.error('[feature-browser] Episode click: episode id=' + epId + ' not found in feature ' + fid + '.');
            return;
          }

          var panel = document.getElementById('fb-expansion');
          if (!panel) return;

          // Show loading state
          panel.style.display = 'block';
          panel.innerHTML = '<div class="viz-loading"><div class="spinner"></div><p>Loading episode trace...</p></div>';

          loadBrowserTrace(fid, epId, function (traceData) {
            // Check we're still looking at the same episode
            if (state.expandedEpisodeId !== epId) return;

            if (!traceData) {
              panel.innerHTML = '<div class="fb-expansion-header" style="color: #e53e3e;">Could not load trace data for episode ' + epId + '.</div>';
              return;
            }

            renderExpansionPanel(panel, traceData, episodeData, fid);
          });
        }
      });
    });

    // Card click (event delegation on the grid)
    const grid = container.querySelector('.fb-grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const card = e.target.closest('.fb-card');
        if (!card) return;

        // Don't toggle if the user clicked on an image (let it load naturally)
        if (e.target.tagName === 'IMG') return;

        const fid = parseInt(card.dataset.fid, 10);
        if (state.expandedId === fid) {
          state.expandedId = null;
        } else {
          state.expandedId = fid;
        }
        // Reset episode expansion when feature changes
        state.expandedEpisodeId = null;
        render();
      });
    }

    // Pagination (event delegation)
    const pagination = container.querySelector('.fb-pagination');
    if (pagination) {
      pagination.addEventListener('click', (e) => {
        const btn = e.target.closest('.fb-page-btn');
        if (!btn || btn.disabled) return;
        const targetPage = parseInt(btn.dataset.page, 10);
        if (isNaN(targetPage) || targetPage < 0 || targetPage >= totalPages()) return;
        state.page = targetPage;
        state.expandedId = null;
        render();

        // Scroll to top of browser section
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  // ------------------------------------------------------------------
  // Initialisation
  // ------------------------------------------------------------------

  async function init() {
    container = document.getElementById('feature-browser-container');
    if (!container) return;

    // Show loading spinner immediately
    render();

    // Fetch metadata
    await loadMetadata();

    // Re-render with data
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
