let extensionEnabled = true; // default enabled
let keigoButton = null;

// Load extension state from storage
chrome.storage.sync.get(['extensionEnabled'], (result) => {
  extensionEnabled = result.extensionEnabled !== false; // default to true
  updateButtonVisibility();
});

// Listen for extension toggle messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TOGGLE_EXTENSION') {
    extensionEnabled = msg.enabled;
    updateButtonVisibility();
  }
});

function updateButtonVisibility() {
  if (keigoButton) {
    keigoButton.style.display = extensionEnabled ? 'block' : 'none';
  }
  
  // Hide popup if extension is disabled
  if (!extensionEnabled) {
    const existingPopup = document.querySelector(".keigo-suggestion-popup");
    if (existingPopup) {
      existingPopup.remove();
    }
  }
}

// Wait for Gmail to load
setTimeout(() => {
  // Create completely separate button
  const keigoBtn = document.createElement("div");
  keigoBtn.innerHTML = `
    <button id="keigo-independent-btn" style="
      position: fixed;
      top: 12px;
      right: 200px;
      background: #ff6b35;
      color: white;
      border: none;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: Arial, sans-serif;
    ">
      敬語チェック
    </button>
  `;
  
  document.body.appendChild(keigoBtn);
  keigoButton = keigoBtn.querySelector('#keigo-independent-btn');
  
  // Update visibility based on current state
  updateButtonVisibility();
  
  // Add click handler with preventDefault
  document.getElementById("keigo-independent-btn").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    if (!extensionEnabled) {
      return;
    }
    
    const button = document.getElementById("keigo-independent-btn");
    
    // Check if popup is already open - if so, close it
    const existingPopup = document.querySelector(".keigo-suggestion-popup");
    if (existingPopup) {
      existingPopup.remove();
      return;
    }
    
    // Check if button is already in loading state
    if (button.disabled) {
      return;
    }
    
    // Set button to loading state
    const originalText = button.textContent;
    const originalStyle = button.style.cssText;
    button.disabled = true;
    button.style.opacity = '0.6';
    button.style.cursor = 'not-allowed';
    button.textContent = '処理中...';
    
    // Add loading animation
    let loadingDots = 0;
    const loadingInterval = setInterval(() => {
      loadingDots = (loadingDots + 1) % 4;
      button.textContent = '処理中' + '.'.repeat(loadingDots);
    }, 500);
    
    // Function to restore button state
    const restoreButton = () => {
      clearInterval(loadingInterval);
      button.disabled = false;
      button.style.cssText = originalStyle;
      button.textContent = originalText;
    };
    
    // Find text in compose area
    const composeAreas = document.querySelectorAll('[contenteditable="true"]');
    let foundText = "";
    
    composeAreas.forEach((area, i) => {
      const text = area.innerText || area.textContent || "";
      if (text.trim().length > 0) {
        foundText = text;
      }
    });
    
    if (!foundText.trim()) {
      restoreButton();
      alert("テキストが見つかりません。メール本文に日本語を入力してください。");
      return;
    }
    
    // Get keigo level from storage
    chrome.storage.sync.get(['keigoLevel'], (result) => {
      const level = result.keigoLevel || 'polite';
      
      // Call our API
      fetch('http://localhost:3000/api/check-keigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: foundText, level: level })
      })
      .then(response => {
        return response.json();
      })
      .then(data => {
        restoreButton();
        showKeigoSuggestion(data, composeAreas[0]);
      })
      .catch(error => {
        console.error("API Error:", error);
        restoreButton();
        // Fallback to mock data
        const mockData = {
          suggested_text: foundText.replace("こんにちは", "おはようございます") + "。よろしくお願いいたします。",
          variants: {
            polite: foundText.replace("こんにちは", "おはようございます") + "。よろしくお願いします。",
            honorific: foundText.replace("こんにちは", "おはようございます") + "。何卒よろしくお願いいたします。"
          },
          explanations: ["Mock suggestion - server not available"]
        };
        showKeigoSuggestion(mockData, composeAreas[0]);
      });
    });
  });
  
}, 3000);

