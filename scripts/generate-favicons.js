#!/usr/bin/env node

/**
 * Favicon Generator
 * Generates multiple favicon sizes from a source image
 */

const fs = require('fs');
const path = require('path');

// Try to import sharp, with fallback instructions
let sharp;
try {
    sharp = require('sharp');
} catch (error) {
    console.log('📦 Sharp not installed. Installing sharp for image processing...');
    console.log('💡 Run: npm install sharp');
    console.log('💡 Then run this script again');
    process.exit(1);
}

const Logger = require('./utils/logger');

class FaviconGenerator {
    constructor() {
        this.sourceFile = path.join(process.cwd(), 'assets', 'favicon.png');
        this.outputDir = path.join(process.cwd(), 'assets');
        
        // Define all required favicon sizes
        this.sizes = [
            { name: 'favicon-16x16.png', size: 16 },
            { name: 'favicon-32x32.png', size: 32 },
            { name: 'favicon-48x48.png', size: 48 },
            { name: 'apple-touch-icon.png', size: 180 },
            { name: 'android-chrome-192x192.png', size: 192 },
            { name: 'android-chrome-512x512.png', size: 512 }
        ];
    }

    async checkSource() {
        if (!fs.existsSync(this.sourceFile)) {
            throw new Error(`Source favicon not found: ${this.sourceFile}`);
        }
        
        const stats = fs.statSync(this.sourceFile);
        Logger.info(`📷 Source file: ${this.sourceFile} (${(stats.size / 1024).toFixed(1)}KB)`);
    }

    async generateFavicons() {
        Logger.info('🎨 Generating favicon sizes...');
        
        await this.checkSource();
        
        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        const sourceImage = sharp(this.sourceFile);
        const metadata = await sourceImage.metadata();
        
        Logger.info(`📐 Source dimensions: ${metadata.width}x${metadata.height}`);

        // Generate each size
        for (const favicon of this.sizes) {
            try {
                const outputPath = path.join(this.outputDir, favicon.name);
                
                await sourceImage
                    .resize(favicon.size, favicon.size, {
                        kernel: sharp.kernel.lanczos3,
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    })
                    .png({
                        quality: 100,
                        compressionLevel: 9
                    })
                    .toFile(outputPath);
                
                const stats = fs.statSync(outputPath);
                Logger.success(`✅ ${favicon.name} (${favicon.size}x${favicon.size}) - ${(stats.size / 1024).toFixed(1)}KB`);
                
            } catch (error) {
                Logger.error(`❌ Failed to generate ${favicon.name}: ${error.message}`);
            }
        }
    }

    async generateWebManifest() {
        const manifestPath = path.join(this.outputDir, 'site.webmanifest');
        
        const manifest = {
            name: "ScholarSite",
            short_name: "Scholar",
            icons: [
                {
                    src: "assets/android-chrome-192x192.png",
                    sizes: "192x192",
                    type: "image/png"
                },
                {
                    src: "assets/android-chrome-512x512.png", 
                    sizes: "512x512",
                    type: "image/png"
                }
            ],
            theme_color: "#ffffff",
            background_color: "#ffffff",
            display: "standalone"
        };

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        Logger.success(`✅ Generated web manifest: ${manifestPath}`);
    }

    async generate() {
        try {
            await this.generateFavicons();
            await this.generateWebManifest();
            
            Logger.success('🎉 All favicons generated successfully!');
            Logger.info('💡 Files generated:');
            this.sizes.forEach(favicon => {
                Logger.info(`   📄 assets/${favicon.name}`);
            });
            Logger.info('   📄 assets/site.webmanifest');
            
        } catch (error) {
            Logger.error(`❌ Favicon generation failed: ${error.message}`);
            process.exit(1);
        }
    }
}

// Run if called directly
if (require.main === module) {
    const generator = new FaviconGenerator();
    generator.generate();
}

module.exports = FaviconGenerator;