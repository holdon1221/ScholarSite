/**
 * LLM Service Manager
 * Centralized management of LLM services, configurations, and request handling
 */

const HttpClient = require('./http-client');
const Logger = require('./logger');

class LLMServiceManager {
    constructor() {
        this.services = {
            anthropic: {
                name: 'Anthropic Claude',
                endpoint: 'https://api.anthropic.com/v1/messages',
                envVar: 'ANTHROPIC_API_KEY',
                models: {
                    haiku: 'claude-3-haiku-20240307',
                    sonnet: 'claude-3-5-sonnet-20241022',
                    fast: 'claude-3-5-haiku-20241022'
                },
                defaultModel: 'claude-3-5-haiku-20241022'
            },
            openai: {
                name: 'OpenAI GPT',
                endpoint: 'https://api.openai.com/v1/chat/completions',
                envVar: 'OPENAI_API_KEY',
                models: {
                    mini: 'gpt-4o-mini',
                    standard: 'gpt-4o',
                    turbo: 'gpt-3.5-turbo'
                },
                defaultModel: 'gpt-4o-mini'
            },
            perplexity: {
                name: 'Perplexity',
                endpoint: 'https://api.perplexity.ai/chat/completions',
                envVar: 'PERPLEXITY_API_KEY',
                models: {
                    sonar: 'sonar',
                    small: 'sonar-small-chat',
                    medium: 'sonar-medium-chat'
                },
                defaultModel: 'sonar'
            },
            groq: {
                name: 'Groq',
                endpoint: 'https://api.groq.com/openai/v1/chat/completions',
                envVar: 'GROQ_API_KEY',
                models: {
                    scout: 'meta-llama/llama-4-scout-17b-16e-instruct',
                    llama: 'llama-3.1-8b-instant',
                    mixtral: 'mixtral-8x7b-32768'
                },
                defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct'
            }
        };
    }

    /**
     * Detect available LLM services based on environment variables
     */
    detectAvailableServices() {
        const availableServices = [];
        
        for (const [serviceKey, service] of Object.entries(this.services)) {
            const apiKey = process.env[service.envVar];
            if (apiKey && apiKey.trim()) {
                availableServices.push({
                    key: serviceKey,
                    service: service,
                    apiKey: apiKey
                });
                Logger.serviceAvailable(service.name, service.envVar);
            }
        }
        
        if (availableServices.length === 0) {
            Logger.serviceUnavailable('No LLM API keys found');
            return null;
        }
        
        // Return the first available service (priority order)
        const selected = availableServices[0];
        Logger.serviceSelected(selected.service.name);
        return selected;
    }

    /**
     * Get service configuration by key
     */
    getService(serviceKey) {
        const service = this.services[serviceKey];
        if (!service) {
            throw new Error(`Unknown service: ${serviceKey}`);
        }
        
        const apiKey = process.env[service.envVar];
        if (!apiKey) {
            throw new Error(`API key not found for ${service.name}`);
        }
        
        return {
            key: serviceKey,
            service: service,
            apiKey: apiKey
        };
    }

