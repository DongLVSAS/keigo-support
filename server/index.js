require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const app = express();

// CORS middleware để cho phép Chrome Extension
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());


const OPENAI_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 3000;


function buildPrompt(text, level){
    return `あなたは日本のビジネスメール作成の専門家です。

        タスク: 以下の日本語テキストをビジネスメールとして適切な敬語に変換してください。

        重要な判定基準:
        1. テキスト全体を文ごとに分析してください
        2. **一つでも**改善可能な文があれば、改善案を提供してください
        3. **全ての文**が既に適切な敬語レベルの場合のみ「already_polite」として返してください
        4. 部分的に適切でも、改善余地があれば提案を行ってください

        敬語改善の優先順位:
        - メールの文脈に合わせて自然な敬語を使用
        - 相手との関係性を考慮した適切な敬語レベル
        - ビジネスシーンでよく使われる表現を優先
        - 冗長すぎず、簡潔で丁寧な文章

        出力レベル:
        - "polite" (丁寧語): 同僚や一般的なビジネス相手向け（です/ます調）
        - "very_polite" (超丁寧語): 上司、取引先、お客様向け（謙譲語・尊敬語を適切に使用）

        出力は必ずJSONのみを返してください。

        **全文が完璧**な場合の形式:
        {
            "already_polite": true,
            "level": "polite" または "very_polite",
            "message": "この文章は既に適切な敬語レベルです。",
            "original_text": "元のテキスト"
        }

        **一つでも改善可能**な場合の形式:
        {
            "already_polite": false,
            "suggested_text": "(${level}レベルの推奨メール文)",
            "level": "${level}",
            "explanations": [
                {"original":"元の表現", "suggestion":"修正案", "reason":"ビジネスメールでの修正理由"}
            ]
        }

        変換対象テキスト: """${text.replace(/"/g,'\\"')}"""

        判定例:
        - "おはようございます。よろしくお願いします。" → already_polite (全文が適切)
        - "おはようございます。手伝ってください。" → 提案必要 (手伝ってください を改善可能)
        - "こんにちは。ありがとうございます。" → 提案必要 (こんにちは を改善可能)

        注意: 
        - 挨拶文や締めの言葉は状況に応じて追加・修正してください
        - メールの件名や宛先は変更せず、本文のみ敬語化してください
        - 自然で読みやすい日本語ビジネスメールとして仕上げてください`;
}


