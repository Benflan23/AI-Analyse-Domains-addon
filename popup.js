// popup.js - Logique de l'interface utilisateur du popup

// Variables globales
let currentTab = 'capture';
let capturedDomains = [];
let filteredDomains = [];
let analysisResults = null;

// Liens de documentation API
const apiDocLinks = {
  gemini: 'https://ai.google.dev/docs/get-started',
  openai: 'https://platform.openai.com/account/api-keys',
  claude: 'https://docs.anthropic.com/claude/reference/getting-started',
  llama: 'https://llama.meta.com/',
  mistral: 'https://docs.mistral.ai/platform/',
  cohere: 'https://docs.cohere.com/docs/getting-started'
};

// Initialisation du popup
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup initialisé');
  
  await loadSettings();
  setupEventListeners();
  updateLanguageDisplay(); // Renommée pour plus de clarté
  loadFilterSettings();
  loadApiSettings();
  loadCustomPrompt();
  loadHistory();
  
  // Charger les domaines de la page actuelle si disponibles
  await loadCurrentPageDomains();
});

// Configuration des écouteurs d'événements
function setupEventListeners() {
  // Switch de langue (met à jour la préférence utilisateur)
  document.getElementById('langFr').addEventListener('click', () => setLanguagePreference('fr'));
  document.getElementById('langEn').addEventListener('click', () => setLanguagePreference('en'));
  
  // Navigation par onglets
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabId = e.target.dataset.tab;
      switchTab(tabId);
    });
  });
  
  // Boutons de capture
  document.getElementById('captureBtn').addEventListener('click', handleManualCapture);
  document.getElementById('autoCaptureToggle').addEventListener('change', handleAutoCaptureToggle);
  
  // Filtres
  document.querySelectorAll('#filters-section input, #filters-section textarea').forEach(input => {
    input.addEventListener('change', saveFilterSettings);
  });
  
  // Paramètres API
  document.getElementById('aiProviderSelect').addEventListener('change', handleProviderChange);
  document.getElementById('testConnectionBtn').addEventListener('click', handleTestConnection);
  document.getElementById('toggleApiKey').addEventListener('click', toggleApiKeyVisibility);
  document.getElementById('apiKeyInput').addEventListener('input', saveApiKey);
  
  // Prompt personnalisé
  document.getElementById('savePromptBtn').addEventListener('click', saveCustomPrompt);
  
  // Export
  document.getElementById('exportCsvBtn').addEventListener('click', () => exportResults('csv'));
  document.getElementById('exportTxtBtn').addEventListener('click', () => exportResults('txt'));
  document.getElementById('exportJsonBtn').addEventListener('click', () => exportResults('json'));
  
  // Historique
  document.getElementById('historySearch').addEventListener('input', filterHistory);
  document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
}

// Gestion de la préférence de langue
async function setLanguagePreference(lang) {
  // Cette fonction enregistre la préférence de langue de l'utilisateur.
  // Note: chrome.i18n.getMessage() se base sur la langue du navigateur.
  // Pour changer réellement la langue de l'extension via cette API,
  // il faudrait que l'utilisateur change la langue du navigateur ou
  // redémarre l'extension si le manifest le permet.
  // Ici, nous mettons à jour l'affichage des boutons et enregistrons la préférence.
  
  let currentLanguagePreference = await getLanguagePreference();
  if (currentLanguagePreference !== lang) {
      await chrome.storage.local.set({ languagePreference: lang });
      updateLanguageDisplay(lang); // Mise à jour visuelle des boutons
      showNotification('info', chrome.i18n.getMessage('language_changed_info')); // Message d'information
  }
}

// Met à jour l'affichage des textes traduits et l'état des boutons de langue
async function updateLanguageDisplay() {
  const langPref = await getLanguagePreference();
  
  // Mettre à jour les boutons de langue
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === langPref);
  });
  
  // Mettre à jour tous les textes traduits
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.dataset.i18n;
    element.textContent = chrome.i18n.getMessage(key);
  });
  
  // Mettre à jour les placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.dataset.i18nPlaceholder;
    element.placeholder = chrome.i18n.getMessage(key);
  });
}

// Récupère la préférence de langue stockée
async function getLanguagePreference() {
  const result = await chrome.storage.local.get(['languagePreference']);
  return result.languagePreference || 'fr'; // 'fr' par défaut si non défini
}


