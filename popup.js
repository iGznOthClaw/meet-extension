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
    
    // Esperar a que cargue y ejecutar la automatización
    await waitForTabLoad(tab.id);
    
    status.textContent = '⏳ Creando reunión...';
    
    // Ejecutar script en la página
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: automateCreateMeeting
    });
    
    const meetLink = results[0]?.result;
    
    if (meetLink && meetLink.includes('meet.google.com')) {
      // Copiar al portapapeles
      await navigator.clipboard.writeText(meetLink);
      
      status.className = 'success';
      status.textContent = '✅ ¡Enlace copiado al portapapeles!';
      linkDiv.textContent = meetLink;
      linkDiv.style.display = 'block';
    } else {
      throw new Error('No se pudo obtener el enlace');
    }
    
  } catch (error) {
    status.className = 'error';
    status.textContent = '❌ Error: ' + error.message;
  } finally {
    btn.disabled = false;
  }
});

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1500); // Esperar un poco más para que cargue JS
      }
    });
  });
}

// Esta función se ejecuta en el contexto de la página de Meet
async function automateCreateMeeting() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  // Función para encontrar botón por texto
  function findButtonByText(text) {
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      if (btn.textContent.toLowerCase().includes(text.toLowerCase())) {
        return btn;
      }
    }
    return null;
  }
  
  // Función para esperar elemento
  async function waitForElement(selector, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(200);
    }
    return null;
  }
  
  // Función para esperar botón por texto
  async function waitForButtonByText(text, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const btn = findButtonByText(text);
      if (btn) return btn;
      await sleep(200);
    }
    return null;
  }
  
  try {
    // 1. Esperar y click en "Nueva reunión"
    await sleep(2000);
    
    let newMeetingBtn = await waitForButtonByText('Nueva reunión') || 
                        await waitForButtonByText('New meeting') ||
                        await waitForButtonByText('nueva');
    
    if (!newMeetingBtn) {
      // Intentar con selector específico
      newMeetingBtn = document.querySelector('[data-button-id="new-meeting"]') ||
                      document.querySelector('[jsname="CuSyi"]');
    }
    
    if (!newMeetingBtn) {
      throw new Error('No se encontró botón "Nueva reunión"');
    }
    
    newMeetingBtn.click();
    await sleep(1000);
    
    // 2. Click en "Iniciar una reunión instantánea" o "Iniciar una reunión"
    let startBtn = await waitForButtonByText('Iniciar una reunión') ||
                   await waitForButtonByText('Start an instant meeting') ||
                   await waitForButtonByText('instantánea') ||
                   await waitForButtonByText('instant meeting');
    
    if (!startBtn) {
      // Buscar en el menú desplegable
      const menuItems = document.querySelectorAll('[role="menuitem"], [role="option"], li');
      for (const item of menuItems) {
        if (item.textContent.toLowerCase().includes('iniciar') || 
            item.textContent.toLowerCase().includes('start')) {
          startBtn = item;
          break;
        }
      }
    }
    
    if (!startBtn) {
      throw new Error('No se encontró botón "Iniciar reunión"');
    }
    
    startBtn.click();
    
    // 3. Esperar a que cargue la reunión y obtener URL
    await sleep(3000);
    
    // Esperar a que la URL cambie a una reunión
    const maxWait = 15000;
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      const currentUrl = window.location.href;
      if (currentUrl.match(/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/)) {
        return currentUrl;
      }
      await sleep(500);
    }
    
    // Si no cambió la URL, intentar obtenerla del DOM
    const meetingInfo = document.querySelector('[data-meeting-code]');
    if (meetingInfo) {
      const code = meetingInfo.getAttribute('data-meeting-code');
      return `https://meet.google.com/${code}`;
    }
    
    throw new Error('No se pudo obtener el enlace de la reunión');
    
  } catch (error) {
    return 'ERROR: ' + error.message;
  }
}
