/**
 * PaperLensAI - Application Controller (ChatGPT / Gemini Style Multi-Page Webapp)
 */

const appState = {
  currentView: 'home',
  currentPaper: null,
  activeSentences: [],
  selectedFile: null,
  inputMode: 'upload', // 'upload' | 'paste'
  selectedAngle: '',
  audio: {
    isPlaying: false,
    utterance: null,
    speechRate: 1.0,
    progressInterval: null,
    elapsedSeconds: 0,
    totalSeconds: 32
  },
  charts: {
    efficacyChart: null,
    adverseChart: null
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();

  // Load saved API key
  const savedKey = window.paperLensEngine.getApiKey();
  const apiKeyInput = document.getElementById('geminiApiKeyInput');
  if (apiKeyInput && savedKey) {
    apiKeyInput.value = savedKey;
  }

  // Start on clean Home Page (ChatGPT / Gemini style)
  navigateTo('home');
});

/**
 * Multi-Page Navigation Router
 */
function navigateTo(viewId) {
  appState.currentView = viewId;

  // Hide all page views
  document.querySelectorAll('.page-view').forEach(el => el.classList.add('hidden'));

  // Show target page view
  const targetPage = document.getElementById(`page-${viewId}`);
  if (targetPage) targetPage.classList.remove('hidden');

  // Update Sidebar active state
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.getElementById(`nav-${viewId}`);
  if (activeNav) activeNav.classList.add('active');

  // Update Header Title
  const titles = {
    home: 'New Clinical Analysis',
    summary: 'Structured Clinical Summary',
    grounding: 'Evidence Grounding & Source Inspector',
    matrix: 'Cross-Trial Contradiction & Consensus Matrix',
    charts: 'Quantitative Endpoint Charts',
    audio: 'Clinical Audio Briefing ("Podcast Mode")'
  };
  const titleEl = document.getElementById('currentViewTitle');
  if (titleEl) titleEl.textContent = titles[viewId] || 'PaperLensAI';

  // Resize charts if opening charts page
  if (viewId === 'charts' && appState.currentPaper) {
    setTimeout(() => renderCharts(appState.currentPaper.metricsData), 100);
  }

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Load Landmark Sample Paper & Navigate to Summary
 */
function loadSamplePaper(paperId) {
  const paper = SAMPLE_PAPERS.find(p => p.id === paperId);
  if (!paper) return;

  appState.currentPaper = paper;
  appState.activeSentences = paper.sentences;

  // Update Header Badge
  const badge = document.getElementById('activeStudyBadge');
  if (badge) {
    badge.textContent = `Active: ${paper.title.substring(0, 35)}...`;
    badge.classList.remove('hidden');
  }

  // Populate Structured Summary
  document.getElementById('studyTitleHeading').textContent = paper.title;
  document.getElementById('studyAuthorsP').textContent = `${paper.authors} | DOI: ${paper.doi}`;
  document.getElementById('summaryPhaseBadge').textContent = paper.phase;
  document.getElementById('summaryJournalBadge').textContent = `${paper.journal} ${paper.year}`;
  document.getElementById('summarySampleBadge').textContent = `N = ${paper.sampleSize.toLocaleString()}`;
  document.getElementById('groundingScoreValue').textContent = paper.structuredSummary.groundingFidelity;

  renderStructuredSummary(paper.structuredSummary);
  renderEvidenceGrounding(paper.structuredSummary, paper.sentences);
  renderCharts(paper.metricsData);
  renderComparisonMatrix();

  // Audio script
  const script = window.paperLensEngine.generateAudioBriefingScript(paper.structuredSummary);
  document.getElementById('audioScriptText').textContent = `"${script}"`;

  // Navigate to summary page
  navigateTo('summary');
}

/**
 * Render Structured Summary Content
 */
function renderStructuredSummary(summary) {
  document.getElementById('summaryObjective').textContent = summary.objective;
  document.getElementById('summaryMethodology').textContent = summary.methodology;
  document.getElementById('summarySafety').textContent = summary.safetyProfile;
  document.getElementById('summaryBottomLine').textContent = summary.clinicalBottomLine;

  const listEl = document.getElementById('keyFindingsList');
  listEl.innerHTML = '';

  summary.keyFindings.forEach((finding, idx) => {
    const item = document.createElement('div');
    item.className = 'p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-blue-50/40 transition flex items-start justify-between gap-3';
    item.innerHTML = `
      <div class="text-xs text-slate-800 leading-relaxed flex-1">
        <span class="font-bold text-slate-900">${idx + 1}.</span> ${finding.claim}
        <button onclick="inspectSentence(${finding.sentenceIndex})" class="citation-badge" title="Inspect source in Evidence Grounding">
          [Ref ${idx + 1}]
        </button>
      </div>
      <div class="text-right shrink-0">
        <span class="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold bg-white border border-slate-200 text-blue-800 shadow-2xs">
          ${finding.metric}
        </span>
        <div class="text-[10px] font-semibold text-slate-400 mt-0.5">${finding.pVal || ''}</div>
      </div>
    `;
    listEl.appendChild(item);
  });
}

/**
 * Render Grounding Split-View
 */
function renderEvidenceGrounding(summary, sentences) {
  const claimsEl = document.getElementById('groundingClaimsList');
  claimsEl.innerHTML = '';

  summary.keyFindings.forEach((finding, idx) => {
    const card = document.createElement('div');
    card.className = 'p-3 rounded-lg border border-slate-200 bg-white hover:border-blue-500 cursor-pointer transition text-xs space-y-1 claim-card';
    card.id = `claim-card-${idx}`;
    card.onclick = () => highlightSourceSentence(finding.sentenceIndex, idx);
    card.innerHTML = `
      <div class="flex items-center justify-between text-[10px]">
        <span class="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">Claim #${idx + 1}</span>
        <span class="text-slate-400 font-mono">Sentence [${finding.sentenceIndex}]</span>
      </div>
      <p class="text-slate-800 font-medium leading-relaxed">${finding.claim}</p>
      <div class="text-[11px] font-bold text-blue-800 pt-1">${finding.metric} • ${finding.pVal}</div>
    `;
    claimsEl.appendChild(card);
  });

  const viewerEl = document.getElementById('sourceSentenceViewer');
  viewerEl.innerHTML = '';
  document.getElementById('sourceSentenceCountBadge').textContent = `${sentences.length} Sentences Indexed`;

  sentences.forEach((sentence, idx) => {
    const sEl = document.createElement('div');
    sEl.className = 'source-sentence';
    sEl.id = `source-sentence-${idx}`;
    sEl.innerHTML = `
      <span class="text-slate-400 font-bold mr-2 select-none">[${idx}]</span>
      <span>${sentence}</span>
    `;
    viewerEl.appendChild(sEl);
  });
}

function inspectSentence(sentenceIndex) {
  navigateTo('grounding');
  highlightSourceSentence(sentenceIndex);
}

function highlightSourceSentence(sentenceIndex, claimIdx = null) {
  document.querySelectorAll('.source-sentence').forEach(el => el.classList.remove('highlighted'));
  document.querySelectorAll('.claim-card').forEach(el => el.classList.remove('border-blue-600', 'bg-blue-50/20'));

  if (claimIdx !== null) {
    const card = document.getElementById(`claim-card-${claimIdx}`);
    if (card) card.classList.add('border-blue-600', 'bg-blue-50/20');
  }

  const target = document.getElementById(`source-sentence-${sentenceIndex}`);
  if (target) {
    target.classList.add('highlighted');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clearInspectorHighlights() {
  document.querySelectorAll('.source-sentence').forEach(el => el.classList.remove('highlighted'));
  document.querySelectorAll('.claim-card').forEach(el => el.classList.remove('border-blue-600', 'bg-blue-50/20'));
}

/**
 * Render Contradiction & Consensus Matrix
 */
function renderComparisonMatrix() {
  const matrix = CONSENSUS_CONTRADICTION_MATRIX;

  const chipsEl = document.getElementById('matrixStudiesChips');
  chipsEl.innerHTML = '';
  matrix.studiesCompared.forEach(t => {
    const chip = document.createElement('span');
    chip.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200';
    chip.textContent = t;
    chipsEl.appendChild(chip);
  });

  const consensusEl = document.getElementById('consensusList');
  consensusEl.innerHTML = '';
  matrix.consensusPoints.forEach((pt, idx) => {
    const div = document.createElement('div');
    div.className = 'pt-3 pb-2 first:pt-0 text-xs';
    div.innerHTML = `
      <div class="flex items-center justify-between font-bold text-slate-900 mb-1">
        <span>${idx + 1}. ${pt.topic}</span>
        <span class="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">${pt.confidence}</span>
      </div>
      <p class="text-slate-600 mb-2 leading-relaxed">${pt.finding}</p>
      <div class="bg-slate-50 p-2 rounded text-[11px] text-slate-500 font-mono">
        <strong class="text-slate-700">Evidence:</strong> "${pt.groundingSnippet}"
      </div>
    `;
    consensusEl.appendChild(div);
  });

  const contradictionsEl = document.getElementById('contradictionsList');
  contradictionsEl.innerHTML = '';
  matrix.contradictionPoints.forEach((ct, idx) => {
    const div = document.createElement('div');
    div.className = 'pt-3 pb-2 first:pt-0 text-xs';
    div.innerHTML = `
      <div class="flex items-center justify-between font-bold text-slate-900 mb-1">
        <span>${idx + 1}. ${ct.topic}</span>
        <span class="text-[10px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">${ct.status}</span>
      </div>
      <p class="text-slate-600 mb-2 leading-relaxed">${ct.finding}</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] mb-2">
        <div class="bg-slate-50 p-2 rounded border border-slate-100">
          <strong class="block text-slate-800">Study A:</strong> ${ct.evidenceA}
        </div>
        <div class="bg-slate-50 p-2 rounded border border-slate-100">
          <strong class="block text-slate-800">Study B:</strong> ${ct.evidenceB}
        </div>
      </div>
      <div class="text-[11px] text-amber-900 bg-amber-50 p-2 rounded border border-amber-200">
        <strong>Clinical Impact:</strong> ${ct.clinicalImpact}
      </div>
    `;
    contradictionsEl.appendChild(div);
  });
}

/**
 * Render Charts
 */
function renderCharts(metricsData) {
  if (!metricsData) return;

  const efficacyCtx = document.getElementById('efficacyChart')?.getContext('2d');
  const adverseCtx = document.getElementById('adverseChart')?.getContext('2d');

  if (!efficacyCtx || !adverseCtx) return;

  if (appState.charts.efficacyChart) appState.charts.efficacyChart.destroy();
  if (appState.charts.adverseChart) appState.charts.adverseChart.destroy();

  appState.charts.efficacyChart = new Chart(efficacyCtx, {
    type: 'bar',
    data: {
      labels: metricsData.labels,
      datasets: [{
        label: 'Efficacy Metric Delta',
        data: metricsData.efficacyScore,
        backgroundColor: ['#0284c7', '#94a3b8'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });

  const aeData = metricsData.seriousAePct || metricsData.primaryEventRatePct || [13.3, 26.7];
  appState.charts.adverseChart = new Chart(adverseCtx, {
    type: 'bar',
    data: {
      labels: metricsData.labels,
      datasets: [{
        label: 'Adverse Event %',
        data: aeData,
        backgroundColor: ['#e11d48', '#d97706'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

/**
 * Audio Briefing Controller
 */
function toggleAudioBriefing() {
  if (appState.audio.isPlaying) {
    stopAudioBriefing();
  } else {
    startAudioBriefing();
  }
}

function startAudioBriefing() {
  if (!('speechSynthesis' in window)) {
    alert("Speech synthesis is not supported on this browser.");
    return;
  }
  window.speechSynthesis.cancel();

  const script = window.paperLensEngine.generateAudioBriefingScript(
    appState.currentPaper ? appState.currentPaper.structuredSummary : null
  );

  const utterance = new SpeechSynthesisUtterance(script);
  utterance.rate = appState.audio.speechRate;
  
  utterance.onstart = () => {
    appState.audio.isPlaying = true;
    updateAudioUI(true);
  };
  utterance.onend = () => stopAudioBriefing();
  utterance.onerror = () => stopAudioBriefing();

  appState.audio.utterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function stopAudioBriefing() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  appState.audio.isPlaying = false;
  updateAudioUI(false);
}

function updateAudioUI(isPlaying) {
  document.querySelectorAll('.wave-bar').forEach(b => {
    if (isPlaying) b.classList.add('playing');
    else b.classList.remove('playing');
  });

  const playIcon = document.getElementById('mainPlayIcon');
  if (playIcon) playIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');

  const badge = document.getElementById('audioStatusBadge');
  if (badge) badge.textContent = isPlaying ? 'Broadcasting Narration...' : 'Ready';

  if (window.lucide) window.lucide.createIcons();
}

function setPlaybackSpeed(speed) {
  appState.audio.speechRate = speed;
  [1.0, 1.25, 1.5].forEach(s => {
    const btn = document.getElementById(`speedBtn${s === 1.0 ? '1' : s === 1.25 ? '125' : '15'}`);
    if (btn) {
      if (s === speed) btn.className = 'px-2.5 py-0.5 rounded font-bold bg-blue-600 text-white';
      else btn.className = 'px-2.5 py-0.5 rounded text-slate-400 hover:text-white';
    }
  });
  if (appState.audio.isPlaying) startAudioBriefing();
}

function skipAudio(sec) {
  // Restart or proceed
  if (appState.audio.isPlaying) startAudioBriefing();
}

/**
 * File & Prompt Input Handling
 */
function switchInputMode(mode) {
  appState.inputMode = mode;
  const dropZone = document.getElementById('dropZoneArea');
  const pasteArea = document.getElementById('pasteArea');
  const uploadBtn = document.getElementById('homeTabUploadBtn');
  const pasteBtn = document.getElementById('homeTabPasteBtn');

  if (mode === 'upload') {
    dropZone.classList.remove('hidden');
    pasteArea.classList.add('hidden');
    uploadBtn.className = 'text-xs font-bold text-blue-600 border-b-2 border-blue-600 pb-1 flex items-center';
    pasteBtn.className = 'text-xs font-semibold text-slate-400 hover:text-slate-700 pb-1 flex items-center';
  } else {
    dropZone.classList.add('hidden');
    pasteArea.classList.remove('hidden');
    pasteBtn.className = 'text-xs font-bold text-blue-600 border-b-2 border-blue-600 pb-1 flex items-center';
    uploadBtn.className = 'text-xs font-semibold text-slate-400 hover:text-slate-700 pb-1 flex items-center';
  }
}

async function handleFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  appState.selectedFile = file;
  document.getElementById('selectedFileName').textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  document.getElementById('selectedFileInfo').classList.remove('hidden');
}

function clearSelectedFile(event) {
  event.stopPropagation();
  appState.selectedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('selectedFileInfo').classList.add('hidden');
}

function setClinicalAngle(angle) {
  appState.selectedAngle = angle;
  document.getElementById('customAngleInput').value = angle;
}

/**
 * Execute Clinical Synthesis
 */
async function runClinicalSynthesis() {
  const customQuery = document.getElementById('customAngleInput').value.trim();
  let textToAnalyze = '';
  let paperTitle = 'Uploaded Clinical Paper';

  const btn = document.querySelector('button[onclick="runClinicalSynthesis()"]');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<span class="animate-spin mr-2">⚙️</span> Synthesizing Evidence...`;
  btn.disabled = true;

  try {
    if (appState.inputMode === 'upload' && appState.selectedFile) {
      const parsed = await window.documentIngestionService.parseFile(appState.selectedFile);
      textToAnalyze = parsed.text;
      paperTitle = parsed.title;
    } else if (appState.inputMode === 'paste') {
      textToAnalyze = document.getElementById('rawPaperText').value.trim();
      paperTitle = "Pasted Clinical Abstract";
    }

    if (!textToAnalyze) {
      alert("Please upload a PDF/text file or paste text first, or click one of the sample trials below!");
      return;
    }

    const result = await window.paperLensEngine.analyzePaper(textToAnalyze, {
      title: paperTitle,
      clinicalAngle: appState.selectedAngle,
      customPrompt: customQuery
    });

    const newPaper = {
      id: "custom-" + Date.now(),
      title: paperTitle,
      journal: "Ingested Study Document",
      year: "2024",
      doi: "N/A",
      pmid: "N/A",
      phase: result.riskOfBias || "Standard Clinical Protocol",
      sampleSize: result.sampleSize || 0,
      authors: "Clinical Investigators",
      abstract: textToAnalyze,
      sentences: result.sentences,
      structuredSummary: result,
      metricsData: result.metricsData
    };

    appState.currentPaper = newPaper;
    appState.activeSentences = result.sentences;

    // Update active badge in top bar
    const badge = document.getElementById('activeStudyBadge');
    if (badge) {
      badge.textContent = `Active: ${paperTitle.substring(0, 30)}...`;
      badge.classList.remove('hidden');
    }

    // Populate and switch to summary view
    document.getElementById('studyTitleHeading').textContent = newPaper.title;
    document.getElementById('studyAuthorsP').textContent = `${newPaper.authors} | ${newPaper.sentences.length} sentences extracted`;
    document.getElementById('summaryPhaseBadge').textContent = newPaper.phase;
    document.getElementById('summaryJournalBadge').textContent = newPaper.journal;
    document.getElementById('summarySampleBadge').textContent = `N = ${newPaper.sampleSize}`;
    document.getElementById('groundingScoreValue').textContent = result.groundingFidelity;

    renderStructuredSummary(result);
    renderEvidenceGrounding(result, result.sentences);
    renderCharts(result.metricsData);
    renderComparisonMatrix();

    const script = window.paperLensEngine.generateAudioBriefingScript(result);
    document.getElementById('audioScriptText').textContent = `"${script}"`;

    // Navigate to summary
    navigateTo('summary');

  } catch (err) {
    console.error("Synthesis error:", err);
    alert("Error: " + err.message);
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

/**
 * Settings & Printing
 */
function openSettingsModal() {
  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function saveApiKeySettings() {
  const key = document.getElementById('geminiApiKeyInput').value;
  window.paperLensEngine.setApiKey(key);
  closeSettingsModal();
  alert("Settings saved! Free Gemini API is active.");
}

function exportClinicalReport() {
  window.print();
}
