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


function buildPolitePrompt(text) {
    return `あなたは日本のビジネスメール作成の専門家です。

        タスク: 以下の日本語テキストを丁寧語レベルのビジネスメールに変換してください。

        重要な判定基準:
        1. テキスト全体を文ごとに分析してください
        2. **一つでも**改善可能な文があれば、改善案を提供してください
        3. **全ての文**が既に適切な丁寧語レベルの場合のみ「already_polite」として返してください
        4. 部分的に適切でも、改善余地があれば提案を行ってください

        **丁寧語レベル (polite)**: 同僚、部下、馴染みの顧客向け - シンプルで親しみやすい
        - 基本原則: です/ます調のみを使用（過度な敬語は避ける）
        - 特徴: 自然で読みやすく、堅すぎない表現、親しみやすい
        - 避けるべき表現: いたします、させていただく、でございます、お〜いたします等の過度な敬語
        - 適用対象: 社内の同僚・部下、長期取引先など

        変換例:
        - おはよう → おはようございます
        - ありがとう → ありがとうございます  
        - 連絡します → 連絡します (そのまま)
        - 見て → 見てください
        - わかりました → わかりました (そのまま)

        出力は必ずJSONのみを返してください。

        **全文が完璧**な場合の形式:
        {
            "already_polite": true,
            "level": "polite",
            "message": "この文章は既に適切な丁寧語レベルです。",
            "original_text": "元のテキスト"
        }

        **一つでも改善可能**な場合の形式:
        {
            "already_polite": false,
            "suggested_text": "丁寧語レベルの推奨メール文",
            "level": "polite",
            "explanations": [
                {"original":"元の表現", "suggestion":"修正案", "reason":"丁寧語での修正理由"}
            ]
        }

        変換対象テキスト: """${text.replace(/"/g,'\\"')}"""`;
}

function buildHonorificPrompt(text) {
    return `あなたは日本のビジネスメール作成の専門家です。

        タスク: 以下の日本語テキストを尊敬語・謙譲語レベルのビジネスメールに変換してください。

        重要な判定基準:
        1. テキスト全体を文ごとに分析してください
        2. **一つでも**改善可能な文があれば、改善案を提供してください
        3. **全ての文**が既に適切な尊敬語・謙譲語レベルの場合のみ「already_polite」として返してください
        4. 部分的に適切でも、改善余地があれば提案を行ってください

        **尊敬語・謙譲語レベル (honorific)**: 上司、重要顧客、社外向け - 正式で丁寧
        - 基本原則: です/ます調 + 尊敬語・謙譲語の適切な使用
        - 特徴: より正式で丁寧、相手への敬意を示す表現
        - 積極使用: いたします、させていただく、でございます、お〜いたします等の丁寧な敬語
        - 尊敬語: 相手の行為を高める表現を使用
        - 謙譲語: 自分の行為を低める表現を使用
        - 適用対象: 上司、新規顧客、社外の重要な取引先など

        変換例:
        - おはよう → おはようございます。いつもお世話になっております
        - ありがとう → ありがとうございます。心より感謝申し上げます
        - 連絡します → ご連絡させていただきます
        - 見て → ご覧いただけますでしょうか
        - わかりました → かしこまりました

        出力は必ずJSONのみを返してください。

        **全文が完璧**な場合の形式:
        {
            "already_polite": true,
            "level": "honorific",
            "message": "この文章は既に適切な尊敬語・謙譲語レベルです。",
            "original_text": "元のテキスト"
        }

        **一つでも改善可能**な場合の形式:
        {
            "already_polite": false,
            "suggested_text": "尊敬語・謙譲語レベルの推奨メール文",
            "level": "honorific",
            "explanations": [
                {"original":"元の表現", "suggestion":"修正案", "reason":"尊敬語・謙譲語での修正理由"}
            ]
        }

        変換対象テキスト: """${text.replace(/"/g,'\\"')}"""`;
}

function buildPrompt(text, level) {
    if (level === 'polite') {
        return buildPolitePrompt(text);
    } else if (level === 'honorific') {
        return buildHonorificPrompt(text);
    } else {
        // Fallback to polite for unknown levels
        return buildPolitePrompt(text);
    }
}

