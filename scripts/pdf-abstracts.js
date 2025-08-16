const fs = require('fs');
const path = require('path');
const https = require('https');
const pdfParse = require('pdf-parse');
const ConfigManager = require('./utils/config-manager');
const LLMServiceManager = require('./utils/llm-service-manager');
const PDFExtractor = require('./utils/pdf-extractor');
const { spawn, spawnSync } = require('child_process');
const PromptBuilder = require('./utils/prompt-builder');
const DataTransformer = require('./utils/data-transformer');
const ContentSanitizer = require('./utils/content-sanitizer');
const Logger = require('./utils/logger');

function pickPython() {
    // Available order: py → python → python3
    for (const exe of ['py', 'python', 'python3']) {
      const ok = spawnSync(exe, ['--version'], { stdio: 'ignore' });
      if (ok.status === 0) {
        // Windows' py' is version-specific, so prefix with '-3'
        const pre = exe === 'py' ? ['-3'] : [];
        return { cmd: exe, pre };
      }
    }
    throw new Error('Python 3 runtime not found (tried: py, python, python3).');
  }

class PDFAbstractGenerator {
    constructor() {
        this.publicationsDir = path.join(__dirname, '..', 'publications');
        this.outputFile = path.join(__dirname, '..', 'data', 'publications.json');
        this.configManager = new ConfigManager();
        this.llmManager = new LLMServiceManager();
        this.configManager.loadEnvironment();
        this.loadConfiguration();
        
        // Direct Python OCR execution is now the only method
        Logger.info('🔍 PDF extraction uses direct Python OCR execution');
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

    createMultiLanguageSummary(englishAbstract) {
        const summary = {};
        
        // Language placeholders for non-English languages
        const placeholders = {
            ko: '초록을 사용할 수 없습니다.',
            fr: 'Résumé non disponible.',
            ja: '概要は利용できません。',
            zh: '摘要不可用。',
            es: 'Resumen no disponible.',
            de: 'Zusammenfassung nicht verfügbar.'
        };
        
        for (const lang of this.supportedLanguages) {
            if (lang === 'en') {
                summary[lang] = englishAbstract;
            } else {
                // Use placeholder for non-English languages - will be enhanced later
                summary[lang] = placeholders[lang] || 'Abstract not available.';
            }
        }
        return summary;
    }

    detectAvailableService() {
        return this.llmManager.detectAvailableServices();
    }

    async extractPDFContent(pdfPath, correctionPath = null) {
        try {
            // STEP 1: Run Python OCR pipeline to generate .txt file
            await this.runPythonOCRPipeline(pdfPath);
            
            // STEP 2: Read the generated .txt file
            const txtPath = pdfPath.replace(/\.pdf$/i, '.txt');
            if (!fs.existsSync(txtPath)) {
                throw new Error(`Python OCR failed to generate expected .txt file: ${txtPath}`);
            }
            
            const fullText = fs.readFileSync(txtPath, 'utf8');
            console.log(`✅ Read OCR-extracted text: ${fullText.length} characters`);
            
            // STEP 3: Extract all metadata from the OCR fullText
            return await this.extractMetadataFromOCRText(fullText, pdfPath, correctionPath);
            
        } catch (error) {
            Logger.error(`Failed to extract PDF content from ${pdfPath}: ${error.message}`);
            throw error;
        }
    }

    async runPythonOCRPipeline(pdfPath) {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, 'pdf_reader_pipeline.py');
            const absolutePdfPath = path.isAbsolute(pdfPath) ? pdfPath : path.resolve(pdfPath);
            const args = [pythonScript, absolutePdfPath, '--pages', '1-2,last-1,last', '--zoom', '2.5'];
            

            const py = pickPython();
            console.log(`🐍 Running Python OCR: ${py.cmd} ${[...py.pre, ...args].join(' ')}`);
            const pythonProcess = spawn(py.cmd, [...py.pre, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
            
            let stdout = '';
            let stderr = '';
            
            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            pythonProcess.on('close', (code) => {
                const txtPath = absolutePdfPath.replace(/\.pdf$/i, '.txt');
                
                if (code === 0) {
                    // Check if the .txt file was actually created
                    if (!fs.existsSync(txtPath)) {
                        reject(new Error(`Python OCR succeeded but no output file generated. Expected: ${txtPath}`));
                        return;
                    }
                    
                    console.log(`✅ Python OCR completed successfully: ${txtPath}`);
                    resolve(txtPath);
                } else {
                    // Enhanced error reporting for missing dependencies
                    let errorMessage = stderr || 'Unknown error';
                    
                    if (stderr.includes('ModuleNotFoundError') || stderr.includes('ImportError')) {
                        if (stderr.includes('fitz') || stderr.includes('PyMuPDF')) {
                            errorMessage = `Missing PyMuPDF. Install with: pip install --force-reinstall --no-cache-dir "pymupdf>=1.24"`;
                        } else if (stderr.includes('PIL') || stderr.includes('pillow')) {
                            errorMessage = `Missing Pillow. Install with: pip install pillow`;
                        } else if (stderr.includes('pytesseract')) {
                            errorMessage = `Missing pytesseract. Install with: pip install pytesseract`;
                        } else {
                            errorMessage = `Missing Python dependencies. Install with: pip install --force-reinstall --no-cache-dir "pymupdf>=1.24" pillow pytesseract`;
                        }
                    }
                    
                    reject(new Error(`Python OCR failed with exit code ${code}: ${errorMessage}. Stdout: ${stdout}. Stderr: ${stderr}`));
                }
            });
            
            pythonProcess.on('error', (error) => {
                reject(new Error(`Failed to start Python OCR: ${error.message}. Ensure python3 is installed and in PATH.`));
            });
        });
    }

