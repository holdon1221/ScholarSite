/**
 * HTTP Client Utilities
 * Centralized HTTP request handling with retry logic
 */

const https = require('https');

class HttpClient {
    static async makeRequest(options, data = null, retryConfig = {}) {
        const { 
            maxRetries = 3, 
            retryDelays = [1000, 2000, 4000],
            retryCondition = (error) => error.message.includes('429')
        } = retryConfig;

        return new Promise((resolve, reject) => {
            const attemptRequest = (retryCount = 0) => {
                const req = https.request(options, (res) => {
                    let responseData = '';
                    res.on('data', chunk => responseData += chunk);
                    res.on('end', () => {
                        try {
                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                const parsedData = JSON.parse(responseData);
                                resolve(parsedData);
                            } else {
                                reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                            }
                        } catch (error) {
                            reject(new Error(`Parse error: ${error.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    if (retryCondition(error) && retryCount < maxRetries) {
                        const delay = retryDelays[retryCount] || retryDelays[retryDelays.length - 1];
                        console.log(`⏳ API error (${error.message}), waiting ${delay/1000}s before retry ${retryCount + 1}/${maxRetries}...`);
                        setTimeout(() => attemptRequest(retryCount + 1), delay);
                    } else {
                        reject(error);
                    }
                });

                if (data) {
                    req.write(data);
                }
                req.end();
            };

            attemptRequest();
        });
    }

    static async makeAnthropicRequest(apiKey, requestData, retryConfig = {}) {
        const options = {
            hostname: 'api.anthropic.com',
            port: 443,
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Length': Buffer.byteLength(requestData)
            }
        };

        return this.makeRequest(options, requestData, retryConfig);
    }

    static async makeOpenAIRequest(apiKey, requestData, endpoint = '/v1/chat/completions', hostname = 'api.openai.com', retryConfig = {}) {
        const options = {
            hostname: hostname,
            port: 443,
            path: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(requestData)
            }
        };

        return this.makeRequest(options, requestData, retryConfig);
    }

    static async makePerplexityRequest(apiKey, requestData, retryConfig = {}) {
        return this.makeOpenAIRequest(apiKey, requestData, '/chat/completions', 'api.perplexity.ai', retryConfig);
    }

    static async makeGroqRequest(apiKey, requestData, retryConfig = {}) {
        return this.makeOpenAIRequest(apiKey, requestData, '/openai/v1/chat/completions', 'api.groq.com', retryConfig);
    }

    static async makeScholarRequest(scholarId, retryConfig = {}) {
        const options = {
            hostname: 'scholar.google.com',
            port: 443,
            path: `/citations?user=${scholarId}&hl=en&pagesize=100`,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            });

            req.on('error', reject);
            req.end();
        });
    }
}

module.exports = HttpClient;