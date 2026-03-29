/* ================================================================
   ui.js
   Pure DOM manipulation — no framework, no state library.
   Called by ws-client.js on every WebSocket event.
   ================================================================ */

const UI = (() => {

  /* ── Element refs ───────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  const els = {
    wsPill:       $('ws-pill'),
    wsLabel:      $('ws-label'),
    hdrFile:      $('hdr-file'),
    stepList:     $('step-list'),
    stepEmpty:    $('step-empty'),
    stepBadge:    $('step-badge'),
    healBadge:    $('heal-badge'),
    healIdle:     $('heal-idle'),
    healSpinner:  $('heal-spinner'),
    healContent:  $('heal-content'),
    healRootCause:$('heal-root-cause'),
    healOldSel:   $('heal-old-sel'),
    healNewSel:   $('heal-new-sel'),
    confNumber:   $('conf-number'),
    confBar:      $('conf-bar'),
    confLabel:    $('conf-label'),
    statTotal:    $('stat-total'),
    statPassed:   $('stat-passed'),
    statHealed:   $('stat-healed'),
    statFailed:   $('stat-failed'),
    statInterv:   $('stat-interv'),
    runStatus:    $('run-status'),
    runStatusTxt: $('run-status-text'),
    fragilityPanel: $('fragility-panel'),
    fragilityList:  $('fragility-list'),
    healTimer:    $('heal-timer'),
    runOverlay:   $('run-overlay'),
    ovTotal:      $('ov-total'),
    ovHealed:     $('ov-healed'),
    ovInterv:     $('ov-interv'),
    ovTime:       $('ov-time'),
    ovIcon:       $('overlay-icon'),
  };

  /* ── Internal state ─────────────────────────────────────── */
  let state = {
    totalSteps: 0,
    steps: {},
    completedSteps: 0,
    currentHealIndex: null,
    currentHealOldSel: null,
  };

  let _runStartTime   = null;  // Date.now() at run:start
  let _healStartTime  = null;  // Date.now() at heal:start
  let _healTimerRaf   = null;  // requestAnimationFrame id

  /* ── Helpers ────────────────────────────────────────────── */

  function setHealView(mode) {
    // mode: 'idle' | 'spinning' | 'result'
    els.healIdle.style.display    = mode === 'idle'    ? 'flex' : 'none';
    els.healSpinner.style.display = mode === 'spinning'? 'flex' : 'none';
    els.healContent.style.display = mode === 'result'  ? 'flex' : 'none';
  }

  function renderStepCard(index) {
    const s = state.steps[index];
    if (!s) return;

    const existing = document.querySelector(`[data-step-index="${index}"]`);
    const card = existing || document.createElement('div');

    const stateMap = {
      pending: { icon: '○', label: 'Pending' },
      running: { icon: '⟳', label: 'Running…' },
      pass:    { icon: '✓', label: 'Passed'  },
      fail:    { icon: '✕', label: 'Failed'  },
      healing: { icon: '⚡', label: 'Healing…'},
      healed:  { icon: '✦', label: 'Healed'  },
    };

    const { icon, label } = stateMap[s.state] || stateMap.pending;

    card.className   = `step-card state-${s.state}`;
    card.dataset.stepIndex = index;
    card.innerHTML = `
      <div class="step-icon">${icon}</div>
      <div class="step-info">
        <div class="step-index">Step ${index + 1}</div>
        <div class="step-name" title="${s.name}">${s.name}</div>
        ${s.state === 'healed' ? '<div class="step-healed-flash">⚡ Healed</div>' : ''}
      </div>
      <div class="step-state-label">${label}</div>
    `;

    if (!existing) {
      // Remove the "empty" placeholder if first real card
      if (els.stepEmpty) els.stepEmpty.style.display = 'none';
      els.stepList.appendChild(card);
    }

    // Scroll newly-active card into view
    if (s.state === 'running' || s.state === 'healing') {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function updateStepBadge() {
    const done = Object.values(state.steps)
      .filter(s => ['pass','fail','healed'].includes(s.state)).length;
    els.stepBadge.textContent = `${done} / ${state.totalSteps}`;
  }

  function updateSummaryStats({ total, passed, healed, failed, interventions } = {}) {
    if (total        !== undefined) els.statTotal.textContent  = total;
    if (passed       !== undefined) els.statPassed.textContent = passed;
    if (healed       !== undefined) els.statHealed.textContent = healed;
    if (failed       !== undefined) els.statFailed.textContent = failed;
    if (interventions!== undefined) els.statInterv.textContent = interventions;
  }

  /* ── WS connection state ────────────────────────────────── */
  function setWsState(wsState) {
    const pill = els.wsPill;
    pill.classList.remove('connected', 'reconnecting');
    const map = {
      connecting:   { label: 'Connecting…',   cls: '' },
      connected:    { label: 'Live',           cls: 'connected' },
      reconnecting: { label: 'Reconnecting…', cls: 'reconnecting' },
      disconnected: { label: 'Disconnected',  cls: '' },
    };
    const { label, cls } = map[wsState] || map.connecting;
    els.wsLabel.textContent = label;
    if (cls) pill.classList.add(cls);
  }

  /* ── Event handlers ─────────────────────────────────────── */

  /**
   * { type:'run:start', file:'checkout.spec.js', totalSteps:6 }
   */
  function onRunStart(msg) {
    _runStartTime = Date.now();
    // Reset state
    state = {
      totalSteps:       msg.totalSteps || 0,
      steps:            {},
      completedSteps:   0,
      currentHealIndex: null,
      currentHealOldSel: null,
    };

    // Reset step list UI
    els.stepList.innerHTML = '';
    const emptyEl = document.createElement('div');
    emptyEl.id = 'step-empty';
    emptyEl.className = 'step-empty';
    emptyEl.style.display = 'none';
    els.stepList.appendChild(emptyEl);

    // Pre-populate all step slots as "pending"
    for (let i = 0; i < state.totalSteps; i++) {
      state.steps[i] = { name: `Step ${i + 1}`, state: 'pending' };
      renderStepCard(i);
    }

    // Reset header
    els.hdrFile.textContent = msg.file || 'Unknown file';

    // Reset stats
    updateSummaryStats({ total: state.totalSteps, passed: 0, healed: 0, failed: 0, interventions: 0 });
    els.stepBadge.textContent = `0 / ${state.totalSteps}`;

    // Reset heal panel
    setHealView('idle');
    els.healBadge.textContent = 'Idle';

    // Run status
    els.runStatus.className = 'run-status running';
    els.runStatusTxt.textContent = 'Running';
  }

  /**
   * { type:'step:start', index:2, name:'healClick #view-cart' }
   */
  function onStepStart(msg) {
    const { index, name } = msg;
    state.steps[index] = state.steps[index] || { name, state: 'pending' };
    state.steps[index].name  = name || state.steps[index].name;
    state.steps[index].state = 'running';
    renderStepCard(index);
    updateStepBadge();
  }

  /**
   * { type:'step:pass', index:2 }
   * { type:'step:pass', index:2, healed:true }
   */
  function onStepPass(msg) {
    const { index, healed } = msg;
    const s = state.steps[index];
    if (!s) return;

    // If this was a healed step, keep it amber (healed state is already set by heal:done)
    if (!healed) {
      s.state = 'pass';
    }
    renderStepCard(index);
    updateStepBadge();

    // Update pass counter in summary (non-healed only — healed already counted separately)
    if (!healed) {
      const current = parseInt(els.statPassed.textContent, 10) || 0;
      updateSummaryStats({ passed: current + 1 });
    }
  }

  /**
   * { type:'step:fail', index:2, error:'Element not found: #view-cart' }
   */
  function onStepFail(msg) {
    const { index, error } = msg;
    const s = state.steps[index];
    if (!s) return;

    s.state = 'fail';
    // Capture the old selector from the error message for heal display
    const selectorMatch = error && error.match(/:\s*(.+)$/);
    state.currentHealOldSel = selectorMatch ? selectorMatch[1].trim() : (error || '?');

    renderStepCard(index);
    updateStepBadge();

    const current = parseInt(els.statFailed.textContent, 10) || 0;
    updateSummaryStats({ failed: current + 1 });
  }

  /**
   * { type:'heal:start', index:2 }
   */
  function onHealStart(msg) {
    const { index } = msg;
    state.currentHealIndex = index;

    const s = state.steps[index];
    if (s) { s.state = 'healing'; renderStepCard(index); }

    setHealView('spinning');
    els.healBadge.textContent = `Step ${index + 1}`;

    // Start live timer
    _healStartTime = Date.now();
    const tick = () => {
      if (!_healStartTime) return;
      const sec = ((Date.now() - _healStartTime) / 1000).toFixed(1);
      if (els.healTimer) els.healTimer.textContent = `${sec}s`;
      _healTimerRaf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(_healTimerRaf);
    _healTimerRaf = requestAnimationFrame(tick);
  }

  /**
   * { type:'heal:reason', rootCause:'...', newSelector:'...', confidence:0.94 }
   */
  function onHealReason(msg) {
    const { rootCause, newSelector, confidence } = msg;
    const pct = Math.round((confidence || 0) * 100);
    const isHigh = confidence >= 0.8;

    // Root cause
    els.healRootCause.textContent = rootCause || '—';

    // Selectors
    els.healOldSel.textContent = state.currentHealOldSel || '—';
    els.healNewSel.textContent = newSelector || '—';

    // Confidence number
    els.confNumber.textContent = `${pct}%`;
    els.confNumber.className   = `conf-number ${isHigh ? 'high' : 'low'}`;

    // Bar
    els.confBar.style.width = `${pct}%`;
    els.confBar.className   = `conf-bar-fill ${isHigh ? '' : 'low'}`;

    // Label
    els.confLabel.textContent = isHigh ? '✓ High confidence — auto-applying' : '⚠ Low confidence — review recommended';
    els.confLabel.className   = `conf-label ${isHigh ? 'high' : 'low'}`;

    setHealView('result');
  }

  /**
   * { type:'heal:done', index:2, newSelector:'#cart-icon', healed:true }
   */
  function onHealDone(msg) {
    const { index, healed } = msg;

    // Stop timer
    cancelAnimationFrame(_healTimerRaf);
    _healStartTime = null;

    if (healed) {
      const s = state.steps[index];
      if (s) { s.state = 'healed'; renderStepCard(index); }

      const hCurrent = parseInt(els.statHealed.textContent, 10) || 0;
      updateSummaryStats({ healed: hCurrent + 1 });

      // Decrement the fail count that was added in step:fail
      const fCurrent = parseInt(els.statFailed.textContent, 10) || 0;
      if (fCurrent > 0) updateSummaryStats({ failed: fCurrent - 1 });

      els.healBadge.textContent = `Healed ✦`;
    } else {
      els.healBadge.textContent = 'Failed to heal';
    }
  }

  /**
   * { type:'run:done', passed:5, healed:2, failed:0, interventions:0 }
   */
  function onRunDone(msg) {
    const { passed, healed, failed, interventions } = msg;
    updateSummaryStats({
      total:         state.totalSteps,
      passed:        passed        ?? parseInt(els.statPassed.textContent, 10),
      healed:        healed        ?? parseInt(els.statHealed.textContent, 10),
      failed:        failed        ?? parseInt(els.statFailed.textContent, 10),
      interventions: interventions ?? 0,
    });

    const allOk = (failed === 0 || failed === undefined);
    els.runStatus.className  = `run-status done`;
    els.runStatusTxt.textContent = allOk ? '✓ Run Complete' : '✕ Run Complete (failures)';
    if (!allOk) els.runStatus.style.color = 'var(--red)';

    els.stepBadge.textContent = `${state.totalSteps} / ${state.totalSteps}`;

    // Show full-screen overlay
    const totalSec = _runStartTime ? (((Date.now() - _runStartTime) / 1000).toFixed(1) + 's') : '—';
    const h = healed ?? parseInt(els.statHealed.textContent, 10) ?? 0;
    const t = state.totalSteps;
    const iv = interventions ?? 0;

    els.ovTotal.textContent  = t;
    els.ovHealed.textContent = h;
    els.ovInterv.textContent = iv;
    els.ovTime.textContent   = totalSec;
    els.ovIcon.textContent   = allOk ? '✦' : '✕';
    els.runOverlay.classList.add('show');
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {
    setWsState,
    onRunStart,
    onStepStart,
    onStepPass,
    onStepFail,
    onHealStart,
    onHealReason,
    onHealDone,
    onRunDone,
    onFragilityScan: (msg) => {
      const results = msg.results || [];
      if (results.length === 0) return;
      
      els.fragilityPanel.style.display = 'block';
      els.fragilityList.innerHTML = results.map(r => `
        <div class="fragility-row">
          <div class="frag-sel">${r.selector}</div>
          <div class="frag-bar-wrap">
            <div class="frag-bar-fill risk-${r.risk}" style="width: ${Math.round(r.score * 100)}%"></div>
          </div>
          <div class="risk-badge risk-${r.risk}">${r.risk}</div>
        </div>
      `).join('');
    }
  };

})();