    async extractMetadataFromOCRText(fullText, pdfPath, correctionPath = null) {
        try {
            // Check if LLM enhancement is available and enabled
            const serviceInfo = this.detectAvailableService();
            const hasLLMService = !!serviceInfo;
            const llmEnabled = this.config.settings?.enable_llm_enhancement !== false;
            
            let metadata;
            
            if (hasLLMService && llmEnabled) {
                console.log(`🔍 Extracting metadata using LLM from OCR text for ${path.basename(pdfPath)}`);
                metadata = await this.extractMetadataWithLLM(fullText, serviceInfo);
            } else {
                console.log(`🔍 Extracting metadata using basic methods from OCR text for ${path.basename(pdfPath)}`);
                // Use basic extraction methods when LLM is not available
                const lines = fullText.split('\n').filter(line => line.trim().length > 0);
                metadata = {
                    title: PDFExtractor.extractTitle(lines, fullText),
                    journal: PDFExtractor.extractJournal(lines, fullText),
                    date: PDFExtractor.extractPublicationDate(lines, fullText),
                    abstract: PDFExtractor.extractAbstract(lines, fullText),
                    doi: PDFExtractor.extractDOI(lines, fullText)
                };
            }
            
            let title = metadata.title || path.basename(pdfPath, '.pdf');
            let journal = metadata.journal || 'Unknown Journal';
            let publicationDate = metadata.date || '2024-01-01';
            let abstractText = metadata.abstract || '';
            let doi = metadata.doi || null;
            
            // Extract additional content using existing methods as supplementary
            const lines = fullText.split('\n').filter(line => line.trim().length > 0);
            let quantitativeResults = PDFExtractor.extractQuantitativeResults(lines, fullText);
            let statisticalFindings = PDFExtractor.extractStatisticalFindings(fullText);
            let tableResults = this.extractTableResults(fullText);
            
            // Handle correction data if available
            let correctionText = '';
            if (correctionPath && fs.existsSync(correctionPath)) {
                const correctionBuffer = fs.readFileSync(correctionPath);
                const correctionData = await pdfParse(correctionBuffer);
                correctionText = correctionData.text;
                console.log('📝 Including correction data');
            }
            
            return {
                title: title || path.basename(pdfPath, '.pdf'),
                journal: journal || 'Unknown Journal',
                publicationDate: publicationDate || '2024-01-01',
                quantitativeResults: quantitativeResults.trim(),
                statisticalFindings: statisticalFindings,
                tableResults: tableResults,
                doi: doi,
                correctionText: correctionText,
                fullText: fullText, // Complete OCR-extracted text
                extractionMethod: ['python_ocr_direct']
            };
        } catch (error) {
            console.error(`❌ Error extracting metadata from OCR text:`, error.message);
            throw error;
        }
    }

    // Remove this method - use PDFExtractor.extractTitle instead
    
    // Remove all these methods - use EnhancedPDFExtractor methods instead

