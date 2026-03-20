/* global state */
const API = '';
let currentIncidentId = null;
let incidents = [];

// ── Utils ──────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 4000);
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function api(path, method = 'GET', body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}/api${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Source status ──────────────────────────────────────────────────────────
async function loadSourceStatus() {
  try {
    const sources = await api('/sources');
    const container = document.getElementById('sourceStatus');
    container.innerHTML = sources.map(s => `
      <div class="source-chip ${s.configured ? 'ok' : 'warn'}">
        ${s.configured ? '✅' : '⚠️'} ${s.name}
      </div>
    `).join('');
  } catch (e) {
    console.warn('Could not load source status:', e);
  }
}

// ── Incident list ──────────────────────────────────────────────────────────
async function loadIncidents() {
  try {
    incidents = await api('/incidents');
    renderIncidentList();
  } catch (e) {
    showToast('Failed to load incidents: ' + e.message, 'error');
  }
}

function renderIncidentList() {
  const el = document.getElementById('incidentList');
  if (!incidents.length) {
    el.innerHTML = '<div class="empty-state">No incidents yet.<br/>Create one or scan your data sources.</div>';
    return;
  }
  el.innerHTML = incidents.map(inc => `
    <div class="incident-item ${inc.id === currentIncidentId ? 'active' : ''}"
         onclick="selectIncident('${inc.id}')">
      <div class="incident-item-title">${esc(inc.title)}</div>
      <div class="incident-item-meta">
        <span class="badge ${inc.severity}">${inc.severity}</span>
        <span class="status-chip status-${inc.status}">${inc.status}</span>
        <span class="incident-item-source">${inc.source}</span>
      </div>
    </div>
  `).join('');
}

// ── Incident detail ────────────────────────────────────────────────────────
async function selectIncident(id) {
  currentIncidentId = id;
  try {
    const inc = await api(`/incidents/${id}`);
    renderIncidentDetail(inc);
    renderIncidentList(); // refresh active highlight
  } catch (e) {
    showToast('Failed to load incident: ' + e.message, 'error');
  }
}

function renderIncidentDetail(inc) {
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('incidentDetail').style.display = 'flex';
  document.getElementById('incidentDetail').style.flexDirection = 'column';

  document.getElementById('detailTitle').textContent = inc.title;
  document.getElementById('detailDescription').textContent = inc.description;

  const badge = document.getElementById('detailSeverityBadge');
  badge.className = `badge ${inc.severity}`;
  badge.textContent = inc.severity;

  const statusChip = document.getElementById('detailStatus');
  statusChip.className = `status-chip status-${inc.status}`;
  statusChip.textContent = inc.status;

  document.getElementById('detailCreated').textContent = fmtDate(inc.createdAt);
  document.getElementById('detailSource').textContent = `source: ${inc.source}`;

  const sel = document.getElementById('statusSelect');
  sel.value = inc.status;

  // AI analysis
  if (inc.analysis) {
    document.getElementById('aiAnalysisBlock').style.display = 'block';
    document.getElementById('noAnalysisBlock').style.display = 'none';
    document.getElementById('analysisSummary').textContent = inc.analysis.summary;
    document.getElementById('analysisRootCause').textContent = inc.analysis.rootCauseSuggestion;
    document.getElementById('analysisImpact').textContent = inc.analysis.impactAssessment;
    document.getElementById('analysisTime').textContent = 'Generated ' + fmtDate(inc.analysis.generatedAt);

    const similar = inc.analysis.similarIncidents || [];
    if (similar.length) {
      document.getElementById('similarIncidentsBlock').style.display = 'block';
      document.getElementById('similarIncidentsList').innerHTML = similar.map(s => `<li>${esc(s)}</li>`).join('');
    }
  } else {
    document.getElementById('aiAnalysisBlock').style.display = 'none';
    document.getElementById('noAnalysisBlock').style.display = 'block';
  }

  // Remediation
  renderRemediationSteps(inc.remediationSteps || []);

  // Timeline
  renderTimeline(inc.timeline || []);

  // Events
  renderEvents(inc.events || []);
}

function renderRemediationSteps(steps) {
  const container = document.getElementById('remediationSteps');
  const noRem = document.getElementById('noRemediation');
  if (!steps.length) {
    container.innerHTML = '';
    noRem.style.display = 'block';
    return;
  }
  noRem.style.display = 'none';
  container.innerHTML = steps.sort((a, b) => a.order - b.order).map(step => `
    <div class="remediation-step ${step.completed ? 'completed' : ''}" id="step-${step.order}">
      <div class="step-number ${step.completed ? 'done' : ''}">${step.completed ? '✓' : step.order}</div>
      <div class="step-body">
        <div class="step-title">${esc(step.title)}</div>
        <div class="step-desc">${esc(step.description)}</div>
        ${step.command ? `<div class="step-command">${esc(step.command)}</div>` : ''}
        <div class="step-tags">
          ${step.automated ? '<span class="badge medium">automatable</span>' : ''}
          ${step.link ? `<a href="${esc(step.link)}" target="_blank" style="color:var(--primary);font-size:12px;">Docs ↗</a>` : ''}
        </div>
        <button class="step-complete-btn" onclick="completeStep(${step.order})"
          ${step.completed ? 'disabled' : ''}>
          ${step.completed ? 'Done' : 'Mark Complete'}
        </button>
      </div>
    </div>
  `).join('');
}

function renderTimeline(entries) {
  const container = document.getElementById('timelineList');
  container.innerHTML = [...entries].reverse().map(e => `
    <div class="timeline-entry">
      <span class="timeline-actor actor-${e.actor}">${e.actor}</span>
      <span class="timeline-msg">${esc(e.message)}</span>
      <span class="timeline-time">${fmtDate(e.timestamp)}</span>
    </div>
  `).join('');
}

function renderEvents(events) {
  const container = document.getElementById('eventsList');
  if (!events.length) {
    container.innerHTML = '<div class="empty-state">No events collected yet.</div>';
    return;
  }
  container.innerHTML = events.map(e => `
    <div class="event-item">
      <div class="event-header">
        <span class="event-source-badge source-${e.source}">${e.source}</span>
        <span class="event-title">${esc(e.title)}</span>
      </div>
      <div class="event-desc">${esc(e.description)}</div>
    </div>
  `).join('');
}

// ── Actions ────────────────────────────────────────────────────────────────
async function triggerAnalysis() {
  if (!currentIncidentId) return;
  const btn = document.getElementById('analyzeBtn');
  btn.innerHTML = '<span class="spinner"></span>Analyzing...';
  btn.disabled = true;
  try {
    const inc = await api(`/incidents/${currentIncidentId}/analyze`, 'POST');
    renderIncidentDetail(inc);
    await loadIncidents();
    showToast('AI analysis complete!', 'success');
    document.querySelector('[data-tab="overview"]').click();
  } catch (e) {
    showToast('Analysis failed: ' + e.message, 'error');
  } finally {
    btn.innerHTML = 'AI Analyze';
    btn.disabled = false;
  }
}

async function completeStep(order) {
  if (!currentIncidentId) return;
  try {
    const inc = await api(`/incidents/${currentIncidentId}/remediation/${order}/complete`, 'POST');
    renderIncidentDetail(inc);
    await loadIncidents();
    showToast(`Step ${order} completed!`, 'success');
  } catch (e) {
    showToast('Failed to complete step: ' + e.message, 'error');
  }
}

async function scanSources() {
  const btn = document.getElementById('scanBtn');
  btn.innerHTML = '<span class="spinner"></span>Scanning...';
  btn.disabled = true;
  try {
    const results = await api('/sources/scan', 'POST');
    renderScanResults(results);
    document.getElementById('scanModal').style.display = 'flex';
  } catch (e) {
    showToast('Scan failed: ' + e.message, 'error');
  } finally {
    btn.innerHTML = 'Scan Sources';
    btn.disabled = false;
  }
}

function renderScanResults(results) {
  const container = document.getElementById('scanResults');
  container.innerHTML = results.map(r => `
    <div class="scan-source-block">
      <div class="scan-source-header">
        <span class="scan-source-name">${esc(r.name || r.source)}</span>
        <span class="scan-event-count">${r.result?.events?.length || 0} events found</span>
      </div>
      ${r.result?.events?.length ? `
        <div class="scan-events-list">
          ${r.result.events.slice(0, 5).map(e => `
            <div class="scan-event-item">[${e.source}] ${esc(e.title)}</div>
          `).join('')}
          ${r.result.events.length > 5 ? `<div class="scan-event-item" style="color:var(--text-dim)">...and ${r.result.events.length - 5} more</div>` : ''}
        </div>
      ` : `<div style="padding:12px 16px;color:var(--text-dim);font-size:13px;">${r.configured === false ? 'Not configured — check .env file' : 'No events found in the last hour'}</div>`}
    </div>
  `).join('');
}

// ── Event handlers ─────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.getElementById('newIncidentBtn').onclick = () => {
  document.getElementById('newIncidentModal').style.display = 'flex';
};
document.getElementById('welcomeNewBtn').onclick = () => {
  document.getElementById('newIncidentModal').style.display = 'flex';
};
document.getElementById('welcomeScanBtn').onclick = scanSources;
document.getElementById('scanBtn').onclick = scanSources;

