/**
 * 打包并发布正式版本到 VS Code Marketplace
 * 确保发布的版本不包含 debug 配置
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PACKAGE_JSON_PATH = path.join(__dirname, '..', 'package.json');
const BACKUP_PATH = path.join(__dirname, '..', 'package.json.backup');

console.log('🚀 开始打包并发布正式版本...\n');

// 1. 备份原始 package.json
console.log('1️⃣ 备份 package.json...');
const originalContent = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8');
fs.writeFileSync(BACKUP_PATH, originalContent, 'utf8');
console.log('   ✅ 备份完成\n');

try {
    // 2. 修改 package.json - 移除 debug 相关配置
    console.log('2️⃣ 移除 debug 相关配置...');
    const packageJson = JSON.parse(originalContent);
    
    if (packageJson.contributes && packageJson.contributes.configuration && packageJson.contributes.configuration.properties) {
        const props = packageJson.contributes.configuration.properties;
        
        if (props['chatHistory.cloudSync.debugMode']) {
            delete props['chatHistory.cloudSync.debugMode'];
            console.log('   ✅ 移除 chatHistory.cloudSync.debugMode');
        }
        
        if (props['chatHistory.cloudSync.debugServerUrl']) {
            delete props['chatHistory.cloudSync.debugServerUrl'];
            console.log('   ✅ 移除 chatHistory.cloudSync.debugServerUrl');
        }
    }
    
    fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2), 'utf8');
    console.log('   ✅ 配置修改完成\n');
    
    // 3. 构建
    console.log('3️⃣ 开始构建...');
    console.log('   执行: npm run build\n');
    execSync('npm run build', { stdio: 'inherit' });
    
    // 4. 发布（vsce publish 会自动打包并发布）
    console.log('\n4️⃣ 发布到 VS Code Marketplace...');
    console.log('   执行: vsce publish --allow-missing-repository\n');
    execSync('vsce publish --allow-missing-repository', { stdio: 'inherit' });
    
    console.log('\n✨ 发布成功！');
    console.log(`📦 版本: ${packageJson.version}`);
    console.log('🔒 已确保不包含 debug 配置\n');
    
} catch (error) {
    console.error('\n❌ 发布失败:', error.message);
    process.exitCode = 1;
} finally {
    // 5. 恢复原始 package.json
    console.log('5️⃣ 恢复原始配置...');
    fs.writeFileSync(PACKAGE_JSON_PATH, originalContent, 'utf8');
    fs.unlinkSync(BACKUP_PATH);
    console.log('   ✅ 配置已恢复\n');
}

