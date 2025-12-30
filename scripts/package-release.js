/**
 * 打包正式发布版本
 * 正式版移除 debug 相关配置，不暴露给用户
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PACKAGE_JSON_PATH = path.join(__dirname, '..', 'package.json');
const BACKUP_PATH = path.join(__dirname, '..', 'package.json.backup');

console.log('📦 开始打包正式发布版本...\n');

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
        
        // 移除 debugMode 配置
        if (props['chatHistory.cloudSync.debugMode']) {
            delete props['chatHistory.cloudSync.debugMode'];
            console.log('   ✅ 移除 chatHistory.cloudSync.debugMode');
        }
        
        // 移除 debugServerUrl 配置
        if (props['chatHistory.cloudSync.debugServerUrl']) {
            delete props['chatHistory.cloudSync.debugServerUrl'];
            console.log('   ✅ 移除 chatHistory.cloudSync.debugServerUrl');
        }
    }
    
    // 写入修改后的 package.json
    fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2), 'utf8');
    console.log('   ✅ 配置修改完成\n');
    
    // 3. 打包
    console.log('3️⃣ 开始打包...');
    console.log('   执行: npm run build\n');
    execSync('npm run build', { stdio: 'inherit' });
    
    console.log('\n   执行: vsce package --allow-missing-repository\n');
    execSync('vsce package --allow-missing-repository', { stdio: 'inherit' });
    
    console.log('\n✨ 正式版本打包完成！');
    console.log(`📦 文件名: llm-chat-history-${packageJson.version}.vsix`);
    console.log('\n🔒 正式版特点:');
    console.log('   - 不包含 debugMode 配置');
    console.log('   - 不包含 debugServerUrl 配置');
    console.log('   - 始终连接到正式服务器\n');
    
} catch (error) {
    console.error('\n❌ 打包失败:', error.message);
    process.exitCode = 1;
} finally {
    // 4. 恢复原始 package.json
    console.log('4️⃣ 恢复原始配置...');
    fs.writeFileSync(PACKAGE_JSON_PATH, originalContent, 'utf8');
    fs.unlinkSync(BACKUP_PATH);
    console.log('   ✅ 配置已恢复\n');
}

