/**
 * LLM Service Configuration
 * Centralized configuration for all AI services
 */

const LLM_SERVICES = {
    anthropic: {
        name: 'Anthropic Claude',
        envVar: 'ANTHROPIC_API_KEY',
        model: 'claude-3-haiku-20240307',
        endpoint: 'https://api.anthropic.com/v1/messages',
        headers: (apiKey) => ({
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        }),
        priority: 1
    },
    openai: {
        name: 'OpenAI GPT',
        envVar: 'OPENAI_API_KEY', 
        model: 'gpt-4o-mini',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        headers: (apiKey) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }),
        priority: 2
    },
    perplexity: {
        name: 'Perplexity',
        envVar: 'PERPLEXITY_API_KEY',
        model: 'sonar',
        endpoint: 'https://api.perplexity.ai/chat/completions',
        headers: (apiKey) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }),
        priority: 3
    },
    groq: {
        name: 'Groq',
        envVar: 'GROQ_API_KEY',
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        headers: (apiKey) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }),
        priority: 4
    }
};

class LLMServiceDetector {
    /**
     * Detect available LLM services based on environment variables
     * Used in llm-abstracts.js and pdf-abstracts.js
     */
    static detectAvailableServices() {
        const Logger = require('../utils/logger');
        const available = [];
        
        Logger.step('Checking available LLM services:');
        
        for (const [key, service] of Object.entries(LLM_SERVICES)) {
            const hasKey = service.envVar && process.env[service.envVar];
            
            if (hasKey) {
                Logger.serviceAvailable(key, service.envVar);
                available.push({ key, service, priority: service.priority });
            }
        }
        
        // Sort by priority
        available.sort((a, b) => a.priority - b.priority);
        
        if (available.length > 0) {
            Logger.serviceSelected(available[0].key);
            return available[0];
        } else {
            Logger.serviceUnavailable();
            return null;
        }
    }

    /**
     * Get service configuration by key
     */
    static getService(key) {
        return LLM_SERVICES[key] || null;
    }

    /**
     * Get all available service configurations
     */
    static getAllServices() {
        return LLM_SERVICES;
    }
}

module.exports = { LLM_SERVICES, LLMServiceDetector };