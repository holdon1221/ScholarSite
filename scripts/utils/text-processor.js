/**
 * Text Processing Utilities
 * Common text manipulation and validation functions
 */

class TextProcessor {
    /**
     * Normalize title for matching
     */
    static normalizeTitle(title) {
        if (!title) return '';
        return title.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Clean and sanitize text
     */
    static sanitizeText(text) {
        if (!text) return '';
        return text.trim()
            .replace(/\s+/g, ' ')
            .replace(/[\r\n\t]/g, ' ')
            .trim();
    }

    /**
     * Extract clean text from potentially messy input
     */
    static extractCleanText(text) {
        if (!text) return '';
        
        // Remove common PDF artifacts and formatting
        return text
            .replace(/\f/g, ' ')  // Form feed
            .replace(/\x00/g, '') // Null characters
            .replace(/\u0000/g, '') // Unicode null
            .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Control characters
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Validate and clean email
     */
    static validateEmail(email) {
        if (!email) return null;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const cleaned = email.trim().toLowerCase();
        return emailRegex.test(cleaned) ? cleaned : null;
    }

    /**
     * Validate and clean URL
     */
    static validateUrl(url) {
        if (!url) return null;
        try {
            const cleaned = url.trim();
            // Add https:// if no protocol
            const fullUrl = cleaned.match(/^https?:\/\//) ? cleaned : `https://${cleaned}`;
            new URL(fullUrl); // Throws if invalid
            return fullUrl;
        } catch {
            return null;
        }
    }

    /**
     * Extract DOI from text
     */
    static extractDOI(text) {
        if (!text) return null;
        const doiRegex = /10\.\d{4,}[^\s]*/;
        const match = text.match(doiRegex);
        return match ? match[0] : null;
    }

    /**
     * Extract year from text
     */
    static extractYear(text) {
        if (!text) return null;
        const yearRegex = /\b(19|20)\d{2}\b/g;
        const matches = text.match(yearRegex);
        if (matches) {
            // Return the most recent year found
            return Math.max(...matches.map(Number)).toString();
        }
        return null;
    }

    /**
     * Truncate text to specified length with ellipsis
     */
    static truncate(text, maxLength = 150) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        
        // Try to break at word boundary
        const truncated = text.substring(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        
        if (lastSpace > maxLength * 0.8) {
            return truncated.substring(0, lastSpace) + '...';
        }
        return truncated + '...';
    }

    /**
     * Extract sentences from text
     */
    static extractSentences(text, maxSentences = 3) {
        if (!text) return [];
        
        // Split by sentence endings
        const sentences = text.split(/[.!?]+/)
            .map(s => s.trim())
            .filter(s => s.length > 10)
            .slice(0, maxSentences);
            
        return sentences;
    }

    /**
     * Calculate text similarity (basic)
     */
    static calculateSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;
        
        const normalize = (str) => str.toLowerCase().replace(/[^\w]/g, '');
        const a = normalize(text1);
        const b = normalize(text2);
        
        if (a === b) return 1;
        if (a.length === 0 || b.length === 0) return 0;
        
        // Simple character-based similarity
        let matches = 0;
        const minLength = Math.min(a.length, b.length);
        
        for (let i = 0; i < minLength; i++) {
            if (a[i] === b[i]) matches++;
        }
        
        return matches / Math.max(a.length, b.length);
    }

    /**
     * Remove translation markers
     */
    static removeTranslationMarkers(text) {
        if (!text) return '';
        return text.replace(/\[AI_TRANSLATE_NEEDED\]/g, '').trim();
    }

    /**
     * Check if text needs translation
     */
    static needsTranslation(text) {
        if (!text) return false;
        if (typeof text === 'string') {
            return text.includes('[AI_TRANSLATE_NEEDED]') || text.trim() === '';
        }
        if (typeof text === 'object') {
            return Object.values(text).some(value => 
                value && (value.includes('[AI_TRANSLATE_NEEDED]') || value.trim() === '')
            );
        }
        return false;
    }

    /**
     * Clean LLM response
     */
    static cleanLLMResponse(text) {
        if (!text) return '';
        
        // Remove common LLM artifacts
        return text
            .replace(/<output[^>]*>([\s\S]*?)<\/output>/gi, '$1')
            .replace(/^```[\s\S]*?\n/, '')
            .replace(/\n```$/, '')
            .replace(/^\**\s*/, '')
            .replace(/\s*\**$/, '')
            .trim();
    }

    /**
     * Format name for display
     */
    static formatName(name) {
        if (!name) return '';
        return name.trim()
            .split(/\s+/)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Generate slug from text
     */
    static generateSlug(text) {
        if (!text) return '';
        return text.toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }
}

module.exports = TextProcessor;