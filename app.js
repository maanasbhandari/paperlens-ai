/**
 * PaperLensAI - Core Application Controller
 * Handles UI interactions, evidence grounding split-view, speech narration, and chart rendering.
 */

// Application State
const appState = {
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

// Document Ready Initialization
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Load initial benchmark paper (STEP-HFpEF 2023)
  loadSamplePaper('step-hfpef-2023');

  // Load saved API key in modal if available
  const savedKey = window.paperLensEngine.getApiKey();
  const apiKeyInput = document.getElementById('geminiApiKeyInput');
  if (apiKeyInput && savedKey) {
    apiKeyInput.value = savedKey;
  }
});

/**
 * Load Landmark Sample Paper
 */
function loadSamplePaper(paperId) {
  const paper = SAMPLE_PAPERS.find(p => p.id === paperId);
  if (!paper) return;

  appState.currentPaper = paper;
  appState.activeSentences = paper.sentences;

  // Update Header Banner
  document.getElementById('studyTitleHeading').textContent = paper.title;
  document.getElementById('studyJournalBadge').textContent = `${paper.journal} ${paper.year}`;
  document.getElementById('studyTypeBadge').textContent = paper.phase;
  document.getElementById('studySampleSizeBadge').textContent = `N = ${paper.sampleSize.toLocaleString()} Enrolled`;
  document.getElementById('studyAuthorsP').textContent = `${paper.authors} | DOI: ${paper.doi} | PMID: ${paper.pmid}`;

  // Update Quality Scores
  document.getElementById('qualityScoreValue').textContent = `${paper.structuredSummary.qualityScore}/100`;
  document.getElementById('groundingScoreValue').textContent = paper.structuredSummary.groundingFidelity;
  document.getElementById('checklistN').textContent = `${paper.sampleSize.toLocaleString()} Subjects`;

  // Render Structured Summary Tab
  renderStructuredSummary(paper.structuredSummary);

  // Render Evidence Grounding Tab
  renderEvidenceGrounding(paper.structuredSummary, paper.sentences);

  // Render Charts
  renderCharts(paper.metricsData);

  // Render Audio Narration Script
  const audioScript = window.paperLensEngine.generateAudioBriefingScript(paper.structuredSummary);
  const audioScriptEl = document.getElementById('audioScriptText');
  if (audioScriptEl) audioScriptEl.textContent = `"${audioScript}"`;

  // If matrix tab needs update
  renderComparisonMatrix();

  // Reset audio state
  stopAudioBriefing();

  // Refresh icons
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Render Structured Summary
 */
function renderStructuredSummary(summary) {
  document.getElementById('summaryObjective').textContent = summary.objective;
  document.getElementById('summaryMethodology').textContent = summary.methodology;
  document.getElementById('summarySafety').textContent = summary.safetyProfile;
  document.getElementById('summaryBottomLine').textContent = summary.clinicalBottomLine;

  const findingsListEl = document.getElementById('keyFindingsList');
  findingsListEl.innerHTML = '';

  summary.keyFindings.forEach((finding, idx) => {
    const item = document.createElement('div');
    item.className = 'p-3 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/60 to-cyan-50/40 hover:from-blue-100/60 hover:to-cyan-100/50 transition';
    item.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="text-xs text-slate-900 leading-relaxed flex-1 font-medium">
          <span class="font-bold text-blue-950">${idx + 1}.</span> ${finding.claim}
          <button onclick="inspectSentence(${finding.sentenceIndex})" class="citation-badge" title="Inspect source sentence in evidence inspector">
            [Ref ${idx + 1}]
          </button>
        </div>
        <div class="text-right shrink-0">
          <span class="inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white border border-cyan-200 text-cyan-800 shadow-2xs">
            ${finding.metric}
          </span>
          <div class="text-[10px] font-bold text-slate-500 mt-0.5">${finding.pVal || ''}</div>
        </div>
      </div>
    `;
    findingsListEl.appendChild(item);
  });
}

/**
 * Render Evidence Grounding & Source Sentence Inspector
 */
function renderEvidenceGrounding(summary, sentences) {
  // 1. Render Claims in Left Pane
  const claimsListEl = document.getElementById('groundingClaimsList');
  claimsListEl.innerHTML = '';

  summary.keyFindings.forEach((finding, idx) => {
    const claimCard = document.createElement('div');
    claimCard.className = 'p-3.5 rounded-xl border border-blue-200 bg-white hover:border-cyan-500 cursor-pointer transition shadow-2xs mb-2.5 claim-card';
    claimCard.id = `claim-card-${idx}`;
    claimCard.onclick = () => highlightSourceSentence(finding.sentenceIndex, idx);
    claimCard.innerHTML = `
      <div class="flex items-center justify-between mb-1.5">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-800 border border-cyan-200">
          Claim #${idx + 1}
        </span>
        <span class="text-[10px] font-mono text-slate-500 font-semibold">
          Maps to Sentence [${finding.sentenceIndex}]
        </span>
      </div>
      <p class="text-xs text-blue-950 font-semibold leading-relaxed">
        ${finding.claim}
      </p>
      <div class="mt-2 flex items-center justify-between text-[11px] text-cyan-800">
        <span class="font-bold bg-blue-50 px-2 py-0.5 rounded">${finding.metric}</span>
        <span class="font-bold text-slate-500">${finding.pVal}</span>
      </div>
    `;
    claimsListEl.appendChild(claimCard);
  });

  // 2. Render Source Sentences in Right Pane
  const sourceViewerEl = document.getElementById('sourceSentenceViewer');
  sourceViewerEl.innerHTML = '';
  document.getElementById('sourceSentenceCountBadge').textContent = `${sentences.length} Sentences Indexed`;

  sentences.forEach((sentence, idx) => {
    const sEl = document.createElement('div');
    sEl.className = 'source-sentence';
    sEl.id = `source-sentence-${idx}`;
    sEl.innerHTML = `
      <span class="text-slate-400 font-bold mr-1.5 select-none">[${idx}]</span>
      <span>${sentence}</span>
    `;
    sourceViewerEl.appendChild(sEl);
  });
}

/**
 * Highlight Sentence in Inspector from Citation Tag
 */
function inspectSentence(sentenceIndex) {
  switchWorkbenchTab('grounding');
  highlightSourceSentence(sentenceIndex);
}

function highlightSourceSentence(sentenceIndex, claimIdx = null) {
  // Clear existing highlights
  document.querySelectorAll('.source-sentence').forEach(el => el.classList.remove('highlighted'));
  document.querySelectorAll('.claim-card').forEach(el => el.classList.remove('border-teal-600', 'bg-teal-50/20'));

  if (claimIdx !== null) {
    const activeCard = document.getElementById(`claim-card-${claimIdx}`);
    if (activeCard) activeCard.classList.add('border-teal-600', 'bg-teal-50/20');
  }

  const targetSentence = document.getElementById(`source-sentence-${sentenceIndex}`);
  if (targetSentence) {
    targetSentence.classList.add('highlighted');
    targetSentence.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clearInspectorHighlights() {
  document.querySelectorAll('.source-sentence').forEach(el => el.classList.remove('highlighted'));
  document.querySelectorAll('.claim-card').forEach(el => el.classList.remove('border-teal-600', 'bg-teal-50/20'));
}

/**
 * Render Cross-Study Contradiction & Consensus Matrix
 */
function renderComparisonMatrix() {
  const matrix = CONSENSUS_CONTRADICTION_MATRIX;

  // Chips
  const chipsContainer = document.getElementById('matrixStudiesChips');
  chipsContainer.innerHTML = '';
  matrix.studiesCompared.forEach(title => {
    const chip = document.createElement('span');
    chip.className = 'px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-900 border border-blue-200 shadow-2xs';
    chip.textContent = title;
    chipsContainer.appendChild(chip);
  });

  // Consensus Points
  const consensusList = document.getElementById('consensusList');
  consensusList.innerHTML = '';
  matrix.consensusPoints.forEach((pt, idx) => {
    const item = document.createElement('div');
    item.className = 'pt-3.5 pb-2 first:pt-0';
    item.innerHTML = `
      <div class="flex items-start justify-between">
        <h5 class="text-xs font-bold text-blue-950">${idx + 1}. ${pt.topic}</h5>
        <span class="text-[10px] font-bold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full border border-emerald-300">
          ${pt.confidence}
        </span>
      </div>
      <p class="text-xs text-slate-700 mt-1 leading-relaxed font-medium">${pt.finding}</p>
      <div class="mt-2 text-[11px] text-slate-700 font-mono bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
        <span class="font-bold text-cyan-800">Grounding Evidence:</span> "${pt.groundingSnippet}"
      </div>
    `;
    consensusList.appendChild(item);
  });

  // Contradictions
  const contradictionsList = document.getElementById('contradictionsList');
  contradictionsList.innerHTML = '';
  matrix.contradictionPoints.forEach((ct, idx) => {
    const item = document.createElement('div');
    item.className = 'pt-3.5 pb-2 first:pt-0';
    item.innerHTML = `
      <div class="flex items-start justify-between">
        <h5 class="text-xs font-bold text-rose-950">${idx + 1}. ${ct.topic}</h5>
        <span class="text-[10px] font-bold text-rose-800 bg-rose-100/70 px-2 py-0.5 rounded-full border border-rose-300">
          ${ct.status}
        </span>
      </div>
      <p class="text-xs text-slate-700 mt-1 leading-relaxed font-medium">${ct.finding}</p>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2.5">
        <div class="bg-blue-50/60 p-2.5 rounded-lg border border-blue-200/80 text-[11px]">
          <span class="font-bold text-blue-950 block mb-0.5">Trial Evidence A:</span>
          <span class="text-slate-700">${ct.evidenceA}</span>
        </div>
        <div class="bg-blue-50/60 p-2.5 rounded-lg border border-blue-200/80 text-[11px]">
          <span class="font-bold text-blue-950 block mb-0.5">Trial Evidence B:</span>
          <span class="text-slate-700">${ct.evidenceB}</span>
        </div>
      </div>

      <div class="mt-2.5 text-[11px] text-amber-950 bg-amber-50 p-2.5 rounded-lg border border-amber-200 flex items-start">
        <i data-lucide="alert-triangle" class="w-3.5 h-3.5 mr-1.5 text-amber-600 shrink-0 mt-0.5"></i>
        <span><strong>Clinical Impact:</strong> ${ct.clinicalImpact}</span>
      </div>
    `;
    contradictionsList.appendChild(item);
  });
}

function loadMultiPaperBenchmark() {
  switchWorkbenchTab('matrix');
  document.getElementById('intakeDrawer').classList.add('hidden');
}

/**
 * Render Dynamic Quantitative Charts (Chart.js)
 */
function renderCharts(metricsData) {
  if (!metricsData) return;

  const efficacyCtx = document.getElementById('efficacyChart')?.getContext('2d');
  const adverseCtx = document.getElementById('adverseChart')?.getContext('2d');

  if (!efficacyCtx || !adverseCtx) return;

  // Destroy previous charts if active
  if (appState.charts.efficacyChart) appState.charts.efficacyChart.destroy();
  if (appState.charts.adverseChart) appState.charts.adverseChart.destroy();

  // Efficacy Chart
  appState.charts.efficacyChart = new Chart(efficacyCtx, {
    type: 'bar',
    data: {
      labels: metricsData.labels,
      datasets: [{
        label: 'Primary Endpoint Efficacy Metric',
        data: metricsData.efficacyScore,
        backgroundColor: ['rgba(13, 148, 136, 0.85)', 'rgba(148, 163, 184, 0.6)'],
        borderColor: ['#0d9488', '#94a3b8'],
        borderWidth: 1.5,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { size: 12 },
          bodyFont: { size: 12 }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: { font: { size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 10, weight: 'bold' } }
        }
      }
    }
  });

  // Adverse Events Chart
  const aeData = metricsData.seriousAePct || metricsData.primaryEventRatePct || [13.3, 26.7];
  appState.charts.adverseChart = new Chart(adverseCtx, {
    type: 'bar',
    data: {
      labels: metricsData.labels,
      datasets: [{
        label: 'Adverse Event Rate (%)',
        data: aeData,
        backgroundColor: ['rgba(225, 29, 72, 0.75)', 'rgba(217, 119, 6, 0.6)'],
        borderColor: ['#e11d48', '#d97706'],
        borderWidth: 1.5,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: { font: { size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 10, weight: 'bold' } }
        }
      }
    }
  });
}

/**
 * 30-Second Audio Narration ("Podcast Mode") using Web Speech Synthesis
 */
function toggleAudioBriefing() {
  if (appState.audio.isPlaying) {
    stopAudioBriefing();
  } else {
    startAudioBriefing();
  }
}

function triggerQuickAudioBriefing() {
  switchWorkbenchTab('audio');
  startAudioBriefing();
}

function startAudioBriefing() {
  if (!('speechSynthesis' in window)) {
    alert("Web Speech API is not supported in this browser. Please use a modern browser like Chrome, Edge, or Safari.");
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const scriptText = window.paperLensEngine.generateAudioBriefingScript(
    appState.currentPaper ? appState.currentPaper.structuredSummary : null
  );

  const utterance = new SpeechSynthesisUtterance(scriptText);
  utterance.rate = appState.audio.speechRate;
  utterance.pitch = 1.0;

  // Select a pleasant natural English voice if available
  const voices = window.speechSynthesis.getVoices();
  const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
  if (naturalVoice) utterance.voice = naturalVoice;

  utterance.onstart = () => {
    appState.audio.isPlaying = true;
    updateAudioUI(true);
    startProgressTimer();
  };

  utterance.onend = () => {
    stopAudioBriefing();
  };

  utterance.onerror = (e) => {
    console.error("Speech error", e);
    stopAudioBriefing();
  };

  appState.audio.utterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function stopAudioBriefing() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  appState.audio.isPlaying = false;
  clearInterval(appState.audio.progressInterval);
  appState.audio.elapsedSeconds = 0;
  updateAudioUI(false);
}

function updateAudioUI(isPlaying) {
  // Waveform bars
  document.querySelectorAll('.wave-bar').forEach(b => {
    if (isPlaying) b.classList.add('playing');
    else b.classList.remove('playing');
  });

  // Play / Pause Icons
  const miniPlayIcon = document.getElementById('miniPlayIcon');
  const mainPlayIcon = document.getElementById('mainPlayIcon');
  const audioStatusBadge = document.getElementById('audioStatusBadge');

  if (miniPlayIcon) {
    miniPlayIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
  }
  if (mainPlayIcon) {
    mainPlayIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
  }
  if (audioStatusBadge) {
    audioStatusBadge.textContent = isPlaying ? 'Broadcasting Narration' : 'Ready to Stream';
    audioStatusBadge.className = isPlaying ? 'bg-teal-600 px-2 py-0.5 rounded text-[11px] text-white animate-pulse' : 'bg-slate-800 px-2 py-0.5 rounded text-[11px] text-slate-300';
  }

  if (window.lucide) window.lucide.createIcons();
}

function startProgressTimer() {
  clearInterval(appState.audio.progressInterval);
  appState.audio.elapsedSeconds = 0;

  const miniBar = document.getElementById('audioProgressBar');
  const mainBar = document.getElementById('mainAudioProgressBar');
  const timerLabel = document.getElementById('audioTimer');

  appState.audio.progressInterval = setInterval(() => {
    if (!appState.audio.isPlaying) {
      clearInterval(appState.audio.progressInterval);
      return;
    }

    appState.audio.elapsedSeconds++;
    const total = appState.audio.totalSeconds;
    const pct = Math.min(100, (appState.audio.elapsedSeconds / total) * 100);

    if (miniBar) miniBar.style.width = `${pct}%`;
    if (mainBar) mainBar.style.width = `${pct}%`;

    const mins = Math.floor(appState.audio.elapsedSeconds / 60);
    const secs = appState.audio.elapsedSeconds % 60;
    const formatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    if (timerLabel) timerLabel.textContent = `${formatted} / 0:32`;

    if (appState.audio.elapsedSeconds >= total) {
      clearInterval(appState.audio.progressInterval);
    }
  }, 1000);
}

function setPlaybackSpeed(speed) {
  appState.audio.speechRate = speed;
  [1.0, 1.25, 1.5].forEach(s => {
    const btn = document.getElementById(`speedBtn${s === 1.0 ? '1' : s === 1.25 ? '125' : '15'}`);
    if (btn) {
      if (s === speed) {
        btn.className = 'px-2 py-0.5 rounded font-bold bg-teal-600 text-white';
      } else {
        btn.className = 'px-2 py-0.5 rounded font-medium bg-slate-800 text-slate-300 hover:bg-slate-700';
      }
    }
  });

  if (appState.audio.isPlaying) {
    startAudioBriefing(); // Restart with new rate
  }
}

function skipAudio(seconds) {
  appState.audio.elapsedSeconds = Math.max(0, appState.audio.elapsedSeconds + seconds);
}

/**
 * Workbench Tab Switching
 */
function switchWorkbenchTab(tabKey) {
  const tabs = ['summary', 'grounding', 'matrix', 'metrics', 'audio'];
  tabs.forEach(t => {
    const content = document.getElementById(`tabContent${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);

    if (t === tabKey) {
      content?.classList.remove('hidden');
      btn?.classList.add('active', 'text-slate-900', 'border-b-2', 'border-teal-600');
      btn?.classList.remove('text-slate-500');
    } else {
      content?.classList.add('hidden');
      btn?.classList.remove('active', 'text-slate-900', 'border-b-2', 'border-teal-600');
      btn?.classList.add('text-slate-500');
    }
  });

  // Re-trigger chart resize if metrics tab opened
  if (tabKey === 'metrics' && appState.currentPaper) {
    setTimeout(() => renderCharts(appState.currentPaper.metricsData), 100);
  }

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Intake Drawer & File Handling
 */
function toggleIntakeDrawer() {
  const drawer = document.getElementById('intakeDrawer');
  drawer.classList.toggle('hidden');
}

function switchInputMode(mode) {
  appState.inputMode = mode;
  const dropZone = document.getElementById('dropZoneArea');
  const pasteArea = document.getElementById('pasteArea');
  const tabUploadBtn = document.getElementById('tabUploadBtn');
  const tabPasteBtn = document.getElementById('tabPasteBtn');

  if (mode === 'upload') {
    dropZone.classList.remove('hidden');
    pasteArea.classList.add('hidden');
    tabUploadBtn.className = 'pb-2 text-xs font-bold text-teal-700 border-b-2 border-teal-600 flex items-center';
    tabPasteBtn.className = 'pb-2 text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center';
  } else {
    dropZone.classList.add('hidden');
    pasteArea.classList.remove('hidden');
    tabPasteBtn.className = 'pb-2 text-xs font-bold text-teal-700 border-b-2 border-teal-600 flex items-center';
    tabUploadBtn.className = 'pb-2 text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center';
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
  document.querySelectorAll('.angle-chip').forEach(c => {
    if (c.textContent.trim().includes(angle.split(' ')[0])) {
      c.className = 'angle-chip px-2.5 py-1 text-[11px] font-bold bg-teal-600 text-white rounded-full border border-teal-600 transition';
    } else {
      c.className = 'angle-chip px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-teal-50 hover:text-teal-800 text-slate-700 rounded-full border border-slate-200 transition';
    }
  });
}

/**
 * Execute Ingestion & Analysis
 */
async function runClinicalSynthesis() {
  const customQuery = document.getElementById('customAngleInput').value.trim();
  let textToAnalyze = '';
  let paperTitle = 'Uploaded Clinical Investigation';

  // Show loading indicator
  const synthesizeBtn = document.querySelector('button[onclick="runClinicalSynthesis()"]');
  const originalBtnHtml = synthesizeBtn.innerHTML;
  synthesizeBtn.innerHTML = `<span class="inline-block animate-spin mr-2">⚙️</span> Synthesizing Evidence...`;
  synthesizeBtn.disabled = true;

  try {
    if (appState.inputMode === 'upload' && appState.selectedFile) {
      const parsed = await window.documentIngestionService.parseFile(appState.selectedFile);
      textToAnalyze = parsed.text;
      paperTitle = parsed.title;
    } else if (appState.inputMode === 'paste') {
      textToAnalyze = document.getElementById('rawPaperText').value.trim();
      paperTitle = "Custom Pasted Research Clinical Abstract";
    }

    if (!textToAnalyze) {
      alert("Please upload a PDF/text file or paste an abstract text before synthesizing.");
      return;
    }

    // Call Engine (Gemini API or Free Deterministic Engine)
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
      doi: "N/A (User Upload)",
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

    // Update UI
    document.getElementById('studyTitleHeading').textContent = newPaper.title;
    document.getElementById('studyJournalBadge').textContent = newPaper.journal;
    document.getElementById('studyTypeBadge').textContent = newPaper.phase;
    document.getElementById('studySampleSizeBadge').textContent = `N = ${newPaper.sampleSize}`;
    document.getElementById('studyAuthorsP').textContent = `Clinical Ingestion Pipeline | ${newPaper.sentences.length} Sentences Extracted`;

    document.getElementById('qualityScoreValue').textContent = `${result.qualityScore}/100`;
    document.getElementById('groundingScoreValue').textContent = result.groundingFidelity;
    document.getElementById('checklistN').textContent = `${newPaper.sampleSize} Subjects`;

    renderStructuredSummary(result);
    renderEvidenceGrounding(result, result.sentences);
    renderCharts(result.metricsData);

    const audioScript = window.paperLensEngine.generateAudioBriefingScript(result);
    document.getElementById('audioScriptText').textContent = `"${audioScript}"`;

    // Switch to summary tab
    switchWorkbenchTab('summary');

    // Scroll to results
    document.getElementById('studyHeaderBanner').scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    console.error("Analysis error:", err);
    alert("Error during synthesis: " + err.message);
  } finally {
    synthesizeBtn.innerHTML = originalBtnHtml;
    synthesizeBtn.disabled = false;
  }
}

/**
 * Settings Modal
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
  alert("Settings saved! Free Gemini API integration is active.");
}

/**
 * Clinical Report Export
 */
function exportClinicalReport() {
  window.print();
}
