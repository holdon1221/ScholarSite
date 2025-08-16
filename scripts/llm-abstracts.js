#!/usr/bin/env node

/**
 * LLM Abstract Generator
 * 
 * This script enhances publication abstracts using various LLM services.
 * It can generate better abstracts and translate them to multiple languages.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const ConfigManager = require('./utils/config-manager');
const LLMServiceManager = require('./utils/llm-service-manager');
const PromptBuilder = require('./utils/prompt-builder');
const DataTransformer = require('./utils/data-transformer');
const ContentSanitizer = require('./utils/content-sanitizer');
const Logger = require('./utils/logger');

// Handle EPIPE errors to prevent crashes during processing
process.stdout.on('error', function(err) {
    if (err.code === 'EPIPE') {
        process.exit(0);
    }
});

process.stderr.on('error', function(err) {
    if (err.code === 'EPIPE') {
        process.exit(0);
    }
});

class LLMAbstractGenerator {
    constructor() {
        this.publicationsFile = path.join(__dirname, '..', 'data', 'publications.json');
        this.configManager = new ConfigManager();
        this.llmManager = new LLMServiceManager();
        
        // Load environment variables and configuration
        this.configManager.loadEnvironment();
        this.loadConfiguration();
    }

    loadEnvVariables() {
        return this.configManager.loadEnvironment();
    }

    loadConfiguration() {
        this.config = this.configManager.loadConfig();
        this.supportedLanguages = this.config.settings?.supportedLanguages || ['en'];
        if (this.supportedLanguages.length > 0) {
            Logger.info(`Loaded supported languages: ${this.supportedLanguages.join(', ')}`);
        } else {
            Logger.warning('Config file not found, using default language (en)');
            this.supportedLanguages = ['en'];
        }
    }

    loadConfig() {
        return this.configManager.loadConfig();
    }

    loadPublications() {
        return this.configManager.loadPublications();
    }


    articleAlreadyExists(newArticle, existingPublications) {
        return DataTransformer.publicationExists(newArticle, existingPublications);
    }

    filterNewArticlesOnly(extractedArticles) {
        // Load existing publications to compare against
        const existingPublications = this.loadPublications();
        const newArticles = [];

        console.log(`🔍 Checking ${extractedArticles.length} articles against existing ${existingPublications.length} publications...`);

        for (const article of extractedArticles) {
            if (this.articleAlreadyExists(article, existingPublications)) {
                console.log(`⏭️ Skipping existing: "${article.title.substring(0, 50)}..."`);
            } else {
                console.log(`✅ New article found: "${article.title.substring(0, 50)}..."`);
                newArticles.push(article);
            }
        }

        const skippedCount = extractedArticles.length - newArticles.length;
        if (skippedCount > 0) {
            console.log(`📊 Token optimization: Skipped ${skippedCount} existing articles, processing ${newArticles.length} new articles`);
        }

        return newArticles;
    }

    detectAvailableService() {
        return this.llmManager.detectAvailableServices();
    }

    async generateAbstractWithOpenAI(title, service, pdfContent = {}, currentAbstract = '') {
        const apiKey = process.env[service.envVar];
        if (!apiKey) {
            throw new Error(`API key not found for ${service.name}`);
        }

        // Use PDF content to build accurate prompt
        const prompt = PromptBuilder.buildAbstractEnhancementPrompt(title, pdfContent, currentAbstract);

        const requestData = JSON.stringify({
            model: service.model,
            messages: [
                {
                    role: "system",
                    content: PromptBuilder.buildSystemPrompt('abstract')
                },
                {
                    role: "user", 
                    content: prompt
                }
            ],
            max_tokens: 250,
            temperature: 0.7
        });

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.openai.com',
                port: 443,
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(requestData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.choices && response.choices[0]) {
                            resolve(response.choices[0].message.content.trim());
                        } else {
                            reject(new Error('Unexpected API response format'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            req.write(requestData);
            req.end();
        });
    }

    async generateAbstractWithGroq(title, service, pdfContent = {}, currentAbstract = '') {
        // Similar to OpenAI but with Groq endpoint
        return this.generateAbstractWithOpenAI(title, service, pdfContent, currentAbstract);
    }

    async generateAbstractWithAnthropic(title, service, pdfContent = {}, currentAbstract = '') {
        const apiKey = process.env[service.envVar];
        if (!apiKey) {
            throw new Error(`API key not found for ${service.name}`);
        }

        // Use PDF content to build accurate prompt
        const prompt = this.buildPromptFromExamples(title, pdfContent, currentAbstract);

        const serviceInfo = { service, apiKey };
        const response = await this.llmManager.makeRequest(serviceInfo, prompt, { maxTokens: 250, temperature: 0.3 });
        return ContentSanitizer.sanitizeAbstract(response);
    }

    async enhanceKoreanTranslation(koreanText, service) {
        const enhancePrompt = `You are a Korean academic writing specialist focused on perfecting research abstracts. Transform this text into polished academic Korean.

## SOURCE TEXT
${koreanText}

## ENHANCEMENT FRAMEWORK

### 🔧 **CRITICAL REPAIRS**
**Unicode Restoration:**
✅ Replace ALL � symbols with correct 한글 characters
✅ Restore incomplete syllables (missing 받침/중성/초성)
✅ Fix character encoding corruption

**Common Corruptions to Fix:**
• 조건��� → 조건을  
• 유지���는 → 유지하는
• 상급종합병원�� → 상급종합병원을
• 데이터를 ��용하여 → 데이터를 사용하여
• 종��-바이러스 → 종양-바이러스
• 백신효��은 → 백신효과는

### 📝 **STYLE STANDARDIZATION**
**Academic Register (반말 체계):**
✅ Consistent 반말 endings: ~했다, ~한다, ~이다, ~였다
✅ Formal declarative tone throughout
✅ Academic objectivity maintained

**Natural Expression Patterns:**
• "~의 목적은 …이다" → "~을/를 목적으로 했다"
• "이 연구는 …에 관한 것이다" → "이 연구는 …을 다뤘다"  
• "실행 가능한 지침" → "실용적인 지침"
• "남한" → "대한민국" or "한국"

### 🎯 **CONTENT REFINEMENT**
**Academic Terminology:**
✅ Use standard Korean academic vocabulary
✅ Prefer established scientific terms over loan words where appropriate
✅ Maintain technical precision in specialized terminology

**Flow Enhancement:**
✅ Natural Korean sentence structure
✅ Appropriate use of connectives (그러나, 또한, 따라서)
✅ Balanced formal academic rhythm

### ⚡ **PROCESSING PROTOCOL**
1. **Corruption Repair** → Fix all � symbols and encoding issues
2. **Content Cleaning** → Remove meta-text and introductory phrases  
3. **Style Unification** → Apply consistent 반말 register
4. **Expression Naturalization** → Replace translationese with Korean patterns
5. **Quality Verification** → Final academic polish

### 🚫 **STRICT PROHIBITIONS**
❌ No introductory phrases ("다음은...", "개선된 번역:", etc.)
❌ No modification of numerical values, percentages, or statistical data
❌ No alteration of technical terms requiring precision
❌ No addition of explanatory commentary
❌ No formatting or structural changes beyond language enhancement

## OUTPUT SPECIFICATION
Deliver ONLY the final, publication-ready Korean academic abstract.
- Absolutely DO NOT include any introductory phrases or labels (e.g., "다음은 한국어 초록입니다:", "초록:", "한국어 번역:", "다음 내용:").
- Output must start directly with the first sentence of the abstract body (no title, no introduction).
- Output must contain ONLY the abstract — no explanations, formatting notes, or comments.
- Do not wrap the text in quotes.
- Do not prepend any identifiers, titles, or metadata.`;

        const apiKey = process.env[service.envVar];
        
        try {
            const serviceInfo = { service, apiKey };
            
            if (service.endpoint.includes('anthropic')) {
                const response = await this.llmManager.makeRequest(serviceInfo, enhancePrompt, { maxTokens: 500, temperature: 0.2 });
                return ContentSanitizer.sanitizeAbstract(response);
            } else {
                let finalData = JSON.stringify({
                    model: service.model,
                    messages: [
                        { role: "system", content: "You are a Korean academic writing specialist focused on quality improvement." },
                        { role: "user", content: enhancePrompt }
                    ],
                    max_tokens: 250,
                    temperature: 0.2
                });
                
                const hostname = service.endpoint.includes('groq') ? 'api.groq.com' : 'api.openai.com';
                const path = service.endpoint.includes('groq') ? '/openai/v1/chat/completions' : '/v1/chat/completions';
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(finalData)
                };
                
                return new Promise((resolve, reject) => {
                    const options = { hostname, port: 443, path, method: 'POST', headers };

                    const req = https.request(options, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            try {
                                const response = JSON.parse(data);
                                if (response.choices && response.choices[0]) {
                                    resolve(response.choices[0].message.content.trim());
                                } else {
                                    reject(new Error('Korean enhancement failed'));
                                }
                            } catch (error) {
                                reject(error);
                            }
                        });
                    });

                    req.on('error', reject);
                    req.write(finalData);
                    req.end();
                });
            }
        } catch (error) {
            throw error;
        }
    }

    async enhanceFrenchTranslation(frenchText, service) {
        const enhancePrompt = `You are a French academic writing specialist focused on elevating research abstracts to journal publication standards. Perfect this text for French academic journals.

## SOURCE TEXT
${frenchText}

## ENHANCEMENT FRAMEWORK

### 🔧 **CRITICAL CORRECTIONS**
**Encoding & Structure:**
✅ Fix ALL corrupted characters (�) and broken syllables
✅ Remove introductory meta-text ("Voici la traduction...", "Traduction française :", "Voici ~ :"etc.)
✅ Normalize whitespace and punctuation consistency

### 📐 **FRENCH TYPOGRAPHY**
**Numerical Formatting (values unchanged):**
✅ Decimal localization: 3.14 → 3,14 (plain numbers only)
✅ Unit spacing: 50% → 50 %, 20kg → 20 kg (non-breaking spaces)
✅ Thousands separation: 1000 → 1 000 (thin non-breaking spaces)

**Protected Elements:**
❌ No changes to LaTeX/math ($...$), scientific notation (1.2e-3), URLs, DOIs, IDs

### 🎯 **ACADEMIC STYLE REFINEMENT**
**Register Enhancement:**
✅ Formal academic French throughout
✅ Impersonal/passive constructions: "Il a été observé que...", "Cette étude démontre..."
✅ Academic nominalizations: "L'analyse a révélé...", "Une comparaison indique..."

**Linguistic Precision:**
• Replace calques: "Ce papier" → "Cet article/Cette étude"
• Use standard terminology: intervalle de confiance, rapport de cotes, essai randomisé
• Deploy logical connectors: Ainsi, Cependant, En revanche, Par conséquent, En effet
• Maintain technical accuracy in specialized vocabulary

### ⚡ **QUALITY PROTOCOL**
1. **Corruption Repair** → Fix encoding issues and remove meta-text
2. **Typography Application** → Apply French numerical conventions
3. **Style Elevation** → Enhance academic register and flow  
4. **Terminology Standardization** → Ensure proper scientific vocabulary
5. **Final Polish** → Review for publication readiness

### 🚫 **PRESERVATION MANDATES**
❌ Numerical values must remain mathematically identical
❌ No meaning alteration, addition, or reinterpretation
❌ No structural reordering unless critically broken
❌ No modification of technical identifiers, citations, or formulas
❌ No explanatory commentary or formatting additions

## OUTPUT SPECIFICATION
Deliver ONLY the final, publication-ready French academic abstract.
- ABSOLUTELY NO introductory phrases or labels (e.g., "Voici le résumé...", "Résumé :", "Traduction :", "Texte :", "En résumé").
- The output MUST start immediately with the first sentence of the abstract (no title, no preamble).
- Output must contain ONLY the abstract text itself — no explanations, no formatting notes, no commentary.
- Do NOT add quotation marks around the entire text.
- Do NOT prefix with any identifiers, headings, or meta-text.`;

        const apiKey = process.env[service.envVar];
        let finalData;
        
        if (service.endpoint.includes('anthropic')) {
            finalData = JSON.stringify({
                model: service.model,
                max_tokens: 500,
                messages: [{ role: "user", content: enhancePrompt }]
            });
        } else {
            finalData = JSON.stringify({
                model: service.model,
                messages: [
                    { role: "system", content: "You are a French academic writing specialist focused on cleaning translations." },
                    { role: "user", content: enhancePrompt }
                ],
                max_tokens: 250,
                temperature: 0.2
            });
        }

        try {
            const serviceInfo = { service, apiKey };
            
            if (service.endpoint.includes('anthropic')) {
                const response = await this.llmManager.makeRequest(serviceInfo, enhancePrompt, { maxTokens: 500, temperature: 0.2 });
                return ContentSanitizer.sanitizeAbstract(response);
            } else {
                const hostname = service.endpoint.includes('groq') ? 'api.groq.com' : 'api.openai.com';
                const path = service.endpoint.includes('groq') ? '/openai/v1/chat/completions' : '/v1/chat/completions';
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(finalData)
                };
                
                return new Promise((resolve, reject) => {
                    const options = { hostname, port: 443, path, method: 'POST', headers };

                    const req = https.request(options, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            try {
                                const response = JSON.parse(data);
                                if (response.choices && response.choices[0]) {
                                    resolve(response.choices[0].message.content.trim());
                                } else {
                                    reject(new Error('French enhancement failed'));
                                }
                            } catch (error) {
                                reject(error);
                            }
                        });
                    });

                    req.on('error', reject);
                    req.write(finalData);
                    req.end();
                });
            }
        } catch (error) {
            throw error;
        }
    }

    async enhanceJapaneseTranslation(japaneseText, service) {
        const enhancePrompt = `You are a Japanese academic writing specialist focused on perfecting research abstracts for Japanese scholarly publications. Transform this text into polished academic Japanese.

## SOURCE TEXT
${japaneseText}

## ENHANCEMENT FRAMEWORK

### 🔧 **CRITICAL CORRECTIONS**
**Text Restoration:**
✅ Fix ALL corrupted characters (�) and encoding issues
✅ Remove introductory meta-text ("以下は学術的な...", "日本語翻訳：", etc.)
✅ Normalize Japanese punctuation and spacing consistency

**Common Corruptions to Fix:**
• 研究�� → 研究を
• ��析した → 解析した  
• データ�� → データは
• 結果��示す → 結果を示す
• 統計��解析 → 統計的解析
• 感染��率 → 感染率

### 📝 **ACADEMIC STYLE (である調)**
**Register Consistency:**
✅ Formal academic Japanese throughout (である調)
✅ Appropriate noun-ending (名詞止め) placement—primarily at abstract/section conclusions
✅ Professional scholarly tone maintained

**Natural Expression Patterns:**
• Replace literal translations with authentic academic phrasing:
  - "〜ことを明らかにした" (clarified that...)
  - "〜が示唆された" (suggested that...)
  - "〜を目的とした研究である" (research aimed at...)
  - "〜に関して検討した" (examined regarding...)

### 🎯 **LINGUISTIC REFINEMENT**
**Character Balance:**
✅ Technical terms in kanji where conventional
✅ Common verbs in kana for readability
✅ Appropriate katakana for scientific loanwords (モデル, アルゴリズム, データ, シミュレーション)

**Flow Enhancement:**
✅ Logical connectors: しかしながら、さらに、その結果、したがって、一方
✅ Smooth transitions between concepts
✅ Natural academic rhythm and coherence

### ⚡ **PROCESSING SEQUENCE**
1. **Corruption Repair** → Fix encoding issues and remove meta-text
2. **Style Unification** → Apply consistent である調 register
3. **Expression Naturalization** → Replace awkward literal translations
4. **Technical Terminology** → Standardize scientific vocabulary
5. **Flow Optimization** → Perfect sentence connections and rhythm

### 🚫 **PRESERVATION REQUIREMENTS**
❌ No alteration of numerical values, percentages, or statistical data
❌ No modification of mathematical symbols, Greek letters, chemical formulas
❌ No changes to variable names, dataset names, or technical identifiers
❌ No structural reordering unless critically necessary
❌ No addition of explanatory content or commentary

## OUTPUT SPECIFICATION
Deliver ONLY the final, publication-ready Japanese academic abstract.
- Absolutely DO NOT include any introductory phrases or labels (e.g., "以下は日本語の要約です：", "要約：", "日本語翻訳：", "次の内容：").
- Output must start directly with the first sentence of the abstract body (no title, no introduction).
- Output must contain ONLY the abstract — no explanations, formatting notes, or comments.
- Do not wrap the text in quotes.
- Do not prepend any identifiers, titles, or metadata.`;

        return this.makeEnhancementRequest(japaneseText, enhancePrompt, service, 'Japanese');
    }

    async enhanceSpanishTranslation(spanishText, service) {
        const enhancePrompt = `You are a Spanish academic writing specialist focused on perfecting research abstracts for Spanish-language scholarly publications. Transform this text into polished academic Spanish.

## SOURCE TEXT
${spanishText}

## ENHANCEMENT FRAMEWORK

### 🔧 **CRITICAL CORRECTIONS**
**Text Restoration:**
✅ Fix ALL corrupted characters (�) and encoding issues
✅ Remove introductory meta-text ("A continuación se presenta...", "Traducción al español:", etc.)
✅ Normalize Spanish punctuation and spacing consistency

### 🎯 **ACADEMIC STYLE REFINEMENT**
**Register Enhancement:**
✅ Formal academic Spanish throughout
✅ Impersonal/passive constructions: "se observó que...", "este estudio demuestra que..."
✅ Professional scholarly tone maintained

**Linguistic Precision:**
• Apply RAE standards for tildes, diacritical marks, and punctuation
• Use logical connectors: sin embargo, por lo tanto, además, en consecuencia, por consiguiente
• Deploy standard Spanish scientific terminology for the relevant field
• Replace literal translations with natural academic phrasing

**Natural Expression Patterns:**
• "Este trabajo se centra en..." → "Este estudio se enfoca en..."
• "Los resultados muestran que..." → "Los hallazgos revelan que..."
• "Se puede concluir que..." → "Se concluye que..."
• "Es importante señalar que..." → "Cabe destacar que..."

### ⚡ **PROCESSING SEQUENCE**
1. **Corruption Repair** → Fix encoding issues and remove meta-text
2. **Style Elevation** → Apply formal academic register
3. **Linguistic Standardization** → Ensure RAE compliance and natural flow
4. **Terminology Precision** → Use proper Spanish scientific vocabulary
5. **Final Polish** → Perfect academic coherence and readability

### 🚫 **PRESERVATION REQUIREMENTS**
❌ No alteration of numerical values, percentages, or statistical data
❌ No modification of mathematical symbols, Greek letters, chemical formulas
❌ No changes to variable names, dataset names, or technical identifiers
❌ No structural reordering unless critically necessary
❌ No addition of explanatory content or commentary

## OUTPUT SPECIFICATION
Deliver ONLY the final, publication-ready Spanish academic abstract.
- ABSOLUTELY NO introductory phrases or labels (e.g., "A continuación se presenta...", "Resumen:", "Traducción al español:", "Texto:", "En resumen").
- The output MUST start immediately with the first sentence of the abstract (no title, no preamble).
- Output must contain ONLY the abstract text itself — no explanations, no formatting notes, no commentary.
- Do NOT add quotation marks around the entire text.
- Do NOT prefix with any identifiers, headings, or meta-text.`;

        return this.makeEnhancementRequest(spanishText, enhancePrompt, service, 'Spanish');
    }

    async enhanceGermanTranslation(germanText, service) {
        const enhancePrompt = `You are a German academic writing specialist focused on perfecting research abstracts for German-language scholarly publications. Transform this text into polished academic German.

## SOURCE TEXT
${germanText}

## ENHANCEMENT FRAMEWORK

### 🔧 **CRITICAL CORRECTIONS**
**Text Restoration:**
✅ Fix ALL corrupted characters (�) and encoding issues
✅ Remove introductory meta-text ("Hier ist die deutsche Übersetzung...", "Deutsche Übersetzung:", etc.)
✅ Normalize German punctuation, umlauts (ä, ö, ü), and ß consistency

### 🎯 **ACADEMIC STYLE REFINEMENT**
**Register Enhancement:**
✅ Formal German academic style throughout
✅ Nominal style (Nominalstil) and passive voice (Passiv) where appropriate
✅ Professional scholarly tone maintained

**Linguistic Precision:**
• Form compound words (Komposita) naturally for technical concepts
• Use logical connectors: jedoch, darüber hinaus, daher, folglich, infolgedessen
• Deploy standard German scientific terminology for the relevant field
• Replace literal translations with natural academic phrasing

**Natural Expression Patterns:**
• "Diese Studie untersucht..." → "Diese Untersuchung befasst sich mit..."
• "Die Ergebnisse zeigen, dass..." → "Die Befunde belegen, dass..."
• "Es kann geschlossen werden..." → "Daraus lässt sich schließen..."
• "Die Analyse ergab..." → "Die Analyse erbrachte..."

### ⚡ **PROCESSING SEQUENCE**
1. **Corruption Repair** → Fix encoding issues and remove meta-text
2. **Style Elevation** → Apply formal academic register with Nominalstil
3. **Linguistic Standardization** → Ensure proper German grammar and flow
4. **Terminology Precision** → Use proper German scientific vocabulary
5. **Final Polish** → Perfect academic coherence and compound word formation

### 🚫 **PRESERVATION REQUIREMENTS**
❌ No alteration of numerical values, percentages, or statistical data
❌ No modification of mathematical symbols, Greek letters, chemical formulas
❌ No changes to variable names, dataset names, or technical identifiers
❌ No structural reordering unless critically necessary
❌ No addition of explanatory content or commentary

## OUTPUT SPECIFICATION
Deliver ONLY the final, publication-ready German academic abstract.
- ABSOLUTELY NO introductory phrases or labels (e.g., "Im Folgenden wird präsentiert...", "Zusammenfassung:", "Übersetzung ins Deutsche:", "Text:", "Kurz gesagt").
- The output MUST start immediately with the first sentence of the abstract (no title, no preamble).
- Output must contain ONLY the abstract text itself — no explanations, no formatting notes, no commentary.
- Do NOT add quotation marks around the entire text.
- Do NOT prefix with any identifiers, headings, or meta-text.`;

        return this.makeEnhancementRequest(germanText, enhancePrompt, service, 'German');
    }

    async enhanceChineseTranslation(chineseText, service) {
        const enhancePrompt = `You are a Chinese academic writing specialist focused on perfecting research abstracts for Chinese-language scholarly publications. Transform this text into polished academic Chinese (简体中文).

## SOURCE TEXT
${chineseText}

## ENHANCEMENT FRAMEWORK

### 🔧 **CRITICAL CORRECTIONS**
**Text Restoration:**
✅ Fix ALL corrupted characters (�) and encoding issues
✅ Remove introductory meta-text ("以下是学术摘要的中文翻译", "中文翻译：", etc.)
✅ Normalize Chinese punctuation（，。；：——（））and spacing consistency

**Common Corruptions to Fix:**
• 研究��果 → 研究结果
• ��据分析 → 数据分析
• 方法��用 → 方法应用
• 病��传播 → 病毒传播
• 模型��拟 → 模型模拟
• 流��病学 → 流行病学

### 🎯 **ACADEMIC STYLE REFINEMENT**
**Register Enhancement:**
✅ Formal academic Chinese (简体中文) throughout
✅ Third-person/impersonal constructions (avoid 我们/我)
✅ Professional scholarly tone maintained

**Linguistic Precision:**
• Use logical connectors: 然而、此外、因此、从而、总体而言、据此
• Apply standard academic phrasing: 本研究...、结果表明...、与...相比...、提示...
• Standardize technical terminology to Mainland Chinese usage
• Replace literal translations with natural academic expressions

**Natural Expression Patterns:**
• "这项研究..." → "本研究..."
• "结果显示..." → "结果表明..."
• "可以得出结论..." → "由此可见..."
• "具有重要意义" → "具有重要的理论与实践意义"

**Technical Terminology Standards:**
• confidence interval → 置信区间
• odds ratio → 比值比（OR）
• randomized controlled trial → 随机对照试验（RCT）
• model fitting → 模型拟合
• parameter estimation → 参数估计

### ⚡ **PROCESSING SEQUENCE**
1. **Corruption Repair** → Fix encoding issues and remove meta-text
2. **Style Elevation** → Apply formal academic register
3. **Linguistic Standardization** → Ensure proper Chinese grammar and flow
4. **Terminology Precision** → Use standard Chinese scientific vocabulary
5. **Final Polish** → Perfect academic coherence and reduce redundancy

### 🚫 **PRESERVATION REQUIREMENTS**
❌ No alteration of numerical values, percentages, or statistical data
❌ No modification of mathematical symbols, Greek letters, chemical formulas
❌ No changes to variable names, dataset names, or technical identifiers
❌ No structural reordering unless critically necessary
❌ No addition of explanatory content or commentary
❌ No first-person usage (我们/我)

## OUTPUT SPECIFICATION
Deliver ONLY the final, publication-ready Chinese academic abstract.
- Absolutely DO NOT include any introductory phrases or labels (e.g., "以下是中文摘要：", "摘要：", "翻译成中文：", "内容如下").
- Output must start directly with the first sentence of the abstract body (no title, no introduction).
- Output must contain ONLY the abstract — no explanations, formatting notes, or comments.
- Do not wrap the text in quotes.
- Do not prepend any identifiers, titles, or metadata.`;

        return this.makeEnhancementRequest(chineseText, enhancePrompt, service, 'Chinese');
    }

    async fixKJCCorruption(corruptedText, targetLang, service) {
        const langSpecs = {
            ko: {
                name: 'Korean',
                script: '한글',
                examples: [
                    '조건��� → 조건을',
                    '유지���는 → 유지하는',
                    '상급종합병원�� → 상급종합병원을',
                    '데이터를 ��용하여 → 데이터를 사용하여',
                    '종��-바이러스 → 종양-바이러스',
                    '백신효��은 → 백신효과는'
                ],
                patterns: '조사(을/를/이/가/에/의), 어미(-다/-는/-한/-된), 받침(ㄴ/ㄹ/ㅁ/ㅇ)'
            },
            ja: {
                name: 'Japanese',
                script: 'ひらがな・カタカナ・漢字',
                examples: [
                    '研究�� → 研究を',
                    '��析した → 解析した',
                    'データ�� → データは',
                    '結果��示す → 結果を示す',
                    '統計��解析 → 統計的解析',
                    '感染��率 → 感染率'
                ],
                patterns: '助詞(を/は/が/に/の/へ/で/と/や), 形容動詞語尾(的/的な/的に), 動詞語尾(する/した/して/される/され), 接続助詞(ので/から/が)'
            },
            zh: {
                name: 'Chinese',
                script: '简体中文',
                examples: [
                    '研究��果 → 研究结果',
                    '��据分析 → 数据分析',
                    '方法��用 → 方法应用',
                    '病��传播 → 病毒传播',
                    '模型��拟 → 模型模拟',
                    '流��病学 → 流行病学'
                ],
                patterns: '常用虚词(的/了/在/和/与/对/于/从/而/并且), 常用动词(使用/分析/研究/应用/提出), 常用量词(个/种/次/年/例)'
            }
        };

        const spec = langSpecs[targetLang];
        if (!spec) {
            throw new Error(`Unsupported language for corruption fixing: ${targetLang}`);
        }

        const fixPrompt = `You are a ${spec.name} text restoration specialist. Your task is to repair Unicode corruption in academic text.

## CORRUPTED TEXT
${corruptedText}

## CORRUPTION ANALYSIS
**Target Language:** ${spec.name} (${spec.script})

**Common Corruption Patterns:**
${spec.examples.map(ex => `• ${ex}`).join('\n')}

**Character Recovery Focus:** ${spec.patterns}

## RESTORATION PROTOCOL

🎯 **OBJECTIVE:** Replace ALL � symbols with correct ${spec.name} characters

🔍 **ANALYSIS METHOD:**
1. **Context Analysis** - Examine surrounding characters for linguistic clues
2. **Pattern Recognition** - Identify incomplete words/phrases using ${spec.patterns}
3. **Semantic Restoration** - Reconstruct meaning-preserving character sequences
4. **Academic Register** - Maintain formal academic terminology consistency

⚡ **PRECISION REQUIREMENTS:**
✅ Replace every � symbol with appropriate ${spec.script} characters
✅ Preserve original word boundaries and spacing
✅ Maintain academic terminology accuracy
✅ Ensure grammatical completeness
✅ Keep non-corrupted text exactly unchanged

❌ **PROHIBITED ACTIONS:**
- Changing uncorrupted characters
- Altering numeric values or punctuation
- Adding explanatory text or commentary
- Modifying sentence structure beyond corruption repair

## OUTPUT SPECIFICATION
Return ONLY the fully repaired ${spec.name} text with all � symbols correctly replaced. No formatting, labels, or explanations.`;

        return this.makeEnhancementRequest(corruptedText, fixPrompt, service, `${spec.name} Corruption Fix`);
    }

    async makeEnhancementRequest(text, enhancePrompt, service, languageName) {
        const apiKey = process.env[service.envVar];
        
        try {
            const serviceInfo = { service, apiKey };
            
            if (service.endpoint.includes('anthropic')) {
                const response = await this.llmManager.makeRequest(serviceInfo, enhancePrompt, { maxTokens: 500, temperature: 0.2 });
                return ContentSanitizer.sanitizeAbstract(response);
            } else {
                let finalData = JSON.stringify({
                    model: service.model,
                    messages: [
                        { role: "system", content: `You are a ${languageName} academic writing specialist focused on cleaning translations.` },
                        { role: "user", content: enhancePrompt }
                    ],
                    max_tokens: 250,
                    temperature: 0.2
                });
                
                const hostname = service.endpoint.includes('groq') ? 'api.groq.com' : 'api.openai.com';
                const path = service.endpoint.includes('groq') ? '/openai/v1/chat/completions' : '/v1/chat/completions';
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(finalData)
                };
                
                return new Promise((resolve, reject) => {
                    const options = { hostname, port: 443, path, method: 'POST', headers };

                    const req = https.request(options, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            try {
                                const response = JSON.parse(data);
                                if (response.choices && response.choices[0]) {
                                    resolve(response.choices[0].message.content.trim());
                                } else {
                                    reject(new Error(`${languageName} enhancement failed`));
                                }
                            } catch (error) {
                                reject(error);
                            }
                        });
                    });

                    req.on('error', reject);
                    req.write(finalData);
                    req.end();
                });
            }
        } catch (error) {
            throw error;
        }
    }

    cleanTranslationMetaText(text) {
        // Remove common meta-text patterns in multiple languages
        const metaPatterns = [
            // French
            /^Voici\s+(l['']?abstract\s+amélioré\s+en\s+français\s+académique|le\s+résumé\s+optimisé\s+pour\s+les\s+normes\s+des\s+revues\s+académiques\s+françaises?)\s*:?\s*/i,
            /^Voici\s+la\s+version\s+améliorée\s+du\s+résumé\s+pour\s+les\s+normes\s+de\s+publication\s+dans\s+les\s+revues\s+académiques\s+françaises\s*:?\s*/i,
            // Spanish
            /^(Aquí\s+se\s+presenta\s+la\s+traducción\s+académica\s+al\s+español|He\s+aquí\s+la\s+traducción\s+al\s+español\s+académico|A\s+continuación\s+se\s+presenta\s+el\s+texto\s+académico\s+en\s+español)\s*:?\s*/i,
            /^(Aquí\s+se\s+presenta\s+la\s+versión\s+en\s+español\s+académico\s+del\s+resumen|Resumen)\s*:?\s*/i,
            // German
            /^(Dies\s+ist\s+die\s+überarbeitete\s+deutsche\s+akademische\s+Fassung\s+des\s+Textes?|Hier\s+ist\s+die\s+Übersetzung\s+in\s+präzises\s+akademisches\s+Deutsch|Hier\s+die\s+überarbeitete\s+deutsche\s+akademische\s+Fassung\s+des\s+gegebenen\s+Abstracts?)\s*:?\s*/i,
            // Chinese
            /^以下是.*?中文翻译\s*[:：]?\s*/i,
            /^中文翻译\s*[:：]?\s*/i,
            // Generic patterns
            /^(Abstract|Summary|Translation|Résumé|Traducción|Übersetzung|摘要|要約)\s*[:：]?\s*/i,
            /^Here\s+(is|are)\s+the\s+.+?translation\s*:?\s*/i,
            /^The\s+following\s+is\s+the\s+.+?translation\s*:?\s*/i
        ];

        let cleanedText = text;
        
        // Apply all meta-text removal patterns
        for (const pattern of metaPatterns) {
            cleanedText = cleanedText.replace(pattern, '');
        }
        
        // Clean up any leading/trailing whitespace
        cleanedText = cleanedText.trim();
        
        return cleanedText;
    }

    async translateAbstract(abstract, targetLang, service) {
        const langNames = {
            ko: 'Korean',
            fr: 'French', 
            en: 'English',
            ja: 'Japanese',
            es: 'Spanish',
            de: 'German',
            zh: 'Chinese'
        };

        if (targetLang === 'en') {
            return abstract; // Already in English
        }

        const koPrompt = `You are a professional Korean academic translator specializing in research publications. Transform this English abstract into natural, scholarly Korean.

## ENGLISH SOURCE
${abstract}

## TRANSLATION EXCELLENCE FRAMEWORK

### 🎯 **TRANSLATION OBJECTIVE**
Produce publication-ready Korean that reads naturally to Korean academics while maintaining complete semantic fidelity to the English source.

### 📝 **KOREAN ACADEMIC STYLE**
**Register Requirements:**
✅ Scholarly 반말 style: ~했다, ~한다, ~이다, ~였다 (formal declarative)
✅ Academic objectivity and precision
✅ Natural Korean academic flow and rhythm

**Linguistic Standards:**
✅ Appropriate 한자어 usage for technical concepts
✅ Natural Korean sentence structure and word order
✅ Elegant academic expressions suitable for Korean journals

### 🔧 **PRECISION REQUIREMENTS**
**Exact Preservation:**
✅ All numerical values, percentages, and statistical data
✅ Technical terminology requiring domain expertise
✅ Mathematical symbols, Greek letters, chemical formulas
✅ Variable names, dataset names, and technical identifiers
✅ LaTeX/math expressions ($...$) and equations

**Acronym Protocol:**
• Full term present → Translate term + keep acronym: "세계보건기구(WHO)"
• Acronym only → Keep as-is: "DNA", "COVID-19"

### ⚡ **TRANSLATION PROTOCOL**
1. **Semantic Analysis** → Understand complete meaning and context
2. **Korean Structuring** → Arrange content in natural Korean flow
3. **Terminology Selection** → Choose appropriate Korean academic terms
4. **Style Application** → Apply consistent scholarly 반말 register
5. **Precision Verification** → Ensure complete semantic equivalence

### 🚫 **STRICT PROHIBITIONS**
❌ Introductory meta-text ("다음은 번역입니다", "Korean translation:", etc.)
❌ Numerical value alterations or localizations
❌ Technical term modifications without domain expertise
❌ Content additions, omissions, or reinterpretations
❌ Explanatory commentary or formatting additions

## OUTPUT SPECIFICATION
Deliver clean Korean academic text that would be publication-ready for Korean scholarly journals. Natural, precise, and linguistically elegant Korean only.`;

        const frPrompt = `You are a professional French academic translator with expertise in scholarly publications for French research institutions. Transform this English abstract into elegant, publication-ready French.

## ENGLISH SOURCE
${abstract}

## FRENCH ACADEMIC TRANSLATION FRAMEWORK

### 🎯 **TRANSLATION OBJECTIVE**
Produce sophisticated French academic prose that maintains complete fidelity to the English source while embodying the elegance and precision expected in French scholarly publications.

### 📝 **FRENCH ACADEMIC STYLE**
**Register Requirements:**
✅ Formal academic French suitable for peer-reviewed journals
✅ Impersonal constructions and passive voice where natural
✅ Logical flow with appropriate connecteurs (cependant, néanmoins, par conséquent)

**Linguistic Excellence:**
✅ Sophisticated vocabulary befitting French academic tradition
✅ Proper French scientific and technical terminology
✅ Natural French syntax avoiding anglicisms

### 🔧 **PRECISION REQUIREMENTS**
**Exact Preservation:**
✅ All numerical values without localization (keep decimal points as-is)
✅ Technical terminology and specialized vocabulary
✅ Mathematical symbols, Greek letters, chemical formulas
✅ Variable names, dataset names, and technical identifiers
✅ LaTeX/math expressions ($...$) and equations

**Acronym Protocol:**
• Full term present → Translate term + keep acronym: "Organisation mondiale de la santé (OMS)"
• Acronym only → Keep as-is: "ADN", "COVID-19"

### ⚡ **TRANSLATION PROTOCOL**
1. **Semantic Analysis** → Comprehend complete meaning and technical context
2. **French Structuring** → Organize content following French academic conventions
3. **Terminology Selection** → Choose precise French scientific vocabulary
4. **Style Application** → Apply elegant formal academic register
5. **Quality Verification** → Ensure semantic equivalence and linguistic refinement

### 🚫 **STRICT PROHIBITIONS**
❌ Introductory meta-text ("Voici la traduction...", "Traduction française:", etc.)
❌ Numerical localization or value modifications
❌ Technical term alterations without domain expertise
❌ Content additions, omissions, or interpretations
❌ Explanatory commentary or formatting additions

## OUTPUT SPECIFICATION
Deliver refined French academic text suitable for publication in prestigious French journals. Linguistically sophisticated, semantically faithful, and academically elegant French only.`;

        const jaPrompt = `You are a professional Japanese academic translator specializing in scholarly publications for Japanese research institutions. Transform this English abstract into sophisticated, publication-ready Japanese.

## ENGLISH SOURCE

<source_text>
${abstract}
</source_text>

## JAPANESE ACADEMIC TRANSLATION FRAMEWORK

### 🎯 **TRANSLATION OBJECTIVE**
Produce refined Japanese academic prose (である調) that maintains complete semantic fidelity while embodying the precision and elegance expected in Japanese scholarly publications.

### 📝 **JAPANESE ACADEMIC STYLE**
**Register Requirements:**
✅ Formal academic Japanese (である調) throughout
✅ Scholarly objectivity and measured tone
✅ Natural Japanese academic flow and rhythm

**Character Balance Excellence:**
✅ Technical terms in kanji where conventional (研究, 解析, 模型)
✅ Common verbs in kana for readability (した, している, である)
✅ Scientific loanwords in katakana (モデル, アルゴリズム, データ, シミュレーション)

**Linguistic Sophistication:**
✅ Appropriate connectors: しかしながら、さらに、その結果、したがって、一方
✅ Natural noun-ending (名詞止め) placement—primarily at abstract conclusions
✅ Elegant Japanese academic expression patterns (本研究では〜を行った, 〜ことを明らかにした)

### 🔧 **PRECISION REQUIREMENTS**
**Exact Preservation:**
✅ All numerical values, percentages, and statistical data
✅ Technical terminology and specialized vocabulary
✅ Mathematical symbols, Greek letters, chemical formulas
✅ Variable names, dataset names, and technical identifiers
✅ LaTeX/math expressions ($...$) and equations

**Acronym Protocol:**
• Full term present → Translate term + keep acronym: "世界保健機関(WHO)"
• Acronym only → Keep as-is: "DNA", "COVID-19"

### ⚡ **TRANSLATION PROTOCOL**
1. **Semantic Analysis** → Understand complete meaning and research context
2. **Japanese Structuring** → Organize content following Japanese academic conventions
3. **Character Selection** → Optimize kanji/kana/katakana balance for readability
4. **Style Application** → Apply consistent である調 register
5. **Flow Refinement** → Ensure natural Japanese academic rhythm

### 🚫 **STRICT PROHIBITIONS**
❌ Introductory meta-text ("以下は翻訳...", "日本語版:", etc.)
❌ Numerical value alterations or localizations
❌ Technical term modifications without domain expertise
❌ Content additions, omissions, or interpretations
❌ Explanatory commentary or formatting additions

<output>
</output>
`;

        const esPrompt = `You are a professional Spanish academic translator with expertise in scholarly publications for Spanish research institutions. Transform this English abstract into elegant, publication-ready Spanish.

## ENGLISH SOURCE
${abstract}

## SPANISH ACADEMIC TRANSLATION FRAMEWORK

### 🎯 **TRANSLATION OBJECTIVE**
Produce sophisticated Spanish academic prose that maintains complete fidelity to the English source while embodying the precision and elegance expected in Spanish scholarly publications.

### 📝 **SPANISH ACADEMIC STYLE**
**Register Requirements:**
✅ Formal academic Spanish suitable for peer-reviewed journals
✅ Impersonal constructions and passive voice where natural
✅ Logical flow with appropriate connecteurs (sin embargo, por lo tanto, además)

**Linguistic Excellence:**
✅ Sophisticated vocabulary befitting Spanish academic tradition
✅ Proper Spanish scientific and technical terminology
✅ Natural Spanish syntax avoiding anglicisms
✅ Academic expressions: "Se observó que...", "Los resultados demuestran..."

### 🔧 **PRECISION REQUIREMENTS**
**Exact Preservation:**
✅ All numerical values without localization (keep decimal points as-is)
✅ Technical terminology and specialized vocabulary
✅ Mathematical symbols, Greek letters, chemical formulas
✅ Variable names, dataset names, and technical identifiers
✅ LaTeX/math expressions ($...$) and equations

**Acronym Protocol:**
• Full term present → Translate term + keep acronym: "Organización Mundial de la Salud (OMS)"
• Acronym only → Keep as-is: "ADN", "COVID-19"

### ⚡ **TRANSLATION PROTOCOL**
1. **Semantic Analysis** → Comprehend complete meaning and technical context
2. **Spanish Structuring** → Organize content following Spanish academic conventions
3. **Terminology Selection** → Choose precise Spanish scientific vocabulary
4. **Style Application** → Apply elegant formal academic register
5. **Quality Verification** → Ensure semantic equivalence and linguistic refinement

### 🚫 **STRICT PROHIBITIONS**
❌ Introductory meta-text ("A continuación se presenta...", "Traducción al español:", etc.)
❌ Numerical localization or value modifications
❌ Technical term alterations without domain expertise
❌ Content additions, omissions, or interpretations
❌ Explanatory commentary or formatting additions

## OUTPUT SPECIFICATION
Deliver refined Spanish academic text suitable for publication in prestigious Spanish journals. Linguistically sophisticated, semantically faithful, and academically elegant Spanish only.`;

        const dePrompt = `You are a professional German academic translator with expertise in scholarly publications for German research institutions. Transform this English abstract into sophisticated, publication-ready German.

## ENGLISH SOURCE
${abstract}

## GERMAN ACADEMIC TRANSLATION FRAMEWORK

### 🎯 **TRANSLATION OBJECTIVE**
Produce refined German academic prose (Wissenschaftsdeutsch) that maintains complete semantic fidelity while embodying the precision and scholarly rigor expected in German academic publications.

### 📝 **GERMAN ACADEMIC STYLE**
**Register Requirements:**
✅ Formal German academic style (Wissenschaftssprache)
✅ Nominal style (Nominalstil) and passive voice where appropriate
✅ Scholarly objectivity and measured tone

**Linguistic Excellence:**
✅ Natural German compound words (Komposita) for technical concepts
✅ Appropriate German academic connectors: jedoch, darüber hinaus, daher, folglich
✅ Characteristic German academic constructions
✅ Academic expressions: "Die Untersuchung zeigt...", "Es wurde festgestellt..."

### 🔧 **PRECISION REQUIREMENTS**
**Exact Preservation:**
✅ All numerical values, percentages, and statistical data
✅ Technical terminology and specialized vocabulary
✅ Mathematical symbols, Greek letters, chemical formulas
✅ Variable names, dataset names, and technical identifiers
✅ LaTeX/math expressions ($...$) and equations
✅ Proper German capitalization rules

**Acronym Protocol:**
• Full term present → Translate term + keep acronym: "Weltgesundheitsorganisation (WHO)"
• Acronym only → Keep as-is: "DNA", "COVID-19"

### ⚡ **TRANSLATION PROTOCOL**
1. **Semantic Analysis** → Understand complete meaning and research context
2. **German Structuring** → Organize content following German academic conventions
3. **Compound Formation** → Create natural Komposita for technical concepts
4. **Style Application** → Apply consistent Wissenschaftsdeutsch register
5. **Quality Refinement** → Ensure natural German academic flow

### 🚫 **STRICT PROHIBITIONS**
❌ Introductory meta-text ("Hier ist die deutsche Übersetzung...", "Deutsche Übersetzung:", etc.)
❌ Numerical value alterations or localizations
❌ Technical term modifications without domain expertise
❌ Content additions, omissions, or interpretations
❌ Explanatory commentary or formatting additions

## OUTPUT SPECIFICATION
Deliver publication-ready German academic text with refined style and proper linguistic standards. Scholarly, precise, and linguistically sophisticated German only.`;

        const zhPrompt = `You are a professional Chinese academic translator with expertise in scholarly publications for Chinese research institutions. Transform this English abstract into sophisticated, publication-ready Chinese (简体中文).

## ENGLISH SOURCE
${abstract}

## CHINESE ACADEMIC TRANSLATION FRAMEWORK

### 🎯 **TRANSLATION OBJECTIVE**
Produce refined Chinese academic prose (学术汉语) that maintains complete semantic fidelity while embodying the precision and elegance expected in Chinese scholarly publications.

### 📝 **CHINESE ACADEMIC STYLE**
**Register Requirements:**
✅ Formal academic Chinese (学术规范汉语) throughout
✅ Third-person/impersonal constructions (avoid 我们/我)
✅ Professional scholarly tone maintained

**Linguistic Excellence:**
✅ Appropriate logical connectors: 然而、此外、因此、从而、总体而言
✅ Standard academic phrasing: 本研究...、结果表明...、与...相比...
✅ Natural Chinese sentence structures and patterns
✅ Academic expressions: "通过...方法", "采用...分析", "本研究显示..."

### 🔧 **PRECISION REQUIREMENTS**
**Exact Preservation:**
✅ All numerical values, percentages, and statistical data
✅ Technical terminology using standard Chinese scientific vocabulary
✅ Mathematical symbols, Greek letters, chemical formulas
✅ Variable names, dataset names, and technical identifiers
✅ LaTeX/math expressions ($...$) and equations

**Terminology Standards:**
• confidence interval → 置信区间
• odds ratio → 比值比
• statistical significance → 统计学意义
• randomized controlled trial → 随机对照试验

**Acronym Protocol:**
• Full term present → Translate term + keep acronym: "世界卫生组织(WHO)"
• Acronym only → Keep as-is: "DNA", "COVID-19"

### ⚡ **TRANSLATION PROTOCOL**
1. **Semantic Analysis** → Understand complete meaning and research context
2. **Chinese Structuring** → Organize content following Chinese academic conventions
3. **Terminology Selection** → Choose appropriate Chinese scientific terms
4. **Style Application** → Apply consistent formal academic register
5. **Flow Refinement** → Ensure natural Chinese academic rhythm

### 🚫 **STRICT PROHIBITIONS**
❌ Introductory meta-text ("以下是学术摘要的中文翻译", "中文翻译：", etc.)
❌ Numerical value alterations or localizations
❌ Technical term modifications without domain expertise
❌ Content additions, omissions, or interpretations
❌ Explanatory commentary or formatting additions
❌ First-person usage (我们/我)

## OUTPUT SPECIFICATION
Deliver publication-ready Chinese academic text with refined style and proper linguistic standards. Scholarly, precise, and linguistically sophisticated Chinese only.`;

        const prompts = {
            ko: koPrompt,
            fr: frPrompt,
            ja: jaPrompt,
            es: esPrompt,
            de: dePrompt,
            zh: zhPrompt
        };

        const prompt = prompts[targetLang];

        const apiKey = process.env[service.envVar];
        const requestData = JSON.stringify({
            model: service.model,
            messages: [
                {
                    role: "system",
                    content: `You are a professional academic translator specializing in ${langNames[targetLang]} translation.`
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: 250,
            temperature: 0.3
        });

        try {
            const serviceInfo = { service, apiKey };
            
            if (service.endpoint.includes('anthropic')) {
                const response = await this.llmManager.makeRequest(serviceInfo, prompt, { maxTokens: 500, temperature: 0.3 });
                let text = ContentSanitizer.sanitizeAbstract(response);
                // Remove output tags and meta-text
                text = text.replace(/<output[^>]*>([\s\S]*?)<\/output>/gi, '$1').trim();
                text = this.cleanTranslationMetaText(text);
                return text;
            } else {
                const hostname = service.endpoint.includes('groq') ? 'api.groq.com' : 'api.openai.com';
                const path = service.endpoint.includes('groq') ? '/openai/v1/chat/completions' : '/v1/chat/completions';
                const finalData = requestData;
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(finalData)
                };
                
                return new Promise((resolve, reject) => {
                    const options = {
                        hostname,
                        port: 443,
                        path,
                        method: 'POST',
                        headers
                    };

                    const req = https.request(options, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            try {
                                const response = JSON.parse(data);
                                if (response.choices && response.choices[0]) {
                                    let text = response.choices[0].message.content.trim();
                                    // Remove meta-text
                                    text = this.cleanTranslationMetaText(text);
                                    resolve(text);
                                } else {
                                    reject(new Error('Translation failed'));
                                }
                            } catch (error) {
                                reject(error);
                            }
                        });
                    });

                    req.on('error', reject);
                    req.write(finalData);
                    req.end();
                });
            }
        } catch (error) {
            throw error;
        }
    }

    async generateFallbackAbstract(title) {
        // Fallback method using simple templates and keyword analysis
        console.log('🔄 Using fallback abstract generation...');
        
        const keywords = this.extractKeywords(title);
        const domain = this.detectResearchDomain(title);
        
        const templates = {
            'epidemiology': `This study presents research on ${title.toLowerCase()}. The work involves mathematical modeling and analysis of epidemiological patterns, contributing to our understanding of disease transmission and control strategies.`,
            'control_theory': `This paper investigates ${title.toLowerCase()}, applying control theory principles and mathematical optimization techniques to analyze system dynamics and develop effective intervention strategies.`,
            'mathematical_biology': `This research examines ${title.toLowerCase()} using mathematical modeling approaches. The study contributes to the field of mathematical biology through theoretical analysis and computational methods.`,
            'general': `This study focuses on ${title.toLowerCase()}, employing rigorous analytical methods and mathematical approaches to advance understanding in this important research area.`
        };
        
        return templates[domain] || templates['general'];
    }

    extractKeywords(title) {
        const commonWords = ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'using', 'based'];
        return title.toLowerCase()
            .split(/\\s+/)
            .filter(word => word.length > 3 && !commonWords.includes(word))
            .slice(0, 5);
    }

    detectResearchDomain(title) {
        const titleLower = title.toLowerCase();
        
        if (titleLower.includes('covid') || titleLower.includes('epidemi') || titleLower.includes('transmission') || titleLower.includes('vaccination')) {
            return 'epidemiology';
        }
        if (titleLower.includes('control') || titleLower.includes('optimal') || titleLower.includes('optimization')) {
            return 'control_theory';
        }
        if (titleLower.includes('mathematical') || titleLower.includes('model')) {
            return 'mathematical_biology';
        }
        
        return 'general';
    }

    /**
     * Return true if `text` contains the Unicode replacement char (U+FFFD).
     */
    detectReplacementChars(text) {
        return typeof text === 'string' && text.indexOf('\uFFFD') !== -1;
    }

    /**
     * Build prompt using PDF content and generic examples
     */
    buildPromptFromExamples(title, pdfContent = {}, currentAbstract = '') {
        const abstractContent = pdfContent.abstract || currentAbstract || '';
        const quantitativeResults = pdfContent.quantitativeResults || '';
        const statisticalFindings = Array.isArray(pdfContent.statisticalFindings) ? 
            pdfContent.statisticalFindings.join(', ') : (pdfContent.statisticalFindings || '');
        const fullTextContext = pdfContent.fullText || '';
        
        return `You are an expert academic writer. Your task is to craft a precise, professional abstract based EXCLUSIVELY on the provided research content for this specific paper.

## CRITICAL ACCURACY REQUIREMENTS

🚨 **ABSOLUTE SOURCE FIDELITY**
- Generate abstracts ONLY from the content provided for THIS paper — NEVER invent or infer details not explicitly present in the supplied material.
- Every finding, numerical value, and conclusion must be taken directly from the source, either verbatim or as a faithful paraphrase. 
- If a result or description is not explicitly stated in the source material, DO NOT include it.
- If multiple scenarios, objective functions, or experiments are present, describe each separately with its own context.
- Do NOT reframe the paper's primary research objective using different terminology.

🔢 **NUMERICAL PRECISION**
- Use ONLY numerical values explicitly stated in the source material.
- Keep all units, scales, and orders of magnitude exactly as in the source.
- Distinguish clearly between different types of metrics (reduction rates vs. error rates vs. confidence intervals vs. relative errors).
- Present each metric in its original context and meaning.
- Never interpolate, estimate, combine figures from different contexts, or alter units.
- Include sensitivity analysis results if they are central to the findings.

📊 **RESEARCH FOCUS ACCURACY**
- Identify and accurately represent the paper's PRIMARY research objective as stated by the authors.
- Use precise academic language that matches the paper's level of certainty.
- Match the level of certainty expressed by the authors; avoid overstating conclusions.
- If the study claims “supports” or “suggests,” do not replace with stronger verbs like “proves” or “demonstrates” unless explicitly stated.

## SOURCE MATERIAL FOR THIS SPECIFIC PAPER
**Paper Title:** ${title}

**Original Abstract:** ${abstractContent}

**Quantitative Results:** ${quantitativeResults}

**Statistical Findings:** ${statisticalFindings}

**Additional Context:** ${fullTextContext}

## PRECISION VERIFICATION CHECKLIST
Before finalizing your abstract, verify:

✅ **Source Isolation:** All content comes exclusively from the source material provided above. 
✅ **Numerical Accuracy:** All numbers, percentages, and statistics are exactly as stated in source material. 
✅ **Methodology Fidelity:** Research methods and approaches accurately reflect source descriptions. 
✅ **Results Separation:** Multiple scenarios (if present) are described distinctly, with correct context.
✅ **Objective Accuracy:** Primary research focus matches authors' stated objective.
✅ **Certainty Level:** Claims match the confidence level expressed by original authors.
✅ **Completeness:** Key methodological details (sensitivity analysis, limitations) included when essential.

❌ **STRICTLY PROHIBITED:** 
- Adding any result, description, or terminology not present in the source material.
- Cross-contamination from other studies.
- Speculation, inference, or invented data beyond the source text.
- Combining separate experimental results.
- Overstating conclusions beyond source claims.
- Reframing research objectives with different terminology.

## STRUCTURAL TEMPLATE
Write exactly 4 sentences in this order:

**Sentence 1:** [Problem/Challenge] - the specific gap, issue, or question motivating the research.
**Sentence 2:** [Method/Approach] - the exact techniques, models, or datasets used.
**Sentence 3:** [Results/Findings] - precise numerical outcomes and key discoveries, with separate coverage for multiple scenarios if applicable.
**Sentence 4:** [Impact/Significance] - the stated contributions, implications, or applications.

## OUTPUT INSTRUCTION
Generate a polished 4-sentence academic abstract that demonstrates complete fidelity to the provided source material. Output the abstract text only—no labels, formatting, or explanatory commentary.`;
    }


    async enhancePublication(publication, service) {
        console.log(`\n\n🔄 Enhancing: "${publication.title.substring(0, 50)}..."`);
        
        try {
            let englishAbstract;
            
            // Generate or improve English abstract using OCR-extracted PDF content
            const existingEnglish = publication.summary?.en || '';
            const pdfContent = {
                abstract: existingEnglish, // Use existing summary.en as abstract
                quantitativeResults: publication.quantitativeResults || '',
                statisticalFindings: publication.statisticalFindings || [],
                fullText: publication.fullText || '' // Use fullText directly from publications.json
            };
            
            // Validate that we have OCR-extracted content
            if (!pdfContent.fullText) {
                console.warn(`⚠️ No OCR-extracted fullText available for "${publication.title}"`);
            } else {
                console.log(`✅ Using OCR-extracted fullText (${pdfContent.fullText.length} chars) for enhancement`);
            }
            
            if (service.key === 'openai' || service.key === 'groq') {
                englishAbstract = await this.generateAbstractWithOpenAI(
                    publication.title, 
                    service.service,
                    pdfContent,
                    existingEnglish
                );
            } else if (service.key === 'anthropic') {
                englishAbstract = await this.generateAbstractWithAnthropic(
                    publication.title,
                    service.service,
                    pdfContent,
                    existingEnglish
                );
            } else {
                // Fallback to template-based generation
                englishAbstract = await this.generateFallbackAbstract(publication.title);
            }
            
            console.log('✅ Generated English abstract');
            
            // Generate multilingual versions based on user configuration
            const summary = { en: englishAbstract };
            
            // Get enhancement methods for each language
            const enhancementMethods = {
                ko: this.enhanceKoreanTranslation.bind(this),
                fr: this.enhanceFrenchTranslation.bind(this),
                ja: this.enhanceJapaneseTranslation.bind(this),
                es: this.enhanceSpanishTranslation.bind(this),
                de: this.enhanceGermanTranslation.bind(this),
                zh: this.enhanceChineseTranslation.bind(this)
            };
            
            // Language names for fallback
            const languageNames = {
                ko: '한국어',
                fr: 'Français',
                ja: '日本語',
                es: 'Español',
                de: 'Deutsch',
                zh: '中文'
            };
            
            if (service.key === 'openai' || service.key === 'groq' || service.key === 'anthropic') {
                // Process each supported language (excluding English which is already done)
                for (const lang of this.supportedLanguages) {
                    if (lang === 'en') continue; // Skip English, already processed
                    
                    try {
                        console.log(`🔄 Processing ${lang.toUpperCase()} translation...`);
                        
                        // Initial translation
                        let translation = await this.translateAbstract(englishAbstract, lang, service.service);
                        console.log(`✅ Initial ${lang.toUpperCase()} translation completed`);
                        const corrupted = this.detectReplacementChars(translation);
                        if (corrupted) {
                            console.log(`🤔 Initial ${lang.toUpperCase()} translation contains replacement characters`);
                        }
                        
                        // Enhancement step
                        if (enhancementMethods[lang]) {
                            translation = await enhancementMethods[lang](translation, service.service);
                            console.log(`✅ Enhanced ${lang.toUpperCase()} translation quality`);
                            let corrupted = this.detectReplacementChars(translation);
                            if (corrupted) {
                                console.log(`🤔 Enhanced ${lang.toUpperCase()} enhancement contains replacement characters`);
                            }
                            
                            // KJC corruption fix step
                            if (corrupted) {
                                for (let i = 0; i < 10; i++) {
                                    translation = await this.fixKJCCorruption(translation, lang, service.service);
                                    const corrupted = this.detectReplacementChars(translation);
                                    if (corrupted) {
                                        console.log(`🤔 Fixing ${lang.toUpperCase()} Unicode corruption step ${i + 1}`);
                                    } else {
                                        console.log(`✅ Fixed ${lang.toUpperCase()} Unicode corruption step ${i + 1}`);
                                        break;
                                    }
                                    await new Promise(r => setTimeout(r, 300 * (i + 1))); // backoff
                                }
                                summary[lang] = translation;
                                if (this.detectReplacementChars(translation)) {
                                    console.log(`❌ Failed to fix ${lang.toUpperCase()} Unicode corruption`);
                                }
                            } else {
                                summary[lang] = translation;
                            }
                        } else {
                            // No enhancement method available, use translation as-is
                            summary[lang] = translation;
                            console.log(`✅ ${lang.toUpperCase()} translation completed (no enhancement available)`);
                        }
                        
                        // Rate limiting between languages
                        if (lang !== this.supportedLanguages[this.supportedLanguages.length - 1]) {
                            console.log('⏱️ Waiting to avoid rate limits...');
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                        
                    } catch (error) {
                        console.warn(`⚠️ ${lang.toUpperCase()} translation failed:`, error.message);
                        const fallbackName = languageNames[lang] || lang.toUpperCase();
                        summary[lang] = `[${fallbackName}] ${englishAbstract}`;
                    }
                }
            } else {
                // Simple fallback translations for all supported languages
                for (const lang of this.supportedLanguages) {
                    if (lang === 'en') continue;
                    const fallbackName = languageNames[lang] || lang.toUpperCase();
                    summary[lang] = `[${fallbackName}] ${englishAbstract}`;
                }
            }
            
            return {
                ...publication,
                summary,
                enhanced_at: new Date().toISOString()
            };
            
        } catch (error) {
            console.warn(`⚠️ Enhancement failed for "${publication.title}":`, error.message);
            
            // Return original with fallback abstract
            const fallbackAbstract = await this.generateFallbackAbstract(publication.title);
            
            // Create fallback summary for all supported languages
            const fallbackSummary = { en: fallbackAbstract };
            const languageNames = {
                ko: '한국어',
                fr: 'Français',
                ja: '日本語',
                es: 'Español',
                de: 'Deutsch',
                zh: '中文'
            };
            
            for (const lang of this.supportedLanguages) {
                if (lang === 'en') continue;
                const fallbackName = languageNames[lang] || lang.toUpperCase();
                fallbackSummary[lang] = `[${fallbackName}] ${fallbackAbstract}`;
            }
            
            return {
                ...publication,
                summary: fallbackSummary,
                enhanced_at: new Date().toISOString()
            };
        }
    }

    savePublications(publications) {
        try {
            console.log('\n\n💾 Saving enhanced publications...');
            const dataToSave = JSON.stringify(publications, null, 2);
            console.log(`📝 Generated ${dataToSave.length} characters of JSON data`);
            fs.writeFileSync(this.publicationsFile, dataToSave, { encoding: 'utf8', flag: 'w' });
            console.log(`✅ Saved ${publications.length} enhanced publications to ${this.publicationsFile}`);
        } catch (error) {
            console.error('❌ Failed to save publications:', error.message);
            console.error('Stack:', error.stack);
            process.exit(1);
        }
    }

    async run(mode = 'auto') {
        // Check if LLM enhancement is enabled
        if (this.config.settings?.enable_llm_enhancement === false) {
            Logger.warning('⚠️  LLM enhancement is disabled in configuration');
            Logger.info('💡 To enable: Set "enable_llm_enhancement": true in config.json');
            Logger.info('🏁 Skipping LLM enhancement...');
            return;
        }

        console.log('🤖 LLM Abstract Generator');
        console.log('==========================');
        
        const publications = this.loadPublications();
        if (publications.length === 0) {
            console.log('📄 No publications found. Creating default structure for manual entry...');
            this.configManager.createDefaultPublicationsStructure();
            return;
        }
        
        console.log(`📚 Loaded ${publications.length} publications from data/publications.json`);
        console.log('🔍 Checking enhancement status for each publication...');
        
        console.log(`📚 Found ${publications.length} publications to enhance`);
        
        // Detect available LLM service
        const availableService = this.detectAvailableService();
        
        if (!availableService) {
            console.log('⚠️ No LLM API keys found. Using fallback generation.');
            console.log('💡 Add API keys to .env file for better results:');
            console.log('   OPENAI_API_KEY=your_key_here');
            console.log('   GROQ_API_KEY=your_key_here');
        } else {
            console.log(`🎯 Using ${availableService.service.name} for enhancement`);
        }
        
        // Filter out publications that already have enhanced summaries
        const publicationsToEnhance = publications.filter(pub => {
            // Check if publication has basic requirements
            if (!pub.enhanced_at || !pub.summary || !pub.summary.en) {
                console.log(`🔄 Needs enhancement: "${pub.title.substring(0, 50)}..." - Missing enhanced_at, summary, or en summary`);
                return true; // Needs enhancement
            }
            
            // Check if summaries are real translations (not placeholders) for user's languages
            const languageNames = {
                ko: '한국어',
                fr: 'Français',
                ja: '日本語',
                es: 'Español',
                de: 'Deutsch',
                zh: '中文'
            };
            
            let hasPlaceholders = false;
            for (const lang of this.supportedLanguages) {
                if (lang === 'en') continue;
                const langName = languageNames[lang];
                if (langName && pub.summary[lang] && pub.summary[lang].startsWith(`[${langName}]`)) {
                    hasPlaceholders = true;
                    break;
                }
            }
            
            if (hasPlaceholders) {
                console.log(`🔄 Needs re-enhancement: "${pub.title.substring(0, 50)}..." - Has placeholder translations`);
                return true; // Needs enhancement (has placeholders)
            }
            
            // Check if it has proper multilingual summaries for all supported languages
            let hasAllLanguages = true;
            for (const lang of this.supportedLanguages) {
                if (lang === 'en') continue;
                if (!pub.summary[lang] || pub.summary[lang] === pub.summary.en) {
                    hasAllLanguages = false;
                    break;
                }
            }
            
            const hasMultipleLanguages = hasAllLanguages;
                                       
            if (hasMultipleLanguages) {
                console.log(`⏭️ Skipping already enhanced: "${pub.title.substring(0, 50)}..."`);
                return false; // Already enhanced
            }
            
            console.log(`🔄 Needs enhancement: "${pub.title.substring(0, 50)}..." - Missing proper multilingual summaries`);
            return true; // Needs enhancement
        });

        if (publicationsToEnhance.length === 0) {
            console.log('✅ All publications already enhanced! No work needed.');
            return;
        }

        console.log(`📊 Token optimization: Processing ${publicationsToEnhance.length}/${publications.length} publications`);

        // Enhance publications
        const enhancedPublications = [];
        
        const languageNames = {
            ko: '한국어',
            fr: 'Français',
            ja: '日本語',
            es: 'Español',
            de: 'Deutsch',
            zh: '中文'
        };
        
        for (let i = 0; i < publicationsToEnhance.length; i++) {
            const publication = publicationsToEnhance[i];
            
            console.log(`\n\n📖 Processing ${i + 1}/${publicationsToEnhance.length}`);
            
            // FAILSAFE: Double-check this publication hasn't been enhanced
            // Check if publication already has all required languages enhanced
            let isAlreadyEnhanced = publication.summary && 
                                   publication.summary.en && 
                                   publication.enhanced_at;
                                   
            if (isAlreadyEnhanced) {
                // Check if all supported languages are present and not placeholders
                for (const lang of this.supportedLanguages) {
                    if (lang === 'en') continue;
                    
                    if (!publication.summary[lang]) {
                        isAlreadyEnhanced = false;
                        break;
                    }
                    
                    // Check if it's a placeholder
                    const langName = languageNames[lang];
                    if (langName && publication.summary[lang].startsWith(`[${langName}]`)) {
                        isAlreadyEnhanced = false;
                        break;
                    }
                }
            }
            
            if (isAlreadyEnhanced) {
                console.error(`🚨 CRITICAL ERROR: Attempting to enhance already processed publication: ${publication.title}`);
                console.error('🛑 TERMINATING to prevent duplicate processing and token waste');
                process.exit(1);
            }

            const enhanced = await this.enhancePublication(
                publication, 
                availableService || { key: 'fallback' }
            );
            
            // Debug: Verify enhancement was applied
            console.log(`✅ Enhanced publication has enhanced_at: ${enhanced.enhanced_at}`);
            
            // Show summaries for all supported languages
            const summaryStatus = this.supportedLanguages.map(lang => `${lang}=${!!enhanced.summary?.[lang]}`).join(', ');
            console.log(`✅ Enhanced publication has summaries: ${summaryStatus}`);
            
            enhancedPublications.push(enhanced);
            
            // Add delay to avoid rate limiting
            if (availableService && i < publicationsToEnhance.length - 1) {
                console.log('⏱️ Waiting to avoid rate limits...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // Combine enhanced publications with skipped ones to maintain complete list
        const allPublications = publications.map(pub => {
            const enhanced = enhancedPublications.find(ep => ep.title === pub.title);
            const result = enhanced || pub; // Use enhanced version if available, otherwise keep original
            
            // Debug: Log what's being saved for each publication
            if (enhanced) {
                console.log(`💾 Saving enhanced: "${pub.title.substring(0, 40)}..." - enhanced_at: ${enhanced.enhanced_at}`);
            } else {
                console.log(`💾 Saving original: "${pub.title.substring(0, 40)}..." - enhanced_at: ${pub.enhanced_at || 'MISSING'}`);
            }
            
            return result;
        });
        
        // Save results
        console.log(`📊 About to save ${allPublications.length} publications (${enhancedPublications.length} were enhanced)`);
        this.savePublications(allPublications);
        
        console.log('\n\n🎉 Abstract enhancement completed!');
        console.log('📈 Results:');
        console.log(`   • ${enhancedPublications.length} publications enhanced`);
        console.log(`   • Multilingual abstracts generated`);
        console.log(`   • Ready for homepage display`);
        
        if (!availableService) {
            console.log('\n\n💡 Next steps for better results:');
            console.log('   • Add LLM API keys to .env file');
            console.log('   • Re-run this script for AI-generated abstracts');
        }
    }
}

// CLI interface
async function main() {
    const mode = process.argv[2] || 'auto';
    const generator = new LLMAbstractGenerator();
    
    try {
        await generator.run(mode);
    } catch (error) {
        console.error('💥 Enhancement failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Script execution failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    });
}

module.exports = LLMAbstractGenerator;