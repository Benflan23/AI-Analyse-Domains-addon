// content_script.js - Script d'injection pour la capture de domaines

// Configuration et variables globales
let isAutoCaptureModeEnabled = false;
let capturedDomains = new Set();
let observer = null;

// Expressions régulières pour la détection de domaines
const DOMAIN_REGEX = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}/g;
// Suppression de CLEAN_DOMAIN_REGEX car elle n'est pas utilisée.

// Initialisation du script
function initContentScript() {
  console.log('Domain List Filter AI - Content Script initialisé');
  
  // Écouter les messages du popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
      case 'captureDomainsManually':
        handleManualCapture(sendResponse);
        return true;
        
      case 'toggleAutoCapture':
        handleToggleAutoCapture(request.enabled, sendResponse);
        return true;
        
      case 'getCurrentPageDomains':
        handleGetCurrentPageDomains(sendResponse);
        return true;
        
      default:
        sendResponse({ success: false, message: 'Action non reconnue' });
    }
  });
  
  // Démarrer la détection automatique si activée
  checkAutoCaptureSettings();
}

// Capture manuelle des domaines
async function handleManualCapture(sendResponse) {
  try {
    console.log('Début de la capture manuelle');
    
    const domains = await captureDomainsFromCurrentPage();
    const cleanedDomains = cleanAndFormatDomains(domains);
    
    console.log(`Capture terminée: ${cleanedDomains.length} domaines trouvés`);
    
    sendResponse({
      success: true,
      domains: cleanedDomains,
      count: cleanedDomains.length,
      url: window.location.href
    });
    
  } catch (error) {
    console.error('Erreur lors de la capture manuelle:', error);
    sendResponse({
      success: false,
      message: error.message
    });
  }
}

// Capture des domaines de la page actuelle
async function captureDomainsFromCurrentPage() {
  const domains = new Set();
  
  // Méthode 1: Extraction depuis les liens (balises <a>)
  const links = document.querySelectorAll('a[href]');
  links.forEach(link => {
    const href = link.href;
    const text = link.textContent.trim();
    
    // Extraire domaine de l'URL
    if (href) {
      const domainFromHref = extractDomainFromUrl(href);
      if (domainFromHref) domains.add(domainFromHref);
    }
    
    // Extraire domaine du texte
    if (text) {
      const domainsFromText = extractDomainsFromText(text);
      domainsFromText.forEach(domain => domains.add(domain));
    }
  });
  
  // Méthode 2: Extraction depuis les tableaux
  const tables = document.querySelectorAll('table');
  tables.forEach(table => {
    const cells = table.querySelectorAll('td, th');
    cells.forEach(cell => {
      const text = cell.textContent.trim();
      if (text) {
        const domainsFromText = extractDomainsFromText(text);
        domainsFromText.forEach(domain => domains.add(domain));
      }
    });
  });
  
  // Méthode 3: Extraction depuis les listes (ul, ol)
  const lists = document.querySelectorAll('ul, ol');
  lists.forEach(list => {
    const items = list.querySelectorAll('li');
    items.forEach(item => {
      const text = item.textContent.trim();
      if (text) {
        const domainsFromText = extractDomainsFromText(text);
        domainsFromText.forEach(domain => domains.add(domain));
      }
    });
  });
  
  // Méthode 4: Extraction depuis les divs et spans (pour les sites dynamiques)
  const containers = document.querySelectorAll('div, span, p');
  containers.forEach(container => {
    // Éviter les conteneurs trop grands pour optimiser les performances
    if (container.textContent.length > 1000) return;
    
    const text = container.textContent.trim();
    if (text && isDomainLikeText(text)) {
      const domainsFromText = extractDomainsFromText(text);
      domainsFromText.forEach(domain => domains.add(domain));
    }
  });
  
  return Array.from(domains);
}

// Extraction de domaine depuis une URL
function extractDomainFromUrl(url) {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;
    
    // Supprimer le préfixe www.
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    
    // Vérifier que c'est un domaine valide
    if (isValidDomain(hostname)) {
      return hostname.toLowerCase();
    }
  } catch (error) {
    // URL invalide, ignorer
  }
  return null;
}

// Extraction de domaines depuis du texte
function extractDomainsFromText(text) {
  const domains = [];
  const matches = text.match(DOMAIN_REGEX);
  
  if (matches) {
    matches.forEach(match => {
      const cleanMatch = match.replace(/^https?:\/\//, '').replace(/^www\./, '');
      if (isValidDomain(cleanMatch)) {
        domains.push(cleanMatch.toLowerCase());
      }
    });
  }
  
  return domains;
}

// Vérification si le texte ressemble à une liste de domaines
function isDomainLikeText(text) {
  // Heuristiques pour identifier les textes contenant potentiellement des domaines
  const domainIndicators = [
    /\.com\b/i, /\.net\b/i, /\.org\b/i, /\.fr\b/i, /\.io\b/i,
    /\.co\b/i, /\.uk\b/i, /\.de\b/i, /\.es\b/i, /\.it\b/i
  ];
  
  return domainIndicators.some(regex => regex.test(text));
}

// Validation de domaine
function isValidDomain(domain) {
  // Vérifications de base
  if (!domain || domain.length < 4 || domain.length > 253) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.includes('..')) return false;
  
  // Doit contenir au moins un point
  if (!domain.includes('.')) return false;
  
  // Vérification avec regex
  const validDomainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  return validDomainRegex.test(domain);
}