document.getElementById('closeModal').onclick = () => {
  document.getElementById('newIncidentModal').style.display = 'none';
};
document.getElementById('cancelModal').onclick = () => {
  document.getElementById('newIncidentModal').style.display = 'none';
};
document.getElementById('closeScanModal').onclick = () => {
  document.getElementById('scanModal').style.display = 'none';
};
document.getElementById('closeScanBtn').onclick = () => {
  document.getElementById('scanModal').style.display = 'none';
};

document.getElementById('newIncidentForm').onsubmit = async (e) => {
  e.preventDefault();
  const title = document.getElementById('incidentTitle').value.trim();
  const description = document.getElementById('incidentDesc').value.trim();
  const severity = document.getElementById('incidentSeverity').value;
  const services = document.getElementById('incidentServices').value.split(',').map(s => s.trim()).filter(Boolean);
  const tags = document.getElementById('incidentTags').value.split(',').map(s => s.trim()).filter(Boolean);

  try {
    const inc = await api('/incidents', 'POST', { title, description, severity, affectedServices: services, tags });
    document.getElementById('newIncidentModal').style.display = 'none';
    document.getElementById('newIncidentForm').reset();
    await loadIncidents();
    selectIncident(inc.id);
    showToast('Incident created!', 'success');
  } catch (e) {
    showToast('Failed to create incident: ' + e.message, 'error');
  }
};

