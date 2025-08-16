/**
 * Data Transformer Utility
 * Handles publication data processing, formatting, and transformation
 */

const TextProcessor = require('./text-processor');

class DataTransformer {
    /**
     * Transform publication data for frontend display
     */
    static transformPublicationsForFrontend(publications, supportedLanguages = ['en']) {
        const placeholders = {
            ko: '초록을 사용할 수 없습니다.',
            fr: 'Résumé non disponible.',
            ja: '概要は利用できません。',
            zh: '摘要不可用。',
            es: 'Resumen no disponible.',
            de: 'Zusammenfassung nicht verfügbar.'
        };

        return publications.map(pub => {
            const processedPub = {
                title: pub.title,
                date: pub.date || new Date().toISOString(),
                journal: pub.journal || 'Academic Journal',
                citations: pub.citations || 0,
                link: pub.link || '#',
                summary: {}
            };

            // Preserve existing enhanced_at if it exists
            if (pub.enhanced_at) {
                processedPub.enhanced_at = pub.enhanced_at;
            }

            // Create multi-language summary
            for (const lang of supportedLanguages) {
                if (lang === 'en') {
                    processedPub.summary[lang] = pub.summary?.en || pub.abstract || placeholders.en || 'Abstract not available.';
                } else {
                    // Use existing translation or placeholder
                    processedPub.summary[lang] = pub.summary?.[lang] || placeholders[lang] || 'Abstract not available.';
                }
            }

            return processedPub;
        });
    }

    /**
     * Create multi-language summary object
     */
    static createMultiLanguageSummary(englishText, supportedLanguages = ['en']) {
        const placeholders = {
            ko: '초록을 사용할 수 없습니다.',
            fr: 'Résumé non disponible.',
            ja: '概要は利用できません。',
            zh: '摘要不可用。',
            es: 'Resumen no disponible.',
            de: 'Zusammenfassung nicht verfügbar.'
        };

        const summary = {};
        
        for (const lang of supportedLanguages) {
            if (lang === 'en') {
                summary[lang] = englishText;
            } else {
                // Use placeholder for non-English languages - will be enhanced later
                summary[lang] = placeholders[lang] || 'Abstract not available.';
            }
        }
        
        return summary;
    }

