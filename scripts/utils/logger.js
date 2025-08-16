/**
 * Standardized Logging Utilities
 * Consistent messaging across the project
 */

const chalk = require('chalk');

class Logger {
    static success(message) {
        console.log(chalk.green(`✅ ${message}`));
    }

    static error(message) {
        console.log(chalk.red(`❌ ${message}`));
    }

    static warning(message) {
        console.log(chalk.yellow(`⚠️  ${message}`));
    }

    static info(message) {
        console.log(chalk.blue(`ℹ️  ${message}`));
    }

    static step(message) {
        console.log(chalk.cyan(`🔄 ${message}`));
    }

    static header(message) {
        console.log(chalk.cyan.bold(`\n${message}\n`));
    }

    static subheader(message) {
        console.log(chalk.blue.bold(`\n${message}`));
    }

    static tip(message) {
        console.log(chalk.gray(`💡 ${message}`));
    }

    static separator() {
        console.log(chalk.gray('━'.repeat(50)));
    }

    // Progress indicators
    static progress(current, total, item = '') {
        const percentage = Math.round((current / total) * 100);
        const bar = '█'.repeat(Math.round(percentage / 5));
        const empty = '░'.repeat(20 - Math.round(percentage / 5));
        console.log(chalk.cyan(`[${bar}${empty}] ${percentage}% ${item}`));
    }

    // Service status logging
    static serviceAvailable(service, envVar) {
        console.log(`   ${chalk.green('✓')} ${service}: ${envVar}`);
    }

    static serviceSelected(service) {
        console.log(`🎯 Selected service: ${service}`);
    }

    static serviceUnavailable(reason = 'No service available') {
        console.log(chalk.red(`❌ ${reason}`));
    }
}

module.exports = Logger;