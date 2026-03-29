
/* ================================================================
   ws-client.js
   Connects to the hosting server dynamically based on origin.
   Handles the Phase 3 WebSocket event contract and delegates
   every event to the matching ui.js function.
   ================================================================ */

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${wsProtocol}//${window.location.host}`;
const RECONNECT_DELAY_MS = 3000;

let ws = null;

function connect() {
  UI.setWsState('connecting');

  try {
    ws = new WebSocket(WS_URL);
  } catch (err) {
    console.error('[ws-client] WebSocket construction failed:', err);
    UI.setWsState('disconnected');
    setTimeout(connect, RECONNECT_DELAY_MS);
    return;
  }

  ws.addEventListener('open', () => {
    console.log('[ws-client] Connected to', WS_URL);
    UI.setWsState('connected');
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      console.warn('[ws-client] Non-JSON message ignored:', event.data);
      return;
    }

    console.log('[ws-client] ←', msg.type, msg);
    dispatch(msg);
  });

  ws.addEventListener('close', () => {
    console.warn('[ws-client] Connection closed. Reconnecting in', RECONNECT_DELAY_MS, 'ms…');
    UI.setWsState('reconnecting');
    setTimeout(connect, RECONNECT_DELAY_MS);
  });

  ws.addEventListener('error', (err) => {
    console.error('[ws-client] Error:', err);
    // close event will fire next and trigger reconnect
  });
}

/* ── Event router ──────────────────────────────────────────── */
function dispatch(msg) {
  switch (msg.type) {

    // { type:'run:start', file:'checkout.spec.js', totalSteps:6 }
    case 'run:start':
      UI.onRunStart(msg);
      break;

    // { type:'step:start', index:2, name:'healClick #view-cart' }
    case 'step:start':
      UI.onStepStart(msg);
      break;

    // { type:'step:pass', index:2 }
    // { type:'step:pass', index:2, healed:true }
    case 'step:pass':
      UI.onStepPass(msg);
      break;

    // { type:'step:fail', index:2, error:'Element not found: #view-cart' }
    case 'step:fail':
      UI.onStepFail(msg);
      break;

    // { type:'heal:start', index:2 }
    case 'heal:start':
      UI.onHealStart(msg);
      break;

    // { type:'heal:reason', rootCause:'...', newSelector:'...', confidence:0.94 }
    case 'heal:reason':
      UI.onHealReason(msg);
      break;

    // { type:'heal:done', index:2, newSelector:'#cart-icon', healed:true }
    case 'heal:done':
      UI.onHealDone(msg);
      break;

    // { type:'run:done', passed:5, healed:2, failed:0, interventions:0 }
    case 'run:done':
      UI.onRunDone(msg);
      break;

    case 'fragility:scan':
      UI.onFragilityScan(msg);
      break;

    default:
      console.log('[ws-client] Unknown event type:', msg.type);
  }
}

// Kick off connection when the page loads
window.addEventListener('DOMContentLoaded', connect);