// Navigation par onglets
function switchTab(tabId) {
  currentTab = tabId;
  
  // Mettre à jour les boutons d'onglets
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  
  // Mettre à jour le contenu des onglets
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabId}-section`);
  });
  saveSettings(); // Sauvegarder l'onglet actif
}

// Capture manuelle des domaines
async function handleManualCapture() {
  const captureBtn = document.getElementById('captureBtn');
  const statusElement = document.getElementById('captureStatus');
  
  try {
    captureBtn.disabled = true;
    captureBtn.textContent = chrome.i18n.getMessage('capturing');
    
    // Envoyer message au content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'captureDomainsManually' });
    
    if (response.success) {
      capturedDomains = response.domains;
      showStatus(statusElement, 'success', `${response.count} ${chrome.i18n.getMessage('captured_count')}`);
      
      // Appliquer les filtres
      await applyFiltersAndAnalyze();
      
      // Afficher les domaines capturés
      displayCapturedDomains();
      
    } else {
      showStatus(statusElement, 'error', response.message || chrome.i18n.getMessage('error_occurred'));
    }
    
  } catch (error) {
    console.error('Erreur capture:', error);
    showStatus(statusElement, 'error', chrome.i18n.getMessage('error_occurred'));
  } finally {
    captureBtn.disabled = false;
    captureBtn.textContent = chrome.i18n.getMessage('capture_domains');
  }
}

// Gestion de la capture automatique
async function handleAutoCaptureToggle(event) {
  const enabled = event.target.checked;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { 
      type: 'toggleAutoCapture', 
      enabled: enabled 
    });
    
    // Sauvegarder le paramètre
    await chrome.storage.local.set({ autoCaptureEnabled: enabled });
    
  } catch (error) {
    console.error('Erreur toggle auto capture:', error);
    event.target.checked = !enabled; // Revenir à l'état précédent
  }
}

// Application des filtres et analyse
async function applyFiltersAndAnalyze() {
  if (capturedDomains.length === 0) return;
  
  try {
    // Appliquer les filtres
    filteredDomains = await applyFilters(capturedDomains);
    
    // Afficher le nombre de domaines filtrés
    const statusElement = document.getElementById('captureStatus');
    showStatus(statusElement, 'info', `${filteredDomains.length} ${chrome.i18n.getMessage('filtered_count')}`);
    
    // Lancer l'analyse IA si configurée
    await analyzeWithAI();
    
  } catch (error) {
    console.error('Erreur filtrage/analyse:', error);
  }
}

// Application des filtres
async function applyFilters(domains) {
  const settings = await getFilterSettings();
  let filtered = [...domains];
  
  if (settings.excludeDigits) {
    filtered = filtered.filter(domain => !/\d/.test(domain));
  }
  
  if (settings.onlyCom) {
    filtered = filtered.filter(domain => domain.endsWith('.com'));
  }
  
  if (settings.excludeHyphens) {
    filtered = filtered.filter(domain => !domain.includes('-'));
  }
  
  if (settings.excludeKeywords && settings.excludeKeywords.length > 0) {
    const keywordsRegex = new RegExp(settings.excludeKeywords.join('|'), 'i');
    filtered = filtered.filter(domain => !keywordsRegex.test(domain));
  }
  
  if (settings.minLength > 0) {
    filtered = filtered.filter(domain => {
      const domainName = domain.split('.')[0];
      return domainName.length >= settings.minLength;
    });
  }
  
  // Correction: Suppression de la condition arbitraire && settings.maxLength < 100
  if (settings.maxLength > 0) { 
    filtered = filtered.filter(domain => {
      const domainName = domain.split('.')[0];
      return domainName.length <= settings.maxLength;
    });
  }
  
  if (settings.allowedExtensions && settings.allowedExtensions.length > 0) {
    filtered = filtered.filter(domain => {
      const parts = domain.split('.');
      const tld = parts[parts.length - 1];
      return settings.allowedExtensions.includes(tld);
    });
  }
  
  return Array.from(new Set(filtered));
}

// Analyse avec IA
async function analyzeWithAI() {
  if (filteredDomains.length === 0) return;
  
  try {
    const provider = document.getElementById('aiProviderSelect').value;
    const prompt = await getCustomPrompt();
    
    if (!provider || !prompt) return;
    
    showNotification('info', chrome.i18n.getMessage('analyzing'));
    
    const response = await chrome.runtime.sendMessage({
      type: 'sendDomainsToAI',
      provider: provider,
      domains: filteredDomains,
      prompt: prompt
    });
    
    if (response.success) {
      analysisResults = {
        provider: provider,
        prompt: prompt,
        domains: filteredDomains,
        result: response.data,
        timestamp: new Date().toISOString(),
        usage: response.usage
      };
      
      displayResults();
      saveToHistory();
      showNotification('success', chrome.i18n.getMessage('analysis_complete'));
      
      // Basculer vers l'onglet résultats
      switchTab('results');
      
    } else {
      showNotification('error', response.message || chrome.i18n.getMessage('error_occurred'));
    }
    
  } catch (error) {
    console.error('Erreur analyse IA:', error);
    showNotification('error', chrome.i18n.getMessage('error_occurred'));
  }
}

// Affichage des domaines capturés
function displayCapturedDomains() {
  const container = document.getElementById('capturedDomains');
  
  if (capturedDomains.length === 0) {
    container.innerHTML = `<div class="empty-state">${chrome.i18n.getMessage('no_domains_captured')}</div>`; // Assurez-vous que cette clé existe dans les fichiers _locales
    return;
  }
  
  const html = capturedDomains.slice(0, 20).map(domain => 
    `<div class="domain-item">
      <span>${domain}</span>
      <button class="favorite-btn" onclick="toggleFavorite('${domain}')">⭐</button>
    </div>`
  ).join('');
  
  if (capturedDomains.length > 20) {
    container.innerHTML = html + `<div class="domain-item">... et ${capturedDomains.length - 20} ${chrome.i18n.getMessage('others')}</div>`; // Assurez-vous que cette clé existe
  } else {
    container.innerHTML = html;
  }
}

// Fonction pour gérer les favoris
function toggleFavorite(domain) {
  showNotification('info', chrome.i18n.getMessage('favorite_action_info', [domain])); // Assurez-vous que 'favorite_action_info' existe dans les _locales et accepte un placeholder
}


// Affichage des résultats
function displayResults() {
  const container = document.getElementById('resultsContent');
  const statsContainer = document.getElementById('resultsStats');
  
  if (!analysisResults) {
    container.innerHTML = `<div class="empty-state">${chrome.i18n.getMessage('no_results')}</div>`;
    return;
  }
  
  // Afficher le résultat de l'IA
  container.innerHTML = `
    <div class="results-header">
      <h4>${chrome.i18n.getMessage('analysis_by', [analysisResults.provider])}</h4>
      <small>${new Date(analysisResults.timestamp).toLocaleString()}</small>
    </div>
    <div class="ai-result">
      ${analysisResults.result.replace(/\n/g, '<br>')}
    </div>
  `;
  
  // Afficher les statistiques
  statsContainer.innerHTML = `
    <div class="stats-grid">
      <div class="stat-item">
        <span class="stat-label">${chrome.i18n.getMessage('domains_analyzed')}:</span>
        <span class="stat-value">${analysisResults.domains.length}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">${chrome.i18n.getMessage('ai_provider')}:</span>
        <span class="stat-value">${analysisResults.provider}</span>
      </div>
      ${analysisResults.usage ? `
        <div class="stat-item">
          <span class="stat-label">${chrome.i18n.getMessage('tokens_used')}:</span>
          <span class="stat-value">${analysisResults.usage.total_tokens || 'N/A'}</span>
        </div>
      ` : ''}
    </div>
  `;
}

// Gestion des paramètres de filtres
async function loadFilterSettings() {
  const response = await chrome.runtime.sendMessage({ type: 'getFilterSettings' });
  if (response.success) {
    const settings = response.settings;
    
    document.getElementById('excludeDigits').checked = settings.excludeDigits;
    document.getElementById('onlyCom').checked = settings.onlyCom;
    document.getElementById('excludeHyphens').checked = settings.excludeHyphens;
    document.getElementById('excludeKeywords').value = settings.excludeKeywords.join('\n');
    document.getElementById('minLength').value = settings.minLength;
    document.getElementById('maxLength').value = settings.maxLength;
    
    // Extensions autorisées
    document.querySelectorAll('.extension-checkbox').forEach(checkbox => {
      checkbox.checked = settings.allowedExtensions.includes(checkbox.value);
    });
  }
}

async function saveFilterSettings() {
  const settings = {
    excludeDigits: document.getElementById('excludeDigits').checked,
    onlyCom: document.getElementById('onlyCom').checked,
    excludeHyphens: document.getElementById('excludeHyphens').checked,
    excludeKeywords: document.getElementById('excludeKeywords').value
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0),
    minLength: parseInt(document.getElementById('minLength').value) || 0,
    maxLength: parseInt(document.getElementById('maxLength').value) || 50,
    allowedExtensions: Array.from(document.querySelectorAll('.extension-checkbox:checked'))
      .map(cb => cb.value)
  };
  
  await chrome.runtime.sendMessage({ 
    type: 'saveFilterSettings', 
    settings: settings 
  });
  showNotification('success', chrome.i18n.getMessage('settings_saved'));
}

async function getFilterSettings() {
  const response = await chrome.runtime.sendMessage({ type: 'getFilterSettings' });
  return response.success ? response.settings : {};
}

// Gestion des paramètres API
async function loadApiSettings() {
  const provider = document.getElementById('aiProviderSelect').value;
  const response = await chrome.runtime.sendMessage({ 
    type: 'getApiKey', 
    provider: provider 
  });
  
  if (response.success && response.apiKey) {
    document.getElementById('apiKeyInput').value = response.apiKey;
  }
  
  updateApiDocLink();
}

async function handleProviderChange() {
  await loadApiSettings();
  updateApiDocLink();
}

function updateApiDocLink() {
  const provider = document.getElementById('aiProviderSelect').value;
  const docLink = document.getElementById('apiDocLink');
  docLink.href = apiDocLinks[provider];
}

async function saveApiKey() {
  const provider = document.getElementById('aiProviderSelect').value;
  const apiKey = document.getElementById('apiKeyInput').value;
  
  if (apiKey.trim()) {
    await chrome.runtime.sendMessage({
      type: 'saveApiKey',
      provider: provider,
      apiKey: apiKey.trim()
    });
  }
}

async function handleTestConnection() {
  const provider = document.getElementById('aiProviderSelect').value;
  const statusElement = document.getElementById('apiStatus');
  const testBtn = document.getElementById('testConnectionBtn');
  
  testBtn.disabled = true;
  testBtn.textContent = chrome.i18n.getMessage('testing_connection'); // Nouvelle clé pour le statut
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'testApiConnection',
      provider: provider
    });
    
    if (response.success) {
      showStatus(statusElement, 'success', `${chrome.i18n.getMessage('connection_success')}: ${response.message}`);
    } else {
      showStatus(statusElement, 'error', `${chrome.i18n.getMessage('connection_failed')}: ${response.message}`);
    }
    
  } catch (error) {
    showStatus(statusElement, 'error', chrome.i18n.getMessage('error_occurred'));
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = chrome.i18n.getMessage('test_connection');
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('apiKeyInput');
  const btn = document.getElementById('toggleApiKey');
  
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

// Gestion du prompt personnalisé
async function loadCustomPrompt() {
  const response = await chrome.runtime.sendMessage({ type: 'getCustomPrompt' });
  if (response.success) {
    document.getElementById('customPrompt').value = response.prompt;
  }
}

async function saveCustomPrompt() {
  const prompt = document.getElementById('customPrompt').value;
  
  const response = await chrome.runtime.sendMessage({
    type: 'saveCustomPrompt',
    prompt: prompt
  });
  
  if (response.success) {
    showNotification('success', chrome.i18n.getMessage('prompt_saved'));
  }
}

async function getCustomPrompt() {
  const response = await chrome.runtime.sendMessage({ type: 'getCustomPrompt' });
  return response.success ? response.prompt : '';
}

// Export des résultats
function exportResults(format) {
  if (!analysisResults) return;
  
  let content, filename, mimeType;
  
  switch (format) {
    case 'csv':
      content = generateCSV();
      filename = `domain-analysis-${Date.now()}.csv`;
      mimeType = 'text/csv';
      break;
      
    case 'txt':
      content = generateTXT();
      filename = `domain-analysis-${Date.now()}.txt`;
      mimeType = 'text/plain';
      break;
      
    case 'json':
      content = JSON.stringify(analysisResults, null, 2);
      filename = `domain-analysis-${Date.now()}.json`;
      mimeType = 'application/json';
      break;
  }
  
  downloadFile(content, filename, mimeType);
  showNotification('success', chrome.i18n.getMessage('export_success'));
}

function generateCSV() {
  const headers = [
    chrome.i18n.getMessage('domain'), // Nouvelle clé
    chrome.i18n.getMessage('extension'), // Nouvelle clé
    chrome.i18n.getMessage('length') // Nouvelle clé
  ];
  const rows = analysisResults.domains.map(domain => {
    const parts = domain.split('.');
    const name = parts.slice(0, -1).join('.');
    const ext = parts[parts.length - 1];
    return [domain, ext, name.length];
  });
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function generateTXT() {
  return `${chrome.i18n.getMessage('analysis_report_title')} - ${new Date(analysisResults.timestamp).toLocaleString()}