    /**
     * Format date for display in multiple languages
     */
    static formatDateForDisplay(dateString, supportedLanguages = ['en']) {
        if (!dateString) {
            const emptyDate = {};
            supportedLanguages.forEach(lang => emptyDate[lang] = '');
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
        
        supportedLanguages.forEach(lang => {
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

    /**
     * Normalize publication for comparison
     */
    static normalizePublicationForComparison(publication) {
        return {
            title: TextProcessor.normalizeTitle(publication.title || ''),
            journal: TextProcessor.normalizeTitle(publication.journal || ''),
            year: this.extractYear(publication.date || publication.publicationDate || ''),
            doi: this.extractDOI(publication.doi || publication.link || '')
        };
    }

    /**
     * Extract year from date string
     */
    static extractYear(dateString) {
        if (!dateString) return '';
        const yearMatch = dateString.match(/\b(19|20)\d{2}\b/);
        return yearMatch ? yearMatch[0] : '';
    }

    /**
     * Extract DOI from various formats
     */
    static extractDOI(input) {
        if (!input) return '';
        
        // Clean DOI patterns
        const doiMatch = input.match(/10\.\d{4,}\/[^\s]+/);
        return doiMatch ? doiMatch[0] : '';
    }

    /**
     * Check if publication already exists in array
     */
    static publicationExists(newPub, existingPubs) {
        const normalizedNew = this.normalizePublicationForComparison(newPub);
        
        return existingPubs.some(existing => {
            const normalizedExisting = this.normalizePublicationForComparison(existing);
            
            // Match on title similarity and journal
            const titleSimilarity = TextProcessor.calculateSimilarity(
                normalizedNew.title, 
                normalizedExisting.title
            );
            
            const journalMatch = normalizedNew.journal === normalizedExisting.journal;
            const yearMatch = normalizedNew.year === normalizedExisting.year;
            
            // Consider it a match if title is very similar and journal/year match
            return titleSimilarity > 0.8 && (journalMatch || yearMatch);
        });
    }

    /**
     * Merge publication data from different sources
     */
    static mergePublicationData(existing, newData) {
        const merged = { ...existing };
        
        // Update with non-empty values from new data
        Object.keys(newData).forEach(key => {
            if (newData[key] && newData[key] !== '' && newData[key] !== 0) {
                // Special handling for certain fields
                switch (key) {
                    case 'citations':
                        // Use higher citation count
                        merged[key] = Math.max(existing[key] || 0, newData[key] || 0);
                        break;
                    case 'summary':
                        // Merge summary objects
                        merged[key] = { ...(existing[key] || {}), ...(newData[key] || {}) };
                        break;
                    case 'date':
                    case 'publicationDate':
                        // Use more recent or more specific date
                        if (!existing[key] || newData[key].length > existing[key].length) {
                            merged[key] = newData[key];
                        }
                        break;
                    default:
                        merged[key] = newData[key];
                }
            }
        });
        
        // Add merge timestamp
        merged.last_updated = new Date().toISOString();
        
        return merged;
    }

    /**
     * Sort publications by various criteria
     */
    static sortPublications(publications, sortBy = 'date', order = 'desc') {
        const sorted = [...publications].sort((a, b) => {
            let aValue, bValue;
            
            switch (sortBy) {
                case 'date':
                    aValue = new Date(a.date || a.publicationDate || '1900-01-01');
                    bValue = new Date(b.date || b.publicationDate || '1900-01-01');
                    break;
                case 'citations':
                    aValue = a.citations || 0;
                    bValue = b.citations || 0;
                    break;
                case 'title':
                    aValue = (a.title || '').toLowerCase();
                    bValue = (b.title || '').toLowerCase();
                    break;
                case 'journal':
                    aValue = (a.journal || '').toLowerCase();
                    bValue = (b.journal || '').toLowerCase();
                    break;
                default:
                    return 0;
            }
            
            if (order === 'desc') {
                return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
            } else {
                return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            }
        });
        
        return sorted;
    }

    /**
     * Filter publications by criteria
     */
    static filterPublications(publications, filters = {}) {
        let filtered = [...publications];
        
        // Filter by year range
        if (filters.yearFrom || filters.yearTo) {
            filtered = filtered.filter(pub => {
                const year = parseInt(this.extractYear(pub.date || pub.publicationDate || ''));
                const yearFrom = filters.yearFrom ? parseInt(filters.yearFrom) : 0;
                const yearTo = filters.yearTo ? parseInt(filters.yearTo) : 9999;
                return year >= yearFrom && year <= yearTo;
            });
        }
        
        // Filter by journal
        if (filters.journal) {
            const journalFilter = filters.journal.toLowerCase();
            filtered = filtered.filter(pub => 
                (pub.journal || '').toLowerCase().includes(journalFilter)
            );
        }
        
        // Filter by minimum citations
        if (filters.minCitations) {
            filtered = filtered.filter(pub => 
                (pub.citations || 0) >= parseInt(filters.minCitations)
            );
        }
        
        // Filter by keywords in title or abstract
        if (filters.keywords) {
            const keywords = filters.keywords.toLowerCase().split(',').map(k => k.trim());
            filtered = filtered.filter(pub => {
                const searchText = `${pub.title || ''} ${pub.abstract || ''} ${JSON.stringify(pub.summary || {})}`.toLowerCase();
                return keywords.some(keyword => searchText.includes(keyword));
            });
        }
        
        return filtered;
    }

    /**
     * Generate publication statistics
     */
    static generatePublicationStats(publications) {
        const stats = {
            total: publications.length,
            totalCitations: publications.reduce((sum, pub) => sum + (pub.citations || 0), 0),
            yearRange: { min: null, max: null },
            journalCounts: {},
            citationDistribution: { 0: 0, '1-5': 0, '6-20': 0, '21-50': 0, '50+': 0 },
            averageCitations: 0,
            recentPublications: 0 // last 2 years
        };
        
        const currentYear = new Date().getFullYear();
        const years = [];
        
        publications.forEach(pub => {
            // Year analysis
            const year = parseInt(this.extractYear(pub.date || pub.publicationDate || ''));
            if (year > 1900) {
                years.push(year);
                if (year >= currentYear - 1) {
                    stats.recentPublications++;
                }
            }
            
            // Journal analysis
            const journal = pub.journal || 'Unknown';
            stats.journalCounts[journal] = (stats.journalCounts[journal] || 0) + 1;
            
            // Citation distribution
            const citations = pub.citations || 0;
            if (citations === 0) stats.citationDistribution[0]++;
            else if (citations <= 5) stats.citationDistribution['1-5']++;
            else if (citations <= 20) stats.citationDistribution['6-20']++;
            else if (citations <= 50) stats.citationDistribution['21-50']++;
            else stats.citationDistribution['50+']++;
        });
        
        // Year range
        if (years.length > 0) {
            stats.yearRange.min = Math.min(...years);
            stats.yearRange.max = Math.max(...years);
        }
        
        // Average citations
        stats.averageCitations = stats.total > 0 ? 
            Math.round((stats.totalCitations / stats.total) * 10) / 10 : 0;
        
        return stats;
    }

    /**
     * Deduplicate publications array
     */
    static deduplicatePublications(publications) {
        const seen = new Set();
        const unique = [];
        
        for (const pub of publications) {
            const normalized = this.normalizePublicationForComparison(pub);
            const key = `${normalized.title}|${normalized.journal}|${normalized.year}`;
            
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(pub);
            }
        }
        
        return unique;
    }

    /**
     * Validate publication data structure
     */
    static validatePublication(publication) {
        const errors = [];
        const warnings = [];
        
        // Required fields
        if (!publication.title || publication.title.trim() === '') {
            errors.push('Title is required');
        }
        
        if (!publication.journal || publication.journal.trim() === '') {
            warnings.push('Journal name is missing');
        }
        
        if (!publication.date && !publication.publicationDate) {
            warnings.push('Publication date is missing');
        }
        
        // Data type validation
        if (publication.citations && (isNaN(publication.citations) || publication.citations < 0)) {
            errors.push('Citation count must be a non-negative number');
        }
        
        // Summary validation
        if (publication.summary && typeof publication.summary !== 'object') {
            errors.push('Summary must be an object with language keys');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
}

module.exports = DataTransformer;