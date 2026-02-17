document.getElementById('createBtn').addEventListener('click', async () => {
  const btn = document.getElementById('createBtn');
  const status = document.getElementById('status');
  const linkDiv = document.getElementById('link');
  
  btn.disabled = true;
  status.className = 'working';
  status.textContent = '⏳ Creando reunión...';
  status.style.display = 'block';
  
  try {
    // Enviar mensaje al background script
    const response = await chrome.runtime.sendMessage({ action: 'createMeeting' });
    
    console.log('Response:', response);
    
    if (response && response.link) {
      // Copiar al portapapeles
      await navigator.clipboard.writeText(response.link);
      
      status.className = 'success';
      status.textContent = '✅ ¡Enlace copiado!';
      linkDiv.textContent = response.link;
      linkDiv.style.display = 'block';
    } else if (response && response.error) {
      status.className = 'error';
      status.textContent = '❌ ' + response.error;
      if (response.buttons) {
        linkDiv.textContent = 'Botones encontrados: ' + response.buttons.join(', ');
        linkDiv.style.display = 'block';
      }
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
