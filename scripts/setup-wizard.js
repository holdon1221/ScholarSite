const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer').default;
const FileSystemUtils = require('./utils/file-system');
const Logger = require('./utils/logger');
const { LanguageUtils, DEFAULT_TEXTS } = require('./config/language-mappings');

class SetupWizard {
    constructor() {
        this.configPath = path.join(process.cwd(), 'config.json');
        this.envPath = path.join(process.cwd(), '.env');
        this.userConfig = {};
    }
    
    // Use modularized file system utilities
    openFileOrDirectory(filePath) {
        return FileSystemUtils.openFileOrDirectory(filePath);
    }

    async run() {
        console.log(chalk.cyan.bold('\n🎓 ScholarSite CLI Setup Wizard\n'));
        console.log(chalk.gray('This wizard will help you set up your professional academic website.'));
        console.log(chalk.gray('Note: You can edit config.json manually after setup if needed\n'));

        try {
            // Step 1: Check existing setup
            await this.checkExistingSetup();
            
            // Step 2: Collect all information
            await this.collectUserInfo();
            await this.collectAcademicInfo();
            await this.collectSocialMedia();
            await this.collectFeaturePreferences();
            await this.configureAPIs();
            
            // Step 3: Show summary and ask for confirmation
            await this.showSummaryAndConfirm();
            
            // Step 4: Setup directories and save (if not already saved)
            await this.setupDirectories();
            if (!this._configAlreadySaved) {
                await this.saveConfiguration();
            }
            
            // Step 5: PDF upload waiting step
            await this.waitForPDFUpload();
            
            // Step 6: Check for API key and run automatic translation
            await this.waitForTranslation();
            await this.checkAndRunTranslation();

            // Step 7: Generate workflows
            await this.showCitationUpdateTutorial();
            
            // Step 8: Final guidance
            await this.showNextSteps();
            
        } catch (error) {
            console.log(chalk.red('\n❌ Setup failed:'), error.message);
            process.exit(1);
        }
    }

    async checkExistingSetup() {
        if (fs.existsSync(this.configPath)) {
            const { overwrite } = await inquirer.prompt([{
                type: 'confirm',
                name: 'overwrite',
                message: '⚠️  Configuration already exists. Overwrite?',
                default: false
            }]);

            if (!overwrite) {
                console.log(chalk.yellow('\n✨ Setup cancelled. Your existing configuration is preserved.'));
                process.exit(0);
            }
        }
    }

    async collectUserInfo() {
        console.log(chalk.blue.bold('\n📋 Personal Information\n'));
        
        const userQuestions = [
            {
                type: 'input',
                name: 'name',
                message: 'Your full name:',
                default: this.userConfig.name || '',
                validate: input => input.trim().length > 0 || 'Name is required'
            },
            {
                type: 'input',
                name: 'email',
                message: 'Primary email address:',
                default: this.userConfig.email || '',
                validate: input => {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    return emailRegex.test(input) || 'Please enter a valid email address';
                }
            },
            {
                type: 'input',
                name: 'email2',
                message: 'Secondary email address (optional):',
                default: this.userConfig.email2 || '',
                validate: input => {
                    if (input.trim() === '') return true;
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    return emailRegex.test(input) || 'Please enter a valid email address';
                }
            },
            {
                type: 'input',
                name: 'title',
                message: 'Academic title/position:',
                default: 'PhD Student',
                validate: input => input.trim().length > 0 || 'Title is required'
            },
            {
                type: 'input',
                name: 'bio',
                message: 'Short bio (2-3 sentences):'
            }
        ];

        const userInfo = await inquirer.prompt(userQuestions);
        this.userConfig = { ...this.userConfig, ...userInfo };
    }

