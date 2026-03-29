/* ================================================================
   chat.js — Agent-style Chat Module
   Handles message rendering, streaming, markdown, and commands.
   ================================================================ */

const Chat = (() => {
  let commands = [];
  let currentStreamMsgId = null;
  let streamBuffer = {};

  function setCommands(cmds) {
    commands = cmds || [];
    _allCommands = cmds || [];
    renderWelcomeCommands();
  }

  function renderWelcomeCommands() {
    const el = document.getElementById('welcomeCmds');
    if (!el) return;
    el.innerHTML = commands
      .filter(c => c.name !== 'clear')
      .map(c => `<button class="welcome-cmd" onclick="prefillChat('/${c.name} ')">${c.icon || ''} /${c.name}</button>`)
      .join('');
  }

  function hideWelcome() {
    const w = document.getElementById('chatWelcome');
    if (w) w.style.display = 'none';
  }

  function addUserMessage(content, command) {
    hideWelcome();
    const container = document.getElementById('chatMessages');
    const msg = document.createElement('div');
    msg.className = 'msg user';
    msg.innerHTML = `
      <div class="msg-body" style="display:flex;flex-direction:column;align-items:flex-end;">
        <div class="msg-header" style="justify-content:flex-end;">
          ${command ? `<span class="msg-badge">/${command}</span>` : ''}
          <span class="msg-name user">You</span>
        </div>
        <div class="msg-content">${escHtml(content)}</div>
      </div>
      <div class="msg-avatar user">U</div>`;
    container.appendChild(msg);
    scrollToBottom();
  }

  function startAssistantMessage(msgId, command) {
    hideWelcome();
    currentStreamMsgId = msgId;
    streamBuffer[msgId] = '';
    const container = document.getElementById('chatMessages');
    const msg = document.createElement('div');
    msg.className = 'msg ai';
    msg.id = 'msg-' + msgId;
    msg.innerHTML = `
      <div class="msg-avatar ai">&#9878;</div>
      <div class="msg-body">
        <div class="msg-header">
          <span class="msg-name ai">SelfHeal</span>
          ${command ? `<span class="msg-badge">/${command}</span>` : ''}
        </div>
        <div class="msg-content" id="content-${msgId}">
          <div class="typing"><span></span><span></span><span></span></div>
        </div>
      </div>`;
    container.appendChild(msg);
    scrollToBottom();
  }

  function appendChunk(msgId, chunk, done) {
    if (streamBuffer[msgId] === undefined) streamBuffer[msgId] = '';
    streamBuffer[msgId] += (chunk || '');
    const contentEl = document.getElementById('content-' + msgId);
    if (!contentEl) return;
    if (done) {
      contentEl.innerHTML = renderMarkdown(streamBuffer[msgId]);
      addCopyButtons(contentEl);
      currentStreamMsgId = null;
      delete streamBuffer[msgId];
    } else {
      contentEl.innerHTML = renderMarkdown(streamBuffer[msgId]) +
        '<div class="typing"><span></span><span></span><span></span></div>';
    }
    scrollToBottom();
  }

  function restoreHistory(messages) {
    if (!messages || messages.length === 0) return;
    hideWelcome();
    messages.forEach(m => {
      if (m.role === 'user') addUserMessage(m.content, m.command);
      else { startAssistantMessage(m.id, m.command); appendChunk(m.id, m.content, true); }
    });
  }

  function clear() {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';
    const w = document.getElementById('chatWelcome');
    if (w) { w.style.display = 'flex'; container.appendChild(w); }
    streamBuffer = {};
    currentStreamMsgId = null;
  }

  function renderMarkdown(text) {
    if (!text) return '';
    let html = escHtml(text);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="lang-${lang}">${code.trim()}</code><button class="copy-btn" onclick="copyCode(this)">Copy</button></pre>`);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    return '<p>' + html + '</p>';
  }

  function addCopyButtons(container) {
    container.querySelectorAll('pre').forEach(pre => {
      if (!pre.querySelector('.copy-btn')) {
        const btn = document.createElement('button');
        btn.className = 'copy-btn'; btn.textContent = 'Copy';
        btn.onclick = () => copyCode(btn); pre.appendChild(btn);
      }
    });
  }

  function scrollToBottom() {
    const el = document.getElementById('chatMessages');
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }

  function escHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { setCommands, addUserMessage, startAssistantMessage, appendChunk, restoreHistory, clear };
})();

/* ── Global helpers ── */
let _allCommands = [];
let activeDropdownIndex = -1;

function prefillChat(text) {
  const input = document.getElementById('chatInput');
  input.value = text; input.focus(); onChatInputChange(input);
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = ''; input.style.height = 'auto'; hideCmdDropdown();
  if (typeof vscode !== 'undefined') vscode.postMessage({ type: 'chatMessage', text });
}

function onChatKeyDown(e) {
  const dropdown = document.getElementById('cmdDropdown');
  if (dropdown.classList.contains('show')) {
    const items = dropdown.querySelectorAll('.cmd-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); activeDropdownIndex = Math.min(activeDropdownIndex + 1, items.length - 1); updateDropdownActive(items); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeDropdownIndex = Math.max(activeDropdownIndex - 1, 0); updateDropdownActive(items); }
    else if (e.key === 'Enter' && activeDropdownIndex >= 0) { e.preventDefault(); items[activeDropdownIndex]?.click(); }
    else if (e.key === 'Escape') { hideCmdDropdown(); }
    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); hideCmdDropdown(); sendChat(); }
  } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
}

function onChatInputChange(el) {
  el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  if (el.value.startsWith('/')) showCmdDropdown(el.value); else hideCmdDropdown();
}

function showCmdDropdown(partial) {
  const query = partial.slice(1).toLowerCase().split(' ')[0];
  const filtered = _allCommands.filter(c => !query || c.name.startsWith(query));
  const dropdown = document.getElementById('cmdDropdown');
  if (filtered.length === 0) { hideCmdDropdown(); return; }
  activeDropdownIndex = 0;
  dropdown.innerHTML = filtered.map((c, i) => `
    <div class="cmd-item ${i === 0 ? 'active' : ''}" onclick="selectCmd('${c.name}')">
      <span class="cmd-icon">${c.icon || ''}</span>
      <div class="cmd-info"><div class="cmd-name">/${c.name}</div><div class="cmd-desc">${c.description || ''}</div></div>
    </div>`).join('');
  dropdown.classList.add('show');
}

function hideCmdDropdown() { document.getElementById('cmdDropdown').classList.remove('show'); activeDropdownIndex = -1; }
function updateDropdownActive(items) { items.forEach((it, i) => it.classList.toggle('active', i === activeDropdownIndex)); }
function selectCmd(name) { document.getElementById('chatInput').value = '/' + name + ' '; document.getElementById('chatInput').focus(); hideCmdDropdown(); }
function copyCode(btn) {
  const code = btn.previousElementSibling?.textContent || btn.parentElement.querySelector('code')?.textContent || '';
  navigator.clipboard?.writeText(code); btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1500);
}
