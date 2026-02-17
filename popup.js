document.getElementById('createBtn').addEventListener('click', async () => {
  const btn = document.getElementById('createBtn');
  const status = document.getElementById('status');
  const linkDiv = document.getElementById('link');
  
  btn.disabled = true;
  status.className = 'working';
  status.textContent = '⏳ Abriendo Google Meet...';
  
  try {
    // Abrir Meet en nueva pestaña
    const tab = await chrome.tabs.create({ 
      url: 'https://meet.google.com/landing',
      active: true 
    });
    
    status.textContent = '⏳ Esperando que cargue...';
    
    // Esperar a que cargue
    await waitForTabLoad(tab.id);
    await sleep(2000); // Extra wait para JS
    
    status.textContent = '⏳ Creando reunión...';
    
    // Ejecutar script en la página
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: automateCreateMeeting
    });
    
    console.log('Script results:', results);
    
    const meetLink = results[0]?.result;
    
    if (meetLink && meetLink.includes('meet.google.com/') && !meetLink.includes('ERROR')) {
      // Copiar al portapapeles
      await navigator.clipboard.writeText(meetLink);
      
      status.className = 'success';
      status.textContent = '✅ ¡Enlace copiado al portapapeles!';
      linkDiv.textContent = meetLink;
      linkDiv.style.display = 'block';
    } else {
      throw new Error(meetLink || 'No se pudo obtener el enlace');
    }
    
  } catch (error) {
    console.error('Extension error:', error);
    status.className = 'error';
    status.textContent = '❌ Error: ' + error.message;
  } finally {
    btn.disabled = false;
  }
});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    
    // Timeout por si acaso
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}

// Esta función se ejecuta en el contexto de la página de Meet
async function automateCreateMeeting() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  const log = (msg) => console.log('[MeetExt]', msg);
  
  try {
    log('Iniciando automatización...');
    
    // Esperar a que cargue el contenido
    await sleep(1500);
    
    // Buscar el botón "Nueva reunión" / "New meeting"
    log('Buscando botón Nueva reunión...');
    
    let newMeetingBtn = null;
    
    // Método 1: Buscar por texto en botones
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      const text = btn.textContent.toLowerCase();
      if (text.includes('nueva reuni') || text.includes('new meeting')) {
        newMeetingBtn = btn;
        log('Encontrado por texto: ' + btn.textContent);
        break;
      }
    }
    
    // Método 2: Buscar por aria-label
    if (!newMeetingBtn) {
      newMeetingBtn = document.querySelector('[aria-label*="Nueva"]') ||
                      document.querySelector('[aria-label*="New meeting"]');
      if (newMeetingBtn) log('Encontrado por aria-label');
    }
    
    // Método 3: Buscar divs clickeables con el texto
    if (!newMeetingBtn) {
      const allDivs = document.querySelectorAll('div[role="button"], div[jsaction]');
      for (const div of allDivs) {
        const text = div.textContent.toLowerCase();
        if (text.includes('nueva reuni') || text.includes('new meeting')) {
          newMeetingBtn = div;
          log('Encontrado div por texto: ' + div.textContent.substring(0, 50));
          break;
        }
      }
    }
    
    if (!newMeetingBtn) {
      // Debug: mostrar todos los botones encontrados
      const btnTexts = Array.from(allButtons).map(b => b.textContent.substring(0, 30));
      log('Botones encontrados: ' + JSON.stringify(btnTexts));
      return 'ERROR: No se encontró botón "Nueva reunión". Botones: ' + btnTexts.join(', ');
    }
    
    // Click en Nueva reunión
    log('Haciendo click en Nueva reunión...');
    newMeetingBtn.click();
    await sleep(1500);
    
    // Buscar "Iniciar una reunión instantánea" en el menú
    log('Buscando opción Iniciar reunión...');
    
    let startBtn = null;
    
    // Buscar en menú desplegable
    const menuItems = document.querySelectorAll('[role="menuitem"], [role="option"], li[data-value], ul li');
    log('Items de menú encontrados: ' + menuItems.length);
    
    for (const item of menuItems) {
      const text = item.textContent.toLowerCase();
      log('Menu item: ' + text.substring(0, 40));
      if (text.includes('iniciar una reuni') || text.includes('start an instant') || 
          text.includes('instantánea') || text.includes('instant meeting')) {
        startBtn = item;
        log('Encontrada opción: ' + item.textContent.substring(0, 40));
        break;
      }
    }
    
    // También buscar en cualquier elemento clickeable
    if (!startBtn) {
      const allClickables = document.querySelectorAll('[jsaction*="click"], [data-mdc-dialog-action]');
      for (const el of allClickables) {
        const text = el.textContent.toLowerCase();
        if (text.includes('iniciar') || text.includes('start')) {
          startBtn = el;
          log('Encontrado clickeable: ' + el.textContent.substring(0, 40));
          break;
        }
      }
    }
    
    if (!startBtn) {
      return 'ERROR: No se encontró opción "Iniciar reunión" en el menú';
    }
    
    // Click en iniciar
    log('Haciendo click en Iniciar...');
    startBtn.click();
    await sleep(3000);
    
    // Esperar a que la URL cambie al formato de reunión
    log('Esperando URL de reunión...');
    
    const maxWait = 20000;
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      const currentUrl = window.location.href;
      log('URL actual: ' + currentUrl);
      
      // Formato: meet.google.com/xxx-xxxx-xxx
      if (currentUrl.match(/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/)) {
        log('¡URL de reunión encontrada!');
        return currentUrl;
      }
      await sleep(500);
    }
    
    return 'ERROR: Timeout esperando URL de reunión. URL final: ' + window.location.href;
    
  } catch (error) {
    return 'ERROR: ' + error.message;
  }
}
