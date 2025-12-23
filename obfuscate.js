/**
 * 代码混淆脚本
 * 用于保护闭源扩展的 JavaScript 代码
 */

const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// 混淆配置
const obfuscationOptions = {
    compact: true,                      // 压缩代码
    controlFlowFlattening: true,        // 控制流平坦化（增加混淆强度）
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,            // 注入死代码
    deadCodeInjectionThreshold: 0.4,
    debugProtection: false,             // 关闭调试保护（避免影响开发）
    debugProtectionInterval: 0,
    disableConsoleOutput: false,        // 保留 console（方便用户反馈问题）
    identifierNamesGenerator: 'hexadecimal', // 标识符名称生成器
    log: false,
    numbersToExpressions: true,         // 数字转表达式
    renameGlobals: false,               // 不重命名全局变量（避免破坏 VS Code API）
    selfDefending: true,                // 自我防御
    simplify: true,                     // 简化代码
    splitStrings: true,                 // 分割字符串
    splitStringsChunkLength: 10,
    stringArray: true,                  // 字符串数组化
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],    // 字符串编码
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,          // 转换对象键
    unicodeEscapeSequence: false        // 不使用 Unicode 转义（保持可读性）
};

// 需要混淆的目录
const distDir = path.join(__dirname, 'dist');

// 递归获取所有 .js 文件
function getAllJsFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            getAllJsFiles(filePath, fileList);
        } else if (file.endsWith('.js') && !file.endsWith('.map')) {
            fileList.push(filePath);
        }
    });
    
    return fileList;
}

// 混淆单个文件
function obfuscateFile(filePath) {
    console.log(`正在混淆: ${path.relative(__dirname, filePath)}`);
    
    try {
        const code = fs.readFileSync(filePath, 'utf8');
        const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, obfuscationOptions).getObfuscatedCode();
        
        // 备份原文件（可选）
        // fs.writeFileSync(filePath + '.backup', code, 'utf8');
        
        // 写入混淆后的代码
        fs.writeFileSync(filePath, obfuscatedCode, 'utf8');
        console.log(`✓ 混淆完成: ${path.relative(__dirname, filePath)}`);
    } catch (error) {
        console.error(`✗ 混淆失败: ${path.relative(__dirname, filePath)}`);
        console.error(`  错误: ${error.message}`);
        process.exit(1);
    }
}

// 主函数
function main() {
    console.log('='.repeat(60));
    console.log('开始混淆代码...');
    console.log('='.repeat(60));
    
    // 检查 dist 目录是否存在
    if (!fs.existsSync(distDir)) {
        console.error('错误: dist 目录不存在，请先运行 npm run compile');
        process.exit(1);
    }
    
    // 获取所有 JS 文件
    const jsFiles = getAllJsFiles(distDir);
    
    if (jsFiles.length === 0) {
        console.warn('警告: 未找到需要混淆的 JS 文件');
        process.exit(0);
    }
    
    console.log(`找到 ${jsFiles.length} 个文件需要混淆\n`);
    
    // 混淆所有文件
    jsFiles.forEach(obfuscateFile);
    
    console.log('\n' + '='.repeat(60));
    console.log(`✓ 所有文件混淆完成！共处理 ${jsFiles.length} 个文件`);
    console.log('='.repeat(60));
}

// 执行
main();

