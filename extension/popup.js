// popup.js - Extension toggle functionality
document.addEventListener('DOMContentLoaded', async () => {
    const toggle = document.getElementById('extensionToggle');
    const statusText = document.getElementById('statusText');
    const levelSelect = document.getElementById('level');

    // Load current settings
    const result = await chrome.storage.sync.get(['extensionEnabled', 'keigoLevel']);
    const isEnabled = result.extensionEnabled !== false; // default to true
    const level = result.keigoLevel || 'polite';

    // Set UI state
    toggle.classList.toggle('active', isEnabled);
    statusText.textContent = isEnabled ? '利用中' : '未利用';
    statusText.style.color = isEnabled ? '#4CAF50' : '#f44336';
    levelSelect.value = level;

    // Toggle extension on/off
    toggle.addEventListener('click', async () => {
        const newState = !toggle.classList.contains('active');
        toggle.classList.toggle('active', newState);
        statusText.textContent = newState ? '利用中' : '未利用';
        statusText.style.color = newState ? '#4CAF50' : '#f44336';
        
        await chrome.storage.sync.set({ extensionEnabled: newState });
        
        // Send message to all tabs to update extension state
        try {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                try {
                    await chrome.tabs.sendMessage(tab.id, { 
                        type: 'TOGGLE_EXTENSION', 
                        enabled: newState 
                    });
                } catch (e) {
                    // Tab might not have content script, ignore
                }
            }
        } catch (e) {
            console.log('[Popup] Failed to update tabs:', e);
        }
    });

    // Save level setting
    levelSelect.addEventListener('change', async () => {
        const newLevel = levelSelect.value;
        await chrome.storage.sync.set({ keigoLevel: newLevel });
    });
});