    extractKeyFindings(lines) {
        let keyFindings = '';
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes('conclusion') || 
                lines[i].toLowerCase().includes('results') ||
                lines[i].toLowerCase().includes('findings')) {
                for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
                    keyFindings += lines[j] + ' ';
                }
                break;
            }
        }
        
        return keyFindings;
    }

    async extractMetadataWithLLM(fullText, serviceInfo) {
        const { service } = serviceInfo;
        const apiKey = process.env[service.envVar];
        
        const prompt = `Extract academic metadata from this OCR text. Return ONLY valid JSON, no explanations.

OCR TEXT (first 2 + last 2 pages):
${fullText.substring(0, 5000)}

Extract:
- title: Main paper title (avoid headers, journal names, author names)
- journal: Journal name from header/footer text. Look for academic journal naming patterns:
  * Most common structure: "JOURNAL OF [SUBJECT]" (32% of academic journals)
  * Organization prefixes: "IEEE", "ACM", "ACTA", "BMC" followed by topic
  * Publication types: "TRANSACTIONS", "PROCEEDINGS", "ANNALS", "REVIEWS"
  * Geographic indicators: "INTERNATIONAL", "AMERICAN", "EUROPEAN" 
  * Common words: "RESEARCH", "SCIENCE", "ENGINEERING", "MATERIALS"
  * Series indicators: "SECTION A/B/C", "PART I/II", volume numbers
  * Minimal punctuation (avoid adding unnecessary symbols)
- date: Publication date as YYYY-MM-DD (prefer "published online" over "received")
- abstract: Abstract text (limit 500 words)
- doi: DOI as https://doi.org/10.xxxx/xxxxx format or null

Academic journal format recognition:
- Look for formal institutional naming
- Identify abbreviated organization names
- Recognize discipline-specific terminology
- Maintain professional academic tone
- Preserve any series/section designations

Return ONLY this JSON structure:
{
  "title": "extracted title here",
  "journal": "extracted journal here", 
  "date": "YYYY-MM-DD",
  "abstract": "extracted abstract here",
  "doi": "https://doi.org/10.xxxx/xxxxx or null"
}`;

        try {
            const response = await this.llmManager.makeRequest(serviceInfo, prompt, { maxTokens: 800, temperature: 0.1 });
            
            // Extract JSON from response (handle various formats)
            let jsonText = response.trim();
            
            // Remove markdown code blocks
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```/g, '');
            
            // Find JSON object in the response
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
            }
            
            const metadata = JSON.parse(jsonText);
            console.log('✅ LLM metadata extraction successful');
            return metadata;
        } catch (error) {
            console.warn(`⚠️ LLM metadata extraction failed: ${error.message}`);
            // Fallback to basic extraction
            const lines = fullText.split('\n').filter(line => line.trim().length > 0);
            return {
                title: PDFExtractor.extractTitle(lines, fullText),
                journal: PDFExtractor.extractJournal(lines, fullText),
                date: PDFExtractor.extractPublicationDate(lines, fullText),
                abstract: PDFExtractor.extractAbstract(lines, fullText),
                doi: PDFExtractor.extractDOI(lines, fullText)
            };
        }
    }

    async generateWithAnthropic(prompt, service, apiKey) {
        const serviceInfo = { service, apiKey };
        const response = await this.llmManager.makeRequest(serviceInfo, prompt, { maxTokens: 200, temperature: 0.7 });
        return ContentSanitizer.sanitizeAbstract(response);
    }

    async generateWithOpenAI(prompt, service, apiKey) {
        const requestData = JSON.stringify({
            model: service.model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 200,
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
                            reject(new Error('Unexpected OpenAI API response format'));
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

    loadExistingPublications() {
        try {
            // Ensure the data directory exists
            const dataDir = path.dirname(this.outputFile);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
                console.log(`📁 Created data directory: ${dataDir}`);
            }
            
            if (fs.existsSync(this.outputFile)) {
                return JSON.parse(fs.readFileSync(this.outputFile, 'utf8'));
            }
        } catch (error) {
            console.warn('⚠️ Could not load existing publications:', error.message);
        }
        return [];
    }

    isPDFAlreadyProcessed(pdfFileName, existingPublications) {
        return existingPublications.some(pub => pub.pdf_file === pdfFileName);
    }


    async processPDFs() {
        // Check if PDF extraction is enabled
        if (this.config.settings?.enable_pdf_extraction === false) {
            Logger.warning('⚠️  PDF extraction is disabled in configuration');
            Logger.info('💡 To enable: Set "enable_pdf_extraction": true in config.json');
            Logger.info('🏁 Skipping PDF processing...');
            
            // Create default publications.json structure if it doesn't exist
            this.configManager.createDefaultPublicationsStructure();
            return;
        }

        console.log('📚 PDF Abstract Generator');
        console.log('========================');
        console.log('⚠️  IMPORTANT NOTICE');
        console.log('📄 This program will extract information from your PDF files and then');
        console.log('🗑️  AUTOMATICALLY DELETE ALL PDF files for safety and clarity.');
        console.log('💾 If you want to keep copies, please back them up elsewhere first.');
        console.log('⏱️  Processing will begin in 5 seconds...');
        console.log('========================\n');
        
        // Give user time to read the disclaimer
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check if LLM enhancement is enabled and available
        const serviceInfo = this.detectAvailableService();
        const hasLLMService = !!serviceInfo;
        const llmEnabled = this.config.settings?.enable_llm_enhancement !== false;
        
        if (llmEnabled && !hasLLMService) {
            console.log('⚠️  LLM enhancement is enabled but no API key available');
            console.log('💡 Either disable LLM enhancement or add API key to .env file');
            console.log('🔄 Proceeding with basic PDF extraction only...');
        }
        
        if (hasLLMService && llmEnabled) {
            console.log(`🎯 Using ${serviceInfo.service.name} for enhancement`);
        } else {
            console.log('📄 Using basic PDF extraction without LLM enhancement');
        }
        
        // Load existing publications to avoid reprocessing
        const existingPublications = this.loadExistingPublications();
        console.log(`📋 Found ${existingPublications.length} existing publications`);
        
        // Debug: Show existing publication files for troubleshooting
        if (existingPublications.length > 0) {
            console.log('📄 Existing publication PDFs:');
            existingPublications.forEach(pub => {
                console.log(`   • ${pub.pdf_file || 'NO PDF_FILE'} - "${pub.title.substring(0, 40)}..."`);
            });
        }
        
        const allPdfFiles = fs.readdirSync(this.publicationsDir)
            .filter(file => file.endsWith('.pdf') && !file.includes('_correction'));
        
        // Debug: Show all PDF files found
        console.log(`📁 Found ${allPdfFiles.length} PDF files in publications/ directory:`);
        allPdfFiles.forEach(file => {
            console.log(`   • ${file}`);
        });
        
        // Filter out already processed PDFs
        const newPdfFiles = allPdfFiles.filter(pdfFile => {
            const isProcessed = this.isPDFAlreadyProcessed(pdfFile, existingPublications);
            if (isProcessed) {
                console.log(`⏭️ Skipping already processed: "${pdfFile}"`);
                return false;
            }
            return true;
        });
        
        console.log(`📚 Found ${allPdfFiles.length} total PDFs, processing ${newPdfFiles.length} new ones`);
        
        if (newPdfFiles.length === 0) {
            if (allPdfFiles.length === 0) {
                console.log('📁 No PDF files found in publications/ directory');
                console.log('📄 Creating default publications.json structure for manual entry...');
                this.configManager.createDefaultPublicationsStructure();
            } else {
                console.log('✅ All PDFs already processed! No new extractions needed.');
                
                // Still create default structure if no publications exist somehow
                if (existingPublications.length === 0) {
                    console.log('📄 No publications found, creating default structure...');
                    this.configManager.createDefaultPublicationsStructure();
                }
            }
            
            return;
        }
        
        const newPublications = [];
        
        for (let i = 0; i < newPdfFiles.length; i++) {
            const pdfFile = newPdfFiles[i];
            const pdfPath = path.join(this.publicationsDir, pdfFile);
            this.currentFile = pdfPath; // Store for journal extraction
            
            console.log(`\n📖 Processing ${i + 1}/${newPdfFiles.length}`);
            console.log(`🔄 Extracting: "${pdfFile}"`);
            
            try {
                // FAILSAFE: Double-check this PDF hasn't been processed
                if (this.isPDFAlreadyProcessed(pdfFile, existingPublications)) {
                    console.error(`🚨 CRITICAL ERROR: Attempting to process already existing PDF: ${pdfFile}`);
                    console.error('🛑 TERMINATING to prevent duplicate processing and token waste');
                    process.exit(1);
                }

                // Check for correction file
                let correctionPath = null;
                if (pdfFile.includes('journal.pone.0249262')) {
                    correctionPath = path.join(this.publicationsDir, 'journal.pone.0253685_correction.pdf');
                    console.log('🔍 Looking for correction file...');
                    if (fs.existsSync(correctionPath)) {
                        console.log('📝 Found correction file');
                    }
                }
                
                const pdfContent = await this.extractPDFContent(pdfPath, correctionPath);
                if (!pdfContent) {
                    console.log('❌ Failed to extract PDF content');
                    continue;
                }
                
                console.log(`📄 LLM-extracted Title: "${pdfContent.title.substring(0, 60)}..."`);
                console.log(`📰 LLM-extracted Journal: "${pdfContent.journal}"`);
                console.log(`📅 LLM-extracted Date: "${pdfContent.publicationDate}"`);
                console.log(`📝 LLM-extracted Abstract: ${pdfContent.abstract ? pdfContent.abstract.length : 0} chars`);
                
                // Use simple template abstract instead of LLM generation
                const abstract = pdfContent.abstract || `Academic paper titled "${pdfContent.title}" published in ${pdfContent.journal} (${pdfContent.publicationDate}). Full metadata extracted using OCR text analysis.`;
                
                const publication = {
                    date: pdfContent.publicationDate,
                    title: pdfContent.title,
                    journal: pdfContent.journal,
                    link: pdfContent.doi || `./publications/${pdfFile}`,
                    citations: 0,
                    summary: this.createMultiLanguageSummary(abstract),
                    fetched_at: new Date().toISOString(),
                    pdf_file: pdfFile,
                    formatted_date: DataTransformer.formatDateForDisplay(pdfContent.publicationDate, this.supportedLanguages),
                    // ✅ Include extracted PDF content for llm-abstracts.js
                    quantitativeResults: pdfContent.quantitativeResults,
                    statisticalFindings: pdfContent.statisticalFindings,
                    fullText: pdfContent.fullText,
                    tableResults: pdfContent.tableResults
                };
                
                newPublications.push(publication);
                console.log('✅ Generated abstract');
                
                // Remove PDF file after successful extraction
                try {
                    fs.unlinkSync(pdfPath);
                    console.log(`🗑️  Removed PDF file: ${pdfFile}`);
                    
                    // Also remove correction file if it exists
                    if (correctionPath && fs.existsSync(correctionPath)) {
                        fs.unlinkSync(correctionPath);
                        console.log(`🗑️  Removed correction file: ${path.basename(correctionPath)}`);
                    }
                } catch (removeError) {
                    console.warn(`⚠️  Could not remove PDF file ${pdfFile}:`, removeError.message);
                }
                
                // Rate limiting
                if (i < newPdfFiles.length - 1) {
                    console.log('⏱️ Waiting to avoid rate limits...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (error) {
                console.error(`❌ Error processing ${pdfFile}:`, error.message);
                console.error(`📄 PDF file "${pdfFile}" was NOT removed due to processing error - you can retry later`);
            }
        }
        
        // Combine existing publications with new ones
        const combinedPublications = [...existingPublications, ...newPublications];
        
        // Deduplicate based on title, keeping the publication with most complete data
        console.log('\n🔄 Deduplicating publications...');
        const titleMap = new Map();
        
        // First pass: group by title and keep the most complete publication
        combinedPublications.forEach(pub => {
            const titleKey = pub.title.toLowerCase().trim();
            const existing = titleMap.get(titleKey);
            
            if (!existing) {
                titleMap.set(titleKey, pub);
            } else {
                // Keep the publication with more complete data (has extracted PDF content)
                const hasExtractedContent = pub.abstract || pub.fullText || pub.quantitativeResults;
                const existingHasExtractedContent = existing.abstract || existing.fullText || existing.quantitativeResults;
                
                if (hasExtractedContent && !existingHasExtractedContent) {
                    console.log(`   🔄 Replacing existing with extracted content: "${pub.title}"`);
                    titleMap.set(titleKey, pub);
                } else if (!hasExtractedContent && existingHasExtractedContent) {
                    console.log(`   ⚠️  Keeping existing with extracted content: "${pub.title}"`);
                    // Keep existing
                } else {
                    console.log(`   ⚠️  Removing duplicate: "${pub.title}"`);
                    // Keep existing (first occurrence)
                }
            }
        });
        
        const allPublications = Array.from(titleMap.values());
        
        const duplicatesRemoved = combinedPublications.length - allPublications.length;
        if (duplicatesRemoved > 0) {
            console.log(`   ✅ Removed ${duplicatesRemoved} duplicate publication(s)`);
        } else {
            console.log(`   ✅ No duplicates found`);
        }
        
        // Save to file
        console.log('\n💾 Saving publications...');
        
        // Ensure the data directory exists before saving
        const dataDir = path.dirname(this.outputFile);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log(`📁 Created data directory: ${dataDir}`);
        }
        
        fs.writeFileSync(this.outputFile, JSON.stringify(allPublications, null, 2));
        console.log(`✅ Saved ${allPublications.length} total publications (${newPublications.length} new) to ${this.outputFile}`);
        
        console.log('\n🎉 PDF processing completed!');
        console.log('📈 Results:');
        console.log(`   • ${newPublications.length} new publications processed`);
        console.log(`   • ${allPublications.length} total publications in database`);
        if (duplicatesRemoved > 0) {
            console.log(`   • ${duplicatesRemoved} duplicate(s) removed`);
        }
        console.log('   • Proper titles, journals, and dates extracted');
        console.log('   • Correction files handled');
        console.log(`   • ${newPublications.length} PDF files automatically removed (safety & clarity)`);
        console.log('   • Ready for homepage display');
    }

    extractDateRelevantText(fullText) {
        // Extract text that might contain publication dates - prioritize "Published online" patterns
        const datePatterns = [
            // Highest priority: Published online patterns
            /published online:?\s*\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/gi,
            /published online:?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
            /published online:?\s*\d{4}[\/\-\s]\d{1,2}[\/\-\s]\d{1,2}/gi,
            /published online:?\s*\d{1,2}[\/\-\s]\d{1,2}[\/\-\s]\d{4}/gi,
            /published online:?[^.]*?\d{4}/gi,
            
            // Other publication patterns
            /available online:?[^.]*?\d{4}/gi,
            /received:?[^.]*?\d{4}/gi,
            /accepted:?[^.]*?\d{4}/gi,
            /published:?[^.]*?\d{4}/gi,
            /first published:?[^.]*?\d{4}/gi,
            /publication date:?[^.]*?\d{4}/gi,
            /copyright.*?\d{4}/gi,
            /\d{4}.*?published/gi,
            
            // Generic date patterns
            /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi,
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
            /\d{1,2}[\/\-\s]\d{1,2}[\/\-\s]\d{4}/gi,
            /\d{4}[\/\-\s]\d{1,2}[\/\-\s]\d{1,2}/gi
        ];
        
        let dateText = '';
        for (const pattern of datePatterns) {
            const matches = fullText.match(pattern);
            if (matches) {
                dateText += matches.join('\n') + '\n';
            }
        }
        
        // Also get the last 1000 characters where publication info often appears
        const lastPart = fullText.substring(Math.max(0, fullText.length - 1000));
        
        return dateText + '\n\nLast part of document:\n' + lastPart;
    }

    async enhanceTitleJournalAndDate(pdfContent, serviceInfo) {
        const { service } = serviceInfo;
        const apiKey = process.env[service.envVar];
        
        // Search for publication date patterns in the OCR-extracted full text
        const fullText = pdfContent.fullText || pdfContent.rawText; // Use OCR fullText first
        const dateSearchText = this.extractDateRelevantText(fullText);
        
        
        const prompt = PromptBuilder.buildTitleJournalDatePrompt(pdfContent, dateSearchText);

        try {
            const serviceInfo = { service, apiKey };
            const response = await this.llmManager.makeRequest(serviceInfo, prompt, { maxTokens: 300, temperature: 0.3 });
            
            // Try to parse as JSON, fallback to original data
            try {
                const parsed = JSON.parse(response);
                return parsed;
            } catch {
                return { title: pdfContent.title, journal: pdfContent.journal, publicationDate: pdfContent.publicationDate };
            }
        } catch (error) {
            Logger.error(`Error enhancing title/journal/date: ${error.message}`);
            return { title: pdfContent.title, journal: pdfContent.journal, publicationDate: pdfContent.publicationDate };
        }
    }

    async enhanceWithAnthropic(prompt, service, apiKey) {
        const requestData = JSON.stringify({
            model: service.model,
            max_tokens: 300,
            messages: [{ role: "user", content: prompt }]
        });

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.anthropic.com',
                port: 443,
                path: '/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Length': Buffer.byteLength(requestData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.content && response.content[0]) {
                            const text = response.content[0].text.trim();
                            // Try to parse as JSON, fallback to text
                            try {
                                const parsed = JSON.parse(text);
                                resolve(parsed);
                            } catch {
                                resolve({ title: text, journal: 'Unknown Journal' });
                            }
                        } else {
                            reject(new Error('Unexpected Anthropic API response format'));
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

    async enhanceWithOpenAI(prompt, service, apiKey) {
        const requestData = JSON.stringify({
            model: service.model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 300,
            temperature: 0.3
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
                            const text = response.choices[0].message.content.trim();
                            // Try to parse as JSON, fallback to text
                            try {
                                const parsed = JSON.parse(text);
                                resolve(parsed);
                            } catch {
                                resolve({ title: text, journal: 'Unknown Journal' });
                            }
                        } else {
                            reject(new Error('Unexpected OpenAI API response format'));
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

    formatDateForDisplay(dateString) {
        // Handle different date formats: "2021-07-15", "2021-07", "2021-01"
        if (!dateString) {
            const emptyDate = {};
            this.supportedLanguages.forEach(lang => emptyDate[lang] = '');
            return emptyDate;
        }

        const parts = dateString.split('-');
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];

        const monthNames = {
            en: ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December'],
            ko: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
            fr: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
            ja: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
            zh: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
            es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
            de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
        };

        const result = {};
        
        this.supportedLanguages.forEach(lang => {
            if (month && month !== '01') {
                const monthIndex = parseInt(month) - 1;
                
                if (day) {
                    // Full date formatting per language
                    switch(lang) {
                        case 'en':
                            result[lang] = `${monthNames.en[monthIndex]} ${parseInt(day)}, ${year}`;
                            break;
                        case 'ko':
                        case 'ja':
                        case 'zh':
                            result[lang] = `${year}.${month}.${day}`;
                            break;
                        case 'fr':
                            result[lang] = `${parseInt(day)} ${monthNames.fr[monthIndex]} ${year}`;
                            break;
                        case 'es':
                            result[lang] = `${parseInt(day)} de ${monthNames.es[monthIndex]} de ${year}`;
                            break;
                        case 'de':
                            result[lang] = `${parseInt(day)}. ${monthNames.de[monthIndex]} ${year}`;
                            break;
                        default:
                            result[lang] = `${monthNames.en[monthIndex]} ${parseInt(day)}, ${year}`;
                    }
                } else {
                    // Month and year formatting
                    switch(lang) {
                        case 'en':
                            result[lang] = `${monthNames.en[monthIndex]} ${year}`;
                            break;
                        case 'ko':
                        case 'ja':
                        case 'zh':
                            result[lang] = `${year}.${month}`;
                            break;
                        case 'fr':
                            result[lang] = `${monthNames.fr[monthIndex]} ${year}`;
                            break;
                        case 'es':
                            result[lang] = `${monthNames.es[monthIndex]} de ${year}`;
                            break;
                        case 'de':
                            result[lang] = `${monthNames.de[monthIndex]} ${year}`;
                            break;
                        default:
                            result[lang] = `${monthNames.en[monthIndex]} ${year}`;
                    }
                }
            } else {
                // Year only - same for all languages
                result[lang] = year;
            }
        });

        return result;
    }

    // Enhanced extraction methods based on 2024 research
    extractPublicationDateEnhanced(lines, fullText) {
        console.log('🔍 Enhanced date extraction...');
        
        // Enhanced date patterns with priority order
        const highPriorityPatterns = [
            // Published online patterns (highest priority)
            /published\s+online[:\s]*([0-9]{1,2}[\s\-\/]*[a-zA-Z]*[\s\-\/]*[0-9]{4})/i,
            /available\s+online[:\s]*([0-9]{1,2}[\s\-\/]*[a-zA-Z]*[\s\-\/]*[0-9]{4})/i,
            
            // Published patterns
            /published[:\s]*([0-9]{1,2}[\s\-\/]*[a-zA-Z]*[\s\-\/]*[0-9]{4})/i,
            
            // Accepted patterns (lower priority)
            /accepted[:\s]*([0-9]{1,2}[\s\-\/]*[a-zA-Z]*[\s\-\/]*[0-9]{4})/i,
            
            // Received patterns (lowest priority)
            /received[:\s]*([0-9]{1,2}[\s\-\/]*[a-zA-Z]*[\s\-\/]*[0-9]{4})/i
        ];
        
        // Search entire document for date patterns
        for (const pattern of highPriorityPatterns) {
            const matches = fullText.matchAll(new RegExp(pattern.source, 'gi'));
            for (const match of matches) {
                const dateStr = match[1];
                const formatted = this.formatDate(dateStr);
                if (formatted && formatted !== '2024-01-01') {
                    console.log(`✅ Found date: ${formatted} (pattern: ${match[0]})`);
                    return formatted;
                }
            }
        }
        
        return this.extractPublicationDate(lines, fullText); // Fallback to original method
    }

    extractAbstractEnhanced(lines, fullText) {
        console.log('🔍 Enhanced abstract extraction...');
        
        // Multiple abstract detection patterns
        const abstractPatterns = [
            /abstract[:\s]*\n(.*?)(?=\n\s*(?:keywords|introduction|1\.|background))/is,
            /abstract[:\s]*(.*?)(?=\n\s*(?:keywords|introduction|1\.|background))/is,
            /summary[:\s]*\n(.*?)(?=\n\s*(?:keywords|introduction|1\.))/is
        ];
        
        // Try each pattern
        for (const pattern of abstractPatterns) {
            const match = fullText.match(pattern);
            if (match && match[1]) {
                let abstract = match[1].trim();
                abstract = abstract.replace(/\s+/g, ' '); // Clean whitespace
                if (abstract.length > 100 && abstract.length < 2000) {
                    console.log(`✅ Found enhanced abstract (${abstract.length} chars)`);
                    return abstract;
                }
            }
        }
        
        return this.extractAbstract(lines); // Fallback to original method
    }

    extractQuantitativeResults(lines, fullText) {
        console.log('🔍 Extracting quantitative results...');
        
        const resultPatterns = [
            // Results section patterns
            /results[:\s]*\n(.*?)(?=\n\s*(?:discussion|conclusion|limitations|references))/is,
            /findings[:\s]*\n(.*?)(?=\n\s*(?:discussion|conclusion|limitations))/is,
            
            // Conclusion patterns
            /conclusion[s]?[:\s]*\n(.*?)(?=\n\s*(?:acknowledgments|references|funding))/is,
            
            // Discussion patterns that might contain key results
            /discussion[:\s]*\n(.*?)(?=\n\s*(?:conclusion|limitations|references))/is
        ];
        
        let results = [];
        
        for (const pattern of resultPatterns) {
            const match = fullText.match(pattern);
            if (match && match[1]) {
                const section = match[1].trim();
                
                // Extract sentences with numbers, percentages, or statistical terms
                const quantitativeSentences = section.match(/[^.!?]*(?:\d+(?:\.\d+)?%?|\bp\s*[<>=]\s*\d+|\bCI\b|\bOR\b|\bRR\b|\bR[₀0]\b)[^.!?]*[.!?]/g);
                
                if (quantitativeSentences) {
                    results.push(...quantitativeSentences);
                }
            }
        }
        
        const uniqueResults = [...new Set(results)];
        console.log(`✅ Found ${uniqueResults.length} quantitative result sentences`);
        return uniqueResults.join(' ').substring(0, 1000); // Limit length
    }

    extractStatisticalFindings(fullText) {
        console.log('🔍 Extracting statistical findings...');
        
        const statisticalPatterns = [
            // Percentages
            /(\d+(?:\.\d+)?%)/g,
            
            // P-values
            /(p\s*[<>=]\s*\d+(?:\.\d+)?)/gi,
            
            // Confidence intervals
            /(95%\s*CI[:\s]*\d+(?:\.\d+)?[-–]\d+(?:\.\d+)?)/gi,
            
            // R0 values
            /(R[₀0]\s*[=:]\s*\d+(?:\.\d+)?)/gi,
            
            // Odds ratios / Risk ratios
            /((?:OR|RR)\s*[=:]\s*\d+(?:\.\d+)?)/gi,
            
            // Reduction/increase patterns
            /(\d+(?:\.\d+)?%?\s*(?:reduction|decrease|increase|improvement))/gi,
            
            // Fold changes
            /(\d+(?:\.\d+)?[-–]fold)/gi,
            
            // Sample sizes
            /(n\s*=\s*\d+)/gi
        ];
        
        let findings = [];
        
        for (const pattern of statisticalPatterns) {
            const matches = fullText.matchAll(pattern);
            for (const match of matches) {
                findings.push(match[1] || match[0]);
            }
        }
        
        const uniqueFindings = [...new Set(findings)];
        console.log(`✅ Found ${uniqueFindings.length} statistical findings`);
        return uniqueFindings.slice(0, 20); // Limit to top 20 findings
    }

    extractTableResults(fullText) {
        console.log('🔍 Extracting table results...');
        
        const tablePatterns = [
            // Table references with results
            /table\s+\d+[^.]*(?:\d+(?:\.\d+)?%|\bp\s*[<>=])/gi,
            
            // Tabular data patterns
            /(\d+(?:\.\d+)?)\s+\(\s*(\d+(?:\.\d+)?%?)\s*\)/g,
            
            // Results in parentheses
            /\(\s*(\d+(?:\.\d+)?%?[^)]*)\s*\)/g
        ];
        
        let tableResults = [];
        
        for (const pattern of tablePatterns) {
            const matches = fullText.matchAll(pattern);
            for (const match of matches) {
                if (match[0].length < 100) { // Avoid capturing too much text
                    tableResults.push(match[0]);
                }
            }
        }
        
        const uniqueTableResults = [...new Set(tableResults)];
        console.log(`✅ Found ${uniqueTableResults.length} table result patterns`);
        return uniqueTableResults.slice(0, 15); // Limit results
    }

    extractDOI(lines, fullText) {
        console.log('🔍 Extracting DOI...');
        
        // DOI patterns to match
        const doiPatterns = [
            /doi:\s*(\S+)/gi,
            /https?:\/\/doi\.org\/([^\s]+)/gi,
            /10\.\d{4,}\/[^\s]+/g
        ];
        
        // Search in lines first
        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            if (lowerLine.includes('doi')) {
                for (const pattern of doiPatterns) {
                    const matches = line.matchAll(pattern);
                    for (const match of matches) {
                        let doi = match[1] || match[0];
                        if (doi.startsWith('10.')) {
                            console.log(`✅ Found DOI: ${doi}`);
                            return `https://doi.org/${doi}`;
                        }
                    }
                }
            }
        }
        
        // Search in full text
        for (const pattern of doiPatterns) {
            const matches = fullText.matchAll(pattern);
            for (const match of matches) {
                let doi = match[1] || match[0];
                if (doi.startsWith('10.')) {
                    console.log(`✅ Found DOI: ${doi}`);
                    return `https://doi.org/${doi}`;
                }
            }
        }
        
        console.log('❌ No DOI found');
        return null;
    }

    async generateFactualAbstractFromPDF(pdfContent, serviceInfo) {
        const { service } = serviceInfo;
        const apiKey = process.env[service.envVar];
        
        const prompt = PromptBuilder.buildFactualAbstractPrompt(pdfContent);

        const response = await this.llmManager.makeRequest(serviceInfo, prompt, { maxTokens: 250, temperature: 0.3 });
        return ContentSanitizer.sanitizeAbstract(response);
    }

    async callAnthropicAPI(prompt, apiKey, model) {
        const requestData = JSON.stringify({
            model: model,
            max_tokens: 250,
            messages: [{ role: "user", content: prompt }]
        });

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.anthropic.com',
                port: 443,
                path: '/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Length': Buffer.byteLength(requestData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.content && response.content[0]) {
                            resolve(response.content[0].text.trim());
                        } else {
                            reject(new Error('Invalid Anthropic response'));
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

    async callOpenAIAPI(prompt, apiKey, model) {
        const requestData = JSON.stringify({
            model: model,
            messages: [
                { role: "system", content: "You are a factual academic abstract writer." },
                { role: "user", content: prompt }
            ],
            max_tokens: 250,
            temperature: 0.3
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
                            reject(new Error('Invalid OpenAI response'));
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
}

module.exports = PDFAbstractGenerator;

// Run the generator
const generator = new PDFAbstractGenerator();
generator.processPDFs().catch(console.error);