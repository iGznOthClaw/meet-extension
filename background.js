// Background service worker

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'createMeeting') {
    createMeeting().then(sendResponse);
    return true; // Mantener el canal abierto para respuesta async
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
    // Timeout
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
      log('URL: ' + window.location.href);
      
      await sleep(2000);
      
      // Debug: ver qué hay en la página
      log('Body HTML length: ' + document.body.innerHTML.length);
      log('Buttons found: ' + document.querySelectorAll('button').length);
      
      // Buscar TODOS los elementos que contengan texto de reunión
      const allElements = document.querySelectorAll('*');
      let targetElement = null;
      
      for (const el of allElements) {
        if (el.children.length === 0 || el.tagName === 'BUTTON' || el.tagName === 'SPAN') {
          const text = el.textContent.trim().toLowerCase();
          if (text === 'nueva reunión' || text === 'new meeting') {
            log('Encontrado elemento exacto: ' + el.tagName + ' - ' + el.textContent);
            // Buscar el padre clickeable
            targetElement = el.closest('button') || el.closest('[role="button"]') || el;
            break;
          }
        }
      }
      
      if (!targetElement) {
        // Buscar por contenido parcial
        for (const el of allElements) {
          const text = el.textContent.toLowerCase();
          if ((text.includes('nueva') && text.includes('reuni')) || 
              (text.includes('new') && text.includes('meeting'))) {
            if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
              log('Encontrado botón por contenido: ' + el.textContent.substring(0, 50));
              targetElement = el;
              break;
            }
          }
        }
      }
      
      if (!targetElement) {
        const btns = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim().substring(0, 30));
        log('No encontrado. Botones disponibles: ' + JSON.stringify(btns));
        resolve({ error: 'No se encontró botón Nueva reunión', buttons: btns });
        return;
      }
      
      log('Haciendo click en: ' + targetElement.textContent.substring(0, 30));
      targetElement.click();
      await sleep(1500);
      
      // Buscar opción de iniciar reunión instantánea
      log('Buscando menú...');
      
      const menuItems = document.querySelectorAll('li, [role="menuitem"], [role="option"], [data-value]');
      log('Items encontrados: ' + menuItems.length);
      
      let startOption = null;
      for (const item of menuItems) {
        const text = item.textContent.toLowerCase();
        log('Item: ' + text.substring(0, 50));
        if (text.includes('iniciar') || text.includes('start an instant') || text.includes('instant')) {
          startOption = item;
          break;
        }
      }
      
      if (!startOption) {
        // Quizás ya está en la página de reunión?
        if (window.location.href.match(/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/)) {
          log('Ya estamos en la reunión!');
          resolve({ link: window.location.href });
          return;
        }
        
        resolve({ error: 'No se encontró opción Iniciar reunión', items: menuItems.length });
        return;
      }
      
      log('Clickeando: ' + startOption.textContent.substring(0, 30));
      startOption.click();
      await sleep(4000);
      
      // Esperar URL de reunión
      log('Esperando URL...');
      const startTime = Date.now();
      while (Date.now() - startTime < 15000) {
        const url = window.location.href;
        if (url.match(/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/)) {
          log('¡Reunión creada! ' + url);
          resolve({ link: url });
          return;
        }
        await sleep(500);
      }
      
      resolve({ error: 'Timeout esperando reunión', finalUrl: window.location.href });
      
    } catch (err) {
      log('Error: ' + err.message);
      resolve({ error: err.message });
    }
  });
}
