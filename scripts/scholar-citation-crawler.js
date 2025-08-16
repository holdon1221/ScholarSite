#!/usr/bin/env node

/**
 * Google Scholar Profile Citation Crawler
 * 
 * Fetches accurate citation counts directly from the user's Google Scholar profile page
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const ConfigManager = require('./utils/config-manager');
const HttpClient = require('./utils/http-client');
const TextProcessor = require('./utils/text-processor');
const Logger = require('./utils/logger');

class ScholarCitationCrawler {
    constructor() {
        this.configManager = new ConfigManager();
    }

    loadConfig() {
        return this.configManager.loadConfig();
    }

    loadPublications() {
        const publications = this.configManager.loadPublications();
        if (publications.length === 0) {
            Logger.error('Could not load publications');
        }
        return publications;
    }

    savePublications(publications) {
        const success = this.configManager.savePublications(publications);
        if (success) {
            Logger.success('Publications updated successfully');
        } else {
            Logger.error('Could not save publications');
        }
    }


    // Fetch the Google Scholar profile page
    async fetchScholarProfile(scholarId) {
        try {
            Logger.info(`Fetching Google Scholar profile: ${scholarId}`);
            
            const retryConfig = {
                maxRetries: 3,
                retryDelays: [2000, 5000, 10000]
            };
            
            const html = await HttpClient.makeScholarRequest(scholarId, retryConfig);
            
            if (html) {
                Logger.success(`Successfully fetched profile (${html.length} characters)`);
                return html;
            } else {
                Logger.error('Error fetching profile: Empty response');
                return '';
            }
        } catch (error) {
            Logger.error(`Request error: ${error.message}`);
            return '';
        }
    }

    // Extract publications and citations from Scholar profile HTML
    parseScholarProfile(html) {
        const publications = [];
        
        try {
            // Look for publication entries in the HTML
            // Google Scholar uses specific patterns for publication listings
            
            // Method 1: Look for citation count patterns near titles
            const titleCitationPattern = /<a[^>]*class="gsc_a_at"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*class="gsc_a_ac[^"]*"[^>]*>(\d+)<\/a>/g;
            let match;
            
            while ((match = titleCitationPattern.exec(html)) !== null) {
                const title = match[1].trim();
                const citations = parseInt(match[2]);
                
                publications.push({
                    title: title,
                    citations: citations
                });
            }

            // Method 2: Alternative pattern matching
            if (publications.length === 0) {
                // Try different patterns for citation extraction
                const alternativePattern = /<tr[^>]*class="gsc_a_tr"[^>]*>[\s\S]*?<a[^>]*class="gsc_a_at"[^>]*>([^<]+)<\/a>[\s\S]*?<td[^>]*class="gsc_a_c"[^>]*><a[^>]*>(\d+)<\/a>/g;
                
                while ((match = alternativePattern.exec(html)) !== null) {
                    const title = match[1].trim();
                    const citations = parseInt(match[2]);
                    
                    publications.push({
                        title: title,
                        citations: citations
                    });
                }
            }

            // Method 3: Look for any citation numbers in the page
            if (publications.length === 0) {
                Logger.info('Trying to extract raw citation data...');
                const citationNumbers = html.match(/gsc_a_ac[^>]*>(\d+)</g);
                const titleElements = html.match(/gsc_a_at[^>]*>([^<]+)</g);
                
                if (citationNumbers && titleElements && citationNumbers.length === titleElements.length) {
                    for (let i = 0; i < Math.min(citationNumbers.length, titleElements.length); i++) {
                        const citations = parseInt(citationNumbers[i].match(/(\d+)/)[1]);
                        const title = titleElements[i].match(/>([^<]+)/)[1].trim();
                        
                        publications.push({
                            title: title,
                            citations: citations
                        });
                    }
                }
            }

            Logger.info(`Extracted ${publications.length} publications from Scholar profile`);
            return publications;
            
        } catch (error) {
            Logger.error(`Error parsing Scholar profile: ${error.message}`);
            return [];
        }
    }

    // Match publication titles (fuzzy matching for slight differences)
    matchTitle(localTitle, scholarTitle) {
        const localNorm = TextProcessor.normalizeTitle(localTitle);
        const scholarNorm = TextProcessor.normalizeTitle(scholarTitle);

        // Exact match
        if (localNorm === scholarNorm) return true;

        // Check if one contains the other (for truncated titles)
        if (localNorm.includes(scholarNorm) || scholarNorm.includes(localNorm)) return true;

        // Check first 5 words match (for very long titles)
        const localWords = localNorm.split(' ').slice(0, 5).join(' ');
        const scholarWords = scholarNorm.split(' ').slice(0, 5).join(' ');
        
        return localWords === scholarWords;
    }

    async updateCitationsFromScholar() {
        const config = this.loadConfig();
        
        // Check if citation crawler is enabled
        if (config.settings?.enable_citation_crawler === false) {
            Logger.warning('⚠️  Citation crawler is disabled in configuration');
            Logger.info('💡 To enable: Set "enable_citation_crawler": true in config.json');
            Logger.info('🏁 Skipping citation updates...');
            
            // Apply unified solution: create default structure if no publications exist
            const publications = this.loadPublications();
            if (publications.length === 0) {
                Logger.info('📄 No publications found. Creating default structure for manual entry...');
                this.configManager.createDefaultPublicationsStructure();
            }
            return;
        }

        Logger.info('Google Scholar Profile Citation Crawler');
        Logger.info('==========================================');
        const publications = this.loadPublications();
        
        // Apply unified solution: create default structure if no publications exist
        if (publications.length === 0) {
            Logger.info('📄 No publications found. Creating default structure for manual entry...');
            this.configManager.createDefaultPublicationsStructure();
            return;
        }
        
        // Extract Scholar ID from nested config structure
        let scholarId = config.author?.scholarId || config.scholarId || config.personal?.google_scholar;
        let googleScholarUrl = config.social?.googleScholar || config.googleScholar || config.personal?.google_scholar;
        
        if (!scholarId && !googleScholarUrl) {
            Logger.error('No Scholar ID found in config.json');
            Logger.info('Please add "scholarId" to author section or "googleScholar" to social section');
            return;
        }

        // Extract Scholar ID from Google Scholar URL if needed
        if (!scholarId && googleScholarUrl) {
            const match = googleScholarUrl.match(/user=([^&]+)/);
            scholarId = match ? match[1] : null;
        }

        if (!scholarId) {
            Logger.error('Could not extract Scholar ID from config');
            return;
        }

        Logger.info(`Using Scholar ID: ${scholarId}`);
        Logger.info(`Found ${publications.length} local publications to update\n`);

        // Fetch Scholar profile
        const profileHtml = await this.fetchScholarProfile(scholarId);
        if (!profileHtml) {
            Logger.error('Could not fetch Scholar profile');
            return;
        }

        // Parse publications from Scholar profile
        const scholarPublications = this.parseScholarProfile(profileHtml);
        if (scholarPublications.length === 0) {
            Logger.error('Could not parse publications from Scholar profile');
            Logger.info('This might be due to Google Scholar\'s anti-bot measures');
            Logger.info('Please check manually at: ' + (googleScholarUrl || `https://scholar.google.com/citations?user=${scholarId}`));
            return;
        }

        Logger.info(`Found ${scholarPublications.length} publications in Scholar profile\n`);

        // Match and update citations
        let updated = 0;
        for (const publication of publications) {
            Logger.info(`Matching: "${publication.title.substring(0, 60)}..."`);
            
            let matched = false;
            for (const scholarPub of scholarPublications) {
                if (this.matchTitle(publication.title, scholarPub.title)) {
                    const oldCitations = publication.citations || 0;
                    publication.citations = scholarPub.citations;
                    publication.citations_updated_at = new Date().toISOString();
                    
                    Logger.success(`   Matched with: "${scholarPub.title.substring(0, 60)}..."`);
                    Logger.info(`   Citations: ${oldCitations} → ${scholarPub.citations}`);
                    
                    if (oldCitations !== scholarPub.citations) {
                        updated++;
                    }
                    matched = true;
                    break;
                }
            }
            
            if (!matched) {
                Logger.warning(`   No match found in Scholar profile`);
                publication.citations = publication.citations || 0;
            }
        }

        // Save updated publications
        this.savePublications(publications);
        
        const totalCitations = publications.reduce((sum, pub) => sum + (pub.citations || 0), 0);
        
        Logger.success('Citation update completed!');
        Logger.info('Results:');
        Logger.info(`   • ${publications.length} publications processed`);
        Logger.info(`   • ${updated} citation counts updated`);
        Logger.info(`   • ${totalCitations} total citations`);
        Logger.info(`   • Data source: Google Scholar profile`);
        
        // Show top cited papers
        const topCited = publications
            .filter(pub => pub.citations > 0)
            .sort((a, b) => b.citations - a.citations)
            .slice(0, 5);
            
        if (topCited.length > 0) {
            Logger.info('\nTop cited papers:');
            topCited.forEach((pub, index) => {
                Logger.info(`   ${index + 1}. ${pub.citations} citations: "${pub.title.substring(0, 60)}..."`);
            });
        }
    }
}

// Run Scholar citation crawler
const crawler = new ScholarCitationCrawler();
crawler.updateCitationsFromScholar().catch(console.error);