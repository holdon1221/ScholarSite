const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const ConfigManager = require('./utils/config-manager');
const HttpClient = require('./utils/http-client');
const TextProcessor = require('./utils/text-processor');
const Logger = require('./utils/logger');

class AITranslator {
    constructor() {
        this.configManager = new ConfigManager();
    }

    async translateConfig() {
        console.log(chalk.blue.bold('\n🌐 AI Translation Service\n'));
        
        // Load config
        if (!this.configManager.hasConfig()) {
            Logger.error('config.json not found. Run setup first.');
            return;
        }

        const config = this.configManager.loadConfig();
        
        // Check if API keys are available
        const apiKeys = this.loadAPIKeys();
        if (!apiKeys.anthropic && !apiKeys.openai) {
            console.log(chalk.yellow('⚠️  No API keys found. Please add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env file.'));
            console.log(chalk.gray('   You can get API keys from:'));
            console.log(chalk.gray('   • Anthropic: https://console.anthropic.com/'));
            console.log(chalk.gray('   • OpenAI: https://platform.openai.com/'));
            console.log(chalk.gray('   • Perplexity: https://www.perplexity.ai/account/api/'));
            console.log(chalk.gray('   • Groq: https://console.groq.com/home/'));
            return;
        }

        const supportedLanguages = config.settings?.supportedLanguages || [config.settings?.language || 'en'];
        const primaryLanguage = config.settings?.language || 'en';

        // Check if translation is needed
        const needsTranslation = this.checkTranslationNeeded(config);
        if (!needsTranslation) {
            console.log(chalk.green('✅ No translations needed. All content is already available in all supported languages.'));
            return;
        }

        console.log(chalk.cyan(`🔍 Found content needing translation to: ${supportedLanguages.filter(lang => lang !== primaryLanguage).join(', ')}`));
        
        const spinner = ora('Translating content with AI...').start();
        
        try {
            const translatedConfig = await this.translateConfigContent(config, apiKeys);
            
            // Save updated config
            this.configManager.saveConfig(translatedConfig);
            
            spinner.succeed('Translation completed successfully!');
            console.log(chalk.green('✅ Config updated with AI translations'));
            console.log(chalk.gray('💡 Run "scholarsite build" to regenerate your homepage'));
            
        } catch (error) {
            spinner.fail('Translation failed');
            console.error(chalk.red('❌ Error during translation:'), error.message);
        }
    }

    loadAPIKeys() {
        this.configManager.loadEnvironment();
        return this.configManager.getApiKeys();
    }

    checkTranslationNeeded(config) {
        const findTranslationNeeded = (obj) => {
            if (typeof obj === 'string') {
                return obj.includes('[AI_TRANSLATE_NEEDED]');
            }
            if (Array.isArray(obj)) {
                return obj.some(item => findTranslationNeeded(item));
            }
            if (typeof obj === 'object' && obj !== null) {
                return Object.values(obj).some(value => findTranslationNeeded(value));
            }
            return false;
        };

        return findTranslationNeeded(config);
    }