    /**
     * Make a request to an LLM service
     */
    async makeRequest(serviceInfo, prompt, options = {}) {
        const { service, apiKey } = serviceInfo;
        const model = options.model || service.defaultModel;
        const maxTokens = options.maxTokens || 1000;
        const temperature = options.temperature || 0.3;

        try {
            if (service.endpoint.includes('anthropic')) {
                return await this.makeAnthropicRequest(service, apiKey, prompt, model, maxTokens, options);
            } else {
                return await this.makeOpenAICompatibleRequest(service, apiKey, prompt, model, maxTokens, temperature, options);
            }
        } catch (error) {
            Logger.error(`LLM request failed for ${service.name}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Make Anthropic API request
     */
    async makeAnthropicRequest(service, apiKey, prompt, model, maxTokens, options = {}) {
        const requestData = JSON.stringify({
            model: model,
            max_tokens: maxTokens,
            messages: [{ role: "user", content: prompt }],
            ...(options.systemPrompt && { system: options.systemPrompt })
        });

        const retryConfig = {
            maxRetries: options.maxRetries || 3,
            retryDelays: options.retryDelays || [2000, 5000, 10000],
            retryCondition: (error) => error.message.includes('429')
        };

        const data = await HttpClient.makeAnthropicRequest(apiKey, requestData, retryConfig);
        
        if (data.content && data.content[0]) {
            return data.content[0].text.trim();
        } else {
            throw new Error('Unexpected Anthropic API response format');
        }
    }

    /**
     * Make OpenAI-compatible API request (OpenAI, Perplexity, Groq)
     */
    async makeOpenAICompatibleRequest(service, apiKey, prompt, model, maxTokens, temperature, options = {}) {
        const messages = [];
        
        if (options.systemPrompt) {
            messages.push({ role: "system", content: options.systemPrompt });
        }
        
        messages.push({ role: "user", content: prompt });

        const requestData = JSON.stringify({
            model: model,
            messages: messages,
            max_tokens: maxTokens,
            temperature: temperature
        });

        const retryConfig = {
            maxRetries: options.maxRetries || 3,
            retryDelays: options.retryDelays || [2000, 5000, 10000],
            retryCondition: (error) => error.message.includes('429')
        };

        let data;
        if (service.endpoint.includes('openai')) {
            data = await HttpClient.makeOpenAIRequest(apiKey, requestData, '/v1/chat/completions', 'api.openai.com', retryConfig);
        } else if (service.endpoint.includes('perplexity')) {
            data = await HttpClient.makePerplexityRequest(apiKey, requestData, retryConfig);
        } else if (service.endpoint.includes('groq')) {
            data = await HttpClient.makeGroqRequest(apiKey, requestData, retryConfig);
        } else {
            throw new Error(`Unsupported service endpoint: ${service.endpoint}`);
        }

        if (data.choices && data.choices[0]) {
            return data.choices[0].message.content.trim();
        } else {
            throw new Error(`Unexpected ${service.name} API response format`);
        }
    }

    /**
     * Get optimal service for a specific task
     */
    getOptimalServiceForTask(taskType = 'general') {
        const preferences = {
            translation: ['anthropic', 'openai', 'perplexity', 'groq'],
            abstract_generation: ['anthropic', 'openai', 'groq', 'perplexity'],
            title_extraction: ['anthropic', 'openai', 'groq', 'perplexity'],
            general: ['anthropic', 'openai', 'perplexity', 'groq']
        };

        const preferredOrder = preferences[taskType] || preferences.general;
        
        for (const serviceKey of preferredOrder) {
            try {
                const serviceInfo = this.getService(serviceKey);
                Logger.serviceSelected(`${serviceInfo.service.name} for ${taskType}`);
                return serviceInfo;
            } catch (error) {
                // Continue to next service if this one is not available
                continue;
            }
        }
        
        return null;
    }

    /**
     * Test service connectivity
     */
    async testService(serviceKey) {
        try {
            const serviceInfo = this.getService(serviceKey);
            const testPrompt = "Hello, this is a connectivity test. Please respond with 'OK'.";
            
            const response = await this.makeRequest(serviceInfo, testPrompt, { maxTokens: 10 });
            Logger.success(`${serviceInfo.service.name} connectivity test passed`);
            return true;
        } catch (error) {
            Logger.error(`${serviceKey} connectivity test failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Get service statistics
     */
    getServiceStats() {
        const stats = {
            total: Object.keys(this.services).length,
            available: 0,
            configured: []
        };

        for (const [serviceKey, service] of Object.entries(this.services)) {
            const apiKey = process.env[service.envVar];
            if (apiKey && apiKey.trim()) {
                stats.available++;
                stats.configured.push({
                    key: serviceKey,
                    name: service.name,
                    hasApiKey: true
                });
            } else {
                stats.configured.push({
                    key: serviceKey,
                    name: service.name,
                    hasApiKey: false
                });
            }
        }

        return stats;
    }
}

module.exports = LLMServiceManager;