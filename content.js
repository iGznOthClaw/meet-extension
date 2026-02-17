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
    copyMeetLink();
    sendResponse({ ok: true });
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
    
    chrome.storage.local.get(['camOff', 'micOff', 'autoAdmit', 'pendingApply'], (data) => {
      if (data.pendingApply) {
        console.log('[MeetExt] Aplicando configuraciones pendientes...');
        chrome.storage.local.remove('pendingApply');
        
        applySettings({
          camOff: data.camOff !== false,
          micOff: data.micOff !== false,
          autoAdmit: data.autoAdmit !== false
        });
        
        copyMeetLink();
      }
    });
    
    return true;
  }
  return false;
}

// Copiar enlace de la reunión
function copyMeetLink() {
  const buttons = document.querySelectorAll('button[aria-label], button[data-tooltip]');
  
  for (const btn of buttons) {
    const label = (btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || '').toLowerCase();
    
    if (label.includes('copiar enlace') || label.includes('copy link') || label === 'copiar enlace') {
      console.log('[MeetExt] Clickeando botón copiar enlace');
      btn.click();
      return true;
    }
  }
  
  // Fallback: copiar URL directamente
  console.log('[MeetExt] Botón no encontrado, copiando URL directamente');
  navigator.clipboard.writeText(window.location.href);
  return true;
}

// Aplicar configuraciones
function applySettings(options) {
  console.log('[MeetExt] Aplicando settings:', options);
  
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
      
      if ((label.includes('cámara') || label.includes('camera') || label.includes('video')) &&
          (label.includes('desactivar') || label.includes('turn off') || label.includes('apagar'))) {
        console.log('[MeetExt] Apagando cámara:', label);
        btn.click();
        break;
      }
    }
  }
  
  // Apagar micrófono
  if (options.micOff) {
    console.log('[MeetExt] Buscando micrófono para apagar...');
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || '').toLowerCase();
      
      if ((label.includes('micrófono') || label.includes('microphone') || label.includes('mic')) &&
          (label.includes('desactivar') || label.includes('turn off') || label.includes('apagar') || label.includes('silenciar') || label.includes('mute'))) {
        console.log('[MeetExt] Apagando micrófono:', label);
        btn.click();
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
  
  const checkAdmitButtons = () => {
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
  };
  
  // Revisar inmediatamente
  checkAdmitButtons();
  
  // Observer para cambios
  const observer = new MutationObserver(checkAdmitButtons);
  observer.observe(document.body, { childList: true, subtree: true });
  window.__meetAutoAdmit = observer;
  
  console.log('[MeetExt] Auto-admitir activado');
}

// Verificar al cargar
checkIfInMeeting();

// Observar cambios de URL (SPA)
let lastUrl = window.location.href;
new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    console.log('[MeetExt] URL cambió a:', lastUrl);
    checkIfInMeeting();
  }
}).observe(document.body, { childList: true, subtree: true });
