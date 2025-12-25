/**
 * 打包测试版本
 * 测试版默认启用 debug 模式，连接到本地开发服务器
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PACKAGE_JSON_PATH = path.join(__dirname, '..', 'package.json');
const BACKUP_PATH = path.join(__dirname, '..', 'package.json.backup');

console.log('📦 开始打包测试版本...\n');

// 1. 备份原始 package.json
console.log('1️⃣ 备份 package.json...');
const originalContent = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8');
fs.writeFileSync(BACKUP_PATH, originalContent, 'utf8');
console.log('   ✅ 备份完成\n');

try {
    // 2. 修改 package.json
    console.log('2️⃣ 修改配置为测试模式...');
    const packageJson = JSON.parse(originalContent);
    
    // 修改版本号，添加 -test 后缀
    const originalVersion = packageJson.version;
    packageJson.version = `${originalVersion}-test`;
    
    // 修改 debugMode 默认值为 true
    if (packageJson.contributes && packageJson.contributes.configuration && packageJson.contributes.configuration.properties) {
        const props = packageJson.contributes.configuration.properties;
        if (props['chatHistory.cloudSync.debugMode']) {
            props['chatHistory.cloudSync.debugMode'].default = true;
            console.log('   ✅ debugMode 默认值设置为 true');
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
    
    console.log('\n✨ 测试版本打包完成！');
    console.log(`📦 文件名: llm-chat-history-${packageJson.version}.vsix`);
    console.log('\n🔧 测试版特点:');
    console.log('   - debugMode 默认开启');
    console.log('   - 连接到本地服务器: http://192.168.56.101:9999');
    console.log('   - 用户仍需手动启用 cloudSync.enabled\n');
    
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

