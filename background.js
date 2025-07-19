// background.js - Service Worker pour Domain List Filter AI

// Configuration des clients API
const API_CLIENTS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    testEndpoint: '/models',
    chatEndpoint: '/chat/completions',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    })
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    testEndpoint: '/models',
    chatEndpoint: '/models/gemini-pro:generateContent',
    headers: (apiKey) => ({
      'Content-Type': 'application/json'
    }),
    urlParams: (apiKey) => `?key=${apiKey}`
  },
  claude: {
    baseUrl: 'https://api.anthropic.com/v1',
    testEndpoint: '/messages', // Sera ajusté dans handleTestApiConnection
    chatEndpoint: '/messages',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    })
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1',
    testEndpoint: '/models',
    chatEndpoint: '/chat/completions',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    })
  },
  cohere: {
    baseUrl: 'https://api.cohere.ai/v1',
    testEndpoint: '/models',
    chatEndpoint: '/generate',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    })
  },
  llama: {
    baseUrl: 'https://api.llama-api.com/v1',
    testEndpoint: '/models',
    chatEndpoint: '/chat/completions',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    })
  }
};

// Gestionnaire des messages depuis le popup et content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message reçu:', request);
  
  switch (request.type) {
    case 'testApiConnection':
      handleTestApiConnection(request.provider, sendResponse);
      return true; // Indique une réponse asynchrone
      
    case 'sendDomainsToAI':
      handleSendDomainsToAI(request.provider, request.domains, request.prompt, sendResponse);
      return true;
      
    case 'saveFilterSettings':
      handleSaveFilterSettings(request.settings, sendResponse);
      return true;
      
    case 'getFilterSettings':
      handleGetFilterSettings(sendResponse);
      return true;
      
    case 'saveApiKey':
      handleSaveApiKey(request.provider, request.apiKey, sendResponse);
      return true;
      
    case 'getApiKey':
      handleGetApiKey(request.provider, sendResponse);
      return true;
      
    case 'saveCustomPrompt':
      handleSaveCustomPrompt(request.prompt, sendResponse);
      return true;
      
    case 'getCustomPrompt':
      handleGetCustomPrompt(sendResponse);
      return true;
      
    case 'saveToHistory':
      handleSaveToHistory(request.entry, sendResponse);
      return true;
      
    case 'getHistory':
      handleGetHistory(sendResponse);
      return true;
      
    case 'clearHistory':
      handleClearHistory(sendResponse);
      return true;
      
    default:
      console.warn('Type de message non reconnu:', request.type);
      sendResponse({ success: false, message: 'Type de message non reconnu' });
  }
});

// Test de connexion API
async function handleTestApiConnection(provider, sendResponse) {
  try {
    const apiKey = await getStoredApiKey(provider);
    if (!apiKey) {
      sendResponse({ success: false, message: 'Clé API non trouvée' });
      return;
    }
    
    const client = API_CLIENTS[provider];
    if (!client) {
      sendResponse({ success: false, message: 'Fournisseur non supporté' });
      return;
    }
    
    let url = client.baseUrl + client.testEndpoint + (client.urlParams ? client.urlParams(apiKey) : '');
    let method = 'GET';
    let body = undefined;

    // Logique spécifique pour le test de connexion de Claude (Anthropic)
    if (provider === 'claude') {
      method = 'POST';
      url = client.baseUrl + client.chatEndpoint; // Utiliser l'endpoint de chat pour le test
      body = JSON.stringify({
        model: 'claude-3-sonnet-20240229', // Ou un autre modèle valide pour un petit test
        max_tokens: 1, // Demander le minimum de tokens
        messages: [{ role: 'user', content: 'hello' }] // Un message minimal
      });
    }
    
    const response = await fetch(url, {
      method: method, // Utiliser la méthode déterminée (GET ou POST)
      headers: client.headers(apiKey),
      body: body // Ajouter le corps si défini
    });
    
    if (response.ok) {
      // Pour Claude, une réponse 200 indique que la connexion est OK même si la réponse n'est pas complète pour 1 token
      sendResponse({ 
        success: true, 
        message: `Connexion ${provider} réussie`,
        status: response.status 
      });
    } else {
      const errorData = await response.json().catch(() => ({}));
      sendResponse({ 
        success: false, 
        message: `Erreur ${provider}: ${errorData.error?.message || response.statusText}` 
      });
    }
  } catch (error) {
    console.error('Erreur test connexion:', error);
    sendResponse({ 
      success: false, 
      message: `Erreur réseau: ${error.message}` 
    });
  }
}

// Envoi des domaines à l'IA
async function handleSendDomainsToAI(provider, domains, prompt, sendResponse) {
  try {
    const apiKey = await getStoredApiKey(provider);
    if (!apiKey) {
      sendResponse({ success: false, message: 'Clé API non trouvée' });
      return;
    }
    
    const client = API_CLIENTS[provider];
    if (!client) {
      sendResponse({ success: false, message: 'Fournisseur non supporté' });
      return;
    }
    
    const requestBody = buildRequestBody(provider, domains, prompt);
    const url = client.baseUrl + client.chatEndpoint + (client.urlParams ? client.urlParams(apiKey) : '');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: client.headers(apiKey),
      body: JSON.stringify(requestBody)
    });
    
    if (response.ok) {
      const data = await response.json();
      const result = extractResponseContent(provider, data);
      sendResponse({ 
        success: true, 
        data: result,
        usage: data.usage || null
      });
    } else {
      const errorData = await response.json().catch(() => ({}));
      sendResponse({ 
        success: false, 
        message: `Erreur API ${provider}: ${errorData.error?.message || response.statusText}` 
      });
    }
  } catch (error) {
    console.error('Erreur envoi IA:', error);
    sendResponse({ 
      success: false, 
      message: `Erreur: ${error.message}` 
    });
  }
}