// Nettoyage et formatage des domaines
function cleanAndFormatDomains(domainList) {
  const cleanedDomains = new Set();
  
  domainList.forEach(domain => {
    if (!domain) return;
    
    // Nettoyer le domaine
    let cleanDomain = domain.toLowerCase().trim();
    
    // Supprimer les protocoles
    cleanDomain = cleanDomain.replace(/^https?:\/\//, '');
    
    // Supprimer www.
    cleanDomain = cleanDomain.replace(/^www\./, '');
    
    // Supprimer les chemins, paramètres, fragments
    cleanDomain = cleanDomain.split('/')[0].split('?')[0].split('#')[0];
    
    // Supprimer les ports
    cleanDomain = cleanDomain.split(':')[0];
    
    // Validation finale
    if (isValidDomain(cleanDomain)) {
      cleanedDomains.add(cleanDomain);
    }
  });
  
  return Array.from(cleanedDomains).sort();
}

// Gestion de la capture automatique
async function handleToggleAutoCapture(enabled, sendResponse) {
  isAutoCaptureModeEnabled = enabled;
  
  if (enabled) {
    startAutoCapture();
    sendResponse({ success: true, message: 'Capture automatique activée' });
  } else {
    stopAutoCapture();
    sendResponse({ success: true, message: 'Capture automatique désactivée' });
  }
}

// Démarrage de la capture automatique
function startAutoCapture() {
  console.log('Démarrage de la capture automatique');
  
  // Observer les changements du DOM
  observer = new MutationObserver(mutations => {
    let hasNewContent = false;
    
    mutations.forEach(mutation => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            hasNewContent = true;
          }
        });
      }
    });
    
    if (hasNewContent) {
      // Débounce pour éviter trop d'appels
      clearTimeout(window.autoCaptureTimeout);
      window.autoCaptureTimeout = setTimeout(() => {
        detectNewDomains();
      }, 1000);
    }
  });
  
  // Commencer l'observation
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Première détection
  detectNewDomains();
}

// Arrêt de la capture automatique
function stopAutoCapture() {
  console.log('Arrêt de la capture automatique');
  
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  
  if (window.autoCaptureTimeout) {
    clearTimeout(window.autoCaptureTimeout);
  }
}

// Détection de nouveaux domaines
async function detectNewDomains() {
  try {
    const currentDomains = await captureDomainsFromCurrentPage();
    const cleanedDomains = cleanAndFormatDomains(currentDomains);
    
    // Identifier les nouveaux domaines
    const newDomains = cleanedDomains.filter(domain => !capturedDomains.has(domain));
    
    if (newDomains.length > 0) {
      console.log(`${newDomains.length} nouveaux domaines détectés`);
      
      // Ajouter à la liste des domaines capturés
      newDomains.forEach(domain => capturedDomains.add(domain));
      
      // Notifier le popup
      chrome.runtime.sendMessage({
        type: 'domainsAutoDetected',
        domains: newDomains,
        totalDomains: Array.from(capturedDomains),
        url: window.location.href
      });
    }
  } catch (error) {
    console.error('Erreur lors de la détection automatique:', error);
  }
}

// Récupération des domaines de la page actuelle
async function handleGetCurrentPageDomains(sendResponse) {
  try {
    const domains = await captureDomainsFromCurrentPage();
    const cleanedDomains = cleanAndFormatDomains(domains);
    
    sendResponse({
      success: true,
      domains: cleanedDomains,
      count: cleanedDomains.length,
      url: window.location.href
    });
  } catch (error) {
    sendResponse({
      success: false,
      message: error.message
    });
  }
}

// Vérification des paramètres de capture automatique
async function checkAutoCaptureSettings() {
  try {
    const result = await chrome.storage.local.get(['autoCaptureEnabled']);
    if (result.autoCaptureEnabled) {
      isAutoCaptureModeEnabled = true;
      startAutoCapture();
    }
  } catch (error) {
    console.error('Erreur lors de la vérification des paramètres:', error);
  }
}

// Suppression de la fonction handlePagination car elle n'est pas utilisée.

// Initialisation quand le DOM est prêt
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContentScript);
} else {
  initContentScript();
}