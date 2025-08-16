/**
 * File System Utilities
 * Common file operations used across the project
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

class FileSystemUtils {
    /**
     * Cross-platform file/directory opener
     * Used in setup-wizard.js
     */
    static openFileOrDirectory(filePath) {
        try {
            const platform = os.platform();
            let command, args;
            
            // Check if we're in WSL (Windows Subsystem for Linux)
            const isWSL = fs.existsSync('/proc/version') && 
                         fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
            
            if (platform === 'win32' || isWSL) {
                // Windows or WSL - use Windows commands
                if (isWSL) {
                    // In WSL, convert Linux path to Windows path and use explorer.exe
                    const windowsPath = filePath.replace('/mnt/c/', 'C:\\').replace(/\//g, '\\');
                    command = 'explorer.exe';
                    args = [windowsPath];
                } else {
                    // Native Windows
                    command = 'cmd';
                    args = ['/c', 'start', '""', filePath];
                }
            } else if (platform === 'darwin') {
                // macOS
                command = 'open';
                args = [filePath];
            } else {
                // Linux and others
                command = 'xdg-open';
                args = [filePath];
            }
            
            const child = spawn(command, args, { 
                detached: true,
                stdio: 'ignore' 
            });
            
            // Handle spawn errors gracefully
            child.on('error', (error) => {
                const chalk = require('chalk');
                console.log(chalk.yellow(`⚠️  Failed to auto-open ${path.basename(filePath)}`));
                console.log(chalk.gray(`💡 Please open it manually:`));
                try {
                    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
                        console.log(chalk.cyan(`   Directory: ${filePath}`));
                    } else {
                        console.log(chalk.cyan(`   File: ${filePath}`));
                    }
                } catch (statError) {
                    console.log(chalk.cyan(`   Path: ${filePath}`));
                }
            });
            
            child.unref();
            return true;
        } catch (error) {
            const chalk = require('chalk');
            console.log(chalk.yellow(`⚠️  Failed to auto-open ${path.basename(filePath)}`));
            console.log(chalk.gray(`💡 Please open it manually:`));
            if (fs.existsSync(filePath)) {
                if (fs.statSync(filePath).isDirectory()) {
                    console.log(chalk.cyan(`   Directory: ${filePath}`));
                } else {
                    console.log(chalk.cyan(`   File: ${filePath}`));
                }
            } else {
                console.log(chalk.cyan(`   Path: ${filePath}`));
            }
            return false;
        }
    }

    /**
     * Safe JSON file reader with error handling
     * Used across multiple files
     */
    static loadJsonFile(filePath, defaultValue = {}) {
        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(content);
            }
            return defaultValue;
        } catch (error) {
            console.error(`❌ Could not load ${path.basename(filePath)}:`, error.message);
            return defaultValue;
        }
    }

    /**
     * Safe JSON file writer with error handling
     * Used across multiple files
     */
    static saveJsonFile(filePath, data) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error(`❌ Could not save ${path.basename(filePath)}:`, error.message);
            return false;
        }
    }

    /**
     * Ensure directory exists, create if not
     * Used across multiple files
     */
    static ensureDirectory(dirPath) {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                return true;
            }
            return false; // Already existed
        } catch (error) {
            console.error(`❌ Could not create directory ${dirPath}:`, error.message);
            return false;
        }
    }
}

module.exports = FileSystemUtils;