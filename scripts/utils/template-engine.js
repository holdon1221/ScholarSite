/**
 * Template Engine Utilities
 * Common HTML template generation functions
 */

class TemplateEngine {
    /**
     * Generate HTML meta tags
     */
    static generateMetaTags(config) {
        const personal = config.personal || {};
        const language = config.settings?.language || 'en';
        
        return `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${this.escapeHtml(this.getLocalizedText(personal.bio, language))}">
    <meta name="author" content="${this.escapeHtml(personal.name || 'ScholarSite')}">
    <meta name="keywords" content="academic, research, publications, ${this.escapeHtml(personal.name || '')}">
    <meta property="og:title" content="${this.escapeHtml(personal.name || 'ScholarSite')}">
    <meta property="og:description" content="${this.escapeHtml(this.getLocalizedText(personal.bio, language))}">
    <meta property="og:type" content="profile">
    ${personal.email ? `<meta property="og:email" content="${this.escapeHtml(personal.email)}">` : ''}
    <link rel="canonical" href="${config.website || '#'}">
    ${this.generateFaviconTags()}`;
    }

    /**
     * Generate comprehensive favicon tags
     */
    static generateFaviconTags() {
        return `
    <!-- Standard favicons -->
    <link rel="icon" type="image/png" sizes="16x16" href="assets/favicon-16x16.png">
    <link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="48x48" href="assets/favicon-48x48.png">
    
    <!-- Apple touch icon -->
    <link rel="apple-touch-icon" sizes="180x180" href="assets/apple-touch-icon.png">
    
    <!-- Android icons -->
    <link rel="icon" type="image/png" sizes="192x192" href="assets/android-chrome-192x192.png">
    <link rel="icon" type="image/png" sizes="512x512" href="assets/android-chrome-512x512.png">
    
    <!-- Web manifest -->
    <link rel="manifest" href="assets/site.webmanifest">
    
    <!-- Fallback -->
    <link rel="icon" href="assets/favicon.png">`;
    }

    /**
     * Generate navigation links
     */
    static generateNavigation(sections, currentLanguage = 'en') {
        const navItems = [
            { href: '#about', text: this.getLocalizedText({ en: 'About', ko: '소개' }, currentLanguage) },
            { href: '#publications', text: this.getLocalizedText({ en: 'Publications', ko: '논문' }, currentLanguage) },
            { href: '#experience', text: this.getLocalizedText({ en: 'Experience', ko: '경력' }, currentLanguage) },
            { href: '#contact', text: this.getLocalizedText({ en: 'Contact', ko: '연락처' }, currentLanguage) }
        ];
        
        return navItems.map(item => 
            `<a href="${item.href}" class="nav-link">${this.escapeHtml(item.text)}</a>`
        ).join('\n            ');
    }

    /**
     * Generate social media links
     */static generateSocialLinks(personal = {}, social = {}) {
        const e = (s) => this.escapeHtml(String(s || ""));
        const isUrl = (v) => /^https?:\/\//i.test(v || "");
        const u = (base, v) => (isUrl(v) ? v : base + v);

        const items = [];
        if (personal.email)  items.push(`<a href="mailto:${e(personal.email)}" target="_blank" aria-label="Email"><i class="fas fa-envelope"></i></a>`);
        if (personal.email2) items.push(`<a href="mailto:${e(personal.email2)}" target="_blank" aria-label="Email 2"><i class="fa-regular fa-envelope"></i></a>`);

        if (personal.orcid) {
            let id = String(personal.orcid).trim();
            const m = id.match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i);
            if (m) id = m[1];
            const url = isUrl(personal.orcid) ? personal.orcid : `https://orcid.org/${id}`;
            items.push(`<a href="${e(url)}" target="_blank" rel="noopener noreferrer" aria-label="ORCID"><i class="fab fa-orcid"></i></a>`);
        }
        if (personal.google_scholar) {
            const v = String(personal.google_scholar).trim();
            const url = isUrl(v) ? v : `https://scholar.google.com/citations?user=${encodeURIComponent(v)}`;
            items.push(`<a href="${e(url)}" target="_blank" rel="noopener noreferrer" aria-label="Google Scholar"><i class="fas fa-graduation-cap"></i></a>`);
        }

        if (social.github)       items.push(`<a href="${e(u("https://github.com/",       social.github))}"       target="_blank" rel="noopener noreferrer" aria-label="GitHub"><i class="fab fa-github"></i></a>`);
        if (social.linkedin)     items.push(`<a href="${e(u("https://linkedin.com/in/",  social.linkedin))}"     target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><i class="fab fa-linkedin"></i></a>`);
        if (social.twitter)      items.push(`<a href="${e(u("https://x.com/",            social.twitter))}"      target="_blank" rel="noopener noreferrer" aria-label="Twitter"><i class="fab fa-twitter"></i></a>`);
        if (social.bluesky)      items.push(`<a href="${e(u("https://bsky.app/profile/", social.bluesky))}"      target="_blank" rel="noopener noreferrer" aria-label="Bluesky"><i class="fa-brands fa-bluesky"></i></a>`);
        if (social.instagram)    items.push(`<a href="${e(u("https://instagram.com/",    social.instagram))}"    target="_blank" rel="noopener noreferrer" aria-label="Instagram"><i class="fab fa-instagram"></i></a>`);
        if (social.researchgate) items.push(`<a href="${e(u("https://researchgate.net/profile/", social.researchgate))}" target="_blank" rel="noopener noreferrer" aria-label="ResearchGate"><i class="fab fa-researchgate"></i></a>`);

