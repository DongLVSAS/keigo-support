// background.js (service worker)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'CHECK_KEIGO') {
        // Check if extension is enabled
        chrome.storage.sync.get(['extensionEnabled', 'keigoLevel'], (result) => {
            const isEnabled = result.extensionEnabled !== false; // default to true
            const level = result.keigoLevel || 'polite';
            
            if (!isEnabled) {
                sendResponse({ error: 'Extension is disabled' });
                return;
            }

            fetch('http://localhost:3000/api/check-keigo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: msg.text, level: level })
            })
            .then(r => r.json())
            .then(data => sendResponse(data))
            .catch(err => { 
                console.error(err); 
                sendResponse(null);  
            });
        });
        return true; // keep channel open
    }
});