#!/usr/bin/env node

/**
 * 构建检查脚本
 * 检查构建产物是否有问题
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const maxFileSize = 1024 * 1024; // 1MB
const maxTotalSize = 50 * 1024 * 1024; // 50MB

console.log('🔍 检查构建产物...\n');

if (!fs.existsSync(distDir)) {
    console.error('❌ dist 目录不存在');
    process.exit(1);
}

const files = fs.readdirSync(distDir).filter(file => file.endsWith('.js') && !file.endsWith('.map'));
let totalSize = 0;
let hasErrors = false;

console.log('📊 文件大小检查:\n');

files.forEach(file => {
    const filePath = path.join(distDir, file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    totalSize += stats.size;

    console.log(`${file}: ${sizeMB} MB`);

    // 检查单个文件大小
    if (stats.size > maxFileSize) {
        console.error(`❌ 文件过大: ${file} (${sizeMB} MB > 1MB)`);
        hasErrors = true;
    }

    // 检查文件内容是否正常
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.length === 0) {
            console.error(`❌ 空文件: ${file}`);
            hasErrors = true;
        }

        // 检查是否包含异常内容
        if (content.includes('undefined') && content.length > 1000000) {
            console.warn(`⚠️  可疑内容: ${file} 包含大量 'undefined'`);
        }

    } catch (error) {
        console.error(`❌ 无法读取文件: ${file} - ${error.message}`);
        hasErrors = true;
    }
});

const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
console.log(`\n📈 总大小: ${totalSizeMB} MB`);

// 检查总大小
if (totalSize > maxTotalSize) {
    console.error(`❌ 总大小过大: ${totalSizeMB} MB > 50MB`);
    hasErrors = true;
}

// 检查必要的文件是否存在
const requiredFiles = [
    'extension.js',
    'agents/cursor/cursor-database-reader.js',
    'agents/cline/cline-reader.js',
    'cloud/cloud-sync.js'
];

console.log('\n📁 检查必要文件:');
requiredFiles.forEach(file => {
    const filePath = path.join(distDir, file);
    if (fs.existsSync(filePath)) {
        console.log(`✅ ${file}`);
    } else {
        console.error(`❌ 缺少必要文件: ${file}`);
        hasErrors = true;
    }
});

if (hasErrors) {
    console.error('\n❌ 构建检查失败！请修复上述问题。');
    process.exit(1);
} else {
    console.log('\n✅ 构建检查通过！');
}