app.post('/api/check-keigo', async (req,res)=>{
    console.log('API called with body:', req.body);
    
    const { text, level = 'polite' } = req.body || {};
    console.log('Extracted text:', text);
    console.log('Level:', level);
    
    if (!text) {
        console.log('No text provided');
        return res.status(400).json({ error: 'no text' });
    }
    
    try {
        console.log('Building prompt...');
        const prompt = buildPrompt(text, level);
        console.log('Prompt built:', prompt.substring(0, 100) + '...');
        
        console.log('Calling OpenAI API...');
        console.log('API Key exists:', !!OPENAI_KEY);
        console.log('API Key prefix:', OPENAI_KEY ? OPENAI_KEY.substring(0, 10) + '...' : 'NOT SET');
        
        // Try different models in order of preference (only active models)
        const models = [
            'gpt-4o-mini',
        ];
        let response = null;
        let lastError = null;
        
        for (const model of models) {
            try {
                console.log(`Trying model: ${model}`);
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
                
                console.log(`${model} Response status:`, r.status);
                
                if (r.status === 200) {
                    response = r;
                    console.log(`Success with model: ${model}`);
                    break;
                } else {
                    const errorData = await r.json();
                    console.log(`${model} failed:`, errorData);
                    
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
                console.log(`${model} network error:`, err.message);
                lastError = err;
            }
        }
        
        if (!response) {
            console.log('All OpenAI models failed, using fallback response');
            
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
                console.log('Sending fallback already-polite response:', alreadyPoliteResponse);
                return res.json(alreadyPoliteResponse);
            }
            
            // Fallback improvement suggestions
            let fallbackSuggestion = text;
            if (level === 'polite') {
                // polite level: basic です/ます + simple keigo
                fallbackSuggestion = text
                    .replace(/だ([。！？\s]|$)/g, "です$1")
                    .replace(/である([。！？\s]|$)/g, "です$1")
                    .replace(/おはよう/g, "おはようございます")
                    .replace(/ありがとう([。！？\s]|$)/g, "ありがとうございます$1")
                    + (text.match(/[。！？]$/) ? "" : "。よろしくお願いします。");
            } else {
                // honorific level: です/ます + 尊敬語・謙譲語
                fallbackSuggestion = text
                    .replace(/だ([。！？\s]|$)/g, "でございます$1")
                    .replace(/である([。！？\s]|$)/g, "でございます$1")
                    .replace(/おはよう/g, "おはようございます。いつもお世話になっております")
                    .replace(/ありがとう([。！？\s]|$)/g, "ありがとうございます。心より感謝申し上げます$1")
                    + (text.match(/[。！？]$/) ? "" : "。何卒よろしくお願いいたします。");
            }
            
            const fallbackResponse = {
                [level]: [
                    {
                        original: text,
                        suggestion: fallbackSuggestion,
                        reason: `OpenAI service unavailable - Applied basic ${level === 'polite' ? 'business politeness (丁寧語)' : 'formal business honorific (尊敬語・謙譲語)'}`
                    }
                ]
            };
            
            console.log('Sending fallback response:', fallbackResponse);
            return res.json(fallbackResponse);
        }
        
        const j = await response.json();
        console.log('OpenAI Response data:', JSON.stringify(j, null, 2));
        
        const assistantText = j.choices?.[0]?.message?.content || '';
        console.log('Assistant text:', assistantText);
        
        // try parse JSON
        let parsed = { suggested_text: assistantText, variants: {}, explanations: [] };
        try { 
            parsed = JSON.parse(assistantText);
            console.log('Successfully parsed JSON:', parsed);
            
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
                console.log('Sending already-polite response:', alreadyPoliteResponse);
                return res.json(alreadyPoliteResponse);
            }
            
            // Convert new single-level format
            if (parsed.suggested_text && !parsed.variants) {
                const singleLevelResponse = {
                    [level]: [
                        {
                            original: text,
                            suggestion: parsed.suggested_text,
                            reason: parsed.explanations?.[0]?.reason || `${level === 'polite' ? '丁寧語' : '尊敬語・謙譲語'}レベルの提案`
                        }
                    ]
                };
                console.log('Sending single level response:', singleLevelResponse);
                return res.json(singleLevelResponse);
            }
            
            // Convert old dual format to single level (backward compatibility)
            if (parsed.variants && (parsed.variants.polite || parsed.variants.honorific)) {
                const requestedSuggestion = parsed.variants[level] || parsed.suggested_text;
                const singleLevelResponse = {
                    [level]: [
                        {
                            original: text,
                            suggestion: requestedSuggestion,
                            reason: `${level === 'polite' ? '丁寧語' : '尊敬語・謙譲語'}レベルの提案`
                        }
                    ]
                };
                console.log('Sending converted single level response:', singleLevelResponse);
                return res.json(singleLevelResponse);
            }
            
        }
        catch (e) { 
            console.log('⚠️ Failed to parse JSON, using raw text:', e.message);
        }
        
        console.log('Sending response:', parsed);
        res.json(parsed);
    } catch(err) { 
        console.error('Server error:', err); 
        res.status(500).json({ error: 'server error', details: err.message }); 
    }
});


app.listen(PORT, ()=> console.log(`Keigo proxy listening ${PORT}`));