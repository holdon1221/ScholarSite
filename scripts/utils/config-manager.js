/**
 * Configuration Manager
 * Centralized configuration and data file management
 */

const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor() {
        this.rootPath = process.cwd();
        this.configFile = path.join(this.rootPath, 'config.json');
        this.publicationsFile = path.join(this.rootPath, 'data', 'publications.json');
        this.envFile = path.join(this.rootPath, '.env');
    }

    /**
     * Load configuration with error handling
     */
    loadConfig() {
        try {
            if (fs.existsSync(this.configFile)) {
                const content = fs.readFileSync(this.configFile, 'utf8');
                return JSON.parse(content);
            }
            return {};
        } catch (error) {
            console.error('❌ Could not load config.json:', error.message);
            return {};
        }
    }

    /**
     * Save configuration with error handling
     */
    saveConfig(config) {
        try {
            fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
            return true;
        } catch (error) {
            console.error('❌ Could not save config.json:', error.message);
            return false;
        }
    }

    /**
     * Load publications with error handling
     */
    loadPublications() {
        try {
            if (fs.existsSync(this.publicationsFile)) {
                const content = fs.readFileSync(this.publicationsFile, 'utf8');
                return JSON.parse(content);
            }
            return [];
        } catch (error) {
            console.error('❌ Could not load publications.json:', error.message);
            return [];
        }
    }

    /**
     * Save publications with error handling
     */
    savePublications(publications) {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.publicationsFile);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            
            fs.writeFileSync(this.publicationsFile, JSON.stringify(publications, null, 2));
            return true;
        } catch (error) {
            console.error('❌ Could not save publications.json:', error.message);
            return false;
        }
    }

    /**
     * Create default publications structure when no publications exist
     * Unified solution for all scenarios where publications are missing
     */
    createDefaultPublicationsStructure() {
        const Logger = require('./logger');
        
        // Ensure the data directory exists
        const dataDir = path.dirname(this.publicationsFile);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            Logger.info(`📁 Created data directory: ${dataDir}`);
        }
        
        // Check if publications.json already exists and has content
        if (fs.existsSync(this.publicationsFile)) {
            try {
                const existing = JSON.parse(fs.readFileSync(this.publicationsFile, 'utf8'));
                if (existing.length > 0) {
                    Logger.info('📄 publications.json already has content');
                    return false; // Indicates no action taken
                }
            } catch (error) {
                Logger.warning('📄 publications.json exists but is invalid, recreating...');
            }
        }
        
        // Get supported languages from config
        const config = this.loadConfig();
        const supportedLanguages = config.settings?.supportedLanguages || ['en'];
        
        // Create multilingual summary helper
        const createMultiLanguageSummary = (englishText) => {
            const summary = {};
            const placeholders = {
                ko: '초록을 사용할 수 없습니다.',
                fr: 'Résumé non disponible.',
                ja: '概要は利用できません。',
                zh: '摘要不可用。',
                es: 'Resumen no disponible.',
                de: 'Zusammenfassung nicht verfügbar.'
            };
            
            for (const lang of supportedLanguages) {
                if (lang === 'en') {
                    summary[lang] = englishText;
                } else {
                    summary[lang] = placeholders[lang] || 'Abstract not available.';
                }
            }
            return summary;
        };
        
        // Create formatted date helper
        const formatDateForDisplay = (dateString) => {
            const result = {};
            supportedLanguages.forEach(lang => {
                result[lang] = dateString; // Simple fallback
            });
            return result;
        };
        
        // Create default structure with field examples for manual entry
        const defaultStructure = [{
            "date": "2024-01-01",
            "title": "Example Publication Title - Replace with your paper title",
            "journal": "Example Journal Name - Replace with actual journal", 
            "link": "https://example.com/paper - Replace with DOI or paper URL",
            "citations": 0,
            "summary": createMultiLanguageSummary("Replace this with your paper's abstract or summary."),
            "fetched_at": new Date().toISOString(),
            "pdf_file": null,
            "formatted_date": formatDateForDisplay("2024-01-01")
        }];
        
        fs.writeFileSync(this.publicationsFile, JSON.stringify(defaultStructure, null, 2));
        Logger.success(`✅ Created default publications.json structure`);
        Logger.info('💡 Edit data/publications.json to add your publications manually');
        Logger.info('🔄 Then run the build command again to generate your homepage');
        
        return true; // Indicates structure was created
    }

    /**
     * Load environment variables from .env file
     */
    loadEnvironment() {
        try {
            if (fs.existsSync(this.envFile)) {
                const envContent = fs.readFileSync(this.envFile, 'utf8');
                const lines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
                
                const envVars = {};
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.includes('=')) {
                        const [key, ...valueParts] = trimmed.split('=');
                        const value = valueParts.join('=');
                        envVars[key.trim()] = value.trim();
                        
                        // Set in process.env if not already set
                        if (!process.env[key.trim()]) {
                            process.env[key.trim()] = value.trim();
                        }
                    }
                }
                return envVars;
            }
            return {};
        } catch (error) {
            console.error('❌ Could not load .env file:', error.message);
            return {};
        }
    }

    /**
     * Check if configuration exists
     */
    hasConfig() {
        return fs.existsSync(this.configFile);
    }

    /**
     * Check if publications exist
     */
    hasPublications() {
        return fs.existsSync(this.publicationsFile);
    }

    /**
     * Get file paths
     */
    getPaths() {
        return {
            config: this.configFile,
            publications: this.publicationsFile,
            env: this.envFile,
            root: this.rootPath
        };
    }

    /**
     * Backup configuration
     */
    backupConfig() {
        try {
            if (fs.existsSync(this.configFile)) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupPath = path.join(this.rootPath, `config.backup.${timestamp}.json`);
                fs.copyFileSync(this.configFile, backupPath);
                return backupPath;
            }
            return null;
        } catch (error) {
            console.error('❌ Could not backup config:', error.message);
            return null;
        }
    }

    /**
     * Get API keys from environment
     */
    getApiKeys() {
        return {
            anthropic: process.env.ANTHROPIC_API_KEY,
            openai: process.env.OPENAI_API_KEY,
            perplexity: process.env.PERPLEXITY_API_KEY,
            groq: process.env.GROQ_API_KEY,
            serp: process.env.SERP_API_KEY
        };
    }

    /**
     * Check if any API key is available
     */
    hasApiKey() {
        const keys = this.getApiKeys();
        return Object.values(keys).some(key => key && key.trim());
    }
}

module.exports = ConfigManager;