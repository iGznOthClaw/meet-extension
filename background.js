// Background service worker

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'createMeeting') {
    createMeeting(message.options || {}).then(sendResponse);
    return true;
  }
});

async function createMeeting(options) {
  try {
    console.log('[BG] Creando reunión con opciones:', options);
    
    // 1. Abrir Meet
    const tab = await chrome.tabs.create({ 
      url: 'https://meet.google.com/landing',
      active: true 
    });
    
    // 2. Esperar a que cargue
    await waitForTabComplete(tab.id);
    await sleep(3000);
    
    // 3. Ejecutar automatización para crear reunión
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: createMeetingInPage
    });
    
    const result = results[0]?.result;
    
    if (result && result.link) {
      // 4. Esperar a que cargue la página de la reunión
      await waitForTabComplete(tab.id);
      await sleep(3000);
      
      // 5. Aplicar configuraciones (cámara, mic, auto-admit)
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: applyMeetingSettings,
        args: [options]
      });
      
      // 6. Copiar link
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (link) => navigator.clipboard.writeText(link),
        args: [result.link]
      });
    }
    
    return result;
    
  } catch (error) {
    console.error('[BG] Error:', error);
    return { error: error.message };
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const check = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (tab && tab.status === 'complete') {
          resolve();
        } else {
          setTimeout(check, 200);
        }
      });
    };
    check();
    setTimeout(resolve, 15000);
  });
}

// Crear la reunión
function createMeetingInPage() {
  return new Promise(async (resolve) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const log = msg => console.log('[MeetExt]', msg);
    
    try {
      log('=== CREANDO REUNIÓN ===');
      await sleep(2000);
      
      // Buscar botón Nueva reunión
      let targetElement = null;
      const allElements = document.querySelectorAll('*');
      
      for (const el of allElements) {
        if (el.children.length === 0 || el.tagName === 'BUTTON' || el.tagName === 'SPAN') {
          const text = el.textContent.trim().toLowerCase();
          if (text === 'nueva reunión' || text === 'new meeting') {
            targetElement = el.closest('button') || el.closest('[role="button"]') || el;
            break;
          }
        }
      }
      
      if (!targetElement) {
        for (const el of allElements) {
          const text = el.textContent.toLowerCase();
          if ((text.includes('nueva') && text.includes('reuni')) || 
              (text.includes('new') && text.includes('meeting'))) {
            if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
              targetElement = el;
              break;
            }
          }
        }
      }
      
      if (!targetElement) {
        resolve({ error: 'No se encontró botón Nueva reunión' });
        return;
      }
      
      log('Click en Nueva reunión');
      targetElement.click();
      await sleep(1500);
      
      // Buscar opción Iniciar reunión
      const menuItems = document.querySelectorAll('li, [role="menuitem"], [role="option"], [data-value]');
      let startOption = null;
      
      for (const item of menuItems) {
        const text = item.textContent.toLowerCase();
        if (text.includes('iniciar') || text.includes('start an instant') || text.includes('instant')) {
          startOption = item;
          break;
        }
      }
      
      if (!startOption) {
        resolve({ error: 'No se encontró opción Iniciar reunión' });
        return;
      }
      
      log('Click en Iniciar');
      startOption.click();
      await sleep(4000);
      
      // Esperar URL de reunión
      const startTime = Date.now();
      while (Date.now() - startTime < 15000) {
        const url = window.location.href;
        if (url.match(/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/)) {
          log('Reunión creada: ' + url);
          resolve({ link: url });
          return;
        }
        await sleep(500);
      }
      
      resolve({ error: 'Timeout esperando reunión' });
      
    } catch (err) {
      resolve({ error: err.message });
    }
  });
}

// Aplicar configuraciones de la reunión
function applyMeetingSettings(options) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = msg => console.log('[MeetExt]', msg);
  
  log('=== APLICANDO CONFIGURACIONES ===');
  log('Opciones: ' + JSON.stringify(options));
  
  // Función para encontrar y hacer click en botones de control
  async function toggleControl(type, shouldBeOff) {
    if (!shouldBeOff) return;
    
    await sleep(1000);
    
    const buttons = document.querySelectorAll('button');
    
    for (const btn of buttons) {
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      const dataTooltip = (btn.getAttribute('data-tooltip') || '').toLowerCase();
      const label = ariaLabel || dataTooltip;
      
      let isTarget = false;
      let isCurrentlyOn = false;
      
      if (type === 'camera') {
        isTarget = label.includes('camera') || label.includes('cámara') || 
                   label.includes('video') || label.includes('cam');
        // Si dice "turn off" o "desactivar", está encendida
        isCurrentlyOn = label.includes('turn off') || label.includes('desactivar') || 
                        label.includes('apagar') || label.includes('off');
      } else if (type === 'mic') {
        isTarget = label.includes('microphone') || label.includes('micrófono') || 
                   label.includes('micro') || label.includes('mic');
        isCurrentlyOn = label.includes('turn off') || label.includes('desactivar') || 
                        label.includes('apagar') || label.includes('off') || label.includes('mute');
      }
      
      if (isTarget) {
        log(`Encontrado ${type}: "${label}" - actualmente ${isCurrentlyOn ? 'ON' : 'OFF'}`);
        if (isCurrentlyOn) {
          log(`Apagando ${type}...`);
          btn.click();
          await sleep(500);
          return true;
        }
      }
    }
    
    log(`No se encontró botón de ${type} para apagar`);
    return false;
  }
  
  // Función principal async
  (async () => {
    await sleep(2000);
    
    // Apagar cámara si está marcado
    if (options.camOff) {
      log('Intentando apagar cámara...');
      await toggleControl('camera', true);
    }
    
    // Apagar micrófono si está marcado
    if (options.micOff) {
      log('Intentando apagar micrófono...');
      await toggleControl('mic', true);
    }
    
    // Configurar auto-admitir
    if (options.autoAdmit) {
      log('Configurando auto-admitir...');
      
      const observer = new MutationObserver(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent.toLowerCase().trim();
          if (text === 'admitir' || text === 'admit' || 
              text === 'admitir a todos' || text === 'admit all') {
            log('Auto-admitiendo: ' + text);
            btn.click();
          }
        }
      });
      
      observer.observe(document.body, { childList: true, subtree: true });
      window.__meetAutoAdmit = observer;
      log('Auto-admitir activado');
    }
    
    log('=== CONFIGURACIONES APLICADAS ===');
  })();
}
