/**
 * Enhanced PDF Content Extractor with Python OCR Integration
 * Combines Node.js pdf-parse with Python OCR for maximum accuracy
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const PDFExtractor = require('./pdf-extractor');

class EnhancedPDFExtractor extends PDFExtractor {
    
    /**
     * Check if Python dependencies are installed
     * @returns {Promise<{available: boolean, missing: string[]}>}
     */
    static async checkPythonDependencies() {
        return new Promise((resolve) => {
            const checkScript = `
import sys
missing = []

try:
    import fitz
    # Check if it's the correct PyMuPDF version
    if not hasattr(fitz, 'open') or not hasattr(fitz, 'version'):
        missing.append('pymupdf>=1.24')
except ImportError:
    missing.append('pymupdf>=1.24')

try:
    import PIL
except ImportError:
    missing.append('pillow')

try:
    import pytesseract
except ImportError:
    missing.append('pytesseract')

if missing:
    print("MISSING:" + ",".join(missing))
    sys.exit(1)
else:
    print("OK")
    sys.exit(0)
`;
            
            const pythonProcess = spawn('python3', ['-c', checkScript], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            pythonProcess.on('close', (code) => {
                if (code === 0 && stdout.trim() === 'OK') {
                    resolve({ available: true, missing: [] });
                } else {
                    const missing = stdout.includes('MISSING:') 
                        ? stdout.split('MISSING:')[1].trim().split(',')
                        : ['pymupdf>=1.24', 'pillow', 'pytesseract'];
                    resolve({ available: false, missing });
                }
            });
            
            pythonProcess.on('error', () => {
                resolve({ available: false, missing: ['python3'] });
            });
        });
    }

    /**
     * Extract text using Python OCR pipeline for better accuracy
     * @param {string} pdfPath - Path to PDF file
     * @param {string} pages - Page range (e.g., "1-3") or null for all pages
     * @returns {Promise<string>} - Extracted text
     */
    static async extractWithPythonOCR(pdfPath, pages = null) {
        return new Promise((resolve, reject) => {
            const pythonScript = path.join(__dirname, '../pdf_reader_pipeline.py');
            // Ensure we're using the correct absolute path
            const absolutePdfPath = path.isAbsolute(pdfPath) ? pdfPath : path.resolve(pdfPath);
            const args = [pythonScript, absolutePdfPath];
            
            if (pages) {
                args.push('--pages', pages);
            }
            
            // Use optimal zoom for OCR quality
            args.push('--zoom', '2.5');
            
            const pythonProcess = spawn('python3', args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
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
                    
                    try {
                        const extractedText = fs.readFileSync(txtPath, 'utf8');
                        
                        // Validate that we got meaningful content
                        if (!extractedText || extractedText.trim().length < 10) {
                            reject(new Error(`Python OCR generated empty or minimal content. File: ${txtPath}, Length: ${extractedText ? extractedText.length : 0}`));
                            return;
                        }
                        
                        // Clean up the generated txt file
                        fs.unlinkSync(txtPath);
                        console.log(`✅ OCR extracted ${extractedText.length} characters of text`);
                        resolve(extractedText);
                    } catch (error) {
                        reject(new Error(`Failed to read OCR output from ${txtPath}: ${error.message}`));
                    }
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
    
    /**
     * Enhanced PDF metadata extraction using Python OCR as primary method
     * @param {string} pdfPath - Path to PDF file
     * @param {string} filename - Filename for context
     * @returns {Promise<Object>} - Extracted metadata
     */
    static async extractMetadataEnhanced(pdfPath, filename = '') {
        try {
            console.log(`🔍 OCR extraction starting for: ${filename}`);
            
            // Check Python dependencies first
            console.log(`🔧 Checking Python dependencies...`);
            const depCheck = await this.checkPythonDependencies();
            
            if (!depCheck.available) {
                console.warn(`⚠️ Python dependencies missing: ${depCheck.missing.join(', ')}`);
                console.warn(`📝 Install with: pip install --force-reinstall --no-cache-dir "pymupdf>=1.24" pillow pytesseract`);
                console.warn(`🔄 Falling back to Node.js extraction...`);
                
                // Direct fallback to Node.js
                const pdf = require('pdf-parse');
                const dataBuffer = fs.readFileSync(pdfPath);
                const pdfData = await pdf(dataBuffer);
                const lines = pdfData.text.split('\n');
                
                const result = {
                    title: this.extractTitle(lines, pdfData.text),
                    journal: this.extractJournal(lines, pdfData.text, filename),
                    date: this.extractPublicationDate(lines, pdfData.text),
                    doi: this.extractDOI(lines, pdfData.text),
                    abstract: this.extractAbstract(lines, pdfData.text),
                    quantitativeResults: this.extractQuantitativeResults(lines, pdfData.text),
                    statisticalFindings: this.extractStatisticalFindings(pdfData.text),
                    fullText: pdfData.text,
                    extractionMethod: ['nodejs_dependency_fallback']
                };
                
                console.log(`✅ Node.js dependency fallback extraction completed`);
                return result;
            }
            
            console.log(`✅ Python dependencies available`);
            
            // Primary Method: Python OCR extraction (full document)
            try {
                console.log(`🐍 Starting Python OCR extraction (full document)...`);
                const ocrText = await this.extractWithPythonOCR(pdfPath, null); // Extract all pages
                const ocrLines = ocrText.split('\n');
                
                const result = {
                    title: this.extractTitle(ocrLines, ocrText),
                    journal: this.extractJournal(ocrLines, ocrText, filename),
                    date: this.extractPublicationDate(ocrLines, ocrText),
                    doi: this.extractDOI(ocrLines, ocrText),
                    abstract: this.extractAbstract(ocrLines, ocrText),
                    quantitativeResults: this.extractQuantitativeResults(ocrLines, ocrText),
                    statisticalFindings: this.extractStatisticalFindings(ocrText),
                    fullText: ocrText,
                    extractionMethod: ['python_ocr']
                };
                
                console.log(`✅ Python OCR extraction completed successfully`);
                return result;
                
            } catch (error) {
                console.warn(`⚠️ Python OCR extraction failed: ${error.message}`);
                
                // Fallback: Node.js pdf-parse
                console.log(`📄 Falling back to Node.js extraction...`);
                const pdf = require('pdf-parse');
                const dataBuffer = fs.readFileSync(pdfPath);
                const pdfData = await pdf(dataBuffer);
                const lines = pdfData.text.split('\n');
                
                const result = {
                    title: this.extractTitle(lines, pdfData.text),
                    journal: this.extractJournal(lines, pdfData.text, filename),
                    date: this.extractPublicationDate(lines, pdfData.text),
                    doi: this.extractDOI(lines, pdfData.text),
                    abstract: this.extractAbstract(lines, pdfData.text),
                    quantitativeResults: this.extractQuantitativeResults(lines, pdfData.text),
                    statisticalFindings: this.extractStatisticalFindings(pdfData.text),
                    fullText: pdfData.text,
                    extractionMethod: ['nodejs_fallback']
                };
                
                console.log(`✅ Node.js fallback extraction completed`);
                return result;
            }
            
        } catch (error) {
            console.error(`❌ All extraction methods failed: ${error.message}`);
            throw error;
        }
    }
    
}

module.exports = EnhancedPDFExtractor;