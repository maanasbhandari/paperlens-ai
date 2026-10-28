/**
 * PaperLensAI - Screen 1 (Intake) to Screen 2 (Results & Multi-Option Navigation)
 */

const appState = {
  activeScreen: 'intake', // 'intake' | 'results'
  activeResultOption: 'summary', // 'summary' | 'grounding' | 'matrix' | 'charts' | 'audio'
  currentPaper: null,
  activeSentences: [],
  selectedFile: null,
  inputMode: 'upload', // 'upload' | 'paste'
  audio: {
    isPlaying: false,
    utterance: null,
    speechRate: 1.0
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

  // Ensure initial state is clean Screen 1 ONLY
  resetToIntakeScreen();
});

/**
 * Screen 1 -> Screen 2 Transitions
 */
function showResultsScreen() {
  appState.activeScreen = 'results';
  document.getElementById('screen-intake').classList.add('hidden');
  document.getElementById('screen-results').classList.remove('hidden');

  // Default to summary option on results screen
  switchResultOption('summary');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetToIntakeScreen() {
  appState.activeScreen = 'intake';
  document.getElementById('screen-results').classList.add('hidden');
  document.getElementById('screen-intake').classList.remove('hidden');

  // Stop any ongoing audio
  stopAudioBriefing();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Screen 2 Option Navigation Switcher
 */
function switchResultOption(optionId) {
  appState.activeResultOption = optionId;

  // Update Buttons
  document.querySelectorAll('.option-tab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`opt-${optionId}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Update Result Views
  document.querySelectorAll('.result-view').forEach(view => view.classList.add('hidden'));
  const activeView = document.getElementById(`view-${optionId}`);
  if (activeView) activeView.classList.remove('hidden');

  // Resize charts if opening charts view
  if (optionId === 'charts' && appState.currentPaper) {
    setTimeout(() => renderCharts(appState.currentPaper.metricsData), 80);
  }

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Load Landmark Sample Paper (1-Click Evaluation)
 */
function loadSamplePaper(paperId) {
  const paper = SAMPLE_PAPERS.find(p => p.id === paperId);
  if (!paper) return;

  appState.currentPaper = paper;
  appState.activeSentences = paper.sentences;

  // Populate Screen 2 Top Bar
  document.getElementById('resTitleHeading').textContent = paper.title;
  document.getElementById('resAuthorsP').textContent = `${paper.authors} | DOI: ${paper.doi} | PMID: ${paper.pmid}`;
  document.getElementById('resPhaseBadge').textContent = paper.phase;
  document.getElementById('resJournalBadge').textContent = `${paper.journal} ${paper.year}`;
  document.getElementById('resSampleBadge').textContent = `N = ${paper.sampleSize.toLocaleString()} Enrolled`;
  document.getElementById('resGroundingScore').textContent = paper.structuredSummary.groundingFidelity;

  // Render Sub-Views
  renderStructuredSummary(paper.structuredSummary);
  renderEvidenceGrounding(paper.structuredSummary, paper.sentences);
  renderComparisonMatrix();
  renderCharts(paper.metricsData);

  // Audio script
  const script = window.paperLensEngine.generateAudioBriefingScript(paper.structuredSummary);
  document.getElementById('audioScriptText').textContent = `"${script}"`;

  // Transition to Screen 2
  showResultsScreen();
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
    item.className = 'p-3.5 rounded-xl border border-[#e4e4e7] bg-[#fafafa] hover:bg-[#f4f4f5] transition flex items-start justify-between gap-3';
    item.innerHTML = `
      <div class="text-xs text-[#09090b] leading-relaxed flex-1 font-medium">
        <span class="font-bold text-[#09090b]">${idx + 1}.</span> ${finding.claim}
        <button onclick="inspectSentence(${finding.sentenceIndex})" class="citation-badge" title="Inspect source in Evidence Grounding">
          [Ref ${idx + 1}]
        </button>
      </div>
      <div class="text-right shrink-0">
        <span class="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold bg-white border border-[#e4e4e7] text-[#09090b] shadow-xs font-mono">
          ${finding.metric}
        </span>
        <div class="text-[10px] font-semibold text-[#71717a] mt-0.5">${finding.pVal || ''}</div>
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
    card.className = 'p-3.5 rounded-xl border border-[#e4e4e7] bg-white hover:border-[#09090b] cursor-pointer transition text-xs space-y-1.5 claim-card shadow-xs';
    card.id = `claim-card-${idx}`;
    card.onclick = () => highlightSourceSentence(finding.sentenceIndex, idx);
    card.innerHTML = `
      <div class="flex items-center justify-between text-[10px]">
        <span class="font-bold text-[#09090b] bg-[#f4f4f5] px-2 py-0.5 rounded border border-[#e4e4e7]">Claim #${idx + 1}</span>
        <span class="text-[#71717a] font-mono">Sentence [${finding.sentenceIndex}]</span>
      </div>
      <p class="text-[#09090b] font-medium leading-relaxed">${finding.claim}</p>
      <div class="text-[11px] font-bold text-[#09090b] pt-0.5 font-mono">${finding.metric} • ${finding.pVal}</div>
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
      <span class="text-[#a1a1aa] font-bold mr-2 select-none font-mono">[${idx}]</span>
      <span>${sentence}</span>
    `;
    viewerEl.appendChild(sEl);
  });
}

function inspectSentence(sentenceIndex) {
  switchResultOption('grounding');
  highlightSourceSentence(sentenceIndex);
}

function highlightSourceSentence(sentenceIndex, claimIdx = null) {
  document.querySelectorAll('.source-sentence').forEach(el => el.classList.remove('highlighted'));
  document.querySelectorAll('.claim-card').forEach(el => el.classList.remove('border-[#09090b]', 'bg-[#f4f4f5]'));

  if (claimIdx !== null) {
    const card = document.getElementById(`claim-card-${claimIdx}`);
    if (card) card.classList.add('border-[#09090b]', 'bg-[#f4f4f5]');
  }

  const target = document.getElementById(`source-sentence-${sentenceIndex}`);
  if (target) {
    target.classList.add('highlighted');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clearInspectorHighlights() {
  document.querySelectorAll('.source-sentence').forEach(el => el.classList.remove('highlighted'));
  document.querySelectorAll('.claim-card').forEach(el => el.classList.remove('border-[#09090b]', 'bg-[#f4f4f5]'));
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
    chip.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-[#f4f4f5] text-[#09090b] border border-[#e4e4e7]';
    chip.textContent = t;
    chipsEl.appendChild(chip);
  });

  const consensusEl = document.getElementById('consensusList');
  consensusEl.innerHTML = '';
  matrix.consensusPoints.forEach((pt, idx) => {
    const div = document.createElement('div');
    div.className = 'pt-3 pb-2 first:pt-0 text-xs';
    div.innerHTML = `
      <div class="flex items-center justify-between font-bold text-[#09090b] mb-1">
        <span>${idx + 1}. ${pt.topic}</span>
        <span class="text-[10px] text-[#09090b] bg-white px-2 py-0.5 rounded border border-[#e4e4e7] font-semibold">${pt.confidence}</span>
      </div>
      <p class="text-[#52525b] mb-2 leading-relaxed font-normal">${pt.finding}</p>
      <div class="bg-[#fafafa] p-2.5 rounded-lg border border-[#e4e4e7] text-[11px] font-mono">
        <strong class="text-[#09090b]">Evidence:</strong> "${pt.groundingSnippet}"
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
      <div class="flex items-center justify-between font-bold text-[#09090b] mb-1">
        <span>${idx + 1}. ${ct.topic}</span>
        <span class="text-[10px] text-[#71717a] bg-white px-2 py-0.5 rounded border border-[#e4e4e7]">${ct.status}</span>
      </div>
      <p class="text-[#52525b] mb-2 leading-relaxed">${ct.finding}</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] mb-2">
        <div class="bg-white p-2.5 rounded-lg border border-[#e4e4e7]">
          <strong class="block text-[#09090b]">Study A:</strong> ${ct.evidenceA}
        </div>
        <div class="bg-white p-2.5 rounded-lg border border-[#e4e4e7]">
          <strong class="block text-[#09090b]">Study B:</strong> ${ct.evidenceB}
        </div>
      </div>
      <div class="text-[11px] text-[#27272a] bg-[#fafafa] p-2.5 rounded-lg border border-[#e4e4e7]">
        <strong>Clinical Impact:</strong> ${ct.clinicalImpact}
      </div>
    `;
    contradictionsEl.appendChild(div);
  });
}

/**
 * Render Charts in Monochrome
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
        backgroundColor: ['#09090b', '#71717a'],
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
        backgroundColor: ['#18181b', '#a1a1aa'],
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
      if (s === speed) btn.className = 'px-2.5 py-0.5 rounded font-bold bg-[#25855a] text-white';
      else btn.className = 'px-2.5 py-0.5 rounded text-[#86a896] hover:text-white';
    }
  });
  if (appState.audio.isPlaying) startAudioBriefing();
}

function skipAudio(sec) {
  if (appState.audio.isPlaying) startAudioBriefing();
}

/**
 * File & Prompt Input Handling
 */
function switchInputMode(mode) {
  appState.inputMode = mode;
  const dropZone = document.getElementById('dropZoneArea');
  const pasteArea = document.getElementById('pasteArea');
  const uploadBtn = document.getElementById('tabUploadBtn');
  const pasteBtn = document.getElementById('tabPasteBtn');

  if (mode === 'upload') {
    dropZone.classList.remove('hidden');
    pasteArea.classList.add('hidden');
    uploadBtn.className = 'font-bold text-[#143628] border-b-2 border-[#143628] pb-1 flex items-center';
    pasteBtn.className = 'font-medium text-[#5e7368] hover:text-[#143628] pb-1 flex items-center';
  } else {
    dropZone.classList.add('hidden');
    pasteArea.classList.remove('hidden');
    pasteBtn.className = 'font-bold text-[#143628] border-b-2 border-[#143628] pb-1 flex items-center';
    uploadBtn.className = 'font-medium text-[#5e7368] hover:text-[#143628] pb-1 flex items-center';
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

/**
 * Run Clinical Synthesis -> Transitions immediately to Screen 2!
 */
async function runClinicalSynthesis() {
  const customQuery = document.getElementById('customAngleInput').value.trim();
  let textToAnalyze = '';
  let paperTitle = 'Uploaded Clinical Paper';

  const btnText = document.getElementById('submitBtnText');
  const originalText = btnText.textContent;
  btnText.textContent = "Synthesizing Evidence...";

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
      alert("Please upload a PDF/text file or paste an abstract, or click one of the sample trials!");
      btnText.textContent = originalText;
      return;
    }

    // Call Engine
    const result = await window.paperLensEngine.analyzePaper(textToAnalyze, {
      title: paperTitle,
      clinicalAngle: customQuery,
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

    // Populate Screen 2 Top Bar
    document.getElementById('resTitleHeading').textContent = newPaper.title;
    document.getElementById('resAuthorsP').textContent = `Clinical Ingestion Pipeline | ${newPaper.sentences.length} sentences extracted`;
    document.getElementById('resPhaseBadge').textContent = newPaper.phase;
    document.getElementById('resJournalBadge').textContent = newPaper.journal;
    document.getElementById('resSampleBadge').textContent = `N = ${newPaper.sampleSize}`;
    document.getElementById('resGroundingScore').textContent = result.groundingFidelity;

    // Render Sub-Views
    renderStructuredSummary(result);
    renderEvidenceGrounding(result, result.sentences);
    renderComparisonMatrix();
    renderCharts(result.metricsData);

    const script = window.paperLensEngine.generateAudioBriefingScript(result);
    document.getElementById('audioScriptText').textContent = `"${script}"`;

    // Transition immediately to Screen 2
    showResultsScreen();

  } catch (err) {
    console.error("Synthesis error:", err);
    alert("Error: " + err.message);
  } finally {
    btnText.textContent = originalText;
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
  alert("Settings saved! Free Gemini API is active.");
}