    async translateConfigContent(config, apiKeys) {
        const supportedLanguages = config.settings?.supportedLanguages || [config.settings?.language || 'en'];
        const primaryLanguage = config.settings?.language || 'en';
        const targetLanguages = supportedLanguages.filter(lang => lang !== primaryLanguage);

        // Create a deep copy of config
        const translatedConfig = JSON.parse(JSON.stringify(config));

        // Recursive function to translate content
        const translateObject = async (obj, parentKey = '') => {
            if (typeof obj === 'string') {
                return obj; // Strings don't need processing at this level
            }
            
            if (Array.isArray(obj)) {
                // Handle arrays (like description lists)
                const results = [];
                for (let item of obj) {
                    results.push(await translateObject(item, parentKey));
                }
                return results;
            }
            
            if (typeof obj === 'object' && obj !== null) {
                // Check if this is a translatable object (has language codes as keys)
                const keys = Object.keys(obj);
                const hasLanguageKeys = keys.some(key => supportedLanguages.includes(key));
                
                if (hasLanguageKeys) {
                    // This is a translation object - translate missing languages
                    const result = { ...obj };
                    const sourceText = result[primaryLanguage];
                    
                    if (sourceText && typeof sourceText === 'string') {
                        for (let targetLang of targetLanguages) {
                            // Only translate if explicitly marked as needing translation or completely missing
                            if (TextProcessor.needsTranslation(result[targetLang])) {
                                result[targetLang] = await this.translateText(
                                    sourceText, 
                                    primaryLanguage, 
                                    targetLang, 
                                    apiKeys,
                                    parentKey
                                );
                            }
                        }
                    } else if (Array.isArray(sourceText)) {
                        // Handle array translations (like experience descriptions)
                        for (let targetLang of targetLanguages) {
                            // Only translate if explicitly marked as needing translation or completely missing
                            if (TextProcessor.needsTranslation(result[targetLang])) {
                                const translatedArray = [];
                                for (let item of sourceText) {
                                    translatedArray.push(await this.translateText(
                                        item, 
                                        primaryLanguage, 
                                        targetLang, 
                                        apiKeys,
                                        parentKey
                                    ));
                                }
                                result[targetLang] = translatedArray;
                            }
                        }
                    }
                    
                    return result;
                } else {
                    // Regular object - recurse into properties
                    const result = {};
                    for (let [key, value] of Object.entries(obj)) {
                        result[key] = await translateObject(value, key);
                    }
                    return result;
                }
            }
            
            return obj;
        };

        // Translate specific sections
        if (translatedConfig.personal) {
            translatedConfig.personal = await translateObject(translatedConfig.personal, 'personal');
        }
        if (translatedConfig.sectionTitles) {
            translatedConfig.sectionTitles = await translateObject(translatedConfig.sectionTitles, 'sectionTitles');
        }
        if (translatedConfig.experiences) {
            translatedConfig.experiences = await translateObject(translatedConfig.experiences, 'experiences');
        }
        if (translatedConfig.ongoingProject) {
            translatedConfig.ongoingProject = await translateObject(translatedConfig.ongoingProject, 'ongoingProject');
        }
        if (translatedConfig.achievements) {
            translatedConfig.achievements = await translateObject(translatedConfig.achievements, 'achievements');
        }
        if (translatedConfig.education) {
            translatedConfig.education = await translateObject(translatedConfig.education, 'education');
        }

        return translatedConfig;
    }

    async translateText(text, fromLang, toLang, apiKeys, context = '') {
        const languageNames = {
            en: 'English',
            ko: 'Korean',
            fr: 'French',
            ja: 'Japanese',
            es: 'Spanish',
            de: 'German',
            zh: 'Chinese (Simplified)'
        };

        const fromLanguage = languageNames[fromLang] || fromLang;
        const toLanguage = languageNames[toLang] || toLang;

        // Add context-specific instructions
        const contextInstructions = {
            bio: 'This is a professional academic bio. Maintain the professional tone and academic style.',
            title: 'This is an academic job title or position. Translate professionally.',
            sectionTitles: 'These are website section titles (like "Experience", "Education"). Use short, standard academic terms.',
            experiences: 'This is work experience content. Keep it professional and concise.',
            achievements: 'This is about academic achievements and awards. Use formal academic language.',
            education: 'This is about educational background. Use standard academic terminology.',
            ongoingProject: 'This is about a research project. Keep technical terms accurate.'
        };

        const contextHint = contextInstructions[context] || 'Translate professionally and accurately.';

        // Language-specific style guidelines for consistency
        const styleGuides = {
            ja: `
- Use Arabic numerals (2024年) NOT kanji numerals (二〇二四年) for years and dates
- For titles/positions, use standard academic terminology
- Maintain formal academic register (丁寧語/敬語)`,
            zh: `
- Use simplified Chinese characters
- Use Arabic numerals (2024年) for years and dates  
- For titles/positions, use standard mainland academic terminology`,
            es: `
- Use formal academic Spanish
- For dates, follow Spanish conventions (marzo 2024)
- Use standard Latin American academic terminology`,
            de: `
- Use formal academic German
- Capitalize nouns properly
- For dates, use German conventions (März 2024)`,
            ko: `
- Use formal academic Korean (존댓말)
- Use Arabic numerals with Korean units (2024년)
- Follow Korean academic naming conventions`
        };

        const styleGuide = styleGuides[toLang] || '';
        
        const prompt = `You are a professional academic translator. Translate the following ${fromLanguage} text to ${toLanguage}. ${contextHint}

CRITICAL STYLE REQUIREMENTS:${styleGuide}

Text to translate: "${text}"

Requirements:
- Maintain professional academic tone and consistency
- Keep the meaning precise and accurate  
- Use natural, native-sounding ${toLanguage}
- For technical terms, use standard academic translations
- Follow the CRITICAL STYLE REQUIREMENTS above exactly
- Return ONLY the translated text, no quotes, no explanations

Translation:`;

        if (apiKeys.anthropic) {
            return await this.translateWithAnthropic(prompt, apiKeys.anthropic);
        } else if (apiKeys.openai) {
            return await this.translateWithOpenAI(prompt, apiKeys.openai);
        } else if (apiKeys.perplexity) {
            return await this.translateWithPerplexity(prompt, apiKeys.perplexity);
        } else if (apiKeys.groq) {
            return await this.translateWithGroq(prompt, apiKeys.groq);
        }

        throw new Error('No API key available for translation');
    }