${chrome.i18n.getMessage('ai_provider')}: ${analysisResults.provider}
${chrome.i18n.getMessage('number_of_domains')}: ${analysisResults.domains.length}

${chrome.i18n.getMessage('domains_analyzed_list')}:
${analysisResults.domains.join('\n')}

${chrome.i18n.getMessage('analysis_result_heading')}:
${analysisResults.result}`;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  URL.revokeObjectURL(url);
}

// Gestion de l'historique
async function loadHistory() {
  const response = await chrome.runtime.sendMessage({ type: 'getHistory' });
  if (response.success) {
    displayHistory(response.history);
  }
}

function displayHistory(history) {
  const container = document.getElementById('historyContent');
  
  if (history.length === 0) {
    container.innerHTML = `<div class="empty-state">${chrome.i18n.getMessage('no_history')}</div>`;
    return;
  }
  
  const html = history.map(entry => `
    <div class="history-item" onclick="restoreAnalysis(${entry.id})">
      <div class="history-header">
        <span class="history-date">${new Date(entry.timestamp).toLocaleString()}</span>
        <span class="history-provider">${entry.provider}</span>
      </div>
      <div class="history-summary">
        ${entry.domains.length} ${chrome.i18n.getMessage('domains_analyzed_count')}
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
}

// Fonction pour restaurer une analyse à partir de l'historique
async function restoreAnalysis(entryId) {
  const response = await chrome.runtime.sendMessage({ type: 'getHistory' });
  if (response.success) {
    const history = response.history;
    const entry = history.find(item => item.id === entryId);
    
    if (entry) {
      analysisResults = entry;
      filteredDomains = entry.domains; 
      displayResults();
      switchTab('results'); 
      showNotification('success', chrome.i18n.getMessage('analysis_restored_success')); 
    } else {
      showNotification('error', chrome.i18n.getMessage('history_entry_not_found')); 
    }
  } else {
    showNotification('error', chrome.i18n.getMessage('error_loading_history')); 
  }
}


