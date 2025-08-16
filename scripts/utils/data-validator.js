/**
 * Data Validation Utilities
 * Common validation and sanitization patterns
 */

class DataValidator {
    /**
     * Validate configuration object structure
     */
    static validateConfig(config) {
        const errors = [];
        
        if (!config) {
            errors.push('Configuration object is missing');
            return { isValid: false, errors };
        }

        // Check required sections
        if (!config.personal) {
            errors.push('Personal information section is missing');
        } else {
            if (!config.personal.name || !config.personal.name.trim()) {
                errors.push('Name is required in personal information');
            }
            if (!config.personal.email || !this.isValidEmail(config.personal.email)) {
                errors.push('Valid email is required in personal information');
            }
        }

        if (!config.settings) {
            errors.push('Settings section is missing');
        } else {
            if (!config.settings.language) {
                errors.push('Language setting is required');
            }
            if (!config.settings.supportedLanguages || !Array.isArray(config.settings.supportedLanguages)) {
                errors.push('Supported languages must be an array');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate publication object structure
     */
    static validatePublication(publication) {
        const errors = [];
        
        if (!publication) {
            errors.push('Publication object is missing');
            return { isValid: false, errors };
        }

        if (!publication.title || !publication.title.trim()) {
            errors.push('Publication title is required');
        }

        if (!publication.journal || !publication.journal.trim()) {
            errors.push('Journal name is required');
        }

        if (!publication.publicationDate) {
            errors.push('Publication date is required');
        } else if (!this.isValidDate(publication.publicationDate)) {
            errors.push('Publication date must be in valid format');
        }

        if (publication.doi && !this.isValidDOI(publication.doi)) {
            errors.push('DOI format is invalid');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate email format
     */
    static isValidEmail(email) {
        if (!email || typeof email !== 'string') return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
    }

    /**
     * Validate URL format
     */
    static isValidUrl(url) {
        if (!url || typeof url !== 'string') return false;
        try {
            const fullUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;
            new URL(fullUrl);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Validate DOI format
     */
    static isValidDOI(doi) {
        if (!doi || typeof doi !== 'string') return false;
        const doiRegex = /^10\.\d{4,}\/[^\s]+$/;
        return doiRegex.test(doi.trim());
    }

    /**
     * Validate date format (various formats)
     */
    static isValidDate(dateStr) {
        if (!dateStr) return false;
        
        // Try various date formats
        const date = new Date(dateStr);
        return !isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() <= new Date().getFullYear() + 1;
    }

    /**
     * Validate language code
     */
    static isValidLanguage(langCode) {
        const validLanguages = ['en', 'ko', 'fr', 'ja', 'es', 'de', 'zh'];
        return validLanguages.includes(langCode);
    }

    /**
     * Validate ORCID format
     */
    static isValidORCID(orcid) {
        if (!orcid || typeof orcid !== 'string') return false;
        const orcidRegex = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
        return orcidRegex.test(orcid.trim());
    }

    /**
     * Sanitize string input
     */
    static sanitizeString(str, maxLength = 1000) {
        if (!str || typeof str !== 'string') return '';
        
        return str
            .trim()
            .replace(/[\u0000-\u001F\u007F]/g, '') // Remove control characters
            .replace(/\s+/g, ' ') // Normalize whitespace
            .substring(0, maxLength);
    }

    /**
     * Sanitize HTML (basic)
     */
    static sanitizeHtml(html) {
        if (!html || typeof html !== 'string') return '';
        
        // Basic HTML sanitization - remove dangerous elements
        return html
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
            .replace(/<object[^>]*>.*?<\/object>/gi, '')
            .replace(/<embed[^>]*>/gi, '')
            .replace(/on\w+="[^"]*"/gi, '') // Remove event handlers
            .replace(/javascript:/gi, '');
    }

    /**
     * Validate API key format
     */
    static isValidApiKey(apiKey, service = 'generic') {
        if (!apiKey || typeof apiKey !== 'string') return false;
        
        const key = apiKey.trim();
        
        switch (service.toLowerCase()) {
            case 'anthropic':
                return key.startsWith('sk-ant-') && key.length > 20;
            case 'openai':
                return key.startsWith('sk-') && key.length > 20;
            case 'groq':
                return key.startsWith('gsk_') && key.length > 20;
            case 'perplexity':
                return key.startsWith('pplx-') && key.length > 20;
            default:
                return key.length > 10; // Generic validation
        }
    }

    /**
     * Validate file path
     */
    static isValidFilePath(filePath) {
        if (!filePath || typeof filePath !== 'string') return false;
        
        // Check for dangerous patterns
        const dangerousPatterns = [
            /\.\./,  // Directory traversal
            /\/\//,  // Double slashes
            /[<>:"|?*]/,  // Invalid filename characters
        ];
        
        return !dangerousPatterns.some(pattern => pattern.test(filePath));
    }

    /**
     * Validate citation count
     */
    static isValidCitationCount(count) {
        if (count === null || count === undefined) return true; // Optional field
        
        const num = parseInt(count);
        return !isNaN(num) && num >= 0 && num < 1000000; // Reasonable upper limit
    }

    /**
     * Validate and clean multilingual field
     */
    static validateMultilingualField(field, supportedLanguages = ['en']) {
        if (!field) return null;
        
        if (typeof field === 'string') {
            return this.sanitizeString(field);
        }
        
        if (typeof field === 'object') {
            const cleaned = {};
            for (const lang of supportedLanguages) {
                if (field[lang]) {
                    cleaned[lang] = this.sanitizeString(field[lang]);
                }
            }
            return Object.keys(cleaned).length > 0 ? cleaned : null;
        }
        
        return null;
    }

    /**
     * Get validation summary
     */
    static getValidationSummary(validationResults) {
        const totalChecks = validationResults.length;
        const passed = validationResults.filter(r => r.isValid).length;
        const failed = totalChecks - passed;
        
        return {
            total: totalChecks,
            passed,
            failed,
            success: failed === 0,
            errors: validationResults.filter(r => !r.isValid).flatMap(r => r.errors)
        };
    }
}

module.exports = DataValidator;