function showKeigoSuggestion(data, targetEditor) {
  // Check if extension is enabled before showing popup
  if (!extensionEnabled) {
    return;
  }
  
  // Remove existing popup
  const existing = document.querySelector(".keigo-suggestion-popup");
  if (existing) existing.remove();
  
  // Determine which level data is available (new single-level format)
  let currentLevel = '';
  let currentText = '';
  let currentReason = '';
  
  if (data.polite && data.polite[0]) {
    currentLevel = 'polite';
    currentText = data.polite[0].suggestion;
    currentReason = data.polite[0].reason || "";
  } else if (data.honorific && data.honorific[0]) {
    currentLevel = 'honorific';
    currentText = data.honorific[0].suggestion;
    currentReason = data.honorific[0].reason || "";
  } else if (data.variants) {
    // Fallback to old dual format - determine level from available data
    if (data.variants.polite && data.variants.honorific) {
      // Both available, need to check stored preference
      chrome.storage.sync.get(['keigoLevel'], (result) => {
        const storedLevel = result.keigoLevel || 'polite';
        currentLevel = storedLevel;
        currentText = data.variants[storedLevel];
      });
    } else if (data.variants.polite) {
      currentLevel = 'polite';
      currentText = data.variants.polite;
    } else if (data.variants.honorific) {
      currentLevel = 'honorific';
      currentText = data.variants.honorific;
    }
  } else if (data.suggested_text) {
    currentLevel = 'polite'; // default
    currentText = data.suggested_text;
  }
  
  const popup = document.createElement("div");
  popup.className = "keigo-suggestion-popup";
  
  // Check if already polite
  const isAlreadyPolite = currentReason.includes("既に適切な敬語");
  const headerColor = isAlreadyPolite ? "#4CAF50" : "#333";
  const headerText = isAlreadyPolite ? "✅ 敬語チェック結果" : "敬語の提案";
  
  // Determine section styling based on level
  const sectionColor = currentLevel === 'honorific' ? '#9C27B0' : '#2196F3';
  const sectionBg = currentLevel === 'honorific' ? '#faf4ff' : '#f0f8ff';
  const sectionLabel = currentLevel === 'honorific' ? '尊敬語' : '丁寧語';
  const sectionTitle = currentLevel === 'honorific' ? '尊敬語・謙譲語レベル' : '丁寧語レベル';
  
  popup.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 15px; color: ${headerColor}; text-align: center; font-size: 16px;">
      ${headerText}
    </div>
    
    <!-- Single Level Section -->
    <div style="margin-bottom: 20px;">
      <div style="font-weight: bold; margin-bottom: 8px; color: ${sectionColor}; display: flex; align-items: center;">
        <span style="background: ${sectionColor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 8px;">${sectionLabel}</span>
        ${sectionTitle}
      </div>
      <div style="background: ${sectionBg}; padding: 12px; border-radius: 6px; border-left: 4px solid ${sectionColor}; white-space: pre-wrap; font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.5;">
        ${currentText && currentText != '' ? escapeHtml(currentText) : '<i>提案がありません。</i>'}
      </div>
      ${currentReason ? `<div style="margin-top: 6px; font-size: 12px; color: #666; font-style: italic;">${escapeHtml(currentReason)}</div>` : ''}
      <div style="margin-top: 8px; text-align: right;">
        <button class="keigo-apply-btn" data-level="${currentLevel}" style="background: ${isAlreadyPolite ? '#4CAF50' : sectionColor}; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          ${isAlreadyPolite ? 'そのまま使用' : 'この敬語を適用'}
        </button>
      </div>
    </div>
    
    <!-- Control Buttons -->
    <div style="display: flex; gap: 8px; justify-content: center; padding-top: 10px; border-top: 1px solid #eee;">
      <button id="keigo-cancel-btn" style="background: #f44336; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
        キャンセル
      </button>
    </div>
  `;
  
  popup.style.position = "fixed";
  popup.style.top = "64px";
  popup.style.right = "20px";
  popup.style.width = "450px";
  popup.style.maxHeight = "80vh";
  popup.style.overflowY = "auto";
  popup.style.background = "white";
  popup.style.border = "2px solid #ff6b35";
  popup.style.borderRadius = "12px";
  popup.style.padding = "20px";
  popup.style.boxShadow = "0 8px 32px rgba(0,0,0,0.3)";
  popup.style.zIndex = "999999";
  popup.style.fontSize = "14px";
  popup.style.fontFamily = "'Hiragino Sans', 'Yu Gothic', sans-serif";
  
  document.body.appendChild(popup);
  
  // Apply button handler
  const applyButton = popup.querySelector('.keigo-apply-btn');
  if (applyButton) {
    applyButton.addEventListener('click', () => {
      if (targetEditor && currentText) {
        if (targetEditor.isContentEditable) {
          targetEditor.innerText = currentText;
        } else {
          targetEditor.value = currentText;
        }
      }
      popup.remove();
    });
  }
  
  // Cancel button  
  document.getElementById("keigo-cancel-btn").addEventListener("click", () => {
    popup.remove();
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}