async function saveToHistory() {
  if (!analysisResults) return;
  
  await chrome.runtime.sendMessage({
    type: 'saveToHistory',
    entry: analysisResults
  });
}

async function clearHistory() {
  if (confirm(chrome.i18n.getMessage('confirm_clear_history'))) { 
    await chrome.runtime.sendMessage({ type: 'clearHistory' });
    await loadHistory();
    showNotification('success', chrome.i18n.getMessage('history_cleared')); 
  }
}

function filterHistory() {
  const searchTerm = document.getElementById('historySearch').value.toLowerCase();
  const items = document.querySelectorAll('.history-item');
  
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(searchTerm) ? 'block' : 'none';
  });
}

// Fonctions utilitaires
function showStatus(element, type, message) {
  element.className = `status-message ${type}`;
  element.textContent = message;
  element.style.display = 'block';
  
  setTimeout(() => {
    element.style.display = 'none';
  }, 5000);
}

function showNotification(type, message) {
  const container = document.getElementById('notifications');
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  container.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

async function loadSettings() {
  const result = await chrome.storage.local.get(['languagePreference', 'currentTab']);
  if (result.languagePreference) {
    // La préférence de langue est chargée, mais chrome.i18n gère la langue réelle de l'UI
    updateLanguageDisplay(result.languagePreference);
  }
  if (result.currentTab) {
    currentTab = result.currentTab;
    switchTab(currentTab);
  }
}

async function saveSettings() {
  await chrome.storage.local.set({
    currentTab: currentTab
  });
  // La préférence de langue est enregistrée séparément dans setLanguagePreference
}

async function loadCurrentPageDomains() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'getCurrentPageDomains' });
    
    if (response && response.success && response.domains.length > 0) {
      capturedDomains = response.domains;
      displayCapturedDomains();
    }
  } catch (error) {
    // Ignorer les erreurs (page non compatible, etc.)
  }
}

// Écouter les messages du content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'domainsAutoDetected') {
    capturedDomains = request.totalDomains;
    displayCapturedDomains();
    showNotification('info', chrome.i18n.getMessage('new_domains_detected', [request.domains.length])); // Nouvelle clé avec placeholder
  }
});