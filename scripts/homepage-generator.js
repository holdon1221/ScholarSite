#!/usr/bin/env node
/**
 * ScholarSite HTML Generator
 *
 * Generates index.html & style.css from templates with runtime substitutions
 */
const fs = require('fs');
const path = require('path');
const ConfigManager = require('./utils/config-manager');
const TemplateEngine = require('./utils/template-engine');
const TextProcessor = require('./utils/text-processor');
const Logger = require('./utils/logger');

// -------- tiny template renderer (placeholder: {{KEY}}) --------
function render(tpl, map) {
  return Object.entries(map).reduce(
    (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v == null ? '' : String(v)),
    tpl
  );
}

class HomepageGenerator {
  constructor() {
    this.configManager = new ConfigManager();
    this.outputDir = process.cwd();
    this.outputFile = path.join(this.outputDir, 'index.html');
    this.styleFile = path.join(this.outputDir, 'style.css');
    this.templatesDir = path.join(process.cwd(), '/scripts/templates'); // <== 새로 추가
  }

  loadConfig() {
    return this.configManager.loadConfig();
  }

  loadPublications() {
    const publications = this.configManager.loadPublications();
    if (publications.length === 0) {
      Logger.warning('No publications found, generating homepage without publications');
    }
    return publications;
  }

  /**
   * 기존의 거대한 CSS 문자열을 없애고,
   * /templates/style_template.css 를 읽어 변수만 치환해서 style.css 생성
   */
  createBasicCSS() {
    const config = this.loadConfig();

    // 1) 템플릿 읽기
    const cssTplPath = path.join(this.templatesDir, 'style_template.css');
    if (!fs.existsSync(cssTplPath)) {
      throw new Error(`Missing template: ${cssTplPath}`);
    }
    const cssTpl = fs.readFileSync(cssTplPath, 'utf8');

    // 2) CSS 변수 치환
    const css = render(cssTpl, {
      CSS_VARIABLES: TemplateEngine.generateCSSVariables(config),
    });

    // 3) 결과 쓰기
    fs.writeFileSync(this.styleFile, css, 'utf8');
    Logger.success('Basic stylesheet created successfully');
  }

  generateDataFiles(config, publications) {
    const supportedLanguages = config.settings?.supportedLanguages || ['en'];

    const placeholders = {
      ko: '초록을 사용할 수 없습니다.',
      fr: 'Résumé non disponible.',
      ja: '概要は利用できません。',
      zh: '摘要不可用。',
      es: 'Resumen no disponible.',
      de: 'Zusammenfassung nicht verfügbar.'
    };

    const processedPublications = publications.map(pub => {
      const processedPub = {
        title: pub.title,
        date: pub.date || new Date().toISOString(),
        journal: pub.journal || 'Academic Journal',
        citations: pub.citations || 0,
        link: pub.link || '#',
        summary: {}
      };
      if (pub.enhanced_at) processedPub.enhanced_at = pub.enhanced_at;

      supportedLanguages.forEach(lang => {
        if (lang === 'en') {
          processedPub.summary[lang] = pub.summary?.en || pub.abstract || "Abstract not available.";
        } else {
          processedPub.summary[lang] = pub.summary?.[lang] || placeholders[lang] || 'Abstract not available.';
        }
      });

      return processedPub;
    });

    this.configManager.savePublications(processedPublications);
  }

  /**
   * 기존의 거대한 HTML 문자열을 없애고,
   * /templates/index_template.html 을 읽어서 치환해 반환
   */
  generateHTML(config, publications) {
    const personal = config.personal || {};
    const social = config.social || {};
    const lang = config.settings?.language || 'en';

    // 1) 템플릿 읽기
    const htmlTplPath = path.join(this.templatesDir, 'index_template.html');
    if (!fs.existsSync(htmlTplPath)) {
      throw new Error(`Missing template: ${htmlTplPath}`);
    }
    const htmlTpl = fs.readFileSync(htmlTplPath, 'utf8');

    // 2) 치환 맵 준비(기존 동작과 동일한 초기 텍스트 주입)
    const map = {
      LANG: lang,
      META_TAGS: TemplateEngine.generateMetaTags(config),
      TITLE: personal.name || 'ScholarSite',
      PERSONAL_NAME: personal.name || 'Your Name',
      TITLE_TEXT: this.getLocalizedTextHelper(personal.title, lang, 'Scholar & Developer'),
      BIO_TEXT: this.getLocalizedTextHelper(personal.bio, lang, 'Passionate researcher exploring the intersection of mathematics and science.'),

      // 네비게이션 라벨
      NAV_EXPERIENCE: this.getLocalizedTextHelper(config.sectionTitles?.['section-experience'], lang, 'Experience'),
      NAV_ONGOING: this.getLocalizedTextHelper(config.sectionTitles?.['section-ongoing-projects'], lang, 'Projects'),
      NAV_PUBLICATIONS: this.getLocalizedTextHelper(config.sectionTitles?.['section-publications'], lang, 'Publications'),
      NAV_ACHIEVEMENTS: this.getLocalizedTextHelper(config.sectionTitles?.['section-achievements'], lang, 'Achievements'),
      NAV_EDUCATION: this.getLocalizedTextHelper(config.sectionTitles?.['section-education'], lang, 'Education'),

      // 섹션 타이틀
      SEC_EXPERIENCE: this.getLocalizedTextHelper(config.sectionTitles?.['section-experience'], lang, 'Experience'),
      SEC_ONGOING: this.getLocalizedTextHelper(config.sectionTitles?.['section-ongoing-projects'], lang, 'Ongoing Projects'),
      SEC_PUBLICATIONS: this.getLocalizedTextHelper(config.sectionTitles?.['section-publications'], lang, 'Publications'),
      SEC_ACHIEVEMENTS: this.getLocalizedTextHelper(config.sectionTitles?.['section-achievements'], lang, 'Achievements'),
      SEC_EDUCATION: this.getLocalizedTextHelper(config.sectionTitles?.['section-education'], lang, 'Education'),

      // 소셜 링크(기존과 동일 마크업)
      SOCIAL_LINKS: TemplateEngine.generateSocialLinks(personal, social),

      // 푸터(기존 함수 그대로 사용)
      FOOTER_HTML: TemplateEngine.generateFooter(config),
    };

    // 3) 치환
    return render(htmlTpl, map);
  }

  async generate() {
    Logger.info('Generating homepage...');
    const config = this.loadConfig();
    const publications = this.loadPublications();

    // CSS / 데이터 / HTML 생성
    this.createBasicCSS();
    this.generateDataFiles(config, publications);

    const html = this.generateHTML(config, publications);
    fs.writeFileSync(this.outputFile, html, 'utf8');

    Logger.success(`Homepage generated: ${this.outputFile}`);
    Logger.success(`Stylesheet created: ${this.styleFile}`);
    Logger.info(`${publications.length} publications included`);

    return this.outputFile;
  }

  getLocalizedTextHelper(data, lang, defaultText = '') {
    return TemplateEngine.getLocalizedText(data, lang) || defaultText;
  }
}

// Run if called directly
if (require.main === module) {
  const generator = new HomepageGenerator();
  generator.generate().catch(console.error);
}

module.exports = HomepageGenerator;
