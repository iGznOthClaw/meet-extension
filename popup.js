// Cargar opciones guardadas
document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['camOff', 'micOff', 'autoAdmit']);
  
  document.getElementById('camOff').checked = stored.camOff !== false;
  document.getElementById('micOff').checked = stored.micOff !== false;
  document.getElementById('autoAdmit').checked = stored.autoAdmit !== false;
});

// Guardar opciones cuando cambian
document.querySelectorAll('.options input').forEach(input => {
  input.addEventListener('change', () => {
    chrome.storage.local.set({
      camOff: document.getElementById('camOff').checked,
      micOff: document.getElementById('micOff').checked,
      autoAdmit: document.getElementById('autoAdmit').checked
    });
  });
});

document.getElementById('createBtn').addEventListener('click', async () => {
  const btn = document.getElementById('createBtn');
  const status = document.getElementById('status');
  const linkDiv = document.getElementById('link');
  
  const options = {
    camOff: document.getElementById('camOff').checked,
    micOff: document.getElementById('micOff').checked,
    autoAdmit: document.getElementById('autoAdmit').checked
  };
  
  // Guardar opciones
  await chrome.storage.local.set(options);
  
  btn.disabled = true;
  status.className = 'working';
  status.textContent = '⏳ Creando reunión...';
  status.style.display = 'block';
  
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'createMeeting',
      options: options
    });
    
    console.log('Response:', response);
    
    if (response && response.link) {
      await navigator.clipboard.writeText(response.link);
      
      status.className = 'success';
      status.textContent = '✅ ¡Enlace copiado!';
      linkDiv.textContent = response.link;
      linkDiv.style.display = 'block';
    } else if (response && response.error) {
      status.className = 'error';
      status.textContent = '❌ ' + response.error;
    } else {
      status.className = 'error';
      status.textContent = '❌ Sin respuesta';
    }
    
  } catch (error) {
    console.error('Error:', error);
    status.className = 'error';
    status.textContent = '❌ ' + error.message;
  } finally {
    btn.disabled = false;
  }
});
