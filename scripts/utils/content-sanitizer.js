/**
 * Content Sanitizer Utility
 * Text cleaning, validation, and sanitization functions
 */

const TextProcessor = require('./text-processor');

class ContentSanitizer {
    /**
     * Clean and sanitize abstract text
     */
    static sanitizeAbstract(text) {
        if (!text) return '';
        
        let cleaned = text;
        
        // Remove common LLM artifacts
        cleaned = this.removeLLMArtifacts(cleaned);
        
        // Remove PDF extraction artifacts
        cleaned = this.removePDFArtifacts(cleaned);
        
        // Normalize whitespace
        cleaned = this.normalizeWhitespace(cleaned);
        
        // Remove unwanted patterns
        cleaned = this.removeUnwantedPatterns(cleaned);
        
        // Fix common formatting issues
        cleaned = this.fixCommonFormattingIssues(cleaned);
        
        return cleaned.trim();
    }

    /**
     * Remove LLM response artifacts
     */
    static removeLLMArtifacts(text) {
        return text
            // Remove XML-style tags
            .replace(/<output[^>]*>([\s\S]*?)<\/output>/gi, '$1')
            .replace(/<thinking[^>]*>([\s\S]*?)<\/thinking>/gi, '')
            .replace(/<response[^>]*>([\s\S]*?)<\/response>/gi, '$1')
            
            // Remove code blocks
            .replace(/^```[\s\S]*?\n/, '')
            .replace(/\n```$/, '')
            
            // Remove leading/trailing asterisks
            .replace(/^\**\s*/, '')
            .replace(/\s*\**$/, '')
            
            // Remove "Here is..." or "Here's..." prefixes
            .replace(/^(?:here\s+is|here's)\s+[^:]*:\s*/i, '')
            
            // Remove common LLM response patterns
            .replace(/^(?:abstract|summary):\s*/i, '')
            .replace(/^(?:the\s+)?(?:enhanced|improved|generated)\s+(?:abstract|summary):\s*/i, '');
    }

    /**
     * Remove PDF extraction artifacts
     */
    static removePDFArtifacts(text) {
        return text
            // Remove form feed characters
            .replace(/\f/g, ' ')
            
            // Remove null characters
            .replace(/\x00/g, '')
            .replace(/\u0000/g, '')
            
            // Remove control characters
            .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
            
            // Remove page numbers and headers/footers
            .replace(/^\d+\s*$/gm, '')
            .replace(/^page\s+\d+\s*$/gmi, '')
            
            // Remove common PDF metadata
            .replace(/^(?:doi|issn|isbn):\s*[^\n]*/gmi, '')
            .replace(/^©.*$/gm, '')
            .replace(/^received:.*accepted:.*$/gmi, '');
    }

    /**
     * Normalize whitespace
     */
    static normalizeWhitespace(text) {
        return text
            // Replace multiple spaces with single space
            .replace(/\s+/g, ' ')
            
            // Replace multiple newlines with single newline
            .replace(/\n\s*\n/g, '\n')
            
            // Remove spaces at line beginnings/endings
            .replace(/^\s+|\s+$/gm, '')
            
            // Ensure proper spacing after punctuation
            .replace(/([.!?])([A-Z])/g, '$1 $2')
            .replace(/([,;])([A-Za-z])/g, '$1 $2');
    }

    /**
     * Remove unwanted patterns
     */
    static removeUnwantedPatterns(text) {
        return text
            // Remove URLs
            .replace(/https?:\/\/[^\s]+/g, '')
            
            // Remove email addresses
            .replace(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,}/g, '')
            
            // Remove excessive punctuation
            .replace(/[.]{3,}/g, '...')
            .replace(/[!]{2,}/g, '!')
            .replace(/[?]{2,}/g, '?')
            
            // Remove standalone numbers (likely page numbers)
            .replace(/^\d+$\n?/gm, '')
            
            // Remove common manuscript artifacts
            .replace(/^\s*abstract\s*$/gmi, '')
            .replace(/^\s*keywords?:.*$/gmi, '')
            .replace(/^\s*introduction\s*$/gmi, '');
    }

    /**
     * Fix common formatting issues
     */
    static fixCommonFormattingIssues(text) {
        return text
            // Fix sentence spacing
            .replace(/\.\s+([a-z])/g, '. $1')
            
            // Fix capitalization after periods
            .replace(/\.\s+([a-z])/g, (match, letter) => '. ' + letter.toUpperCase())
            
            // Fix common abbreviations
            .replace(/\be\.g\./gi, 'e.g.')
            .replace(/\bi\.e\./gi, 'i.e.')
            .replace(/\betc\./gi, 'etc.')
            .replace(/\bvs\./gi, 'vs.')
            
            // Fix number formatting
            .replace(/(\d)\s*%/g, '$1%')
            .replace(/(\d)\s*°C/g, '$1°C')
            
            // Fix hyphenation issues
            .replace(/([a-z])\s*-\s*([a-z])/g, '$1-$2');
    }

    /**
     * Sanitize title text
     */
    static sanitizeTitle(title) {
        if (!title) return '';
        
        let cleaned = title;
        
        // Remove common title artifacts
        cleaned = cleaned
            .replace(/^(the\s+|a\s+|an\s+)/i, '')
            .replace(/\s*[|]\s*$/, '')
            .replace(/\s*\(\d{4}\)\s*$/, '')
            .replace(/\s*\.\s*$/, '');
        
        // Fix spacing issues
        cleaned = this.normalizeWhitespace(cleaned);
        
        // Capitalize first letter
        if (cleaned.length > 0) {
            cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        }
        
        return cleaned.trim();
    }

    /**
     * Sanitize journal name
     */
    static sanitizeJournal(journal) {
        if (!journal) return '';
        
        let cleaned = journal;
        
        // Remove common artifacts
        cleaned = cleaned
            .replace(/^journal\s+of\s+/i, 'Journal of ')
            .replace(/\s+journal\s*$/i, ' Journal')
            .replace(/\s*\|.*$/, '')
            .replace(/^.*\s+in\s+/, '');
        
        // Normalize whitespace
        cleaned = this.normalizeWhitespace(cleaned);
        
        // Proper case for common journal words
        cleaned = cleaned
            .replace(/\bjournal\b/gi, 'Journal')
            .replace(/\breports?\b/gi, 'Reports')
            .replace(/\bscience\b/gi, 'Science')
            .replace(/\bnature\b/gi, 'Nature')
            .replace(/\bmedicine\b/gi, 'Medicine')
            .replace(/\bbiosciences?\b/gi, 'Biosciences')
            .replace(/\bmathematics?\b/gi, 'Mathematics');
        
        return cleaned.trim();
    }

    /**
     * Validate and clean email address
     */
    static sanitizeEmail(email) {
        if (!email) return '';
        
        const cleaned = email.trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        return emailRegex.test(cleaned) ? cleaned : '';
    }

    /**
     * Validate and clean URL
     */
    static sanitizeUrl(url) {
        if (!url) return '';
        
        try {
            const cleaned = url.trim();
            // Add https:// if no protocol
            const fullUrl = cleaned.match(/^https?:\/\//) ? cleaned : `https://${cleaned}`;
            new URL(fullUrl); // Throws if invalid
            return fullUrl;
        } catch {
            return '';
        }
    }

    /**
     * Clean academic bio text
     */
    static sanitizeBio(bio) {
        if (!bio) return '';
        
        let cleaned = bio;
        
        // Remove excessive self-promotion language
        cleaned = cleaned
            .replace(/\b(groundbreaking|revolutionary|cutting-edge|world-class|leading|pioneering)\b/gi, '')
            .replace(/\b(exceptional|outstanding|remarkable|extraordinary)\b/gi, '');
        
        // Normalize academic language
        cleaned = this.normalizeWhitespace(cleaned);
        
        // Remove redundant phrases
        cleaned = cleaned
            .replace(/\bDr\. Dr\./g, 'Dr.')
            .replace(/\bProfessor Professor\b/g, 'Professor')
            .replace(/(research|researcher)\s+(research|researcher)/gi, '$1');
        
        return cleaned.trim();
    }

    /**
     * Remove translation markers
     */
    static removeTranslationMarkers(text) {
        if (!text) return '';
        return text.replace(/\[AI_TRANSLATE_NEEDED\]/g, '').trim();
    }

    /**
     * Sanitize file path for security
     */
    static sanitizeFilePath(filePath) {
        if (!filePath) return '';
        
        // Remove dangerous patterns
        return filePath
            .replace(/\.\./g, '') // Directory traversal
            .replace(/\/\//g, '/') // Double slashes
            .replace(/[<>:"|?*]/g, '') // Invalid filename characters
            .trim();
    }

    /**
     * Clean statistical findings text
     */
    static sanitizeStatisticalFindings(findings) {
        if (!Array.isArray(findings)) return [];
        
        return findings
            .map(finding => {
                if (typeof finding !== 'string') return '';
                
                return finding
                    .trim()
                    .replace(/\s+/g, ' ')
                    .replace(/^[^\w]*/, '') // Remove leading non-word characters
                    .replace(/[^\w%.,()\-=<>\s]*$/, ''); // Remove trailing junk
            })
            .filter(finding => finding.length > 0 && finding.length < 200) // Reasonable length
            .slice(0, 20); // Limit count
    }

    /**
     * Sanitize and validate DOI
     */
    static sanitizeDOI(doi) {
        if (!doi) return '';
        
        // Extract DOI pattern
        const doiMatch = doi.match(/10\.\d{4,}\/[^\s]+/);
        if (doiMatch) {
            return `https://doi.org/${doiMatch[0]}`;
        }
        
        // If it's already a URL, validate it
        if (doi.startsWith('http')) {
            try {
                new URL(doi);
                return doi;
            } catch {
                return '';
            }
        }
        
        return '';
    }

    /**
     * Clean HTML content (basic sanitization)
     */
    static sanitizeHtml(html) {
        if (!html) return '';
        
        return html
            // Remove dangerous elements
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
            .replace(/<object[^>]*>.*?<\/object>/gi, '')
            .replace(/<embed[^>]*>/gi, '')
            
            // Remove event handlers
            .replace(/on\w+="[^"]*"/gi, '')
            .replace(/javascript:/gi, '')
            
            // Clean up formatting
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Comprehensive text cleaning for any academic content
     */
    static cleanAcademicText(text, options = {}) {
        if (!text) return '';
        
        let cleaned = text;
        
        // Apply requested cleaning steps
        if (options.removeLLMArtifacts !== false) {
            cleaned = this.removeLLMArtifacts(cleaned);
        }
        
        if (options.removePDFArtifacts !== false) {
            cleaned = this.removePDFArtifacts(cleaned);
        }
        
        if (options.normalizeWhitespace !== false) {
            cleaned = this.normalizeWhitespace(cleaned);
        }
        
        if (options.removeUnwantedPatterns !== false) {
            cleaned = this.removeUnwantedPatterns(cleaned);
        }
        
        if (options.fixFormatting !== false) {
            cleaned = this.fixCommonFormattingIssues(cleaned);
        }
        
        // Apply length limits if specified
        if (options.maxLength && cleaned.length > options.maxLength) {
            cleaned = TextProcessor.truncate(cleaned, options.maxLength);
        }
        
        return cleaned.trim();
    }

    /**
     * Validate and clean multi-language content
     */
    static sanitizeMultilingualContent(content, supportedLanguages = ['en']) {
        if (!content || typeof content !== 'object') return {};
        
        const sanitized = {};
        
        for (const lang of supportedLanguages) {
            if (content[lang]) {
                sanitized[lang] = this.cleanAcademicText(content[lang]);
            }
        }
        
        return sanitized;
    }
}

module.exports = ContentSanitizer;