        return items.join("\n                        ");
    }


    /**
     * Generate publication item HTML
     */
    static generatePublicationItem(publication, language = 'en') {
        const title = this.getLocalizedText(publication.title, language);
        const abstract = this.getLocalizedText(publication.abstract, language);
        const year = publication.publicationDate ? new Date(publication.publicationDate).getFullYear() : '';
        const citations = publication.citationCount || 0;
        
        return `
        <div class="publication-item">
            <div class="publication-header">
                <h3 class="publication-title">${this.escapeHtml(title)}</h3>
                <span class="publication-year">${year}</span>
            </div>
            <div class="publication-details">
                <p class="publication-journal">${this.escapeHtml(publication.journal || 'Journal')}</p>
                ${citations > 0 ? `<p class="publication-citations">📊 ${citations} citations</p>` : ''}
                ${publication.doi ? `<p class="publication-doi">DOI: <a href="https://doi.org/${publication.doi}" target="_blank">${publication.doi}</a></p>` : ''}
            </div>
            ${abstract ? `<div class="publication-abstract">
                <p>${this.escapeHtml(this.truncateText(abstract, 200))}</p>
            </div>` : ''}
        </div>`;
    }

    /**
     * Generate experience item HTML
     */
    static generateExperienceItem(experience, language = 'en') {
        const title = this.getLocalizedText(experience.title, language);
        const company = this.getLocalizedText(experience.company, language);
        const description = this.getLocalizedText(experience.description, language);
        
        return `
        <div class="experience-item">
            <div class="experience-header">
                <h3 class="experience-title">${this.escapeHtml(title)}</h3>
                <span class="experience-period">${this.escapeHtml(experience.period || '')}</span>
            </div>
            <p class="experience-company">${this.escapeHtml(company)}</p>
            ${description ? `<p class="experience-description">${this.escapeHtml(description)}</p>` : ''}
        </div>`;
    }

    /**
     * Generate language selector
     */
    static generateLanguageSelector(supportedLanguages, currentLanguage) {
        if (!supportedLanguages || supportedLanguages.length <= 1) return '';
        
        const languageNames = {
            en: 'English',
            ko: '한국어',
            fr: 'Français',
            ja: '日本語',
            es: 'Español',
            de: 'Deutsch',
            zh: '中文'
        };
        
        const options = supportedLanguages.map(lang => 
            `<option value="${lang}" ${lang === currentLanguage ? 'selected' : ''}>
                ${languageNames[lang] || lang}
            </option>`
        ).join('\n                ');
        
        return `
        <div class="language-selector">
            <select id="language-select" onchange="changeLanguage(this.value)">
                ${options}
            </select>
        </div>`;
    }


    /**
     * Generate footer HTML
     */
    static generateFooter(config) {
        const currentYear = new Date().getFullYear();
        const name = config.personal?.name || 'ScholarSite CLI';
        
        return `
    <footer>
        <div class="footer-content">
            <p>&copy; ${currentYear} ${this.escapeHtml(name)} — Built with <a href="https://github.com/holdon1221/ScholarSite" target="_blank" rel="noopener noreferrer">ScholarSite</a> by <a href="https://github.com/holdon1221" target="_blank" rel="noopener noreferrer">Taeyong Lee</a></p>
        </div>
    </footer>`;
    }

    /**
     * Helper: Get localized text
     */
    static getLocalizedText(text, language = 'en') {
        if (!text) return '';
        
        if (typeof text === 'string') {
            return text;
        }
        
        if (typeof text === 'object') {
            return text[language] || text.en || text[Object.keys(text)[0]] || '';
        }
        
        return '';
    }

    /**
     * Helper: Escape HTML
     */
    static escapeHtml(text) {
        if (!text) return '';
        return text.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    /**
     * Helper: Truncate text
     */
    static truncateText(text, maxLength = 150) {
        if (!text || text.length <= maxLength) return text;
        
        const truncated = text.substring(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        
        if (lastSpace > maxLength * 0.8) {
            return truncated.substring(0, lastSpace) + '...';
        }
        return truncated + '...';
    }

    /**
     * Generate CSS variables for theming
     */
    static generateCSSVariables(config) {
        const theme = config.theme || {};
        
        return `
:root {
    --primary-color: ${theme.primaryColor || '#000000'};
    --secondary-color: ${theme.secondaryColor || '#333333'};
    --accent-color: ${theme.accentColor || '#666666'};
    --text-color: ${theme.textColor || '#000000'};
    --text-light: ${theme.textLight || '#666666'};
    --text-lighter: ${theme.textLighter || '#999999'};
    --bg-color: ${theme.bgColor || '#ffffff'};
    --bg-secondary: ${theme.bgSecondary || '#f8f9fa'};
    --bg-tertiary: ${theme.bgTertiary || '#f1f3f4'};
    --border-color: ${theme.borderColor || '#e8eaed'};
    --border-light: ${theme.borderLight || '#f1f3f4'};
    --shadow: ${theme.shadow || '0 1px 3px 0 rgba(0, 0, 0, 0.08)'};
    --shadow-md: ${theme.shadowMd || '0 4px 6px -1px rgba(0, 0, 0, 0.06)'};
    --shadow-lg: ${theme.shadowLg || '0 10px 15px -3px rgba(0, 0, 0, 0.08)'};
    --shadow-xl: ${theme.shadowXl || '0 20px 25px -5px rgba(0, 0, 0, 0.08)'};
    --font-family: ${theme.fontFamily || "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"};
}`;
    }

    /**
     * Generate responsive CSS grid
     */
    static generateResponsiveGrid(items, minWidth = '300px') {
        return `
        .responsive-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(${minWidth}, 1fr));
            gap: 1.5rem;
            padding: 1rem;
        }`;
    }
}

module.exports = TemplateEngine;