document.getElementById('analyzeBtn').onclick = triggerAnalysis;

document.getElementById('statusSelect').onchange = async (e) => {
  if (!currentIncidentId) return;
  try {
    await api(`/incidents/${currentIncidentId}/status`, 'PATCH', { status: e.target.value });
    await loadIncidents();
    showToast(`Status updated to: ${e.target.value}`, 'success');
  } catch (err) {
    showToast('Failed to update status: ' + err.message, 'error');
  }
};

document.getElementById('deleteBtn').onclick = async () => {
  if (!currentIncidentId || !confirm('Delete this incident?')) return;
  try {
    await api(`/incidents/${currentIncidentId}`, 'DELETE');
    currentIncidentId = null;
    document.getElementById('incidentDetail').style.display = 'none';
    document.getElementById('welcomeScreen').style.display = 'flex';
    await loadIncidents();
    showToast('Incident deleted', 'info');
  } catch (e) {
    showToast('Failed to delete: ' + e.message, 'error');
  }
};

document.getElementById('addTimelineBtn').onclick = async () => {
  const input = document.getElementById('timelineInput');
  const msg = input.value.trim();
  if (!msg || !currentIncidentId) return;
  try {
    const inc = await api(`/incidents/${currentIncidentId}/timeline`, 'POST', { message: msg });
    input.value = '';
    renderTimeline(inc.timeline);
  } catch (e) {
    showToast('Failed to add note: ' + e.message, 'error');
  }
};

document.getElementById('timelineInput').onkeydown = (e) => {
  if (e.key === 'Enter') document.getElementById('addTimelineBtn').click();
};

document.getElementById('addEventBtn').onclick = async () => {
  const title = document.getElementById('eventTitle').value.trim();
  const description = document.getElementById('eventDescription').value.trim();
  if (!title || !currentIncidentId) return;
  try {
    const inc = await api(`/incidents/${currentIncidentId}/events`, 'POST', { title, description, source: 'http', type: 'manual' });
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDescription').value = '';
    if (inc) renderEvents(inc.events);
  } catch (e) {
    showToast('Failed to add event: ' + e.message, 'error');
  }
};

// Chat
document.getElementById('sendChatBtn').onclick = sendChat;
document.getElementById('chatInput').onkeydown = (e) => {
  if (e.key === 'Enter') sendChat();
};

async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg || !currentIncidentId) return;

  const chatContainer = document.getElementById('chatMessages');
  chatContainer.innerHTML += `<div class="chat-msg user">${esc(msg)}</div>`;
  chatContainer.innerHTML += `<div class="chat-msg ai loading-text"><span class="spinner"></span>Claude is thinking...</div>`;
  chatContainer.scrollTop = chatContainer.scrollHeight;
  input.value = '';

  try {
    const { reply } = await api(`/incidents/${currentIncidentId}/chat`, 'POST', { message: msg });
    const loadingMsg = chatContainer.querySelector('.chat-msg.ai.loading-text');
    if (loadingMsg) loadingMsg.remove();
    chatContainer.innerHTML += `<div class="chat-msg ai">${esc(reply)}</div>`;
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } catch (e) {
    const loadingMsg = chatContainer.querySelector('.chat-msg.ai.loading-text');
    if (loadingMsg) loadingMsg.remove();
    showToast('Chat failed: ' + e.message, 'error');
  }
}

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  };
});

// ── Init ───────────────────────────────────────────────────────────────────
(async () => {
  await Promise.all([loadIncidents(), loadSourceStatus()]);
})();