    async translateWithAnthropic(prompt, apiKey) {
        try {
            const requestData = JSON.stringify({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 1000,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            });

            const retryConfig = {
                maxRetries: 3,
                retryDelays: [2000, 5000, 10000],
                retryCondition: (error) => error.message.includes('429')
            };

            const data = await HttpClient.makeAnthropicRequest(apiKey, requestData, retryConfig);
            
            // Clean up extra quotes that might be added by the AI
            let translation = data.content[0].text.trim();
            translation = translation.replace(/^["']|["']$/g, ''); // Remove quotes at start/end
            return translation;
        } catch (error) {
            throw error;
        }
    }

    async translateWithOpenAI(prompt, apiKey) {
        try {
            const requestData = JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 1000,
                temperature: 0.3
            });

            const retryConfig = {
                maxRetries: 3,
                retryDelays: [2000, 5000, 10000],
                retryCondition: (error) => error.message.includes('429')
            };

            const data = await HttpClient.makeOpenAIRequest(apiKey, requestData, '/v1/chat/completions', 'api.openai.com', retryConfig);
            
            // Clean up extra quotes that might be added by the AI
            let translation = data.choices[0].message.content.trim();
            translation = translation.replace(/^["']|["']$/g, ''); // Remove quotes at start/end
            return translation;
        } catch (error) {
            throw error;
        }
    }

    async translateWithPerplexity(prompt, apiKey) {
        try {
            const requestData = JSON.stringify({
                model: 'sonar-small-chat',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 1000,
                temperature: 0.3
            });

            const retryConfig = {
                maxRetries: 3,
                retryDelays: [2000, 5000, 10000],
                retryCondition: (error) => error.message.includes('429')
            };

            const data = await HttpClient.makePerplexityRequest(apiKey, requestData, retryConfig);
            
            // Clean up extra quotes that might be added by the AI
            let translation = data.choices[0].message.content.trim();
            translation = translation.replace(/^["']|["']$/g, ''); // Remove quotes at start/end
            return translation;
        } catch (error) {
            throw error;
        }
    }

    async translateWithGroq(prompt, apiKey) {
        try {
            const requestData = JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 1000,
                temperature: 0.3
            });

            const retryConfig = {
                maxRetries: 3,
                retryDelays: [2000, 5000, 10000],
                retryCondition: (error) => error.message.includes('429')
            };

            const data = await HttpClient.makeGroqRequest(apiKey, requestData, retryConfig);
            
            // Clean up extra quotes that might be added by the AI
            let translation = data.choices[0].message.content.trim();
            translation = translation.replace(/^["']|["']$/g, ''); // Remove quotes at start/end
            return translation;
        } catch (error) {
            throw error;
        }
    }

    needsTranslation(value) {
        return TextProcessor.needsTranslation(value);
    }
}

module.exports = AITranslator;

// CLI usage
if (require.main === module) {
    const translator = new AITranslator();
    translator.translateConfig().catch(console.error);
}