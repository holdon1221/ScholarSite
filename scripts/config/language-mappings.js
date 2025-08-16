/**
 * Language Configuration and Mappings
 * Centralized language support configuration
 */

const LANGUAGE_MAPPINGS = {
    en: {
        name: 'English',
        nativeName: 'English',
        code: 'en'
    },
    ko: {
        name: 'Korean',
        nativeName: '한국어',
        code: 'ko'
    },
    fr: {
        name: 'French', 
        nativeName: 'Français',
        code: 'fr'
    },
    ja: {
        name: 'Japanese',
        nativeName: '日本語',
        code: 'ja'
    },
    es: {
        name: 'Spanish',
        nativeName: 'Español', 
        code: 'es'
    },
    de: {
        name: 'German',
        nativeName: 'Deutsch',
        code: 'de'
    },
    zh: {
        name: 'Chinese',
        nativeName: '中文',
        code: 'zh'
    }
};

const DEFAULT_TEXTS = {
    title: {
        en: "Type your title",
        ko: "직책 입력",
        fr: "Votre titre",
        ja: "職位を入力",
        es: "Su título",
        de: "Ihr Titel",
        zh: "输入职位"
    },
    bio: {
        en: "This is a placeholder for your bio.",
        ko: "이곳에 당신의 소개글을 입력해주세요.",
        fr: "Ceci est un espace réservé pour votre bio.",
        ja: "これはあなたのプロフィールのプレースホルダーです。",
        es: "Este es un espacio reservado para tu biografía.",
        de: "Dies ist ein Platzhalter für Ihre Bio.",
        zh: "这是一个用于您的简介的占位符。"
    },
    sections: {
        'section-experience': {
            en: 'Experience', ko: '직무 경험', fr: 'Expérience', ja: '職務経歴', 
            es: 'Experiencia', de: 'Erfahrung', zh: '工作经验'
        },
        'section-ongoing-projects': {
            en: 'Ongoing Projects', ko: '진행 중인 프로젝트', fr: 'Projets en cours', ja: '進行中のプロジェクト', 
            es: 'Proyectos en curso', de: 'Laufende Projekte', zh: '进行中的项目'
        },
        'section-publications': {
            en: 'Publications', ko: '출판물', fr: 'Publications', ja: '出版物', 
            es: 'Publicaciones', de: 'Publikationen', zh: '出版物'
        },
        'section-achievements': {
            en: 'Awards & Honors', ko: '수상 및 성과', fr: 'Réalisations', ja: '受賞・表彰', 
            es: 'Logros', de: 'Errungenschaften', zh: '获奖情况'
        },
        'section-education': {
            en: 'Education', ko: '학력', fr: 'Éducation', ja: '学歴', 
            es: 'Educación', de: 'Ausbildung', zh: '教育'
        }
    }
};

class LanguageUtils {
    /**
     * Create multilingual field based on supported languages
     * Used in setup-wizard.js
     */
    static createMultilingualField(userInput, defaultTexts, primaryLang, supportedLanguages) {
        if (supportedLanguages.length === 1) {
            // Single language - return as string
            return userInput || defaultTexts[primaryLang] || defaultTexts.en;
        } else {
            // Multiple languages - return as object
            const result = {};
            
            if (userInput) {
                // If user input exists: primary is user input, others are AI_TRANSLATE_NEEDED
                supportedLanguages.forEach(lang => {
                    result[lang] = (lang === primaryLang) ? userInput : '[AI_TRANSLATE_NEEDED]';
                });
            } else {
                // If user input doesn't exist: defaultTexts
                supportedLanguages.forEach(lang => {
                    result[lang] = defaultTexts[lang] || '[AI_TRANSLATE_NEEDED]';
                });
            }
            
            return result;
        }
    }

    /**
     * Get language choices for inquirer prompts
     */
    static getLanguageChoices() {
        return Object.entries(LANGUAGE_MAPPINGS).map(([code, config]) => ({
            name: `${config.nativeName} (${config.name})`,
            value: code
        }));
    }

    /**
     * Validate language selection
     */
    static validateLanguageSelection(input, answers) {
        if (input.length === 0) {
            return 'Please select at least one language';
        }
        // Check if primary language is included (answers might be undefined in newer inquirer versions)
        if (answers && answers.language && !input.includes(answers.language)) {
            return 'Your primary language must be included in supported languages';
        }
        return true;
    }
}

module.exports = { LANGUAGE_MAPPINGS, DEFAULT_TEXTS, LanguageUtils };