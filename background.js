// Background service worker

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'createMeeting') {
    createMeeting().then(sendResponse);
    return true;
  }
});

async function createMeeting() {
  try {
    console.log('[BG] Creando reunión...');
    
    // 1. Abrir Meet
    const tab = await chrome.tabs.create({ 
      url: 'https://meet.google.com/landing',
      active: true 
    });
    
    console.log('[BG] Tab creada:', tab.id);
    
    // 2. Esperar a que cargue
    await waitForTabComplete(tab.id);
    await sleep(3000);
    
    console.log('[BG] Página cargada, ejecutando script...');
    
    // 3. Ejecutar automatización
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: automateInPage
    });
    
    console.log('[BG] Resultado:', results);
    
    const result = results[0]?.result;
    
    // 4. Si hay link, copiarlo al portapapeles desde la página
    if (result && result.link) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (link) => {
          navigator.clipboard.writeText(link).then(() => {
            console.log('[MeetExt] Link copiado:', link);
          });
        },
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
        if (tab.status === 'complete') {
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

// Función que corre en la página
function automateInPage() {
  return new Promise(async (resolve) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    
    const log = (msg) => {
      console.log('[MeetExt]', msg);
    };
    
    try {
      log('=== INICIANDO AUTOMATIZACIÓN ===');
      
      await sleep(2000);
      
      // Buscar botón Nueva reunión
      const allElements = document.querySelectorAll('*');
      let targetElement = null;
      
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
      
      // Buscar opción Iniciar reunión instantánea
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
        if (window.location.href.match(/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/)) {
          resolve({ link: window.location.href });
          return;
        }
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
          
          // Apagar cámara y micrófono
          await sleep(2000);
          await toggleCameraAndMic();
          
          // Configurar auto-admitir
          await setupAutoAdmit();
          
          resolve({ link: url });
          return;
        }
        await sleep(500);
      }
      
      resolve({ error: 'Timeout esperando reunión' });
      
    } catch (err) {
      log('Error: ' + err.message);
      resolve({ error: err.message });
    }
  });
}

// Función para apagar cámara y micrófono (se inyecta en automateInPage)
async function toggleCameraAndMic() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = msg => console.log('[MeetExt]', msg);
  
  log('Apagando cámara y micrófono...');
  
  // Buscar botones de cámara y mic por aria-label o data attributes
  const buttons = document.querySelectorAll('button[aria-label], button[data-tooltip]');
  
  for (const btn of buttons) {
    const label = (btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || '').toLowerCase();
    
    // Cámara
    if (label.includes('camera') || label.includes('cámara') || label.includes('video')) {
      if (label.includes('turn off') || label.includes('desactivar') || label.includes('apagar') ||
          !label.includes('turn on') && !label.includes('activar')) {
        log('Apagando cámara: ' + label);
        btn.click();
        await sleep(500);
      }
    }
    
    // Micrófono
    if (label.includes('microphone') || label.includes('micrófono') || label.includes('mic')) {
      if (label.includes('turn off') || label.includes('desactivar') || label.includes('apagar') ||
          !label.includes('turn on') && !label.includes('activar')) {
        log('Apagando micrófono: ' + label);
        btn.click();
        await sleep(500);
      }
    }
  }
  
  // Método alternativo: usar atajos de teclado
  // Ctrl+D = toggle cámara, Ctrl+E = toggle mic
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));
    await sleep(300);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, bubbles: true }));
  } catch (e) {
    log('Atajos no funcionaron: ' + e.message);
  }
}

// Función para auto-admitir participantes
async function setupAutoAdmit() {
  const log = msg => console.log('[MeetExt]', msg);
  
  log('Configurando auto-admitir...');
  
  // Observer para detectar cuando alguien quiere entrar
  const observer = new MutationObserver((mutations) => {
    // Buscar botón "Admitir" / "Admit"
    const admitButtons = document.querySelectorAll('button');
    for (const btn of admitButtons) {
      const text = btn.textContent.toLowerCase();
      if (text === 'admitir' || text === 'admit' || text.includes('admit')) {
        log('Auto-admitiendo participante');
        btn.click();
      }
    }
    
    // También buscar "Admit all" / "Admitir a todos"
    for (const btn of admitButtons) {
      const text = btn.textContent.toLowerCase();
      if (text.includes('admit all') || text.includes('admitir a todos')) {
        log('Admitiendo a todos');
        btn.click();
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  log('Auto-admitir activado');
  
  // Guardar referencia para que no se elimine
  window.__meetExtAutoAdmit = observer;
}
