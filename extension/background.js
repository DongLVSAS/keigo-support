// background.js (service worker)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'CHECK_KEIGO') {
        console.log('Background received CHECK_KEIGO message:', msg);
        
        // Check if extension is enabled
        chrome.storage.sync.get(['extensionEnabled'], (result) => {
            const isEnabled = result.extensionEnabled !== false; // default to true
            
            if (!isEnabled) {
                console.log('Extension is disabled');
                sendResponse({ error: 'Extension is disabled' });
                return;
            }

            // Use the level from the message (already retrieved in content script)
            const level = msg.level || 'polite';
            const text = msg.text;

            if (!text || !text.trim()) {
                console.log('No text provided');
                sendResponse({ error: 'No text provided' });
                return;
            }

            console.log('Making API call with:', { text, level });

            // Call the API
            fetch('https://keigo-support.vercel.app/api/check-keigo', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ text: text, level: level })
            })
            .then(response => {
                console.log('API response status:', response.status);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('API success:', data);
                sendResponse(data);
            })
            .catch(err => { 
                console.error('API error:', err);
                
                // Provide better fallback based on level
                const fallbackData = generateFallbackData(text, level);
                sendResponse(fallbackData);
            });
        });
        
        return true; // keep message channel open for async response
    }
});

// Helper function to generate fallback data
function generateFallbackData(text, level) {
    console.log('🔄 Generating fallback data for level:', level);
    
    let suggestion = text;
    
    if (level === 'polite') {
        // Simple polite transformation
        suggestion = text
            .replace(/おはよう/g, "おはようございます")
            .replace(/ありがとう([。！？\s]|$)/g, "ありがとうございます$1")
            .replace(/だ([。！？\s]|$)/g, "です$1")
            .replace(/である([。！？\s]|$)/g, "です$1");
        
        if (!suggestion.match(/[。！？]$/)) {
            suggestion += "。よろしくお願いします。";
        }
    } else {
        // Honorific transformation
        suggestion = text
            .replace(/おはよう/g, "おはようございます。いつもお世話になっております")
            .replace(/ありがとう([。！？\s]|$)/g, "ありがとうございます。心より感謝申し上げます$1")
            .replace(/だ([。！？\s]|$)/g, "でございます$1")
            .replace(/である([。！？\s]|$)/g, "でございます$1");
        
        if (!suggestion.match(/[。！？]$/)) {
            suggestion += "。何卒よろしくお願いいたします。";
        }
    }

    return {
        [level]: [
            {
                original: text,
                suggestion: suggestion,
                reason: `Server unavailable - Applied basic ${level === 'polite' ? 'polite (丁寧語)' : 'honorific (尊敬語・謙譲語)'} transformation`
            }
        ]
    };
}