    async collectAcademicInfo() {
        console.log(chalk.blue.bold('\n🎓 Academic Information\n'));
        
        const academicQuestions = [
            {
                type: 'list',
                name: 'language',
                message: 'Primary language for your homepage:',
                choices: [
                    { name: 'English', value: 'en' },
                    { name: '한국어 (Korean)', value: 'ko' },
                    { name: 'Français (French)', value: 'fr' },
                    { name: '日本語 (Japanese)', value: 'ja' },
                    { name: 'Español (Spanish)', value: 'es' },
                    { name: 'Deutsch (German)', value: 'de' },
                    { name: '中文 (Chinese)', value: 'zh' }
                ],
                default: 'en'
            },
            {
                type: 'checkbox',
                name: 'supportedLanguages',
                message: 'Which languages do you want to support? (Select all that apply):',
                choices: (answers) => [
                    { name: 'English', value: 'en', checked: answers.language === 'en' },
                    { name: '한국어 (Korean)', value: 'ko', checked: answers.language === 'ko' },
                    { name: 'Français (French)', value: 'fr', checked: answers.language === 'fr' },
                    { name: '日本語 (Japanese)', value: 'ja', checked: answers.language === 'ja' },
                    { name: 'Español (Spanish)', value: 'es', checked: answers.language === 'es' },
                    { name: 'Deutsch (German)', value: 'de', checked: answers.language === 'de' },
                    { name: '中文 (Chinese)', value: 'zh', checked: answers.language === 'zh' }
                ],
                validate: (input, answers) => {
                    if (input.length === 0) {
                        return 'Please select at least one language';
                    }
                    // Check if primary language is included (answers might be undefined in newer inquirer versions)
                    if (answers && answers.language && !input.includes(answers.language)) {
                        return 'Your primary language must be included in supported languages';
                    }
                    return true;
                }
            },
            {
                type: 'input',
                name: 'orcid',
                message: 'ORCID ID or URL (we\'ll extract the ID automatically):',
                default: '',
                transformer: (input) => {
                  if (!input) return '';
                  const m = input.trim().match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dXx])/);
                  return m ? m[1].toUpperCase() : input;
                },
                filter: (input) => {
                  if (!input) return '';
                  const m = input.trim().match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dXx])/);
                  if (m) {
                    const id = m[1].toUpperCase();
                    return id;
                  }
                  return input.trim();
                },
                validate: (input) => {
                  if (input.trim() === '') return true;
                  const m = input.trim().match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dXx])/);
                  return !!m || 'Please enter a valid ORCID ID (0000-0000-0000-0000) or full ORCID URL';
                }
            },
            {
                type: 'input',
                name: 'google_scholar',
                message: "Google Scholar profile URL (user ID extracted automatically):",
                default: '',
                transformer: (input) => {
                  if (!input) return '';
                  const m = input.trim().match(/[?&]user=([^&#]+)/);
                  return m ? decodeURIComponent(m[1]) : input.trim();
                },
                filter: (input) => {
                  if (!input) return '';
                  input = input.trim();
                  const m = input.match(/[?&]user=([^&#]+)/);
                  const id = m ? decodeURIComponent(m[1]) : input;
                  return id;
                },
                validate: (input) => {
                  const val = (input || '').trim();
                  if (!val) return true; // optional
                  const m = val.match(/[?&]user=([^&#]+)/);
                  const id = m ? decodeURIComponent(m[1]) : val;
                  return /^[A-Za-z0-9_-]{5,}$/.test(id) || 'Please enter a valid Google Scholar user ID or full URL';
                }
            }
        ];

        const academicInfo = await inquirer.prompt(academicQuestions);
        this.userConfig = { ...this.userConfig, ...academicInfo };
    }

    async collectSocialMedia() {
        console.log(chalk.blue.bold('\n🔗 Social Media & Professional Profiles (Optional)\n'));
        
        const socialQuestions = [
            {
                type: 'input',
                name: 'linkedin',
                message: 'LinkedIn username or profile URL (optional):',
                default: '',
                transformer: (input) => {
                    if (!input) return input;
                    // Extract username from URL if provided
                    const match = input.match(/linkedin\.com\/in\/([^\/]+)/);
                    return match ? match[1] : input;
                },
                filter: (input) => {
                  if (!input) return input;
                  const match = input.match(/linkedin\.com\/in\/([^\/]+)/);
                  return match ? match[1] : input;
                }
            },
            {
                type: 'input',
                name: 'github',
                message: 'GitHub username (optional):',
                default: '',
                transformer: (input) => {
                    if (!input) return input;
                    // Extract username from URL if provided
                    const match = input.match(/github\.com\/([^\/]+)/);
                    return match ? match[1] : input;
                },
                filter: (input) => {
                  if (!input) return input;
                  const match = input.match(/github\.com\/([^\/]+)/);
                  return match ? match[1] : input;
                }
            },
            {
                type: 'input',
                name: 'twitter',
                message: 'Twitter/X username (without @, optional):',
                default: '',
                transformer: (input) => {
                    if (!input) return input;
                    // Remove @ if present, extract from URL if provided
                    const urlMatch = input.match(/(?:twitter\.com|x\.com)\/([^\/]+)/);
                    if (urlMatch) return urlMatch[1];
                    return input.replace(/^@/, '');
                },
                filter: (input) => {
                  if (!input) return input;
                  const urlMatch = input.match(/(?:twitter\.com|x\.com)\/([^\/]+)/);
                  if (urlMatch) return urlMatch[1];
                  return input.replace(/^@/, '');
                }
            },
            {
                type: 'input',
                name: 'researchgate',
                message: 'ResearchGate profile name or URL (optional):',
                default: '',
                transformer: (input) => {
                  if (!input) return input;
                  const match = input.match(/researchgate\.net\/profile\/([^\/\?#]+)/i);
                  return match ? match[1] : input.trim();
                },
                filter: (input) => {
                  if (!input) return input;
                  const match = input.match(/researchgate\.net\/profile\/([^\/\?#]+)/i);
                  return match ? match[1] : input.trim();
                }
            },
            {
                type: 'input',
                name: 'bluesky',
                message: 'Bluesky handle (e.g., user.bsky.social, optional):',
                default: '',
                transformer: (input) => {
                    if (!input) return input;
                    // Extract handle from URL if provided
                    const match = input.match(/bsky\.app\/profile\/([^\/]+)/);
                    return match ? match[1] : input;
                },
                filter: (input) => {
                  if (!input) return input;
                  const match = input.match(/bsky\.app\/profile\/([^\/]+)/);
                  return match ? match[1] : input;
                }
            },
            {
                type: 'input',
                name: 'instagram',
                message: 'Instagram username (optional):',
                default: '',
                transformer: (input) => {
                    if (!input) return input;
                    // Extract username from URL if provided
                    const match = input.match(/instagram\.com\/([^\/]+)/);
                    return match ? match[1] : input;
                },
                filter: (input) => {
                  if (!input) return input;
                  const match = input.match(/instagram\.com\/([^\/]+)/);
                  return match ? match[1] : input;
                }
            }
        ];

        const socialInfo = await inquirer.prompt(socialQuestions);
        this.userConfig.social = socialInfo;
    }

    async collectFeaturePreferences() {
        console.log(chalk.blue.bold('\n⚙️ Setup Feature Configuration\n'));
        
        const featureQuestions = [
            {
                type: 'confirm',
                name: 'enable_pdf_extraction',
                message: 'Enable automatic PDF text extraction?',
                default: true
            },
            {
                type: 'confirm',
                name: 'enable_llm_enhancement',
                message: 'Enable AI-powered abstract generation?',
                default: true
            },
            {
                type: 'confirm',
                name: 'enable_citation_crawler',
                message: 'Enable automatic citation updates?',
                default: true
            },
        ];

        const features = await inquirer.prompt(featureQuestions);
        this.userConfig = { ...this.userConfig, ...features };
    }

    async showCitationUpdateTutorial(){
        console.log(chalk.blue.bold('\n📚 Automatic Citation Update Tutorial\n'));
        console.log(chalk.gray('🎯 Automatic Citation Updates within Github Actions'));
        console.log(chalk.gray('━'.repeat(60)));
        const { setSerpApiKey } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'setSerpApiKey',
                message: 'Do you want to add the automatic citation update workflow?',
                default: true
            }
        ]);
        
        if (setSerpApiKey) {
            console.log(chalk.green('\n=== Step 1: Set your SERP_API_KEY in GitHub ==='));
            console.log(chalk.gray('1. Open your repository on GitHub'));
            console.log(chalk.gray('2. Go to: Settings → Secrets and variables → Actions'));
            console.log(chalk.gray('3. Click "New repository secret"'));
            console.log(chalk.gray('4. Name: SERP_API_KEY'));
            console.log(chalk.gray('5. Value: Your SerpAPI key'));
            console.log(chalk.gray('6. Click "Add secret"'));
            
            await inquirer.prompt([
                { type: 'input', 
                name: 'continue',
                message: 'Press Enter after setting the API key...',
                default: '' }
            ]);

            console.log(chalk.green('\n=== Step 2: Configure Git commit identity ==='));
            console.log(chalk.gray('This will be used for update citation commits.'));
            const { userName } = await inquirer.prompt([
            { type: 'input', name: 'userName', message: 'Enter your Git user name:', default: '' }
            ]);
            console.log(chalk.green('✅ Git user name and email set successfully.\n'));
            console.log(chalk.gray('Generating citation update workflow'));

            // Generate requirements.txt
            const requirementsTxt = `google-search-results
python-dotenv`;
            fs.writeFileSync(path.join(process.cwd(), 'requirements.txt'), requirementsTxt);
            console.log(chalk.green('✅ requirements.txt generated successfully.\n'));
            
            // Generate citation update workflow
            await this.generateCitationUpdateWorkflowWithCitationUpdates(userName);
        } else {
            console.log(chalk.yellow('Skipping citation update workflow generation.'));
            console.log(chalk.gray('Generating deployment workflow'));
            await this.generateCitationUpdateWorkflowWithoutCitationUpdates();
        }
    }

    async generateCitationUpdateWorkflowWithCitationUpdates(userName){
        const workflowsDir = path.join(process.cwd(), '.github', 'workflows');
        fs.mkdirSync(workflowsDir, { recursive: true });
    
        const deployYml = `name: Update Citations & Deploy

on:
  push:
    branches:
      - main
  schedule:
    - cron: "0 0 * * *"   # Update every day at 00:00 (UTC)
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  update-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"
          cache-dependency-path: requirements.txt

      - name: Install deps (skip if no requirements.txt)
        if: hashFiles('requirements.txt') != ''
        run: pip install -r requirements.txt

      # 1. Check SerpAPI key, if not set, exit
      - name: Check SerpAPI key
        run: |
          if [ -z "\${{ secrets.SERP_API_KEY }}" ]; then
            echo "No SERP_API_KEY set. Skipping citation update."
            exit 0
          fi

      # 2. Update citations only if there are changes
      - name: Update citations
        env:
          SERP_API_KEY: \${{ secrets.SERP_API_KEY }}
        run: python scripts/gs_crawler.py

      - name: Commit changes
        run: |
          git config user.name "${userName}"
          git config user.email "\${{ github.actor }}@users.noreply.github.com"
          git add data/publications.json
          git commit -m "chore: update citations" || echo "No changes to commit"
          git push

      # 4. Deploy homepage (GitHub Pages)
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - uses: actions/deploy-pages@v4
        `;
        
        const targetPath = path.join(workflowsDir, 'deploy.yml');
        fs.writeFileSync(targetPath, deployYml.trim(), 'utf-8');
    
        console.log(`✅ Workflow created at ${targetPath}`);
    }

    async generateCitationUpdateWorkflowWithoutCitationUpdates() {
    const workflowsDir = path.join(process.cwd(), '.github', 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });

    const deployYml = `name: Deploy ScholarSite

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: .

      - name: Deploy to Pages
        uses: actions/deploy-pages@v4
    `.trim();

    const targetPath = path.join(workflowsDir, 'deploy.yml');
    fs.writeFileSync(targetPath, deployYml, 'utf-8');
    console.log(`✅ Workflow created at ${targetPath}`);
    }

    async configureAPIs() {
        console.log(chalk.blue.bold('\n🔑 API Configuration\n'));
        console.log(chalk.gray('API keys enable advanced features such as AI-powered abstract generation and automatic translation.'));
        console.log(chalk.gray('You can skip this step and configure it later in your .env file.\n'));
    
        const { provider } = await inquirer.prompt([
            {
                type: 'list',
                name: 'provider',
                message: 'Select the API provider you want to use:',
                choices: [
                    { name: 'Anthropic', value: 'ANTHROPIC_API_KEY' },
                    { name: 'OpenAI', value: 'OPENAI_API_KEY' },
                    { name: 'Perplexity', value: 'PERPLEXITY_API_KEY' },
                    { name: 'Groq', value: 'GROQ_API_KEY' },
                    { name: 'Skip for now', value: '' }
                ]
            }
        ]);
    
        if (!provider) {
            console.log(chalk.yellow('⚠️ Skipped API key configuration.'));
            return;
        }
    
        const { apiKey } = await inquirer.prompt([
            {
                type: 'password',
                name: 'apiKey',
                message: `Enter your ${provider} value:`,
                mask: '*',
                validate: input => input.trim() ? true : 'API key cannot be empty'
            }
        ]);
    
        if (apiKey) {
            fs.writeFileSync(this.envPath, `${provider}=${apiKey.trim()}\n`);
            console.log(chalk.green(`✅ Saved ${provider} to .env file`));
        }
    }    

    async setupDirectories() {
        console.log(chalk.blue.bold('\n📁 Directory Setup\n'));
        
        const directories = ['publications', 'data'];
        
        directories.forEach(dir => {
            const fullPath = path.join(process.cwd(), dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                console.log(chalk.green(`✅ Created directory: ${dir}/`));
            }
        });
    }

    async saveConfiguration() {
        console.log(chalk.blue.bold('\n💾 Saving Configuration\n'));
        
        const spinner = ora('Saving configuration...').start();
        
        try {
            // Create comprehensive config with examples
            const finalConfig = this.createCompleteConfig();

            // Save configuration
            fs.writeFileSync(this.configPath, JSON.stringify(finalConfig, null, 2));
            
            spinner.succeed('Configuration saved successfully!');
            
        } catch (error) {
            spinner.fail('Failed to save configuration');
            throw error;
        }
    }

    async showSummaryAndConfirm() {
        console.log(chalk.blue.bold('\n📋 Configuration Summary\n'));
        
        // Display summary of collected information
        console.log(chalk.white('Personal Information:'));
        console.log(chalk.gray(`  Name: ${this.userConfig.name || 'Not provided'}`));
        console.log(chalk.gray(`  Email: ${this.userConfig.email || 'Not provided'}`));
        if (this.userConfig.email2) console.log(chalk.gray(`  Second Email: ${this.userConfig.email2}`));
        console.log(chalk.gray(`  Title: ${this.userConfig.title || 'Not provided'}`));
        
        console.log(chalk.white('\nAcademic Information:'));
        console.log(chalk.gray(`  Language: ${this.userConfig.language || 'en'}`));
        console.log(chalk.gray(`  ORCID: ${this.userConfig.orcid || 'Not provided'}`));
        console.log(chalk.gray(`  Google Scholar: ${this.userConfig.google_scholar || 'Not provided'}`));
        
        console.log(chalk.white('\nSetup Features Enabled:'));
        console.log(chalk.gray(`  PDF Extraction: ${this.userConfig.enable_pdf_extraction ? '✅' : '❌'}`));
        console.log(chalk.gray(`  AI Enhancement: ${this.userConfig.enable_llm_enhancement ? '✅' : '❌'}`));
        console.log(chalk.gray(`  Citation Updates: ${this.userConfig.enable_citation_crawler ? '✅' : '❌'}`));
        
        const { confirmSetup } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmSetup',
                message: '✅ Does this configuration look correct?',
                default: true
            }
        ]);
        
        if (!confirmSetup) {
            // Save current config first
            console.log(chalk.blue('\n💾 Saving current configuration to config.json...'));
            await this.saveConfigurationNow();
            
            console.log(chalk.yellow('\n📝 Please modify config.json as needed, then:'));
            console.log(chalk.white('   • Press Enter when you\'re done editing'));
            
            await inquirer.prompt([{
                type: 'input',
                name: 'continue',
                message: 'Press Enter after modifying config.json to complete setup...',
                default: ''
            }]);
            
            console.log(chalk.green('✅ Configuration updated!'));
            this._configAlreadySaved = true;
            return; // Skip normal save since we already saved
        }
    }

    async saveConfigurationNow() {
        const spinner = ora('Saving configuration...').start();
        
        try {
            // Create comprehensive config with examples
            const finalConfig = this.createCompleteConfig();

            // Save configuration
            fs.writeFileSync(this.configPath, JSON.stringify(finalConfig, null, 2));
            
            spinner.succeed('Configuration saved successfully!');
            
        } catch (error) {
            spinner.fail('Failed to save configuration');
            throw error;
        }
    }

    createCompleteConfig() {
        const primaryLang = this.userConfig.language || 'en';
        const supportedLanguages = this.userConfig.supportedLanguages || [primaryLang];
        
        // Create bio object with only supported languages
        const createMultilingualField = (userInput, defaultTexts) => {
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
        };

        const defaultTitleTexts = {
            en: "Type your title",
            ko: "직책 입력",
            fr: "Votre titre",
            ja: "職位を入力",
            es: "Su título",
            de: "Ihr Titel",
            zh: "输入职位"
        };

        const defaultBioTexts = {
            en: "This is a placeholder for your bio.",
            ko: "이곳에 당신의 소개글을 입력해주세요.",
            fr: "Ceci est un espace réservé pour votre bio.",
            ja: "これはあなたのプロフィールのプレースホルダーです。",
            es: "Este es un espacio reservado para tu biografía.",
            de: "Dies ist ein Platzhalter für Ihre Bio.",
            zh: "这是一个用于您的简介的占位符。"
        };

        return {
            personal: {
                name: this.userConfig.name || "Your Name",
                email: this.userConfig.email || "your.email@university.edu",
                email2: this.userConfig.email2 || "",
                title: createMultilingualField(this.userConfig.title, defaultTitleTexts),
                orcid: this.userConfig.orcid || "",
                google_scholar: this.userConfig.google_scholar || "",
                bio: createMultilingualField(this.userConfig.bio, defaultBioTexts)
            },
            settings: {
                language: primaryLang,
                supportedLanguages: supportedLanguages,
                enable_pdf_extraction: this.userConfig.enable_pdf_extraction !== false,
                enable_llm_enhancement: this.userConfig.enable_llm_enhancement !== false,
                enable_citation_crawler: this.userConfig.enable_citation_crawler !== false
            },
            social: {
                github: this.userConfig.social?.github || "",
                linkedin: this.userConfig.social?.linkedin || "",
                twitter: this.userConfig.social?.twitter || "",
                bluesky: this.userConfig.social?.bluesky || "",
                instagram: this.userConfig.social?.instagram || "",
                researchgate: this.userConfig.social?.researchgate || ""
            },
            directories: {
                publications: './publications',
                output: './'
            },
            // Section title translations
            sectionTitles: {
                'section-experience': createMultilingualField(null, {
                    en: 'Experience', ko: '직무 경험', fr: 'Expérience', ja: '職務経歴', 
                    es: 'Experiencia', de: 'Erfahrung', zh: '工作经验'
                }),
                'section-ongoing-projects': createMultilingualField(null, {
                    en: 'Ongoing Projects', ko: '진행 중인 프로젝트', fr: 'Projets en cours', ja: '進行中のプロジェクト', 
                    es: 'Proyectos en curso', de: 'Laufende Projekte', zh: '进行中的项目'
                }),
                'section-publications': createMultilingualField(null, {
                    en: 'Publications', ko: '출판물', fr: 'Publications', ja: '出版物', 
                    es: 'Publicaciones', de: 'Publikationen', zh: '出版物'
                }),
                'section-achievements': createMultilingualField(null, {
                    en: 'Awards & Honors', ko: '수상 및 성과', fr: 'Réalisations', ja: '受賞・表彰', 
                    es: 'Logros', de: 'Errungenschaften', zh: '获奖情况'
                }),
                'section-education': createMultilingualField(null, {
                    en: 'Education', ko: '학력', fr: 'Éducation', ja: '学歴', 
                    es: 'Educación', de: 'Ausbildung', zh: '教育'
                })
            },
            // Add example structures for user guidance
            experiences: this.getExperienceExamples(primaryLang, supportedLanguages),
            ongoingProject: this.getOngoingProjectExample(primaryLang, supportedLanguages),
            achievements: this.getAchievementExamples(primaryLang, supportedLanguages),
            education: this.getEducationExamples(primaryLang, supportedLanguages)
        };
    }

    getExperienceExamples(primaryLang, supportedLanguages) {
        const createMultilingualField = (texts) => {
            if (supportedLanguages.length === 1) {
                return texts[primaryLang] || texts.en;
            } else {
                // Multiple languages - return as object
                const result = {};
                supportedLanguages.forEach(lang => {
                    result[lang] = texts[lang] || '[AI_TRANSLATE_NEEDED]';
                });
                return result;
            }
        };

        const defaultTitle = {
            en: "Current Title",
            ko: "현재 직위",
            fr: "Titre actuel",
            ja: "現在の職位",
            es: "Cargo actual",
            de: "Aktueller Titel",
            zh: "当前职位"
        }
        const defaultTitle2 = {
            en: "Previous Title",
            ko: "이전 직위",
            fr: "Titre précédent",
            ja: "以前の職位",
            es: "Cargo anterior",
            de: "Vorheriger Titel",
            zh: "前职位"
        }
        const defaultLocation = {
            en: "Seoul, Korea",
            ko: "서울, 한국",
            fr: "Séoul, Corée",
            ja: "ソウル、韓国",
            es: "Seúl, Corea",
            de: "Seoul, Korea",
            zh: "首尔, 韩国"
        }
        const defaultLocation2 = {
            en: "New York, USA",
            ko: "뉴욕, 미국",
            fr: "New York, États-Unis",
            ja: "ニューヨーク、アメリカ",
            es: "New York, Estados Unidos",
            de: "New York, USA",
            zh: "纽约, 美国"
        }
        const defaultPeriod = {
            en: "Mar. 2024-present",
            ko: "2024년 3월-현재",
            fr: "Mar. 2024-présent",
            ja: "2024年3月-現在",
            es: "Marzo 2024-presente",
            de: "März 2024-heute",
            zh: "2024年3月-至今"
        }
        const defaultPeriod2 = {
            en: "Sep. 2023-Feb. 2024",
            ko: "2023년 9월-2024년 2월",
            fr: "Sep. 2023-Fév. 2024",
            ja: "2023年9月-2024年2月",
            es: "Septiembre 2023-Febrero 2024",
            de: "September 2023-Februar 2024",
            zh: "2023年9月-2024年2月"
        }
        const defaultDescription = {
            en: ["Modify config.json", "Add description"],
            ko: ["config.json 수정", "설명 추가"],
            fr: ["Modifier config.json", "Ajouter une description"],
            ja: ["config.jsonを編集", "説明を追加"],
            es: ["Modificar config.json", "Agregar descripción"],
            de: ["config.json bearbeiten", "Beschreibung hinzufügen"],
            zh: ["修改 config.json", "添加描述"]
        }

        return [
            {
                title: createMultilingualField(defaultTitle),
                location: createMultilingualField(defaultLocation),
                period: createMultilingualField(defaultPeriod),
                description: createMultilingualField(defaultDescription)
            },
            {
                title: createMultilingualField(defaultTitle2),
                location: createMultilingualField(defaultLocation2),
                period: createMultilingualField(defaultPeriod2),
                description: createMultilingualField(defaultDescription)
            }
        ];
    }

    getOngoingProjectExample(primaryLang, supportedLanguages) {
        const createMultilingualField = (texts) => {
            if (supportedLanguages.length === 1) {
                return texts[primaryLang] || texts.en;
            } else {
                // Multiple languages - return as object
                const result = {};
                supportedLanguages.forEach(lang => {
                    result[lang] = texts[lang] || '[AI_TRANSLATE_NEEDED]';
                });
                return result;
            }
        };

        const nameTexts = {
            en: "Research Project",
            ko: "연구 프로젝트",
            fr: "Projet de Recherche",
            ja: "研究プロジェクト",
            es: "Proyecto de Investigación",
            de: "Forschungsprojekt",
            zh: "研究项目"
        };

        const descTexts = {
            en: "Developing innovative solutions for complex research problems",
            ko: "복잡한 연구 문제에 대한 혁신적 솔루션 개발",
            fr: "Développement de solutions innovantes pour des problèmes de recherche complexes",
            ja: "複雑な研究問題に対する革新的ソリューションの開発",
            es: "Desarrollo de soluciones innovadoras para problemas de investigación complejos",
            de: "Entwicklung innovativer Lösungen für komplexe Forschungsprobleme",
            zh: "为复杂研究问题开发创新解决方案"
        };

        return [{
            name: createMultilingualField(nameTexts),
            progress: 85,
            description: createMultilingualField(descTexts)
        }];
    }

    getAchievementExamples(primaryLang, supportedLanguages) {
        const createMultilingualField = (texts) => {
            if (supportedLanguages.length === 1) {
                return texts[primaryLang] || texts.en;
            } else {
                // Multiple languages - return as object
                const result = {};
                supportedLanguages.forEach(lang => {
                    result[lang] = texts[lang] || '[AI_TRANSLATE_NEEDED]';
                });
                return result;
            }
        };

        const award1Name = {
            en: "Excellence in Research Award",
            ko: "연구 우수상",
            fr: "Prix d'Excellence en Recherche",
            ja: "研究優秀賞",
            es: "Premio de Excelencia en Investigación",
            de: "Forschungsexzellenz-Auszeichnung",
            zh: "研究优秀奖"
        };

        const award1Where = {
            en: "Academic Society",
            ko: "학술회",
            fr: "Société Académique",
            ja: "学術会",
            es: "Sociedad Académica",
            de: "Akademische Gesellschaft",
            zh: "学术会"
        };

        const award2Name = {
            en: "Best Paper Award",
            ko: "최우수 논문상",
            fr: "Prix du Meilleur Article",
            ja: "最優秀論文賞",
            es: "Premio al Mejor Artículo",
            de: "Beste Arbeit Auszeichnung",
            zh: "最佳论文奖"
        };

        const award2Where = {
            en: "International Research Conference",
            ko: "국제 연구 컨퍼런스",
            fr: "Conférence Internationale de Recherche",
            ja: "国際研究会議",
            es: "Conferencia Internacional de Investigación",
            de: "Internationale Forschungskonferenz",
            zh: "国际研究会议"
        };

        const period2024 = {
            en: "Aug. 2024",
            ko: "2024년 8월",
            fr: "Août 2024",
            ja: "2024年8月",
            es: "Agosto 2024",
            de: "August 2024",
            zh: "2024年8月"
        };

        const period2023 = {
            en: "2023",
            ko: "2023년",
            fr: "2023",
            ja: "2023年",
            es: "2023",
            de: "2023",
            zh: "2023年"
        };

        return [
            {
                name: createMultilingualField(award1Name),
                period: createMultilingualField(period2024),
                where: createMultilingualField(award1Where)
            },
            {
                name: createMultilingualField(award2Name),
                period: createMultilingualField(period2023),
                where: createMultilingualField(award2Where)
            }
        ];
    }

    getEducationExamples(primaryLang, supportedLanguages) {
        const createMultilingualField = (texts) => {
            if (supportedLanguages.length === 1) {
                return texts[primaryLang] || texts.en;
            } else {
                // Multiple languages - return as object
                const result = {};
                supportedLanguages.forEach(lang => {
                    result[lang] = texts[lang] || '[AI_TRANSLATE_NEEDED]';
                });
                return result;
            }
        };

        const phdDegree = {
            en: "Ph.D. in Research Field",
            ko: "연구 분야 박사",
            fr: "Doctorat en Domaine de Recherche",
            ja: "研究分野博士",
            es: "Doctorado en Campo de Investigación",
            de: "Doktorat im Forschungsbereich",
            zh: "研究领域博士"
        };

        const mastersDegree = {
            en: "M.S. in Research Field",
            ko: "연구 분야 석사",
            fr: "Master en Domaine de Recherche",
            ja: "研究分野修士",
            es: "Maestría en Campo de Investigación",
            de: "Master im Forschungsbereich",
            zh: "研究领域硕士"
        };

        const university1 = {
            en: "Research University",
            ko: "연구 대학교",
            fr: "Université de Recherche",
            ja: "研究大学",
            es: "Universidad de Investigación",
            de: "Forschungsuniversität",
            zh: "研究型大学"
        };

        const university2 = {
            en: "Academic University",
            ko: "학술 대학교",
            fr: "Université Académique",
            ja: "学術大学",
            es: "Universidad Académica",
            de: "Akademische Universität",
            zh: "学术大学"
        };

        const currentPeriod = {
            en: "2022-present",
            ko: "2022년-현재",
            fr: "2022-présent",
            ja: "2022年-現在",
            es: "2022-presente",
            de: "2022-heute",
            zh: "2022年-至今"
        };

        const pastPeriod = {
            en: "2020-2022",
            ko: "2020년-2022년",
            fr: "2020-2022",
            ja: "2020年-2022年",
            es: "2020-2022",
            de: "2020-2022",
            zh: "2020年-2022年"
        };

        return [
            {
                degree: createMultilingualField(phdDegree),
                university: createMultilingualField(university1),
                period: createMultilingualField(currentPeriod),
                gpa: "3.9/4.0"
            },
            {
                degree: createMultilingualField(mastersDegree),
                university: createMultilingualField(university2),
                period: createMultilingualField(pastPeriod),
                gpa: "4.0/4.0"
            }
        ];
    }

    async waitForPDFUpload() {
        console.log(chalk.blue.bold('\n📄 PDF Upload Step\n'));
        console.log(chalk.yellow('⚠️  IMPORTANT DISCLAIMER:'));
        console.log(chalk.gray('   • PDF files will be processed and then REMOVED for copyright safety'));
        console.log(chalk.gray('   • Only extracted information will be kept in the database'));
        console.log(chalk.gray('   • This protects you from accidentally distributing copyrighted content online\n'));
        
        console.log(chalk.white('📂 Please add your publication PDFs to:'));
        console.log(chalk.cyan('   ./publications/\n'));
        
        console.log(chalk.gray('💡 Tips:'));
        console.log(chalk.gray('   • Add 2-10 of your best/recent papers'));
        console.log(chalk.gray('   • Ensure PDFs are text-searchable (not scanned images)'));
        console.log(chalk.gray('   • PDFs will be deleted after information extraction'));
        console.log(chalk.gray('   • You can always add more papers later\n'));
        
        // Auto-open publications directory
        const pubDir = path.join(process.cwd(), 'publications');
        if (!fs.existsSync(pubDir)) {
            fs.mkdirSync(pubDir, { recursive: true });
            console.log(chalk.blue(`📁 Created ./publications/ directory`));
        }
        
        console.log(chalk.blue('🚀 Opening publications directory...'));
        try {
            this.openFileOrDirectory(pubDir);
            console.log(chalk.green('✅ Publications directory opened!'));
        } catch (error) {
            console.log(chalk.yellow('⚠️  Could not open publications directory automatically'));
            console.log(chalk.gray(`💡 Please open manually: ${pubDir}`));
        }
        
        await inquirer.prompt([{
            type: 'input',
            name: 'continue',
            message: 'Press Enter after adding your PDF files to ./publications/',
            default: ''
        }]);
        
        // Check if any PDFs were added
        const pdfFiles = fs.readdirSync(pubDir).filter(f => f.endsWith('.pdf'));
        if (pdfFiles.length > 0) {
            console.log(chalk.green(`✅ Found ${pdfFiles.length} PDF file(s) ready for processing`));
        } else {
            console.log(chalk.yellow('⚠️  No PDF files found. That\'s okay!'));
            console.log(chalk.gray('   You can add them later and run: scholarsite build'));
        }
    }

    async waitForTranslation() {
        console.log(chalk.blue.bold('\n🤖 Translation Step\n'));
        console.log(chalk.yellow('⚠️  IMPORTANT:'));
        console.log(chalk.gray('   • You can edit config.json if needed'));
        console.log(chalk.gray('   • If you want to have AI translate something, add [AI_TRANSLATE_NEEDED] to the value'));
        console.log(chalk.gray('   • For example: "description": "[AI_TRANSLATE_NEEDED]"'));
        console.log('\n');
        
        // Auto-open config.json if it exists
        if (fs.existsSync(this.configPath)) {
            console.log(chalk.blue('🚀 Opening config.json for editing...'));
            try {
                this.openFileOrDirectory(this.configPath);
                console.log(chalk.green('✅ Config.json opened in your default editor!'));
            } catch (error) {
                console.log(chalk.yellow('⚠️  Could not open config.json automatically'));
                console.log(chalk.gray(`💡 Please open manually: ${this.configPath}`));
            }
        } else {
            console.log(chalk.yellow('⚠️  config.json not found. Please run setup first.'));
        }
        
        await inquirer.prompt([{
            type: 'input',
            name: 'continue',
            message: 'Press Enter after editing config.json if needed',
            default: ''
        }]);
    }

    async checkAndRunTranslation() {
        const envPath = path.join(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const hasApiKey = /^(ANTHROPIC_API_KEY|OPENAI_API_KEY|PERPLEXITY_API_KEY|GROQ_API_KEY)\s*=\s*[^\s]+/m.test(envContent);
            
            const supportedLanguages = this.userConfig.supportedLanguages || [this.userConfig.language || 'en'];
            
            if (hasApiKey && supportedLanguages && supportedLanguages.length > 1) {
                console.log(chalk.blue('\n🤖 API key detected! Running automatic translation...'));
                
                try {
                    const AITranslator = require('./ai-translator.js');
                    const translator = new AITranslator();
                    await translator.translateConfig();
                    console.log(chalk.green('✅ Automatic translation completed!'));
                } catch (error) {
                    console.log(chalk.yellow('⚠️  Translation failed, you can run it manually later: scholarsite translate'));
                    console.log(chalk.gray(`Error: ${error.message}`));
                }
            } else if (!hasApiKey && supportedLanguages && supportedLanguages.length > 1) {
                console.log(chalk.yellow('\n💡 Multiple languages detected but no API key found.'));
                console.log(chalk.gray('Add your API key to .env and run: scholarsite translate'));
            }
        }
    }

    async showNextSteps() {
        console.log(chalk.green.bold('\n🎉 Setup Complete!\n'));
        console.log(chalk.cyan('📋 Next steps:'));
        console.log(chalk.white('   1. Run: scholarsite build'));
        console.log(chalk.white('   2. Run: scholarsite serve'));
        console.log(chalk.gray('\n💡 Tips:'));
        console.log(chalk.gray('   • Edit config.json to customize experiences, achievements, education'));
        console.log(chalk.gray('   • Use scholarsite status to check system status'));
        console.log(chalk.gray('   • Add more PDFs anytime to ./publications/ and rebuild\n'));
    }
}

module.exports = SetupWizard;