// Test endpoint để kiểm tra API key
app.get('/api/test', async (req, res) => {
    try {
        console.log('🔥 Testing API key...');
        const r = await fetch('https://api.openai.com/v1/models', {
            headers: {
                'Authorization': `Bearer ${OPENAI_KEY}`
            }
        });
        
        console.log('🔥 Models API status:', r.status);
        const data = await r.json();
        
        if (r.status === 200) {
            const availableModels = data.data.map(m => m.id).filter(id => 
                id.includes('gpt') || id.includes('davinci')
            );
            console.log('✅ Available models:', availableModels);
            res.json({ success: true, availableModels });
        } else {
            console.log('❌ API key test failed:', data);
            res.json({ success: false, error: data });
        }
    } catch (err) {
        console.error('❌ Test error:', err);
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/check-keigo', async (req,res)=>{
    console.log('🔥 API called with body:', req.body);
    
    const { text, level = 'polite' } = req.body || {};
    console.log('🔥 Extracted text:', text);
    console.log('🔥 Level:', level);
    
    if (!text) {
        console.log('❌ No text provided');
        return res.status(400).json({ error: 'no text' });
    }
    
    try {
        console.log('🔥 Building prompt...');
        const prompt = buildPrompt(text, level);
        console.log('🔥 Prompt built:', prompt.substring(0, 100) + '...');
        
        console.log('🔥 Calling OpenAI API...');
        console.log('🔥 API Key exists:', !!OPENAI_KEY);
        console.log('🔥 API Key prefix:', OPENAI_KEY ? OPENAI_KEY.substring(0, 10) + '...' : 'NOT SET');
        
        // Try different models in order of preference (only active models)
        const models = [
            'gpt-4o-mini',
        ];
        let response = null;
        let lastError = null;
        
        for (const model of models) {
            try {
                console.log(`🔥 Trying model: ${model}`);
                const r = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_KEY}`
                },
                body: JSON.stringify({ 
                    model: model, 
                    messages:[
                        {
                            role:'system',
                            content:'You are a Japanese keigo expert.'
                        },
                        {
                            role:'user',
                            content:prompt
                        }
                    ], max_tokens:800 })
                });
                
                console.log(`🔥 ${model} Response status:`, r.status);
                
                if (r.status === 200) {
                    response = r;
                    console.log(`✅ Success with model: ${model}`);
                    break;
                } else {
                    const errorData = await r.json();
                    console.log(`❌ ${model} failed:`, errorData);
                    
                    // Skip deprecated or unavailable models
                    if (errorData.error?.code === 'model_not_found' || 
                        errorData.error?.message?.includes('deprecated')) {
                        console.log(`⏭️ Skipping deprecated/unavailable model: ${model}`);
                        continue;
                    }
                    
                    // For other errors, still try next model but save error
                    lastError = errorData;
                }
            } catch (err) {
                console.log(`❌ ${model} network error:`, err.message);
                lastError = err;
            }
        }
        
        if (!response) {
            console.log('❌ All OpenAI models failed, using fallback response');
            
            // Simple check for already polite text (basic heuristic)
            const hasPoliteMarkers = text.match(/(です|ます|でございます|いたします|させていただき|お[^\s]{1,3}(する|します|いたします)|ご[^\s]{1,3}(する|します|いたします))/) && !text.match(/(だ[。！？\s]|である[。！？\s]|だよ|だね|じゃん)/);
            
            if (hasPoliteMarkers && text.length < 100) { // Conservative check for short, already polite text
                const alreadyPoliteResponse = {
                    [level]: [
                        {
                            original: text,
                            suggestion: text,
                            reason: "この文章は既に適切な敬語レベルです。(Fallback判定)"
                        }
                    ]
                };
                console.log('🔥 Sending fallback already-polite response:', alreadyPoliteResponse);
                return res.json(alreadyPoliteResponse);
            }
            
            // Fallback improvement suggestions
            let fallbackSuggestion = text;
            if (level === 'polite') {
                fallbackSuggestion = text.replace(/だ$/, "です").replace(/である$/, "です") + (text.match(/[。！？]$/) ? "" : "。よろしくお願いします。");
            } else {
                fallbackSuggestion = text.replace(/だ$/, "でございます").replace(/である$/, "でございます") + (text.match(/[。！？]$/) ? "" : "。何卒よろしくお願いいたします。");
            }
            
            const fallbackResponse = {
                [level]: [
                    {
                        original: text,
                        suggestion: fallbackSuggestion,
                        reason: `OpenAI service unavailable - Applied basic ${level === 'polite' ? 'business email politeness' : 'formal business email courtesy'}`
                    }
                ]
            };
            
            console.log('🔥 Sending fallback response:', fallbackResponse);
            return res.json(fallbackResponse);
        }
        
        const j = await response.json();
        console.log('🔥 OpenAI Response data:', JSON.stringify(j, null, 2));
        
        const assistantText = j.choices?.[0]?.message?.content || '';
        console.log('🔥 Assistant text:', assistantText);
        
        // try parse JSON
        let parsed = { suggested_text: assistantText, variants: {}, explanations: [] };
        try { 
            parsed = JSON.parse(assistantText);
            console.log('✅ Successfully parsed JSON:', parsed);
            
            // Handle already_polite case
            if (parsed.already_polite) {
                console.log('📝 Text is already polite, converting to single level format');
                const alreadyPoliteResponse = {
                    [level]: [
                        {
                            original: text,
                            suggestion: parsed.original_text || text,
                            reason: parsed.message || "この文章は既に適切な敬語レベルです。"
                        }
                    ]
                };
                console.log('🔥 Sending already-polite response:', alreadyPoliteResponse);
                return res.json(alreadyPoliteResponse);
            }
            
            // Convert new single-level format
            if (parsed.suggested_text && !parsed.variants) {
                const singleLevelResponse = {
                    [level]: [
                        {
                            original: text,
                            suggestion: parsed.suggested_text,
                            reason: parsed.explanations?.[0]?.reason || `${level === 'polite' ? '丁寧語' : '超丁寧語'}レベルの提案`
                        }
                    ]
                };
                console.log('🔥 Sending single level response:', singleLevelResponse);
                return res.json(singleLevelResponse);
            }
            
            // Convert old dual format to single level (backward compatibility)
            if (parsed.variants && (parsed.variants.polite || parsed.variants.very_polite)) {
                const requestedSuggestion = parsed.variants[level] || parsed.suggested_text;
                const singleLevelResponse = {
                    [level]: [
                        {
                            original: text,
                            suggestion: requestedSuggestion,
                            reason: `${level === 'polite' ? '丁寧語' : '超丁寧語'}レベルの提案`
                        }
                    ]
                };
                console.log('🔥 Sending converted single level response:', singleLevelResponse);
                return res.json(singleLevelResponse);
            }
            
        }
        catch (e) { 
            console.log('⚠️ Failed to parse JSON, using raw text:', e.message);
        }
        
        console.log('🔥 Sending response:', parsed);
        res.json(parsed);
    } catch(err) { 
        console.error('❌ Server error:', err); 
        res.status(500).json({ error: 'server error', details: err.message }); 
    }
});


app.listen(PORT, ()=> console.log(`Keigo proxy listening ${PORT}`));