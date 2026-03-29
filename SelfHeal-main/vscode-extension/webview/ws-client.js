/* ================================================================
   ws-client.js — WebSocket Client for CLI integration
   Connects to the SelfHeal CLI runner's WebSocket server.
   ================================================================ */

const WS = (() => {
  let ws = null;
  const RECONNECT_DELAY = 3000;

  function connect(port) {
    if (ws && ws.readyState <= 1) return;

    const url = `ws://localhost:${port}`;
    console.log('[ws-client] Connecting to', url);

    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.error('[ws-client] WebSocket construction failed:', err);
      return;
    }

    ws.addEventListener('open', () => {
      console.log('[ws-client] Connected');
      if (typeof UI !== 'undefined') UI.setWsState('connected');
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      dispatch(msg);
    });

    ws.addEventListener('close', () => {
      console.warn('[ws-client] Disconnected');
      if (typeof UI !== 'undefined') UI.setWsState('disconnected');
      setTimeout(() => connect(port), RECONNECT_DELAY);
    });

    ws.addEventListener('error', (err) => {
      console.error('[ws-client] Error:', err);
    });
  }

  function dispatch(msg) {
    if (typeof UI === 'undefined') return;
    switch (msg.type) {
      case 'run:start':      UI.onRunStart(msg); break;
      case 'step:start':     UI.onStepStart(msg); break;
      case 'step:pass':      UI.onStepPass(msg); break;
      case 'step:fail':      UI.onStepFail(msg); break;
      case 'heal:start':     UI.onHealStart(msg); break;
      case 'heal:reason':    UI.onHealReason(msg); break;
      case 'heal:done':      UI.onHealDone(msg); break;
      case 'run:done':       UI.onRunDone(msg); break;
      case 'fragility:scan': UI.onFragilityScan(msg); break;
    }
  }

  return { connect };
})();
