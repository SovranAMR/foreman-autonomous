/**
 * FOREMAN — Web UI Client
 * WebSocket-based chat + forge pipeline visualization
 */

// ─── State ──────────────────────────────────────────────────
let ws = null;
let connected = false;
let forgeMode = false;
let isResponding = false;
let currentStreamEl = null;
let streamBuffer = '';
let pipelineTimer = null;
let pipelineStartTime = 0;

const PHASE_MAP = {
    vision: 'Vision', decompose: 'Decompose', research: 'Research',
    atomize: 'Atomize', execute: 'Execute', verify: 'Verify',
    reflect: 'Reflect', re_decompose: 'Re-Decompose',
};

// ─── WebSocket ──────────────────────────────────────────────
function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws`);

    ws.onopen = () => {
        connected = true;
        updateConnection(true);
    };

    ws.onclose = () => {
        connected = false;
        updateConnection(false);
        setTimeout(connect, 3000);
    };

    ws.onerror = () => { ws.close(); };

    ws.onmessage = (e) => {
        try {
            const msg = JSON.parse(e.data);
            handleServerMessage(msg);
        } catch { /* ignore */ }
    };
}

function handleServerMessage(msg) {
    switch (msg.type) {
        case 'token':
            hideWelcome();
            if (!currentStreamEl) {
                currentStreamEl = addMessage('assistant', '');
            }
            streamBuffer += msg.text;
            currentStreamEl.querySelector('.message-content').innerHTML = renderMarkdown(streamBuffer);
            scrollToBottom();
            break;

        case 'stream_end':
            currentStreamEl = null;
            streamBuffer = '';
            isResponding = false;
            updateSendBtn();
            break;

        case 'event':
            handlePipelineEvent(msg.event);
            break;

        case 'progress':
            updateStats(msg.progress);
            break;

        case 'project':
            document.getElementById('projectName').textContent = msg.name;
            document.getElementById('projectPath').textContent = msg.path;
            break;

        case 'error':
            addSystemMessage('❌ ' + msg.message, 'error');
            isResponding = false;
            updateSendBtn();
            break;
    }
}

// ─── Pipeline Events ────────────────────────────────────────
function handlePipelineEvent(event) {
    hideWelcome();

    switch (event.type) {
        case 'pipeline_start':
            resetPipeline();
            pipelineStartTime = Date.now();
            pipelineTimer = setInterval(updateTimer, 1000);
            addPipelineCard('⚒️ Forge Pipeline Started', event.detail, 'start');
            break;

        case 'pipeline_end':
            clearInterval(pipelineTimer);
            pipelineTimer = null;
            const success = event.detail?.startsWith('✔');
            addPipelineCard(success ? '✅ Pipeline Complete' : '❌ Pipeline Failed', event.detail, success ? 'success' : 'error');
            isResponding = false;
            updateSendBtn();
            break;

        case 'phase_start':
            setPhaseActive(event.phase);
            break;

        case 'phase_end':
            setPhaseDone(event.phase, event.detail);
            break;

        case 'block_start':
            addAtomEvent('📦', event.detail, '');
            break;

        case 'atom_start':
            addAtomEvent('⚡', event.detail, '');
            break;

        case 'atom_end':
            addAtomEvent('✅', event.detail, event.tokens ? `${event.tokens}t` : '');
            break;

        case 'tool_call':
            addAtomEvent('🔧', event.detail, '');
            break;

        case 'error':
            addAtomEvent('❌', event.detail, '', true);
            break;

        case 'warning':
            addAtomEvent('⚠️', event.detail, '');
            break;
    }
}

function resetPipeline() {
    document.querySelectorAll('.phase-item').forEach(el => {
        el.className = 'phase-item pending';
        const statusEl = el.querySelector('.phase-status');
        if (statusEl) statusEl.textContent = '—';
    });
    document.getElementById('atomList').innerHTML = '';
    document.getElementById('statTokens').textContent = '0';
    document.getElementById('statTools').textContent = '0';
    document.getElementById('statErrors').textContent = '0';
    document.getElementById('statTime').textContent = '0s';
}

function setPhaseActive(phase) {
    if (!phase) return;
    const el = document.querySelector(`[data-phase="${phase}"]`);
    if (el) {
        el.className = 'phase-item active';
        const statusEl = el.querySelector('.phase-status');
        if (statusEl) statusEl.innerHTML = '<span class="spinner"></span>';
    }
}

function setPhaseDone(phase, detail) {
    if (!phase) return;
    const el = document.querySelector(`[data-phase="${phase}"]`);
    if (el) {
        el.className = 'phase-item done';
        const statusEl = el.querySelector('.phase-status');
        if (statusEl) statusEl.textContent = '✓';
    }
}

function addAtomEvent(icon, text, time, isError = false) {
    const list = document.getElementById('atomList');
    const div = document.createElement('div');
    div.className = `pipeline-event${isError ? ' error' : ''}`;
    div.innerHTML = `
    <span class="ev-icon">${icon}</span>
    <span class="ev-text">${escapeHtml((text || '').slice(0, 80))}</span>
    <span class="ev-time">${time}</span>
  `;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
}

function updateStats(progress) {
    if (!progress) return;
    document.getElementById('statTokens').textContent = formatNumber(progress.totalTokens || 0);
    document.getElementById('statTools').textContent = String(progress.toolCalls || 0);
    document.getElementById('statErrors').textContent = String(progress.errors || 0);
}

function updateTimer() {
    if (pipelineStartTime > 0) {
        const elapsed = Math.floor((Date.now() - pipelineStartTime) / 1000);
        document.getElementById('statTime').textContent = elapsed < 60
            ? `${elapsed}s`
            : `${Math.floor(elapsed / 60)}m${elapsed % 60}s`;
    }
}

// ─── Chat Messages ──────────────────────────────────────────
function addMessage(role, content) {
    const messages = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `<div class="message-content">${renderMarkdown(content)}</div>`;
    messages.appendChild(div);
    scrollToBottom();
    return div;
}

function addPipelineCard(title, detail, type) {
    const messages = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'pipeline-card';
    const color = type === 'error' ? 'var(--red)' : type === 'success' ? 'var(--green)' : 'var(--gold)';
    div.innerHTML = `
    <div class="pipeline-card-header" style="color: ${color}">
      <span class="icon">${title.split(' ')[0]}</span>
      <span>${title}</span>
    </div>
    <div style="font-size: 13px; color: var(--text-secondary);">${escapeHtml(detail || '')}</div>
  `;
    messages.appendChild(div);
    scrollToBottom();
}

function addSystemMessage(text, type = 'info') {
    const messages = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'pipeline-card';
    div.style.borderColor = type === 'error' ? 'var(--red)' : 'var(--border)';
    div.innerHTML = `<div style="font-size: 13px; color: ${type === 'error' ? 'var(--red)' : 'var(--text-secondary)'};">${escapeHtml(text)}</div>`;
    messages.appendChild(div);
    scrollToBottom();
}

// ─── Send ───────────────────────────────────────────────────
function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !connected || isResponding) return;

    hideWelcome();
    addMessage('user', text);
    input.value = '';
    autoResize(input);
    isResponding = true;
    updateSendBtn();

    // Check if it's a forge command
    const isForge = forgeMode || text.startsWith('/forge ');
    const cleanText = text.startsWith('/forge ') ? text.slice(7).trim() : text;

    if (isForge) {
        ws.send(JSON.stringify({ type: 'forge', task: cleanText }));
    } else {
        ws.send(JSON.stringify({ type: 'chat', message: text }));
    }
}

function setInput(text) {
    const input = document.getElementById('chatInput');
    input.value = text;
    input.focus();
    autoResize(input);
}

function toggleForge() {
    forgeMode = !forgeMode;
    const btn = document.getElementById('forgeBtn');
    btn.className = forgeMode ? 'btn btn-forge active' : 'btn btn-forge';
    const input = document.getElementById('chatInput');
    input.placeholder = forgeMode
        ? '⚒️ Forge mode: describe what to build...'
        : 'Message Foreman... (Shift+Enter for newline)';
}

function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

function updateSendBtn() {
    document.getElementById('sendBtn').disabled = isResponding;
}

// ─── UI Helpers ─────────────────────────────────────────────
function hideWelcome() {
    const w = document.getElementById('welcome');
    if (w) w.style.display = 'none';
}

function scrollToBottom() {
    const m = document.getElementById('messages');
    requestAnimationFrame(() => { m.scrollTop = m.scrollHeight; });
}

function updateConnection(isConnected) {
    const dot = document.getElementById('connectionDot');
    const text = document.getElementById('connectionText');
    dot.className = isConnected ? 'connection-dot connected' : 'connection-dot';
    text.textContent = isConnected ? 'Connected' : 'Reconnecting...';
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── Simple Markdown Renderer ───────────────────────────────
function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    // Code blocks: ```lang\ncode\n```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

// ─── Init ───────────────────────────────────────────────────
connect();
document.getElementById('chatInput').focus();
