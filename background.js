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
    
    // Guardar opciones + flag para que el content script las aplique
    await chrome.storage.local.set({
      ...options,
      pendingApply: true
    });
    
    // 1. Abrir Meet
    const tab = await chrome.tabs.create({ 
      url: 'https://meet.google.com/landing',
      active: true 
    });
    
    console.log('[BG] Tab creada:', tab.id);
    
    // 2. Esperar a que cargue
    await waitForTabComplete(tab.id);
    await sleep(3000);
    
    // 3. Ejecutar automatización para crear reunión
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: createMeetingInPage
    });
    
    console.log('[BG] Resultado:', results);
    const result = results[0]?.result;
    
    if (result && result.link) {
      // 4. Esperar a que la página de reunión cargue
      await sleep(3000);
      
      // 5. Enviar mensaje al content script para copiar link
      try {
        await chrome.tabs.sendMessage(tab.id, { 
          action: 'copyLink', 
          link: result.link 
        });
      } catch (e) {
        console.log('[BG] No se pudo enviar a content script, copiando directo');
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (link) => navigator.clipboard.writeText(link),
          args: [result.link]
        });
      }
      
      // 6. Enviar mensaje para aplicar settings
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'applySettings',
          options: options
        });
      } catch (e) {
        console.log('[BG] Content script aplicará settings via storage');
      }
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

// Crear la reunión (se ejecuta en la página)
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
