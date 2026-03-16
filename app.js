const API_BASE = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) || window.location.origin;

document.addEventListener('DOMContentLoaded', async () => {
  const tabs = document.querySelectorAll('.input-tab');
  const urlTab = document.getElementById('urlTab');
  const uploadTab = document.getElementById('uploadTab');
  const urlInput = document.getElementById('urlInput');
  const fileInput = document.getElementById('fileInput');
  const uploadZone = document.getElementById('uploadZone');
  const fileSelected = document.getElementById('fileSelected');
  const fileName = document.getElementById('fileName');
  const fileRemove = document.getElementById('fileRemove');
  const extractBtn = document.getElementById('extractBtn');
  const inputSection = document.querySelector('.app-input-section');
  const processingSection = document.getElementById('processingSection');
  const resultsSection = document.getElementById('resultsSection');
  const processingStep = document.getElementById('processingStep');
  const progressFill = document.getElementById('progressFill');
  const resultsGrid = document.getElementById('resultsGrid');
  const resultsMeta = document.getElementById('resultsMeta');
  const newExtract = document.getElementById('newExtract');
  const usageBadge = document.getElementById('usageBadge');
  const authBtn = document.getElementById('authBtn');

  let selectedFile = null;
  let currentTab = 'url';
  let useSupabase = false;
  let accessInfo = null; // { hasAccess, reason, plan, expires }

  const params = new URLSearchParams(window.location.search);
  if (params.get('url')) {
    urlInput.value = params.get('url');
  }

  // --- Init Supabase ---
  try {
    useSupabase = initSupabase();
  } catch (e) {
    console.error('Supabase init error:', e);
    useSupabase = false;
  }

  if (useSupabase) {
    try {
      await getSession();
      onAuthStateChange(async (event, sess) => {
        updateNavAuth(sess?.user);
        await refreshAccess();
      });
      updateNavAuth(currentUser);
      await refreshAccess();
    } catch (e) {
      console.error('Supabase session error:', e);
      useSupabase = false;
      updateBadge();
    }
  }

  if (!useSupabase) {
    updateBadge();
  }

  // Called after sign-in from auth modal
  window.onAuthComplete = async function() {
    await getSession();
    updateNavAuth(currentUser);
    await refreshAccess();
  };

  // --- Nav auth state ---
  function updateNavAuth(user) {
    const btn = document.getElementById('authBtn');
    const menu = document.getElementById('userMenu');

    // If there's already a user menu, remove it when signing out
    if (!user && menu) {
      menu.outerHTML = '<a href="#" class="btn-nav" id="authBtn">Sign In</a>';
      document.getElementById('authBtn').addEventListener('click', (e) => {
        e.preventDefault();
        openAuthModal('signin');
      });
      return;
    }

    if (user && btn && btn.id === 'authBtn') {
      const initial = (user.email || '?')[0].toUpperCase();
      btn.outerHTML = `
        <div class="user-menu" id="userMenu">
          <div class="user-avatar" id="userAvatar">${escapeHtml(initial)}</div>
          <div class="user-dropdown" id="userDropdown">
            <div class="user-dropdown-email">${escapeHtml(user.email)}</div>
            <button class="user-dropdown-item" id="signOutBtn">Sign Out</button>
          </div>
        </div>
      `;
      document.getElementById('userAvatar').addEventListener('click', () => {
        document.getElementById('userDropdown').classList.toggle('open');
      });
      document.getElementById('signOutBtn').addEventListener('click', async () => {
        await signOut();
        localStorage.removeItem('vcf_paid');
        localStorage.removeItem('vcf_plan');
        localStorage.removeItem('vcf_expires');
        localStorage.removeItem('vcf_free_used');
        window.location.reload();
      });
      document.addEventListener('click', (e) => {
        const m = document.getElementById('userMenu');
        const dd = document.getElementById('userDropdown');
        if (m && dd && !m.contains(e.target)) dd.classList.remove('open');
      });
    }
  }

  // --- Access check (Supabase) ---
  async function refreshAccess() {
    if (useSupabase && currentUser) {
      accessInfo = await checkSupabaseAccess();
    } else {
      accessInfo = null;
    }
    updateBadge();
  }

  // Fallback: localStorage only (when Supabase not configured)
  function refreshAccessLocal() {
    const paid = localStorage.getItem('vcf_paid');
    const expires = parseInt(localStorage.getItem('vcf_expires') || '0');
    const used = parseInt(localStorage.getItem('vcf_free_used') || '0');
    const now = Date.now();

    if (paid === 'true' && expires > now) {
      accessInfo = { hasAccess: true, reason: 'paid', plan: localStorage.getItem('vcf_plan'), expires: new Date(expires).toISOString() };
    } else if (used === 0) {
      accessInfo = { hasAccess: true, reason: 'free' };
    } else {
      accessInfo = { hasAccess: false, reason: 'expired' };
    }
    updateBadge();
  }

  function updateBadge() {
    if (!accessInfo) {
      usageBadge.textContent = '1 Free Try — Sign In';
      usageBadge.style.background = 'rgba(34,197,94,0.15)';
      usageBadge.style.color = '#22c55e';
      usageBadge.style.cursor = 'pointer';
      usageBadge.onclick = () => openAuthModal('signup', 'free_try');
      return;
    }
    usageBadge.style.cursor = 'default';
    usageBadge.onclick = null;

    if (accessInfo.hasAccess && accessInfo.reason === 'paid') {
      const daysLeft = Math.ceil((new Date(accessInfo.expires) - Date.now()) / (24*60*60*1000));
      const planLabel = accessInfo.plan === 'monthly' ? 'Monthly' : '2-Week Trial';
      usageBadge.textContent = planLabel + ' — ' + daysLeft + ' days left';
      usageBadge.style.background = 'rgba(109,92,255,0.15)';
      usageBadge.style.color = '';
    } else if (accessInfo.hasAccess && accessInfo.reason === 'free') {
      usageBadge.textContent = '1 Free Try';
      usageBadge.style.background = 'rgba(34,197,94,0.15)';
      usageBadge.style.color = '#22c55e';
    } else {
      usageBadge.textContent = 'Free Try Used — Upgrade';
      usageBadge.style.background = 'rgba(239,68,68,0.15)';
      usageBadge.style.color = '#ef4444';
    }
  }

  // --- Can this user extract right now? ---
  function canExtract() {
    // Must be signed in when Supabase is active
    if (useSupabase && !currentUser) return 'need_signin';
    if (!accessInfo) return 'need_signin';
    if (accessInfo.hasAccess) return 'ok';
    return 'need_pay';
  }

  // --- Tab switching ---
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      urlTab.classList.toggle('hidden', currentTab !== 'url');
      uploadTab.classList.toggle('hidden', currentTab !== 'upload');
    });
  });

  // --- File handling ---
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFile(fileInput.files[0]); });

  function handleFile(file) {
    selectedFile = file;
    fileName.textContent = file.name + ' (' + formatSize(file.size) + ')';
    uploadZone.classList.add('hidden');
    fileSelected.classList.remove('hidden');
  }

  fileRemove.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    uploadZone.classList.remove('hidden');
    fileSelected.classList.add('hidden');
  });

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // --- Sign In button ---
  if (authBtn) {
    authBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openAuthModal('signin');
    });
  }

  // --- Extract button ---
  extractBtn.addEventListener('click', async () => {
    const status = canExtract();

    if (status === 'need_signin') {
      openAuthModal('signup', 'free_try');
      extractBtn.textContent = 'Sign in to Extract';
      setTimeout(() => { extractBtn.textContent = 'Extract Now'; }, 3000);
      return;
    }

    if (status === 'need_pay') {
      const urlVal = urlInput.value.trim();
      window.location.href = 'pay.html?reason=free_used' + (urlVal ? '&url=' + encodeURIComponent(urlVal) : '');
      return;
    }

    const url = urlInput.value.trim();
    const hasUrl = currentTab === 'url' && url.length > 0;
    const hasFile = currentTab === 'upload' && selectedFile !== null;

    if (!hasUrl && !hasFile) {
      urlInput.focus();
      urlInput.parentElement.style.borderColor = '#ef4444';
      setTimeout(() => urlInput.parentElement.style.borderColor = '', 2000);
      return;
    }

    const selectedOutputs = getSelectedOutputs();
    if (selectedOutputs.length === 0) {
      alert('Please select at least one output type.');
      return;
    }

    extractBtn.disabled = true;
    extractBtn.textContent = 'Processing...';
    inputSection.classList.add('hidden');
    processingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    processingStep.textContent = 'Submitting job...';
    progressFill.style.width = '5%';

    try {
      let jobId;

      if (hasUrl) {
        const res = await fetch(API_BASE + '/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, outputs: selectedOutputs }),
        });
        const data = await res.json();
        if (data.error) { showError(data.error); return; }
        jobId = data.job_id;
      } else {
        const formData = new FormData();
        formData.append('file', selectedFile);
        selectedOutputs.forEach(o => formData.append('outputs', o));
        const res = await fetch(API_BASE + '/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.error) { showError(data.error); return; }
        jobId = data.job_id;
      }

      pollJob(jobId, hasUrl ? url : selectedFile.name);
    } catch (err) {
      showError('Connection failed. Make sure the server is running.');
    }
  });

  // --- Poll job ---
  async function pollJob(jobId, source) {
    const poll = async () => {
      try {
        const res = await fetch(API_BASE + '/api/status/' + jobId);
        const job = await res.json();

        processingStep.textContent = job.step || 'Processing...';
        progressFill.style.width = (job.progress || 0) + '%';

        if (job.status === 'complete') {
          showResults(jobId, source, job.results);
          await markUsed();
          return;
        }

        if (job.status === 'error') {
          showError(job.step || 'An error occurred');
          return;
        }

        setTimeout(poll, 1000);
      } catch (err) {
        setTimeout(poll, 2000);
      }
    };
    poll();
  }

  // After a successful extraction, mark free use consumed
  async function markUsed() {
    const isPaid = accessInfo && accessInfo.reason === 'paid';
    if (!isPaid) {
      localStorage.setItem('vcf_free_used', '1');
      if (useSupabase && currentUser) await recordFreeUse();
    }
    if (useSupabase) await refreshAccess(); else refreshAccessLocal();
  }

  // --- Results ---
  function showResults(jobId, source, results) {
    processingSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    const sourceLabel = source.length > 50 ? source.slice(0, 50) + '...' : source;
    resultsMeta.innerHTML = `
      <span class="meta-item">Source: ${escapeHtml(sourceLabel)}</span>
      <span class="meta-item">Outputs: ${results.length}</span>
      <span class="meta-item">Processed just now</span>
    `;

    const iconMap = { transcript: '📄', captions: '🎬', audio: '🎵', video: '🎥', clips: '✂️', ocr: '📝' };

    let html = '';
    results.forEach(r => {
      const icon = r.icon || iconMap[r.type] || '📁';
      html += `
        <div class="result-card">
          <div class="result-info">
            <span class="result-icon">${icon}</span>
            <div>
              <div class="result-name">${escapeHtml(r.label)}</div>
              <div class="result-detail">${escapeHtml(r.detail)}</div>
            </div>
          </div>
          <div class="result-actions">
            <a href="${API_BASE}/api/download/${jobId}/${r.filename}" class="btn-download" download>Download</a>
          </div>
        </div>
      `;
    });

    if (results.length === 0) {
      html = '<div class="result-card"><div class="result-info"><span class="result-icon">⚠️</span><div><div class="result-name">No outputs generated</div><div class="result-detail">The source may not contain processable media.</div></div></div></div>';
    }

    resultsGrid.innerHTML = html;
  }

  function showError(message) {
    processingSection.classList.add('hidden');
    inputSection.classList.remove('hidden');
    extractBtn.disabled = false;
    extractBtn.textContent = 'Extract Now';
    alert(message);
  }

  newExtract.addEventListener('click', () => {
    resultsSection.classList.add('hidden');
    inputSection.classList.remove('hidden');
    extractBtn.disabled = false;
    extractBtn.textContent = 'Extract Now';
    urlInput.value = '';
    progressFill.style.width = '0%';
    selectedFile = null;
    fileInput.value = '';
    uploadZone.classList.remove('hidden');
    fileSelected.classList.add('hidden');
  });

  function getSelectedOutputs() {
    const outputs = [];
    if (document.getElementById('optTranscript').checked) outputs.push('transcript');
    if (document.getElementById('optCaptions').checked) outputs.push('captions');
    if (document.getElementById('optAudio').checked) outputs.push('audio');
    if (document.getElementById('optVideo').checked) outputs.push('video');
    if (document.getElementById('optClips').checked) outputs.push('clips');
    if (document.getElementById('optOcr').checked) outputs.push('ocr');
    return outputs;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
