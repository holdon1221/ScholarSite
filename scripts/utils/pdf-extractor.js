/**
 * PDF Content Extractor
 * Specialized utilities for extracting and processing PDF content
 */

const TextProcessor = require('./text-processor');
const fs = require('fs');
const path = require('path');

class PDFExtractor {
    static scieJournals = null;
    static journalIndex = null;  // Fast lookup index
    
    /**
     * Load SCIE journal list from CSV file and build dynamic patterns
     */
    static loadSCIEJournals() {
        if (this.scieJournals !== null) {
            return this.scieJournals;
        }
        
        try {
            const csvPath = path.join(__dirname, '../../data/SCIE_list.csv');
            const csvContent = fs.readFileSync(csvPath, 'utf8');
            const lines = csvContent.split('\n');
            
            this.scieJournals = [];
            this.journalKeywords = new Set();
            this.journalPatterns = new Set();
            
            // Skip header line and process journal titles
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    // Parse CSV line and extract journal title (first column)
                    const match = line.match(/^"([^"]+)"/);
                    if (match && match[1]) {
                        const journalTitle = match[1].trim();
                        this.scieJournals.push({
                            title: journalTitle,
                            titleLower: journalTitle.toLowerCase(),
                            // Store variations for matching
                            variations: this.generateJournalVariations(journalTitle)
                        });
                        
                        // Extract keywords from actual SCIE journals
                        this.extractKeywordsFromJournal(journalTitle);
                    }
                }
            }
            
            // Build fast lookup index
            this.buildJournalIndex();
            
            console.log(`Loaded ${this.scieJournals.length} SCIE journals`);
            console.log(`Extracted ${this.journalKeywords.size} unique keywords from SCIE list`);
        } catch (error) {
            console.warn('Could not load SCIE journal list:', error.message);
            this.scieJournals = [];
            this.journalKeywords = new Set();
        }
        
        return this.scieJournals;
    }
    
    /**
     * Build fast lookup index for journal matching
     */
    static buildJournalIndex() {
        this.journalIndex = new Map();
        
        for (const journal of this.scieJournals) {
            // Index by exact title
            this.journalIndex.set(journal.titleLower, journal);
            
            // Index by variations (limit to first 3 to avoid memory explosion)
            for (let i = 0; i < Math.min(3, journal.variations.length); i++) {
                const variation = journal.variations[i];
                if (!this.journalIndex.has(variation)) {
                    this.journalIndex.set(variation, journal);
                }
            }
        }
        
        console.log(`Built fast index with ${this.journalIndex.size} entries`);
    }
    
    /**
     * Fast candidate matching using index (much faster than nested loops)
     */
    static fastMatchCandidates(candidates) {
        const matches = [];
        
        for (const candidate of candidates) {
            const candidateLower = candidate.toLowerCase();
            
            // 1. Try exact lookup first (O(1))
            const exactMatch = this.journalIndex.get(candidateLower);
            if (exactMatch) {
                matches.push({
                    journal: exactMatch.title,
                    candidate: candidate,
                    score: 100,
                    matchType: 'exact'
                });
                continue;
            }
            
            // 2. Enhanced substring matching (both directions)
            let bestMatch = null;
            let bestScore = 0;
            
            for (const [indexKey, journal] of this.journalIndex) {
                let score = 0;
                let matchType = '';
                
                // Check if candidate contains journal name
                if (candidateLower.includes(indexKey) && indexKey.length > 8) {
                    score = Math.min(85 * (indexKey.length / candidateLower.length), 85);
                    matchType = 'contains';
                }
                // Check if journal name contains candidate  
                else if (indexKey.includes(candidateLower) && candidateLower.length > 8) {
                    score = Math.min(80 * (candidateLower.length / indexKey.length), 80);
                    matchType = 'substring';
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { journal: journal.title, candidate, score, matchType };
                }
            }
            
            if (bestMatch && bestScore > 60) {
                matches.push(bestMatch);
                continue;
            }
            
            // 3. Try fuzzy matching with top journals
            this.limitedFuzzyMatching(candidate, candidateLower, matches);
        }
        
        return matches;
    }
    
    /**
     * Limited fuzzy matching to prevent performance issues
     */
    static limitedFuzzyMatching(candidate, candidateLower, matches) {
        let checkedCount = 0;
        const MAX_FUZZY_CHECKS = 200; // Increased for better coverage
        
        // Focus on common journal patterns first
        const priorityJournals = this.scieJournals.filter(j => 
            j.titleLower.includes('physical review') ||
            j.titleLower.includes('nature') ||
            j.titleLower.includes('science') ||
            j.titleLower.includes('plos') ||
            j.titleLower.includes('nanoscale') ||
            j.titleLower.includes('optica') ||
            j.titleLower.includes('mathematical')
        );
        
        // Check priority journals first
        for (const journal of priorityJournals) {
            const similarity = this.calculateStringSimilarity(candidateLower, journal.titleLower);
            if (similarity > 0.7) {
                matches.push({
                    journal: journal.title,
                    candidate: candidate,
                    score: similarity * 90,
                    matchType: 'fuzzy'
                });
                return; // Found a good match
            }
        }
        
        // Then check other journals
        for (const journal of this.scieJournals) {
            if (checkedCount++ > MAX_FUZZY_CHECKS) break;
            
            const similarity = this.calculateStringSimilarity(candidateLower, journal.titleLower);
            if (similarity > 0.75) {
                matches.push({
                    journal: journal.title,
                    candidate: candidate,
                    score: similarity * 90,
                    matchType: 'fuzzy'
                });
                break;
            }
        }
    }
    
    /**
     * Extract keywords and patterns from actual SCIE journal titles
     */
    static extractKeywordsFromJournal(title) {
        const titleLower = title.toLowerCase();
        const words = titleLower.split(/\s+/);
        
        // Extract significant words (longer than 3 chars, not common words)
        const commonWords = new Set(['the', 'of', 'and', 'for', 'in', 'on', 'at', 'to', 'a', 'an']);
        
        words.forEach(word => {
            const cleanWord = word.replace(/[^\w]/g, '');
            if (cleanWord.length > 3 && !commonWords.has(cleanWord)) {
                this.journalKeywords.add(cleanWord);
            }
        });
        
        // Extract structural patterns
        if (titleLower.includes('journal of')) {
            this.journalPatterns.add('journal_of');
        }
        if (titleLower.includes('letters')) {
            this.journalPatterns.add('letters');
        }
        if (titleLower.includes('reports')) {
            this.journalPatterns.add('reports');
        }
        if (titleLower.includes('review')) {
            this.journalPatterns.add('review');
        }
        if (titleLower.includes('proceedings')) {
            this.journalPatterns.add('proceedings');
        }
        if (titleLower.includes('communications')) {
            this.journalPatterns.add('communications');
        }
    }
    
    /**
     * Generate common variations of journal names for matching
     */
    static generateJournalVariations(title) {
        const variations = new Set();
        variations.add(title.toLowerCase());
        
        // Common abbreviations and variations
        const titleLower = title.toLowerCase();
        
        // Add abbreviated forms
        variations.add(titleLower.replace(/\bjournal\b/g, 'j'));
        variations.add(titleLower.replace(/\bjournal\b/g, 'j.'));
        variations.add(titleLower.replace(/\breview\b/g, 'rev'));
        variations.add(titleLower.replace(/\breview\b/g, 'rev.'));
        variations.add(titleLower.replace(/\bphysical\b/g, 'phys'));
        variations.add(titleLower.replace(/\bphysical\b/g, 'phys.'));
        variations.add(titleLower.replace(/\bletters\b/g, 'lett'));
        variations.add(titleLower.replace(/\bletters\b/g, 'lett.'));
        variations.add(titleLower.replace(/\bletters\b/g, 'let'));
        variations.add(titleLower.replace(/\bamerican\b/g, 'am'));
        variations.add(titleLower.replace(/\bamerican\b/g, 'am.'));
        variations.add(titleLower.replace(/\bsociety\b/g, 'soc'));
        variations.add(titleLower.replace(/\bsociety\b/g, 'soc.'));
        variations.add(titleLower.replace(/\bapplied\b/g, 'appl'));
        variations.add(titleLower.replace(/\bapplied\b/g, 'appl.'));
        
        // Remove common words
        variations.add(titleLower.replace(/\bthe\b/g, '').replace(/\s+/g, ' ').trim());
        variations.add(titleLower.replace(/\band\b/g, '&').replace(/\s+/g, ' ').trim());
        
        // Add version without punctuation
        variations.add(titleLower.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim());
        
        return Array.from(variations).filter(v => v.length > 3);
    }

    static skipPatterns = [
        /^doi:/i,
        /^issn/i,
        /^volume/i,
        /^number/i,
        /^page/i,
        /^pp\./i,
        /^published/i,
        /^received/i,
        /^accepted/i,
        /^available online/i,
        /^contents lists/i,
        /^sciencedirect/i,
        /^http[s]?:\/\//i,
        /^www\./i,
        /^©/i,
        /^\d{4}/i,
        /^\|/i,
        /^research article/i,
        /^original article/i,
        /^article/i,
        /^abstract/i,
        /^keywords/i,
        /^introduction/i,
        /^methods/i,
        /^author/i,
        /^corresponding/i,
        /^email/i,
        /^affiliation/i,
        /^department/i,
        /^university/i,
        /^college/i,
        /^school/i,
        /received.*accepted/i,
        /accepted.*published/i,
        /^\d{1,2}\s+\w+\s+\d{4}/i,
        /contents.*available/i,
        /science.*direct/i,
        /mathematics.*computers/i
    ];

    /**
     * Extract title from PDF lines using multiple strategies
     */
    static extractTitle(lines, fullText) {
        const cleanedLines = lines.map(line => line.trim()).filter(line => line.length > 0);
        const titleCandidates = [];
        
        // Strategy 1: Look for title-like lines in first 30 lines
        for (let i = 0; i < Math.min(30, cleanedLines.length); i++) {
            const line = cleanedLines[i];
            const lowerLine = line.toLowerCase();
            
            // Skip if too short or too long
            if (line.length < 25 || line.length > 300) continue;
            
            // Skip if matches skip patterns
            if (this.skipPatterns.some(pattern => pattern.test(line))) continue;
            
            // Skip if looks like common non-journal text patterns
            if (/\b(author|email|address|affiliation|corresponding|department|university|received|accepted|published|doi|issn|volume|issue|page)\b/i.test(lowerLine)) continue;
            
            // Skip if looks like metadata
            if (this.isMetadataLine(lowerLine)) continue;
            
            // Skip if mostly numbers or special characters
            const alphaCount = (line.match(/[a-zA-Z]/g) || []).length;
            if (alphaCount < line.length * 0.6) continue;
            
            // Look for title characteristics
            const hasCapitalizedWords = /[A-Z][a-z]/.test(line);
            const hasMultipleWords = line.split(/\s+/).length >= 4;
            const endsWithPeriod = line.endsWith('.');
            
            if (hasCapitalizedWords && hasMultipleWords && !endsWithPeriod) {
                titleCandidates.push({
                    text: line,
                    score: this.calculateTitleScore(line, i),
                    position: i
                });
            }
        }
        
        // Strategy 2: Look for multi-line titles
        titleCandidates.push(...this.findMultiLineTitles(cleanedLines));
        
        // Strategy 3: Look for text after specific keywords
        titleCandidates.push(...this.findTitlesAfterKeywords(cleanedLines));
        
        // Sort by score and return best candidate
        titleCandidates.sort((a, b) => b.score - a.score);
        
        if (titleCandidates.length > 0) {
            let title = this.cleanTitle(titleCandidates[0].text);
            
            // If still looks like spaced text, try to fix it more aggressively
            if (title.includes(' a ') || title.includes(' i ') || title.includes(' o ')) {
                title = this.fixSpacedText(title);
            }
            
            return title;
        }
        
        return '';
    }

    /**
     * Check if line looks like metadata
     */
    static isMetadataLine(lowerLine) {
        const metadataKeywords = [
            'journal', 'volume', 'number', 'page', 'doi', 'issn',
            'published', 'received', 'accepted', 'available', 'contents',
            'sciencedirect', 'aims', 'springer', 'elsevier', 'wiley'
        ];
        
        return metadataKeywords.some(keyword => lowerLine.includes(keyword));
    }

    /**
     * Find multi-line title candidates
     */
    static findMultiLineTitles(cleanedLines) {
        const candidates = [];
        
        for (let i = 0; i < Math.min(25, cleanedLines.length - 1); i++) {
            const line1 = cleanedLines[i];
            const line2 = cleanedLines[i + 1];
            
            if (line1.length > 20 && line2.length > 20 && 
                !line1.toLowerCase().includes('journal') && 
                !line2.toLowerCase().includes('journal')) {
                
                const combined = `${line1} ${line2}`;
                if (combined.length > 30 && combined.length < 250) {
                    candidates.push({
                        text: combined,
                        score: this.calculateTitleScore(combined, i) + 10, // Bonus for multi-line
                        position: i
                    });
                }
            }
        }
        
        return candidates;
    }

    /**
     * Find titles after specific keywords
     */
    static findTitlesAfterKeywords(cleanedLines) {
        const candidates = [];
        const afterKeywords = ['research article', 'original article', 'article'];
        
        for (let i = 0; i < Math.min(20, cleanedLines.length); i++) {
            const line = cleanedLines[i].toLowerCase();
            
            if (afterKeywords.some(keyword => line.includes(keyword))) {
                for (let j = i + 1; j < Math.min(i + 5, cleanedLines.length); j++) {
                    const candidate = cleanedLines[j];
                    if (candidate.length > 30 && candidate.length < 250) {
                        candidates.push({
                            text: candidate,
                            score: this.calculateTitleScore(candidate, j) + 5,
                            position: j
                        });
                    }
                }
            }
        }
        
        return candidates;
    }

    /**
     * Calculate score for title candidate
     */
    static calculateTitleScore(text, position) {
        let score = 0;
        
        // Prefer earlier positions
        score += Math.max(0, 50 - position * 2);
        
        // Prefer certain length ranges
        if (text.length >= 50 && text.length <= 150) score += 20;
        if (text.length >= 30 && text.length <= 200) score += 10;
        
        // Prefer proper capitalization
        if (/^[A-Z]/.test(text)) score += 10;
        if (/[A-Z][a-z]/.test(text)) score += 5;
        
        // Prefer academic words
        const academicWords = [
            'effect', 'impact', 'analysis', 'study', 'model', 'evaluation', 
            'assessment', 'investigation', 'research', 'application', 'method',
            'approach', 'development', 'implementation', 'optimization', 'control'
        ];
        academicWords.forEach(word => {
            if (text.toLowerCase().includes(word)) score += 3;
        });
        
        // Prefer medical/scientific terms
        const scientificTerms = [
            'covid', 'virus', 'vaccination', 'disease', 'transmission', 
            'mathematical', 'statistical', 'clinical', 'epidemiological'
        ];
        scientificTerms.forEach(term => {
            if (text.toLowerCase().includes(term)) score += 5;
        });
        
        // Penalize if looks like metadata
        if (this.isMetadataLine(text.toLowerCase())) score -= 30;
        
        // Penalize if mostly numbers
        const numberCount = (text.match(/\d/g) || []).length;
        if (numberCount > text.length * 0.3) score -= 20;
        
        return score;
    }

    /**
     * Fix spaced text issues common in PDFs
     */
    static fixSpacedText(title) {
        const words = title.split(' ');
        const fixedWords = [];
        
        for (let i = 0; i < words.length; i++) {
            let word = words[i];
            
            // If this is a single character and the next few are also single chars, combine them
            if (word.length === 1 && i < words.length - 1) {
                let combined = word;
                let j = i + 1;
                
                // Look ahead for more single characters
                while (j < words.length && words[j].length === 1) {
                    combined += words[j];
                    j++;
                }
                
                // If we combined multiple single chars, use the combined version
                if (combined.length > 1) {
                    fixedWords.push(combined);
                    i = j - 1; // Skip the chars we just combined
                } else {
                    fixedWords.push(word);
                }
            } else {
                fixedWords.push(word);
            }
        }
        
        return fixedWords.join(' ');
    }

    /**
     * Clean and normalize title text
     */
    static cleanTitle(title) {
        // Remove extra spaces and fix common issues
        title = title.replace(/\s+/g, ' ').trim();
        
        // Fix PDF parsing spacing issues
        title = this.fixCommonSpacingIssues(title);
        
        // Fix common concatenation issues
        title = title.replace(/([a-z])([A-Z])/g, '$1 $2');
        title = title.replace(/([a-z])(\d)/g, '$1 $2');
        title = title.replace(/(\d)([A-Z])/g, '$1 $2');
        
        // Fix specific common concatenations
        title = this.fixSpecificConcatenations(title);
        
        // Remove common prefixes/suffixes
        title = title.replace(/^(The|A|An)\s+/i, '');
        title = title.replace(/\s+\|\s*$/, '');
        title = title.replace(/\s*\(\d{4}\)\s*$/, '');
        title = title.replace(/\s*\.\s*$/, '');
        
        // Remove metadata patterns
        title = title.replace(/^contents\s+lists\s+available\s+at\s+science\s+direct\s*/i, '');
        title = title.replace(/^received:.*accepted:.*$/i, '');
        title = title.replace(/^\d{1,2}\s+\w+\s+\d{4}.*$/i, '');
        
        // Clean up extra spaces again
        title = title.replace(/\s+/g, ' ').trim();
        
        // Fix repeated words
        title = title.replace(/\b(\w+)\s+\1\b/gi, '$1');
        
        // Capitalize first letter
        if (title.length > 0) {
            title = title.charAt(0).toUpperCase() + title.slice(1);
        }
        
        return title;
    }

    /**
     * Fix common spacing issues in PDF text
     */
    static fixCommonSpacingIssues(title) {
        const spacingFixes = [
            [/c\s+o\s+n\s+t\s+e\s+n\s+t\s+s/gi, 'contents'],
            [/l\s+i\s+s\s+t\s+s/gi, 'lists'],
            [/a\s+v\s+a\s+i\s+l\s+a\s+b\s+l\s+e/gi, 'available'],
            [/s\s+c\s+i\s+e\s+n\s+c\s+e/gi, 'science'],
            [/d\s+i\s+r\s+e\s+c\s+t/gi, 'direct'],
            [/m\s+a\s+t\s+h\s+e\s+m\s+a\s+t\s+i\s+c\s+s/gi, 'mathematics'],
            [/c\s+o\s+m\s+p\s+u\s+t\s+e\s+r\s+s/gi, 'computers'],
            [/s\s+i\s+m\s+u\s+l\s+a\s+t\s+i\s+o\s+n/gi, 'simulation'],
            [/e\s+s\s+t\s+i\s+m\s+a\s+t\s+i\s+n\s+g/gi, 'estimating'],
            [/t\s+r\s+a\s+n\s+s\s+m\s+i\s+s\s+s\s+i\s+o\s+n/gi, 'transmission'],
            [/m\s+a\s+t\s+h\s+e\s+m\s+a\s+t\s+i\s+c\s+a\s+l/gi, 'mathematical'],
            [/v\s+a\s+c\s+c\s+i\s+n\s+a\s+t\s+i\s+o\s+n/gi, 'vaccination']
        ];

        for (const [pattern, replacement] of spacingFixes) {
            title = title.replace(pattern, replacement);
        }

        return title;
    }

    /**
     * Fix specific concatenation patterns
     */
    static fixSpecificConcatenations(title) {
        const concatenationFixes = [
            [/effectof/gi, 'effect of'],
            [/modelof/gi, 'model of'],
            [/impactof/gi, 'impact of'],
            [/analysisof/gi, 'analysis of'],
            [/studyof/gi, 'study of'],
            [/transmissionin/gi, 'transmission in'],
            [/vaccinationon/gi, 'vaccination on'],
            [/measureson/gi, 'measures on'],
            [/controlmeasures/gi, 'control measures'],
            [/hospitaland/gi, 'hospital and'],
            [/tertiaryhospital/gi, 'tertiary hospital'],
            [/SouthKorea/gi, 'South Korea'],
            [/COVID-19/gi, 'COVID-19'],
            [/mathematicalmodel/gi, 'mathematical model']
        ];

        for (const [pattern, replacement] of concatenationFixes) {
            title = title.replace(pattern, replacement);
        }

        return title;
    }

    /**
     * Extract journal name from PDF content using SCIE journal list
     */
    static extractJournal(lines, fullText, filename = '') {
        // Load SCIE journal list
        const scieJournals = this.loadSCIEJournals();
        
        if (scieJournals.length === 0) {
            console.warn('SCIE journal list not available, falling back to pattern matching');
            return this.extractJournalFallback(lines, fullText, filename);
        }
        
        // Extract potential journal text candidates from PDF
        const textCandidates = this.extractJournalCandidates(lines, fullText);
        
        // Fast matching using index
        const matches = this.fastMatchCandidates(textCandidates);
        
        // Sort matches by score and return the best one
        if (matches.length > 0) {
            matches.sort((a, b) => b.score - a.score);
            
            // If we have an exact or variation match, strongly prefer it
            const exactMatch = matches.find(m => m.matchType === 'exact' || m.matchType === 'variation');
            if (exactMatch) {
                return exactMatch.journal;
            }
            
            return matches[0].journal;
        }
        
        return 'Unknown Journal';
    }
    
    /**
     * Preprocess PDF text to fix common extraction issues
     */
    static preprocessPDFText(text) {
        // Fix common PDF spacing issues
        text = text.replace(/([a-z])([A-Z])/g, '$1 $2'); // camelCase separation
        text = text.replace(/(\w)([A-Z][a-z])/g, '$1 $2'); // word boundary issues
        text = text.replace(/\s+/g, ' '); // normalize spaces
        
        // Fix common OCR artifacts
        text = text.replace(/\b[IlL](?=[A-Z])/g, ''); // Remove single chars before caps
        text = text.replace(/\b0(?=[A-Z])/g, ''); // Remove zeros before caps
        
        // Fix hyphenated words that got split
        text = text.replace(/(\w)-\s+(\w)/g, '$1$2');
        
        return text.trim();
    }
    
    /**
     * Preprocess line text for better extraction
     */
    static preprocessLineText(line) {
        line = line.trim();
        
        // Remove common PDF artifacts
        line = line.replace(/^\d+\s*/, ''); // Remove line numbers
        line = line.replace(/^\|+\s*/, ''); // Remove leading pipes
        line = line.replace(/\s*\|+$/, ''); // Remove trailing pipes
        
        // Fix spacing issues
        line = line.replace(/\s+/g, ' ');
        
        return line;
    }
    
    /**
     * Enhanced multi-line journal name extraction
     */
    static extractMultiLineJournalNames(cleanedLines, candidates) {
        for (let i = 0; i < cleanedLines.length - 3; i++) {
            const lines = [cleanedLines[i], cleanedLines[i + 1], cleanedLines[i + 2], cleanedLines[i + 3]];
            
            // Skip if any line is too short or contains unwanted content
            if (lines.some(line => line.length < 3 || this.isUnwantedLine(line))) continue;
            
            // Try different combinations
            const combinations = [
                lines[0] + ' ' + lines[1],
                lines[1] + ' ' + lines[2],
                lines[0] + ' ' + lines[1] + ' ' + lines[2],
                lines[1] + ' ' + lines[2] + ' ' + lines[3]
            ];
            
            for (const combo of combinations) {
                const cleaned = this.cleanJournalName(combo);
                if (this.isValidJournalCandidate(cleaned) && this.hasJournalIndicators(cleaned)) {
                    candidates.add(cleaned);
                }
            }
        }
    }
    
    /**
     * Extract journal names from header area
     */
    static extractHeaderJournalNames(cleanedLines, candidates) {
        const headerLines = cleanedLines.slice(0, 30);
        
        for (let i = 0; i < headerLines.length; i++) {
            const line = headerLines[i];
            
            // Skip unwanted lines
            if (this.isUnwantedLine(line)) continue;
            
            const cleaned = this.cleanJournalName(line);
            if (this.isValidJournalCandidate(cleaned)) {
                // Look for journal indicators in this line or surrounding lines
                const context = headerLines.slice(Math.max(0, i - 1), i + 2).join(' ');
                if (this.hasJournalIndicators(cleaned) || this.hasJournalIndicators(context)) {
                    candidates.add(cleaned);
                }
            }
        }
    }
    
    /**
     * Extract journal names from reference sections
     */
    static extractFromReferences(cleanedText, candidates) {
        // Find reference sections
        const refSectionMatch = cleanedText.match(/(?:references|bibliography)[\s\S]*$/i);
        if (!refSectionMatch) return;
        
        const refText = refSectionMatch[0];
        
        // Look for journal names in reference format
        const refPatterns = [
            /\b([A-Z][A-Za-z\s&,\-\.]{8,50})\s+\d{4}/g,
            /\bin\s+([A-Z][A-Za-z\s&,\-\.]{8,50})\s*[,;]/g,
            /\b([A-Z][a-z]+\.\s+[A-Z][a-z]+\.(?:\s+[A-Z][a-z]+\.)?)\s+\d+/g
        ];
        
        for (const pattern of refPatterns) {
            const matches = refText.matchAll(pattern);
            for (const match of matches) {
                if (match[1]) {
                    const cleaned = this.cleanJournalName(match[1]);
                    if (this.isValidJournalCandidate(cleaned)) {
                        candidates.add(cleaned);
                    }
                }
            }
        }
    }
    
    /**
     * Extract journal names from metadata areas
     */
    static extractJournalNamesFromMetadata(cleanedText, candidates) {
        // Look for metadata patterns that often contain journal names
        const metadataPatterns = [
            /©\s*\d{4}\s+([A-Z][A-Za-z\s&,\-\.]{10,50})/g,
            /published\s+by\s+([A-Z][A-Za-z\s&,\-\.]{10,50})/gi,
            /courtesy\s+of\s+([A-Z][A-Za-z\s&,\-\.]{10,50})/gi,
            /source:\s*([A-Z][A-Za-z\s&,\-\.]{10,50})/gi
        ];
        
        for (const pattern of metadataPatterns) {
            const matches = cleanedText.matchAll(pattern);
            for (const match of matches) {
                if (match[1]) {
                    const cleaned = this.cleanJournalName(match[1]);
                    if (this.isValidJournalCandidate(cleaned)) {
                        candidates.add(cleaned);
                    }
                }
            }
        }
    }
    
    /**
     * Check if a line contains unwanted content
     */
    static isUnwantedLine(line) {
        const unwantedPatterns = [
            /^\d+$/,  // Only numbers
            /^page\s+\d+/i,
            /^doi:/i,
            /^issn/i,
            /^abstract/i,
            /^keywords/i,
            /^introduction/i,
            /^references/i,
            /^conclusion/i,
            /^acknowledgment/i,
            /^figure\s+\d+/i,
            /^table\s+\d+/i,
            /^www\./i,
            /^http/i,
            /received.*accepted/i,
            /^[^a-zA-Z]*$/  // No alphabetic characters
        ];
        
        return unwantedPatterns.some(pattern => pattern.test(line.toLowerCase()));
    }
    
    /**
     * Validate if a candidate is a reasonable journal name
     */
    static isValidJournalCandidate(candidate) {
        if (!candidate || typeof candidate !== 'string') return false;
        
        const trimmed = candidate.trim();
        
        // Length checks
        if (trimmed.length < 8 || trimmed.length > 100) return false;
        
        // Must contain letters
        if (!/[a-zA-Z]/.test(trimmed)) return false;
        
        // Should have at least 2 words or be an abbreviation
        const words = trimmed.split(/\s+/);
        if (words.length < 2 && !/[A-Z].*\.[A-Z]/.test(trimmed)) return false;
        
        // Shouldn't be mostly numbers or special characters
        const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
        if (alphaCount < trimmed.length * 0.6) return false;
        
        // Avoid obviously bad candidates
        const badPatterns = [
            /^\d+$/,
            /^[^a-zA-Z]*$/,
            /abstract|keywords|introduction|conclusion|references|figure|table/i,
            /doi:|issn:|www\.|http/i
        ];
        
        return !badPatterns.some(pattern => pattern.test(trimmed));
    }
    
    /**
     * Score candidate quality for ranking
     */
    static scoreCandidate(candidate) {
        let score = 0;
        const lowerCandidate = candidate.toLowerCase();
        
        // Prefer journal-like terms
        if (lowerCandidate.includes('journal')) score += 20;
        if (lowerCandidate.includes('review')) score += 15;
        if (lowerCandidate.includes('letters')) score += 15;
        if (lowerCandidate.includes('proceedings')) score += 10;
        if (lowerCandidate.includes('communications')) score += 10;
        if (lowerCandidate.includes('nature')) score += 25;
        if (lowerCandidate.includes('science')) score += 20;
        if (lowerCandidate.includes('physical')) score += 15;
        if (lowerCandidate.includes('mathematical')) score += 15;
        if (lowerCandidate.includes('applied')) score += 10;
        if (lowerCandidate.includes('international')) score += 10;
        
        // Prefer proper length
        if (candidate.length >= 15 && candidate.length <= 60) score += 10;
        
        // Prefer proper capitalization
        if (/^[A-Z]/.test(candidate)) score += 5;
        if (/[A-Z][a-z]/.test(candidate)) score += 5;
        
        // Penalize obvious non-journal patterns
        if (lowerCandidate.includes('university')) score -= 15;
        if (lowerCandidate.includes('department')) score -= 15;
        if (lowerCandidate.includes('school')) score -= 15;
        if (lowerCandidate.includes('institute') && !lowerCandidate.includes('journal')) score -= 10;
        if (lowerCandidate.includes('foundation')) score -= 10;
        
        return Math.max(0, score);
    }
    
    /**
     * Extract potential journal name candidates from PDF text
     */
    static extractJournalCandidates(lines, fullText) {
        const candidates = new Set();
        
        // Preprocess text to fix common PDF issues
        const cleanedFullText = this.preprocessPDFText(fullText);
        const cleanedLines = lines.map(line => this.preprocessLineText(line));
        
        // Strategy 1: Enhanced journal pattern matching
        const journalPatterns = [
            // High priority: Complete journal titles with common endings
            /\b([A-Z][A-Za-z\s&,\-\.]{10,60})\s+(?:Journal|Letters?|Reports?|Communications?|Reviews?|Proceedings)\b(?:\s*,|\s*Vol|\s*\d{4}|\s*ISSN|\s*pp|\s*Issue|\s*No\.|\s*\(|\s*$)/gi,
            /\bJournal\s+of\s+([A-Z][A-Za-z\s&,\-\.]{8,50})(?:\s*,|\s*Vol|\s*\d{4}|\s*ISSN|\s*pp|\s*Issue|\s*No\.|\s*\(|\s*$)/gi,
            /\b(Reviews?\s+of\s+[A-Z][A-Za-z\s&,\-\.]{8,50})(?:\s*,|\s*Vol|\s*\d{4}|\s*ISSN|\s*pp|\s*Issue|\s*No\.|\s*\(|\s*$)/gi,
            
            // Citation format patterns
            /(?:published|appeared)\s+in\s+([A-Za-z\s&,\-\.]{8,60})(?:\s*,|\s*Vol|\s*\d{4}|\s*ISSN|\s*pp|\s*DOI|$)/gi,
            /cite\s+this\s+article:\s*[^:]*?\d{4}\s+([A-Za-z\s&,\-\.]{8,60})(?:\s*\d|$)/gi,
            
            // Publisher-specific patterns
            /^([A-Za-z\s&,\-\.]{10,60})\s*\|\s*\d{4}/gm,  // Pattern: "Journal Name | 2024"
            /^([A-Za-z\s&,\-\.]{10,60})\s*\d{4}\s*$/gm,   // Pattern: "Journal Name 2024"
            
            // Abbreviated journal names (common in references)
            /\b([A-Z][a-z]{1,8}\.\s+[A-Z][a-z]{1,8}\.(?:\s+[A-Z][a-z]{1,8}\.)?)\s*(?:\d{4}|,|Vol|\d+:|$)/gi,
            
            // Header patterns with volume indicators
            /([A-Z][A-Z\s&,\-]{8,50})\s+(?:VOLUME|VOL)\s*\.?\s*\d+/gi,
            /VOLUME\s*\.?\s*\d+.*?([A-Z][A-Z\s&,\-]{8,50})/gi,
            
            // Multi-word academic titles (broader capture)
            /\b([A-Z][a-z]{3,}(?:\s+(?:of|and|for|in|on|the|&)\s+[A-Z][a-z]{3,}|\s+[A-Z][a-z]{3,}){1,6})(?:\s*,|\s*Vol|\s*\d{4}|\s*ISSN|\s*pp|\s*Issue|\s*No\.|\s*\(|\s*$)/gi,
            
            // Complete sentences that might contain journal names
            /\b([A-Z][A-Za-z\s&,\-\.]{15,80})(?=\s*\.|\s*,\s*\d{4}|\s*Vol|\s*ISSN)/gi
        ];
        
        // Apply patterns to cleaned text
        for (const pattern of journalPatterns) {
            const matches = cleanedFullText.matchAll(pattern);
            for (const match of matches) {
                if (match[1]) {
                    const cleaned = this.cleanJournalName(match[1]);
                    if (this.isValidJournalCandidate(cleaned)) {
                        candidates.add(cleaned);
                    }
                }
            }
        }
        
        // Strategy 2: Enhanced multi-line reconstruction for split journal names
        this.extractMultiLineJournalNames(cleanedLines, candidates);
        
        // Strategy 3: Header-based extraction (common location for journal names)
        this.extractHeaderJournalNames(cleanedLines, candidates);
        
        // Strategy 4: Reference section analysis (reduced weight)
        const refCandidates = new Set();
        this.extractFromReferences(cleanedFullText, refCandidates);
        // Only add reference candidates if we have very few good candidates
        if (candidates.size < 10) {
            Array.from(refCandidates).slice(0, 5).forEach(c => candidates.add(c));
        }
        
        // Strategy 5: Context-aware extraction (looking around publication metadata)
        this.extractJournalNamesFromMetadata(cleanedFullText, candidates);
        
        // Filter and rank candidates by quality
        const validCandidates = Array.from(candidates)
            .filter(candidate => this.isValidJournalCandidate(candidate))
            .map(candidate => ({
                text: candidate,
                score: this.scoreCandidate(candidate)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 30) // Limit to top 30 candidates
            .map(item => item.text);
            
        return validCandidates;
    }
    
    /**
     * Check if text has journal-like indicators using keywords extracted from SCIE list
     */
    static hasJournalIndicators(text) {
        const lowerText = text.toLowerCase();
        
        // Ensure SCIE data is loaded
        if (!this.journalKeywords || this.journalKeywords.size === 0) {
            this.loadSCIEJournals();
        }
        
        // Check against patterns extracted from actual SCIE journals
        return (
            // Check for structural patterns found in SCIE list
            this.journalPatterns.has('journal_of') && /\bjournal\s+of\b/.test(lowerText) ||
            this.journalPatterns.has('letters') && /\bletters?\b/.test(lowerText) ||
            this.journalPatterns.has('reports') && /\breports?\b/.test(lowerText) ||
            this.journalPatterns.has('review') && /\brevie?ws?\b/.test(lowerText) ||
            this.journalPatterns.has('proceedings') && /\bproceedings\b/.test(lowerText) ||
            this.journalPatterns.has('communications') && /\bcommunications?\b/.test(lowerText) ||
            
            // Check for keywords that appear in actual SCIE journals
            this.containsSCIEKeywords(lowerText) ||
            
            // Journal abbreviation patterns (like "Phys. Rev. Lett.")
            /\b[A-Z][a-z]{1,8}\.\s+[A-Z][a-z]{1,8}\./.test(text) ||
            
            // Multi-word academic pattern
            /\b[A-Z][a-z]{4,}\s+[A-Z][a-z]{4,}/.test(text)
        );
    }
    
    /**
     * Check if text contains keywords extracted from SCIE journals
     */
    static containsSCIEKeywords(lowerText) {
        const words = lowerText.split(/\s+/);
        
        // Check if any word matches keywords from SCIE list
        for (const word of words) {
            const cleanWord = word.replace(/[^\w]/g, '');
            if (cleanWord.length > 3 && this.journalKeywords.has(cleanWord)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Enhanced similarity calculation combining multiple algorithms
     */
    static calculateEnhancedSimilarity(str1, str2) {
        // Levenshtein distance
        const levenshtein = this.calculateStringSimilarity(str1, str2);
        
        // Jaccard similarity (word-level)
        const jaccard = this.calculateJaccardSimilarity(str1, str2);
        
        // Normalized character overlap
        const overlap = this.calculateCharacterOverlap(str1, str2);
        
        // Weighted combination (Levenshtein gets highest weight)
        return (levenshtein * 0.5) + (jaccard * 0.3) + (overlap * 0.2);
    }
    
    /**
     * Calculate string similarity using Levenshtein distance
     */
    static calculateStringSimilarity(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        
        if (len1 === 0) return len2 === 0 ? 1 : 0;
        if (len2 === 0) return 0;
        
        const matrix = Array(len2 + 1).fill().map(() => Array(len1 + 1).fill(0));
        
        for (let i = 0; i <= len1; i++) matrix[0][i] = i;
        for (let j = 0; j <= len2; j++) matrix[j][0] = j;
        
        for (let j = 1; j <= len2; j++) {
            for (let i = 1; i <= len1; i++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j - 1][i] + 1,     // deletion
                    matrix[j][i - 1] + 1,     // insertion
                    matrix[j - 1][i - 1] + cost // substitution
                );
            }
        }
        
        const maxLength = Math.max(len1, len2);
        return (maxLength - matrix[len2][len1]) / maxLength;
    }
    
    /**
     * Calculate Jaccard similarity at word level
     */
    static calculateJaccardSimilarity(str1, str2) {
        const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 2));
        const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 2));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return union.size === 0 ? 0 : intersection.size / union.size;
    }
    
    /**
     * Calculate character overlap ratio
     */
    static calculateCharacterOverlap(str1, str2) {
        const chars1 = new Set(str1.toLowerCase().replace(/\s/g, ''));
        const chars2 = new Set(str2.toLowerCase().replace(/\s/g, ''));
        
        const intersection = new Set([...chars1].filter(x => chars2.has(x)));
        const union = new Set([...chars1, ...chars2]);
        
        return union.size === 0 ? 0 : intersection.size / union.size;
    }
    
    /**
     * Calculate word set similarity (handles reordered words)
     */
    static calculateWordSetSimilarity(str1, str2) {
        const words1 = str1.split(/\s+/).filter(w => w.length > 2);
        const words2 = str2.split(/\s+/).filter(w => w.length > 2);
        
        if (words1.length === 0 || words2.length === 0) return 0;
        
        let matchCount = 0;
        const used = new Set();
        
        for (const word1 of words1) {
            for (let i = 0; i < words2.length; i++) {
                if (used.has(i)) continue;
                
                const word2 = words2[i];
                if (word1 === word2 || this.calculateStringSimilarity(word1, word2) > 0.8) {
                    matchCount++;
                    used.add(i);
                    break;
                }
            }
        }
        
        return matchCount / Math.max(words1.length, words2.length);
    }
    
    /**
     * Match abbreviations against full names
     */
    static matchAbbreviation(abbrev, fullName) {
        // Check if candidate could be an abbreviation of the journal name
        const words = fullName.split(/\s+/).filter(w => w.length > 2);
        
        // For each combination of first letters
        const firstLetters = words.map(w => w[0].toLowerCase()).join('');
        if (abbrev.replace(/\./g, '').toLowerCase() === firstLetters) {
            return 0.9;
        }
        
        // Check for partial abbreviation matches
        const abbrevParts = abbrev.split(/[\s\.]+/).filter(p => p.length > 0);
        let matchedWords = 0;
        
        for (const part of abbrevParts) {
            const partLower = part.toLowerCase();
            for (const word of words) {
                if (word.toLowerCase().startsWith(partLower) || 
                    this.calculateStringSimilarity(partLower, word.toLowerCase()) > 0.8) {
                    matchedWords++;
                    break;
                }
            }
        }
        
        return matchedWords / Math.max(abbrevParts.length, words.length);
    }
    
    /**
     * Fallback journal extraction using pattern matching
     */
    static extractJournalFallback(lines, fullText, filename) {
        // Simple fallback when SCIE list is not available
        const candidates = this.extractJournalCandidates(lines, fullText);
        
        if (candidates.length > 0) {
            // Return the first reasonable candidate
            for (const candidate of candidates) {
                if (candidate.length > 10 && candidate.length < 60) {
                    return candidate;
                }
            }
        }
        
        return 'Unknown Journal';
    }

    /**
     * Enhanced journal name cleaning and normalization
     */
    static cleanJournalName(name) {
        if (!name) return '';
        
        // Initial cleanup
        name = name.trim();
        
        // Remove common metadata patterns
        name = name.replace(/^contents\s+lists?\s+available\s+at\s+/i, '');
        name = name.replace(/sciencedirect\s*/i, '');
        name = name.replace(/©\s*\d{4}.*$/, '');
        name = name.replace(/issn\s*:?\s*\d+-\d+/i, '');
        name = name.replace(/doi\s*:?\s*\S+/i, '');
        
        // Remove volume/issue information
        name = name.replace(/\s*,?\s*(vol\.?|volume)\s*\d+.*$/i, '');
        name = name.replace(/\s*,?\s*(issue|no\.?|number)\s*\d+.*$/i, '');
        name = name.replace(/\s*,?\s*(pp?\.?|pages?)\s*\d+.*$/i, '');
        name = name.replace(/\s*\d{4}[\s,].*$/, ''); // Remove year and everything after
        
        // Remove common suffixes and prefixes
        name = name.replace(/^(the\s+)?/i, '');
        name = name.replace(/\s*\|\s*\d{4}$/, ''); // Remove "| 2024" pattern
        name = name.replace(/\s*\(.*?\)\s*$/, ''); // Remove parentheses at end
        name = name.replace(/\s*[,;:].*$/, ''); // Remove everything after comma/semicolon/colon
        
        // Fix common PDF spacing issues
        name = this.fixPDFSpacingIssues(name);
        
        // Normalize whitespace
        name = name.replace(/\s+/g, ' ').trim();
        
        // Smart capitalization
        name = this.smartCapitalization(name);
        
        // Final cleanup
        name = name.replace(/^\W+|\W+$/g, ''); // Remove leading/trailing non-word chars
        
        return name;
    }
    
    /**
     * Fix PDF-specific spacing issues
     */
    static fixPDFSpacingIssues(text) {
        // Common PDF spacing problems
        const spacingFixes = [
            // Spaced-out words
            [/j\s+o\s+u\s+r\s+n\s+a\s+l/gi, 'Journal'],
            [/l\s+e\s+t\s+t\s+e\s+r\s+s/gi, 'Letters'],
            [/r\s+e\s+p\s+o\s+r\s+t\s+s/gi, 'Reports'],
            [/r\s+e\s+v\s+i\s+e\s+w\s+s?/gi, 'Reviews'],
            [/c\s+o\s+m\s+m\s+u\s+n\s+i\s+c\s+a\s+t\s+i\s+o\s+n\s+s/gi, 'Communications'],
            [/p\s+r\s+o\s+c\s+e\s+e\s+d\s+i\s+n\s+g\s+s/gi, 'Proceedings'],
            [/a\s+p\s+p\s+l\s+i\s+e\s+d/gi, 'Applied'],
            [/p\s+h\s+y\s+s\s+i\s+c\s+a\s+l/gi, 'Physical'],
            [/m\s+a\s+t\s+h\s+e\s+m\s+a\s+t\s+i\s+c\s+a\s+l/gi, 'Mathematical'],
            [/b\s+i\s+o\s+l\s+o\s+g\s+i\s+c\s+a\s+l/gi, 'Biological'],
            [/c\s+h\s+e\s+m\s+i\s+c\s+a\s+l/gi, 'Chemical'],
            [/i\s+n\s+t\s+e\s+r\s+n\s+a\s+t\s+i\s+o\s+n\s+a\s+l/gi, 'International'],
            [/e\s+u\s+r\s+o\s+p\s+e\s+a\s+n/gi, 'European'],
            [/a\s+m\s+e\s+r\s+i\s+c\s+a\s+n/gi, 'American'],
            [/s\s+c\s+i\s+e\s+n\s+c\s+e/gi, 'Science'],
            [/n\s+a\s+t\s+u\s+r\s+e/gi, 'Nature'],
            [/c\s+e\s+l\s+l/gi, 'Cell'],
            
            // Missing spaces (common concatenations)
            [/journalof/gi, 'Journal of'],
            [/lettersin/gi, 'Letters in'],
            [/reviewsof/gi, 'Reviews of'],
            [/reportsof/gi, 'Reports of'],
            [/advancesin/gi, 'Advances in'],
            [/proceedingsof/gi, 'Proceedings of'],
            [/announcementsof/gi, 'Announcements of'],
            [/appliedand/gi, 'Applied and'],
            [/theoreticaland/gi, 'Theoretical and'],
            [/experimentaland/gi, 'Experimental and']
        ];
        
        for (const [pattern, replacement] of spacingFixes) {
            text = text.replace(pattern, replacement);
        }
        
        return text;
    }
    
    /**
     * Apply smart capitalization rules
     */
    static smartCapitalization(text) {
        // Split into words
        const words = text.toLowerCase().split(/\s+/);
        
        // Words that should remain lowercase (unless at start)
        const lowercaseWords = new Set([
            'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 
            'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet'
        ]);
        
        // Words that should be capitalized
        const capitalizedWords = new Map([
            ['dna', 'DNA'],
            ['rna', 'RNA'],
            ['pcr', 'PCR'],
            ['hiv', 'HIV'],
            ['aids', 'AIDS'],
            ['covid', 'COVID'],
            ['sars', 'SARS'],
            ['mers', 'MERS'],
            ['usa', 'USA'],
            ['uk', 'UK'],
            ['eu', 'EU'],
            ['ieee', 'IEEE'],
            ['acs', 'ACS'],
            ['rsc', 'RSC'],
            ['apa', 'APA'],
            ['acm', 'ACM'],
            ['aaas', 'AAAS']
        ]);
        
        const result = words.map((word, index) => {
            const cleanWord = word.replace(/[^\w]/g, '');
            
            // Check for special capitalizations
            if (capitalizedWords.has(cleanWord)) {
                return capitalizedWords.get(cleanWord);
            }
            
            // First word is always capitalized
            if (index === 0) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            }
            
            // Keep lowercase words lowercase
            if (lowercaseWords.has(cleanWord)) {
                return word.toLowerCase();
            }
            
            // Capitalize first letter of other words
            return word.charAt(0).toUpperCase() + word.slice(1);
        });
        
        return result.join(' ');
    }

    /**
     * Extract publication date with enhanced patterns
     */
    static extractPublicationDate(lines, fullText) {
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
                    return formatted;
                }
            }
        }

        return '2024-01-01';
    }

    /**
     * Format date string to standardized format
     */
    static formatDate(dateStr) {
        const months = {
            'january': '01', 'february': '02', 'march': '03', 'april': '04',
            'may': '05', 'june': '06', 'july': '07', 'august': '08',
            'september': '09', 'october': '10', 'november': '11', 'december': '12',
            'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
            'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09',
            'oct': '10', 'nov': '11', 'dec': '12'
        };

        const yearMatch = dateStr.match(/[0-9]{4}/);
        if (!yearMatch) return '2024-01-01';

        const year = yearMatch[0];
        const monthMatch = dateStr.toLowerCase().match(/[a-zA-Z]+/);

        if (monthMatch) {
            const month = months[monthMatch[0].toLowerCase()] || '01';
            return `${year}-${month}-01`;
        }

        return `${year}-01-01`;
    }

    /**
     * Extract abstract from PDF content
     */
    static extractAbstract(lines, fullText) {
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
                    return abstract;
                }
            }
        }

        // Fallback: line-by-line extraction
        let abstractText = '';
        let abstractStart = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes('abstract')) {
                abstractStart = i;
                break;
            }
        }

        if (abstractStart >= 0) {
            for (let i = abstractStart + 1; i < Math.min(abstractStart + 20, lines.length); i++) {
                if (lines[i].toLowerCase().includes('introduction') || 
                    lines[i].toLowerCase().includes('keywords') ||
                    lines[i].toLowerCase().includes('1.') ||
                    lines[i].toLowerCase().includes('method')) {
                    break;
                }
                abstractText += lines[i] + ' ';
            }
        }

        return abstractText.trim();
    }

    /**
     * Extract DOI from PDF content
     */
    static extractDOI(lines, fullText) {
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
                    return `https://doi.org/${doi}`;
                }
            }
        }

        return null;
    }

    /**
     * Extract quantitative results from PDF content
     */
    static extractQuantitativeResults(lines, fullText) {
        const resultPatterns = [
            /results[:\s]*\n(.*?)(?=\n\s*(?:discussion|conclusion|limitations|references))/is,
            /findings[:\s]*\n(.*?)(?=\n\s*(?:discussion|conclusion|limitations))/is,
            /conclusion[s]?[:\s]*\n(.*?)(?=\n\s*(?:acknowledgments|references|funding))/is,
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
        return uniqueResults.join(' ').substring(0, 1000); // Limit length
    }

    /**
     * Extract statistical findings from PDF content
     */
    static extractStatisticalFindings(fullText) {
        const statisticalPatterns = [
            /(\d+(?:\.\d+)?%)/g,                                    // Percentages
            /(p\s*[<>=]\s*\d+(?:\.\d+)?)/gi,                       // P-values
            /(95%\s*CI[:\s]*\d+(?:\.\d+)?[-–]\d+(?:\.\d+)?)/gi,    // Confidence intervals
            /(R[₀0]\s*[=:]\s*\d+(?:\.\d+)?)/gi,                    // R0 values
            /((?:OR|RR)\s*[=:]\s*\d+(?:\.\d+)?)/gi,                // Odds ratios / Risk ratios
            /(\d+(?:\.\d+)?%?\s*(?:reduction|decrease|increase|improvement))/gi, // Changes
            /(\d+(?:\.\d+)?[-–]fold)/gi,                           // Fold changes
            /(n\s*=\s*\d+)/gi                                      // Sample sizes
        ];

        let findings = [];

        for (const pattern of statisticalPatterns) {
            const matches = fullText.matchAll(pattern);
            for (const match of matches) {
                findings.push(match[1] || match[0]);
            }
        }

        const uniqueFindings = [...new Set(findings)];
        return uniqueFindings.slice(0, 20); // Limit to top 20 findings
    }

    /**
     * Extract date-relevant text for enhanced date detection
     */
    static extractDateRelevantText(fullText) {
        const datePatterns = [
            // Highest priority: Published online patterns
            /published online:?\s*\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/gi,
            /published online:?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
            /published online:?\s*\d{4}[\/\-\s]\d{1,2}[\/\-\s]\d{1,2}/gi,
            
            // Other publication patterns
            /available online:?[^.]*?\d{4}/gi,
            /received:?[^.]*?\d{4}/gi,
            /accepted:?[^.]*?\d{4}/gi,
            /published:?[^.]*?\d{4}/gi,
            /first published:?[^.]*?\d{4}/gi,
            /publication date:?[^.]*?\d{4}/gi,
            /copyright.*?\d{4}/gi,
            
            // Generic date patterns
            /\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi,
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi
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
}

module.exports = PDFExtractor;