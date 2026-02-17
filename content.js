// Content script - se inyecta automáticamente en meet.google.com

console.log('[MeetExt] Content script cargado en:', window.location.href);

// Escuchar mensajes del background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[MeetExt] Mensaje recibido:', message);
  
  if (message.action === 'applySettings') {
    applySettings(message.options);
    sendResponse({ ok: true });
  }
  
  if (message.action === 'copyLink') {
    navigator.clipboard.writeText(message.link).then(() => {
      console.log('[MeetExt] Link copiado:', message.link);
      sendResponse({ ok: true });
    }).catch(err => {
      console.error('[MeetExt] Error copiando:', err);
      sendResponse({ error: err.message });
    });
    return true; // async response
  }
  
  if (message.action === 'getUrl') {
    sendResponse({ url: window.location.href });
  }
});

// Detectar cuando entramos a una reunión
function checkIfInMeeting() {
  const url = window.location.href;
  if (url.match(/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/)) {
    console.log('[MeetExt] Estamos en una reunión!');
    
    // Obtener opciones guardadas y aplicar
    chrome.storage.local.get(['camOff', 'micOff', 'autoAdmit', 'pendingApply'], (data) => {
      if (data.pendingApply) {
        console.log('[MeetExt] Aplicando configuraciones pendientes...');
        chrome.storage.local.remove('pendingApply');
        
        setTimeout(() => {
          applySettings({
            camOff: data.camOff !== false,
            micOff: data.micOff !== false,
            autoAdmit: data.autoAdmit !== false
          });
        }, 2000);
      }
    });
    
    return true;
  }
  return false;
}

// Aplicar configuraciones
async function applySettings(options) {
  console.log('[MeetExt] Aplicando settings:', options);
  
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  await sleep(2000);
  
  // Buscar todos los botones
  const buttons = document.querySelectorAll('button[aria-label], button[data-tooltip]');
  console.log('[MeetExt] Botones encontrados:', buttons.length);
  
  for (const btn of buttons) {
    const label = (btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || '').toLowerCase();
    console.log('[MeetExt] Botón:', label);
  }
  
  // Apagar cámara
  if (options.camOff) {
    console.log('[MeetExt] Buscando cámara para apagar...');
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || '').toLowerCase();
      
      // Si el label indica que la cámara está encendida (y se puede apagar)
      if ((label.includes('camera') || label.includes('cámara') || label.includes('video')) &&
          (label.includes('turn off') || label.includes('desactivar') || label.includes('apagar'))) {
        console.log('[MeetExt] Apagando cámara:', label);
        btn.click();
        await sleep(500);
        break;
      }
    }
  }
  
  // Apagar micrófono
  if (options.micOff) {
    console.log('[MeetExt] Buscando micrófono para apagar...');
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || '').toLowerCase();
      
      if ((label.includes('microphone') || label.includes('micrófono') || label.includes('mic')) &&
          (label.includes('turn off') || label.includes('desactivar') || label.includes('apagar') || label.includes('silenciar'))) {
        console.log('[MeetExt] Apagando micrófono:', label);
        btn.click();
        await sleep(500);
        break;
      }
    }
  }
  
  // Auto-admitir
  if (options.autoAdmit) {
    console.log('[MeetExt] Activando auto-admitir...');
    setupAutoAdmit();
  }
  
  console.log('[MeetExt] Settings aplicados!');
}

// Observer para auto-admitir
function setupAutoAdmit() {
  if (window.__meetAutoAdmit) return;
  
  const observer = new MutationObserver(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent.toLowerCase().trim();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      
      if (text === 'admitir' || text === 'admit' || 
          text === 'admitir a todos' || text === 'admit all' ||
          ariaLabel.includes('admit')) {
        console.log('[MeetExt] Auto-admitiendo:', text || ariaLabel);
        btn.click();
      }
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  window.__meetAutoAdmit = observer;
  console.log('[MeetExt] Auto-admitir activado');
}

// Verificar al cargar
setTimeout(() => {
  checkIfInMeeting();
}, 1000);

// Observar cambios de URL (SPA)
let lastUrl = window.location.href;
new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    console.log('[MeetExt] URL cambió a:', lastUrl);
    setTimeout(checkIfInMeeting, 1000);
  }
}).observe(document.body, { childList: true, subtree: true });