// Construction du corps de requête selon le fournisseur
function buildRequestBody(provider, domains, prompt) {
  const domainList = domains.join(', ');
  
  switch (provider) {
    case 'openai':
    case 'mistral':
    case 'llama':
      return {
        model: provider === 'openai' ? 'gpt-3.5-turbo' : 
               provider === 'mistral' ? 'mistral-tiny' : 'llama-2-7b-chat',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `Voici une liste de domaines à analyser: ${domainList}` }
        ],
        max_tokens: 1000,
        temperature: 0.7
      };
      
    case 'gemini':
      return {
        contents: [{
          parts: [{
            text: `${prompt}\n\nListe de domaines à analyser: ${domainList}`
          }]
        }],
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.7
        }
      };
      
    case 'claude':
      return {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        messages: [
          { role: 'user', content: `${prompt}\n\nListe de domaines à analyser: ${domainList}` }
        ]
      };
      
    case 'cohere':
      return {
        model: 'command',
        prompt: `${prompt}\n\nListe de domaines à analyser: ${domainList}`,
        max_tokens: 1000,
        temperature: 0.7
      };
      
    default:
      throw new Error('Fournisseur non supporté');
  }
}

// Extraction du contenu de la réponse selon le fournisseur
function extractResponseContent(provider, data) {
  switch (provider) {
    case 'openai':
    case 'mistral':
    case 'llama':
      return data.choices?.[0]?.message?.content || 'Aucune réponse';
      
    case 'gemini':
      return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Aucune réponse';
      
    case 'claude':
      return data.content?.[0]?.text || 'Aucune réponse';
      
    case 'cohere':
      return data.generations?.[0]?.text || 'Aucune réponse';
      
    default:
      return 'Format de réponse non reconnu';
  }
}

// Fonctions de stockage
async function handleSaveApiKey(provider, apiKey, sendResponse) {
  try {
    await chrome.storage.local.set({ [`apiKey_${provider}`]: apiKey });
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, message: error.message });
  }
}

async function handleGetApiKey(provider, sendResponse) {
  try {
    const result = await chrome.storage.local.get([`apiKey_${provider}`]);
    sendResponse({ success: true, apiKey: result[`apiKey_${provider}`] || null });
  } catch (error) {
    sendResponse({ success: false, message: error.message });
  }
}

async function getStoredApiKey(provider) {
  const result = await chrome.storage.local.get([`apiKey_${provider}`]);
  return result[`apiKey_${provider}`] || null;
}

async function handleSaveFilterSettings(settings, sendResponse) {
  try {
    await chrome.storage.local.set({ filterSettings: settings });
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, message: error.message });
  }
}

async function handleGetFilterSettings(sendResponse) {
  try {
    const result = await chrome.storage.local.get(['filterSettings']);
    const defaultSettings = {
      excludeDigits: false,
      onlyCom: false,
      excludeKeywords: [],
      minLength: 0,
      maxLength: 50,
      excludeHyphens: false,
      allowedExtensions: []
    };
    sendResponse({ 
      success: true, 
      settings: result.filterSettings || defaultSettings 
    });
  } catch (error) {
    sendResponse({ success: false, message: error.message });
  }
}

async function handleSaveCustomPrompt(prompt, sendResponse) {
  try {
    await chrome.storage.local.set({ customAiPrompt: prompt });
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, message: error.message });
  }
}

async function handleGetCustomPrompt(sendResponse) {
  try {
    const result = await chrome.storage.local.get(['customAiPrompt']);
    const defaultPrompt = "Veuillez analyser la liste de domaines suivante et identifier ceux qui sont les plus pertinents pour une stratégie de marketing digital axée sur la génération de leads. Classez-les par ordre de pertinence et justifiez brièvement votre choix pour les 5 premiers.";
    sendResponse({ 
      success: true, 
      prompt: result.customAiPrompt || defaultPrompt 
    });
  } catch (error) {
    sendResponse({ success: false, message: error.message });
  }
}

async function handleSaveToHistory(entry, sendResponse) {
  try {
    const result = await chrome.storage.local.get(['analysisHistory']);
    const history = result.analysisHistory || [];
    
    const newEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...entry
    };
    
    history.unshift(newEntry);
    
    // Limiter l'historique à 100 entrées
    if (history.length > 100) {
      history.splice(100);
    }
    
    await chrome.storage.local.set({ analysisHistory: history });
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, message: error.message });
  }
}

async function handleGetHistory(sendResponse) {
  try {
    const result = await chrome.storage.local.get(['analysisHistory']);
    sendResponse({ 
      success: true, 
      history: result.analysisHistory || [] 
    });
  } catch (error) {
    sendResponse({ success: false, message: error.message });
  }
}

async function handleClearHistory(sendResponse) {
  try {
    await chrome.storage.local.remove(['analysisHistory']);
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, message: error.message });
  }
}

// Initialisation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Domain List Filter AI installé');
});