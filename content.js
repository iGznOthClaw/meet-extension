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

// Copiar enlace de la reunión (URL limpia sin parámetros)
function copyMeetLink() {
  const url = window.location.origin + window.location.pathname;
  
  const input = document.createElement('input');
  input.value = url;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
  
  console.log('[MeetExt] URL copiada:', url);
  return true;
}

// Aplicar configuraciones
function applySettings(options) {
  console.log('[MeetExt] Aplicando settings:', options);
  
  // Buscar TODOS los botones
  const buttons = document.querySelectorAll('button');
  console.log('[MeetExt] Botones encontrados:', buttons.length);
  
  for (const btn of buttons) {
    const label = (btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || btn.textContent || '').toLowerCase();
    if (label.length > 0 && label.length < 50) {
      console.log('[MeetExt] Botón:', label.substring(0, 40));
    }
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
    // Buscar elementos que necesiten hover (badges, indicadores)
    const allElements = document.querySelectorAll('button, div, span, [role="button"]');
    
    for (const el of allElements) {
      const text = (el.textContent || '').toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      
      // Hacer hover en elementos de espera
      if (ariaLabel.includes('waiting') || ariaLabel.includes('esperando') ||
          ariaLabel.includes('wants to join') || ariaLabel.includes('quiere unirse') ||
          ariaLabel.includes('asking to join') || ariaLabel.includes('pide unirse') ||
          text.includes('esperando') || text.includes('waiting')) {
        console.log('[MeetExt] Hover en:', ariaLabel || text.substring(0, 30));
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      }
    }
    
    // Buscar botones de admitir
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent.toLowerCase().trim();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      
      if (text === 'admitir' || text === 'admit' || 
          text === 'admitir a todos' || text === 'admit all' ||
          text.includes('admitir a') || text.includes('admit') || 
          text.includes('invitado') || ariaLabel.includes('admit')) {
        console.log('[MeetExt] Auto-admitiendo:', text || ariaLabel);
        btn.click();
      }
    }
  };
  
  checkAdmitButtons();
  
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
