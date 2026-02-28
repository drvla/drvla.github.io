/**
 * feature-viewer.js -- Interactive curated feature viewer
 *
 * Displays a tabbed interface for curated DRVLA features from LIBERO and DROID.
 * Each benchmark tab shows its own set of features with summary statistics
 * and top-10 activating episode images (main + wrist cameras).
 *
 * Clicking an episode card expands a panel below showing sampled frames
 * and a single-feature activation heatmap for that episode.
 *
 * Self-contained IIFE -- expects a <div id="feature-viewer-container">
 * in the page.
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Curated feature data -- LIBERO
  // ------------------------------------------------------------------

  var LIBERO_FEATURES = [
    {
      id: 128,
      label: 'Pre-grasp Alignment',
      shortLabel: 'Pre-grasp',
      description:
        'Activates when the end-effector is positioned above the target object prior to each grasp onset. Magnitude ramps as the object enters and centers in the wrist camera frame. Also re-activates post-placement if the arm returns to a vertically aligned position.',
      stats: {
        episode_coverage: 0.996,
        mean_onset_count: 2.54,
        mean_nonzero_activation: 0.348,
        mean_relative_run_length: 0.235
      },
      classification: 'general',
      color: '#3478f6',
      episodes: [
        { rank: 1, episode_id: 298, timestep: 0, activation: 0.7305, task: 'pick up the book and place it in the back compartment of the caddy' },
        { rank: 2, episode_id: 229, timestep: 0, activation: 0.6857, task: 'pick up the book and place it in the back compartment of the caddy' },
        { rank: 3, episode_id: 931, timestep: 22, activation: 0.6844, task: 'pick up the cream cheese and place it in the basket' },
        { rank: 4, episode_id: 1164, timestep: 66, activation: 0.6773, task: 'pick up the salad dressing and place it in the basket' },
        { rank: 5, episode_id: 180, timestep: 1, activation: 0.6753, task: 'pick up the book and place it in the back compartment of the caddy' },
        { rank: 6, episode_id: 159, timestep: 2, activation: 0.6636, task: 'pick up the book and place it in the back compartment of the caddy' },
        { rank: 7, episode_id: 837, timestep: 21, activation: 0.6615, task: 'pick up the orange juice and place it in the basket' },
        { rank: 8, episode_id: 995, timestep: 151, activation: 0.6555, task: 'pick up the ketchup and place it in the basket' },
        { rank: 9, episode_id: 1046, timestep: 23, activation: 0.6550, task: 'pick up the orange juice and place it in the basket' },
        { rank: 10, episode_id: 111, timestep: 0, activation: 0.6467, task: 'pick up the book and place it in the back compartment of the caddy' }
      ]
    },
    {
      id: 445,
      label: 'Task Completion',
      shortLabel: 'Completion',
      description:
        'Activates when the end-effector approaches the goal placement location, predominantly on the final sub-goal. In compound tasks, activates at lower magnitude and preferentially on the second object placement, consistent with encoding overall task success rather than sub-task completion.',
      stats: {
        episode_coverage: 0.995,
        mean_onset_count: 1.45,
        mean_nonzero_activation: 0.157,
        mean_relative_run_length: 0.419
      },
      classification: 'general',
      color: '#e53e3e',
      episodes: [
        { rank: 1, episode_id: 507, timestep: 84, activation: 0.4625, task: 'put the bowl on the plate' },
        { rank: 2, episode_id: 1467, timestep: 91, activation: 0.4298, task: 'pick up the black bowl next to the plate and place it on the plate' },
        { rank: 3, episode_id: 192, timestep: 107, activation: 0.4258, task: 'put the black bowl in the bottom drawer of the cabinet and close it' },
        { rank: 4, episode_id: 1027, timestep: 126, activation: 0.4223, task: 'pick up the ketchup and place it in the basket' },
        { rank: 5, episode_id: 700, timestep: 86, activation: 0.4215, task: 'turn on the stove' },
        { rank: 6, episode_id: 968, timestep: 152, activation: 0.4196, task: 'pick up the bbq sauce and place it in the basket' },
        { rank: 7, episode_id: 382, timestep: 160, activation: 0.4176, task: 'open the top drawer and put the bowl inside' },
        { rank: 8, episode_id: 1651, timestep: 168, activation: 0.4089, task: 'pick up the black bowl in the top drawer of the wooden cabinet and place it on the plate' },
        { rank: 9, episode_id: 1449, timestep: 79, activation: 0.4048, task: 'pick up the black bowl between the plate and the ramekin and place it on the plate' },
        { rank: 10, episode_id: 1195, timestep: 126, activation: 0.4034, task: 'pick up the ketchup and place it in the basket' }
      ]
    },
    {
      id: 1129,
      label: 'Grasp / Place Transition',
      shortLabel: 'Grasp/Place',
      description:
        'Activates during initial object grasp and placement. Onset count scales with the number of pick-and-place sub-goals: two onsets for single-object tasks, four for two-object tasks.',
      stats: {
        episode_coverage: 0.999,
        mean_onset_count: 2.40,
        mean_nonzero_activation: 0.422,
        mean_relative_run_length: 0.216
      },
      classification: 'general',
      color: '#38a169',
      episodes: [
        { rank: 1, episode_id: 745, timestep: 41, activation: 0.6841, task: 'put the bowl on top of the cabinet' },
        { rank: 2, episode_id: 939, timestep: 193, activation: 0.6543, task: 'pick up the butter and place it in the basket' },
        { rank: 3, episode_id: 238, timestep: 60, activation: 0.6447, task: 'put both the alphabet soup and the tomato sauce in the basket' },
        { rank: 4, episode_id: 1143, timestep: 177, activation: 0.6435, task: 'pick up the alphabet soup and place it in the basket' },
        { rank: 5, episode_id: 1118, timestep: 145, activation: 0.6379, task: 'pick up the butter and place it in the basket' },
        { rank: 6, episode_id: 332, timestep: 178, activation: 0.6343, task: 'put both the cream cheese box and the butter in the basket' },
        { rank: 7, episode_id: 1493, timestep: 38, activation: 0.6343, task: 'pick up the black bowl between the plate and the ramekin and place it on the plate' },
        { rank: 8, episode_id: 369, timestep: 45, activation: 0.6297, task: 'put the white mug on the plate and put the chocolate pudding to the right of the plate' },
        { rank: 9, episode_id: 752, timestep: 54, activation: 0.6289, task: 'push the plate to the front of the stove' },
        { rank: 10, episode_id: 994, timestep: 59, activation: 0.6281, task: 'pick up the butter and place it in the basket' }
      ]
    },
    {
      id: 1902,
      label: 'Transport Phase',
      shortLabel: 'Transport',
      description:
        'Activates between the onset pairs of F1129, corresponding to the carrying phase. Activation magnitude increases approximately linearly toward the goal position, suggesting the feature also encodes proximity to the placement target.',
      stats: {
        episode_coverage: 0.996,
        mean_onset_count: 2.34,
        mean_nonzero_activation: 0.363,
        mean_relative_run_length: 0.254
      },
      classification: 'general',
      color: '#d69e2e',
      episodes: [
        { rank: 1, episode_id: 1169, timestep: 101, activation: 0.6391, task: 'pick up the salad dressing and place it in the basket' },
        { rank: 2, episode_id: 1360, timestep: 89, activation: 0.6278, task: 'pick up the black bowl in the top drawer of the wooden cabinet and place it on the plate' },
        { rank: 3, episode_id: 1175, timestep: 101, activation: 0.6185, task: 'pick up the orange juice and place it in the basket' },
        { rank: 4, episode_id: 870, timestep: 109, activation: 0.6171, task: 'pick up the orange juice and place it in the basket' },
        { rank: 5, episode_id: 1298, timestep: 88, activation: 0.6155, task: 'pick up the black bowl in the top drawer of the wooden cabinet and place it on the plate' },
        { rank: 6, episode_id: 887, timestep: 106, activation: 0.6100, task: 'pick up the alphabet soup and place it in the basket' },
        { rank: 7, episode_id: 930, timestep: 124, activation: 0.6060, task: 'pick up the ketchup and place it in the basket' },
        { rank: 8, episode_id: 926, timestep: 94, activation: 0.6017, task: 'pick up the orange juice and place it in the basket' },
        { rank: 9, episode_id: 1044, timestep: 105, activation: 0.5986, task: 'pick up the orange juice and place it in the basket' },
        { rank: 10, episode_id: 1384, timestep: 100, activation: 0.5967, task: 'pick up the black bowl on the stove and place it on the plate' }
      ]
    }
  ];

  // ------------------------------------------------------------------
  // Curated feature data -- DROID
  // ------------------------------------------------------------------

  var DROID_FEATURES = [
    {
      id: 158,
      label: 'Sub-task Checkpoint',
      shortLabel: 'Checkpoint',
      description:
        'Activates at transitions between manipulation sub-phases, marking key decision points in multi-step tasks. Coverage spans 95.4% of episodes with a mean of 2.73 onsets, indicating consistent activation at sub-task boundaries across diverse DROID tasks.',
      stats: {
        episode_coverage: 0.954,
        mean_onset_count: 2.73,
        mean_nonzero_activation: 0.094,
        mean_relative_run_length: 0.280
      },
      classification: 'general',
      color: '#3478f6',
      episodes: [
        { rank: 1, episode_id: 193, timestep: 621, activation: 0.4903, task: 'DROID task' },
        { rank: 2, episode_id: 1437, timestep: 56, activation: 0.4812, task: 'Put the cup in the bowl' },
        { rank: 3, episode_id: 1144, timestep: 113, activation: 0.4765, task: 'Lift the pink laundry then fold it and put it in the plastic bag' },
        { rank: 4, episode_id: 1091, timestep: 310, activation: 0.4763, task: 'Put the clothes in the plastic bags' },
        { rank: 5, episode_id: 1411, timestep: 128, activation: 0.4720, task: 'Put the carrot plush toy in the pot' },
        { rank: 6, episode_id: 667, timestep: 102, activation: 0.4712, task: 'Push the basketball between the two cups' },
        { rank: 7, episode_id: 525, timestep: 515, activation: 0.4620, task: 'Put the blocks in the bowl' },
        { rank: 8, episode_id: 647, timestep: 85, activation: 0.4607, task: 'Put the orange cup inside the black bowl' },
        { rank: 9, episode_id: 1637, timestep: 652, activation: 0.4602, task: 'Take everything out of the plastic bag' },
        { rank: 10, episode_id: 1539, timestep: 278, activation: 0.4527, task: 'DROID task' }
      ]
    },
    {
      id: 586,
      label: 'Pinch Grasp',
      shortLabel: 'Pinch',
      description:
        'Activates during precision grasps of thin objects, persisting through the entire grasp phase from contact to lift-off. High relative run length (0.498) indicates sustained activation rather than brief spikes, consistent with encoding an ongoing grasping action.',
      stats: {
        episode_coverage: 0.886,
        mean_onset_count: 1.69,
        mean_nonzero_activation: 0.086,
        mean_relative_run_length: 0.498
      },
      classification: 'general',
      color: '#e53e3e',
      episodes: [
        { rank: 1, episode_id: 1642, timestep: 179, activation: 0.3952, task: 'Place some white sachets in the wooden box' },
        { rank: 2, episode_id: 1115, timestep: 268, activation: 0.3887, task: 'Put a slice of bread into the toaster' },
        { rank: 3, episode_id: 384, timestep: 180, activation: 0.3783, task: 'Fold the towel' },
        { rank: 4, episode_id: 44, timestep: 227, activation: 0.3659, task: 'Take one silver fork from the dish rack and put it on the right side of the countertop' },
        { rank: 5, episode_id: 1965, timestep: 98, activation: 0.3609, task: 'Remove the toy from the silver pot and put it on the table' },
        { rank: 6, episode_id: 1694, timestep: 205, activation: 0.3548, task: 'Pick up the open water bottle and pour its contents into the small black pot' },
        { rank: 7, episode_id: 788, timestep: 334, activation: 0.3463, task: 'Move the word pieces on the table' },
        { rank: 8, episode_id: 1504, timestep: 280, activation: 0.3454, task: 'Pour the contents from the clear bowl into the blue bowl' },
        { rank: 9, episode_id: 336, timestep: 304, activation: 0.3404, task: 'Fold the towel in half' },
        { rank: 10, episode_id: 881, timestep: 211, activation: 0.3378, task: 'Move the soda can to the counter on the left' }
      ]
    },
    {
      id: 165,
      label: 'Open Gripper over Target',
      shortLabel: 'Open Gripper',
      description:
        'Activates when the target object is visible between open gripper jaws, encoding the pre-grasp alignment from the wrist camera perspective. High coverage (92.3%) and mean onsets of 1.93 suggest this feature captures a universal pre-manipulation primitive across diverse DROID environments.',
      stats: {
        episode_coverage: 0.923,
        mean_onset_count: 1.93,
        mean_nonzero_activation: 0.135,
        mean_relative_run_length: 0.400
      },
      classification: 'general',
      color: '#38a169',
      episodes: [
        { rank: 1, episode_id: 1125, timestep: 308, activation: 0.6935, task: 'Fold the white cloth on the table' },
        { rank: 2, episode_id: 855, timestep: 72, activation: 0.6209, task: 'Take the marker out of the cup and put it on the table' },
        { rank: 3, episode_id: 340, timestep: 78, activation: 0.5902, task: 'Take the marker out of the cup' },
        { rank: 4, episode_id: 92, timestep: 38, activation: 0.5863, task: 'Pour the contents of the clear jar into the pot' },
        { rank: 5, episode_id: 1506, timestep: 58, activation: 0.5846, task: 'Put the used napkin in the orange packet and then the bin' },
        { rank: 6, episode_id: 1206, timestep: 238, activation: 0.5673, task: 'Remove the marker from the yellow mug, put the marker back in the mug, remove the marker from the mug again' },
        { rank: 7, episode_id: 1065, timestep: 178, activation: 0.5544, task: 'Pick up cup and move it slightly forward' },
        { rank: 8, episode_id: 840, timestep: 216, activation: 0.5460, task: 'Unfold the towel on the table' },
        { rank: 9, episode_id: 1557, timestep: 42, activation: 0.5448, task: 'Pick up the wooden block and move it slightly to the right' },
        { rank: 10, episode_id: 587, timestep: 458, activation: 0.5406, task: 'Place the yellow, green and orange blocks inside the measuring cup' }
      ]
    },
    {
      id: 399,
      label: 'Grasp Acquisition / Placement',
      shortLabel: 'Grasp/Place',
      description:
        'Activates during the closing phase of grasp and placement, analogous to LIBERO F1129. High mean activation (0.168) and broad coverage (88.8%) confirm this as a general manipulation primitive that transfers across the diverse DROID dataset.',
      stats: {
        episode_coverage: 0.888,
        mean_onset_count: 1.78,
        mean_nonzero_activation: 0.168,
        mean_relative_run_length: 0.451
      },
      classification: 'general',
      color: '#d69e2e',
      episodes: [
        { rank: 1, episode_id: 976, timestep: 291, activation: 0.5852, task: 'Open the oven, take the bread out, put it on the plate then close it' },
        { rank: 2, episode_id: 624, timestep: 87, activation: 0.5836, task: 'Sweep the table using the brush and dustpan' },
        { rank: 3, episode_id: 1513, timestep: 139, activation: 0.5641, task: 'Put the knife on the dish rack' },
        { rank: 4, episode_id: 1156, timestep: 304, activation: 0.5566, task: 'Shift the pieces of rope, one after the other, to the laundry basket' },
        { rank: 5, episode_id: 646, timestep: 165, activation: 0.5551, task: 'Pick up then animal plush toy on the counter and put it on the plate' },
        { rank: 6, episode_id: 556, timestep: 71, activation: 0.5541, task: 'Take the lid from the white bowl and place it on the black pot' },
        { rank: 7, episode_id: 1367, timestep: 379, activation: 0.5457, task: 'Pour the contents from the clear bowl into the blue bowl' },
        { rank: 8, episode_id: 1474, timestep: 111, activation: 0.5454, task: 'Put the marker in the cup' },
        { rank: 9, episode_id: 458, timestep: 149, activation: 0.5389, task: 'Get the strawberry toy from the right front plate of the stove and put it in the sink' },
        { rank: 10, episode_id: 1036, timestep: 286, activation: 0.5378, task: 'Put the spoon in the pot' }
      ]
    }
  ];

  // ------------------------------------------------------------------
  // Benchmark configuration
  // ------------------------------------------------------------------

  var BENCHMARKS = {
    libero: {
      label: 'LIBERO',
      features: LIBERO_FEATURES,
      defaultFeatureId: 1129,
      imageBasePath: 'data/features/images',
      traceBasePath: 'data/features/traces/libero'
    },
    droid: {
      label: 'DROID',
      features: DROID_FEATURES,
      defaultFeatureId: 158,
      imageBasePath: 'data/features/images/droid',
      traceBasePath: 'data/features/traces/droid'
    }
  };

  // ------------------------------------------------------------------
  // Trace data cache and loader
  // ------------------------------------------------------------------

  var traceCache = {};

  function loadTraceData(benchmarkKey, featureId, episodeId, callback) {
    var key = benchmarkKey + '_f' + featureId + '_ep' + episodeId;
    if (traceCache[key]) {
      callback(traceCache[key]);
      return;
    }
    var url = BENCHMARKS[benchmarkKey].traceBasePath + '/f' + featureId + '/ep' + episodeId + '.json';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.onload = function () {
      if (xhr.status === 200) {
        var data = JSON.parse(xhr.responseText);
        traceCache[key] = data;
        callback(data);
      } else {
        console.error('[feature-viewer] Failed to load trace: ' + url + ' (HTTP ' + xhr.status + ')');
        callback(null);
      }
    };
    xhr.onerror = function () {
      console.error('[feature-viewer] Network error loading trace: ' + url);
      callback(null);
    };
    xhr.send();
  }

  // ------------------------------------------------------------------
  // Shared tooltip (reused from activation-viz pattern)
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
  // Rendering helpers
  // ------------------------------------------------------------------

  function classificationBadge(classification) {
    var color = classification === 'general' ? 'var(--clr-general, #22c55e)' : 'var(--clr-memorized, #f59e0b)';
    var label = classification.charAt(0).toUpperCase() + classification.slice(1);
    return '<span class="fv-badge" style="background:' + color + ';color:#fff;padding:2px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;margin-left:8px;vertical-align:middle;">' + label + '</span>';
  }

  function fmt(value, digits) {
    return Number(value).toFixed(digits);
  }

  function pct(value) {
    return (value * 100).toFixed(1) + '%';
  }

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

  function imagePath(benchmarkKey, featureId, episodeId, timestep, camera) {
    if (benchmarkKey === 'droid') {
      return 'data/features/images/droid/feature_' + featureId + '/rank' + '_ep' + episodeId + '_t' + timestep + '_' + camera + '.png';
    }
    return 'data/features/images/' + featureId + '/ep' + episodeId + '_t' + timestep + '_' + camera + '.png';
  }

  function droidImagePath(featureId, rank, episodeId, timestep, camera) {
    return 'data/features/images/droid/feature_' + featureId + '/rank' + rank + '_ep' + episodeId + '_t' + timestep + '_' + camera + '.png';
  }

  // ------------------------------------------------------------------
  // Benchmark toggle
  // ------------------------------------------------------------------

  function renderBenchmarkToggle(activeBenchmark) {
    var html = '<div class="viz-toggle" style="margin-bottom: 24px;">';
    var keys = ['libero', 'droid'];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var isActive = key === activeBenchmark;
      var cls = 'viz-toggle-btn' + (isActive ? ' viz-toggle-btn--active' : '');
      html += '<button class="' + cls + '" data-benchmark="' + key + '">' + BENCHMARKS[key].label + '</button>';
    }
    html += '</div>';
    return html;
  }

  // ------------------------------------------------------------------
  // Feature tabs
  // ------------------------------------------------------------------

  function renderTabs(features, activeId) {
    return features.map(function (f) {
      var isActive = f.id === activeId;
      var cls = isActive ? 'fv-tab fv-tab--active' : 'fv-tab';
      return '<button class="' + cls + '" data-fid="' + f.id + '">F' + f.id + ' ' + f.shortLabel + '</button>';
    }).join('');
  }

  // ------------------------------------------------------------------
  // Feature content panel
  // ------------------------------------------------------------------

  function renderFeatureContent(feature, benchmarkKey) {
    var s = feature.stats;

    var statsHTML = '<div class="fv-stats">'
      + '<div class="fv-stat"><span class="fv-stat-label">Coverage</span><span class="fv-stat-value">' + pct(s.episode_coverage) + '</span></div>'
      + '<div class="fv-stat"><span class="fv-stat-label">Mean Onsets</span><span class="fv-stat-value">' + fmt(s.mean_onset_count, 2) + '</span></div>'
      + '<div class="fv-stat"><span class="fv-stat-label">Mean Activation</span><span class="fv-stat-value">' + fmt(s.mean_nonzero_activation, 3) + '</span></div>'
      + '<div class="fv-stat"><span class="fv-stat-label">Rel. Run Length</span><span class="fv-stat-value">' + fmt(s.mean_relative_run_length, 3) + '</span></div>'
      + '</div>';

    var episodesHTML = feature.episodes.map(function (ep) {
      var mainSrc, wristSrc;
      if (benchmarkKey === 'droid') {
        mainSrc = droidImagePath(feature.id, ep.rank, ep.episode_id, ep.timestep, 'main');
        wristSrc = droidImagePath(feature.id, ep.rank, ep.episode_id, ep.timestep, 'wrist');
      } else {
        mainSrc = imagePath(benchmarkKey, feature.id, ep.episode_id, ep.timestep, 'main');
        wristSrc = imagePath(benchmarkKey, feature.id, ep.episode_id, ep.timestep, 'wrist');
      }
      return '<div class="fv-episode-card" data-episode-id="' + ep.episode_id + '" data-feature-id="' + feature.id + '">'
        + '<div class="fv-episode-images">'
        + '<img src="' + mainSrc + '" alt="Main camera, ep ' + ep.episode_id + '" loading="lazy" onerror="this.style.background=\'#f0f0f0\';this.style.display=\'block\'" />'
        + '<img src="' + wristSrc + '" alt="Wrist camera, ep ' + ep.episode_id + '" loading="lazy" onerror="this.style.background=\'#f0f0f0\';this.style.display=\'block\'" />'
        + '</div>'
        + '<div class="fv-episode-meta">Ep ' + ep.episode_id + ', t=' + ep.timestep + ' &nbsp;|&nbsp; Act: ' + fmt(ep.activation, 4) + '</div>'
        + '<div class="fv-episode-task">' + ep.task + '</div>'
        + '</div>';
    }).join('');

    return '<h3 class="fv-title">Feature ' + feature.id + ' &mdash; ' + feature.label + ' ' + classificationBadge(feature.classification) + '</h3>'
      + '<p class="fv-description">' + feature.description + '</p>'
      + statsHTML
      + '<div class="fv-episode-grid">' + episodesHTML + '</div>'
      + '<div class="fv-expansion-panel" id="fv-expansion" style="display:none;"></div>'
      + '<p class="fv-note">Click an episode card to see sampled frames and activation trace. Main camera (left) and wrist camera (right).</p>';
  }

  // ------------------------------------------------------------------
  // Expansion panel: image strip + heatmap
  // ------------------------------------------------------------------

  var HEATMAP_CELLS = 40;

  function renderExpansionContent(panel, traceData, feature, benchmarkKey, episodeData) {
    var basePath = BENCHMARKS[benchmarkKey].traceBasePath;
    var featureId = feature.id;
    var epId = traceData.episode_id;
    var sampledFrames = traceData.sampled_frames;
    var values = traceData.values;
    var length = traceData.length;
    var featureColor = feature.color;

    // Header
    var html = '<div class="fv-expansion-header">'
      + '<strong>Episode ' + epId + '</strong> &mdash; "' + episodeData.task + '" (' + length + ' steps)'
      + '</div>';

    // Image strip (main camera only, same CSS as activation-viz)
    html += '<div class="image-strip">';
    for (var i = 0; i < sampledFrames.length; i++) {
      var fIdx = sampledFrames[i];
      var framePad = String(fIdx);
      while (framePad.length < 3) framePad = '0' + framePad;
      var imgSrc = basePath + '/f' + featureId + '/ep' + epId + '/frame_' + framePad + '_main.jpg';
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

    html += '<div class="heatmap-container">';
    html += '<div class="heatmap-row">';
    html += '<div class="heatmap-label" style="color:' + featureColor + '">F' + featureId + '</div>';
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
      var bgColor = 'rgba(' + hexToRgb(featureColor) + ', ' + intensity.toFixed(3) + ')';
      html += '<div class="heatmap-cell" '
        + 'style="background:' + bgColor + ';" '
        + 'data-feature="' + featureId + '" '
        + 'data-label="' + feature.label + '" '
        + 'data-start="' + start + '" '
        + 'data-end="' + (end - 1) + '" '
        + 'data-avg="' + avg.toFixed(4) + '" '
        + 'data-color="' + featureColor + '"'
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
        var ttHtml = '<strong style="color:' + cell.dataset.color + '">F' + cell.dataset.feature + ' (' + cell.dataset.label + ')</strong><br>'
          + 'Steps ' + cell.dataset.start + '-' + cell.dataset.end + '<br>'
          + 'Avg: ' + cell.dataset.avg;
        var rect = cell.getBoundingClientRect();
        showTooltip(rect.left + rect.width / 2, rect.top, ttHtml);
      });
      cells[ci2].addEventListener('mouseleave', hideTooltip);
    }
  }

  // ------------------------------------------------------------------
  // Initialization
  // ------------------------------------------------------------------

  function init() {
    var container = document.getElementById('feature-viewer-container');
    if (!container) {
      console.error('[feature-viewer] Required element #feature-viewer-container not found in DOM.');
      return;
    }

    var activeBenchmark = 'libero';
    var activeFeatureIds = {
      libero: BENCHMARKS.libero.defaultFeatureId,
      droid: BENCHMARKS.droid.defaultFeatureId
    };
    // Track which episode is expanded per benchmark+feature
    var expandedEpisodes = {};

    function getExpandedKey() {
      return activeBenchmark + '_' + activeFeatureIds[activeBenchmark];
    }

    function render() {
      var bm = BENCHMARKS[activeBenchmark];
      var activeId = activeFeatureIds[activeBenchmark];
      var feature = bm.features.find(function (f) { return f.id === activeId; });
      if (!feature) {
        console.error('[feature-viewer] Feature ID ' + activeId + ' not found in benchmark "' + activeBenchmark + '".');
        return;
      }

      container.innerHTML = renderBenchmarkToggle(activeBenchmark)
        + '<div class="fv-tabs">' + renderTabs(bm.features, activeId) + '</div>'
        + '<div class="fv-content">' + renderFeatureContent(feature, activeBenchmark) + '</div>';

      // Restore expanded state if there was one
      var expandKey = getExpandedKey();
      var expandedEpId = expandedEpisodes[expandKey] || null;
      if (expandedEpId !== null) {
        expandEpisode(feature, expandedEpId);
      }

      // Benchmark toggle handlers
      var bmBtns = container.querySelectorAll('.viz-toggle-btn[data-benchmark]');
      for (var bi = 0; bi < bmBtns.length; bi++) {
        bmBtns[bi].addEventListener('click', function (e) {
          var newBm = e.target.dataset.benchmark;
          if (newBm !== activeBenchmark) {
            activeBenchmark = newBm;
            render();
          }
        });
      }

      // Feature tab handlers
      container.querySelector('.fv-tabs').addEventListener('click', function (e) {
        var btn = e.target.closest('.fv-tab');
        if (!btn) return;
        var fid = parseInt(btn.dataset.fid, 10);
        if (fid !== activeFeatureIds[activeBenchmark]) {
          activeFeatureIds[activeBenchmark] = fid;
          render();
        }
      });

      // Episode card click handler (delegated)
      var grid = container.querySelector('.fv-episode-grid');
      if (grid) {
        grid.addEventListener('click', function (e) {
          var card = e.target.closest('.fv-episode-card');
          if (!card) return;
          var epId = parseInt(card.dataset.episodeId, 10);
          var key = getExpandedKey();

          if (expandedEpisodes[key] === epId) {
            // Collapse
            delete expandedEpisodes[key];
            collapseExpansion();
          } else {
            // Expand (or switch)
            expandedEpisodes[key] = epId;
            expandEpisode(feature, epId);
          }
        });
      }
    }

    function expandEpisode(feature, episodeId) {
      // Update card selection state
      var cards = container.querySelectorAll('.fv-episode-card');
      for (var i = 0; i < cards.length; i++) {
        var cardEpId = parseInt(cards[i].dataset.episodeId, 10);
        if (cardEpId === episodeId) {
          cards[i].classList.add('fv-episode-card--selected');
        } else {
          cards[i].classList.remove('fv-episode-card--selected');
        }
      }

      var panel = document.getElementById('fv-expansion');
      if (!panel) return;

      // Find episode data from feature
      var episodeData = null;
      for (var j = 0; j < feature.episodes.length; j++) {
        if (feature.episodes[j].episode_id === episodeId) {
          episodeData = feature.episodes[j];
          break;
        }
      }
      if (!episodeData) {
        console.error('[feature-viewer] Episode ID ' + episodeId + ' not found in feature ' + feature.id + ' episode list.');
        return;
      }

      // Show loading state
      panel.style.display = 'block';
      panel.innerHTML = '<div class="viz-loading"><div class="spinner"></div><p>Loading episode trace...</p></div>';

      // Load trace data
      loadTraceData(activeBenchmark, feature.id, episodeId, function (traceData) {
        // Check we're still on the same expansion
        var key = getExpandedKey();
        if (expandedEpisodes[key] !== episodeId) return;

        if (!traceData) {
          panel.innerHTML = '<div class="fv-expansion-header" style="color: #e53e3e;">Could not load trace data for episode ' + episodeId + '.</div>';
          return;
        }

        renderExpansionContent(panel, traceData, feature, activeBenchmark, episodeData);
      });
    }

    function collapseExpansion() {
      // Remove all selected states
      var cards = container.querySelectorAll('.fv-episode-card--selected');
      for (var i = 0; i < cards.length; i++) {
        cards[i].classList.remove('fv-episode-card--selected');
      }
      var panel = document.getElementById('fv-expansion');
      if (panel) {
        panel.style.display = 'none';
        panel.innerHTML = '';
      }
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
