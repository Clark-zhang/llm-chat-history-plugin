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
function obfuscateFile(filePath, stats) {
    const relativePath = path.relative(__dirname, filePath);
    console.log(`正在混淆: ${relativePath}`);

    try {
        // 检查文件大小
        const sizeMB = stats.size / 1024 / 1024;

        if (sizeMB > 5) { // 超过5MB的文件跳过混淆
            console.log(`⚠️  文件过大，跳过混淆: ${relativePath} (${sizeMB.toFixed(2)} MB)`);
            return 'skip';
        }

        if (sizeMB === 0) {
            console.log(`⚠️  空文件，跳过混淆: ${relativePath}`);
            return 'skip';
        }

        const code = fs.readFileSync(filePath, 'utf8');

        // 检查代码是否已经是混淆过的
        if (code.includes('var _0x') || code.includes('function _0x')) {
            console.log(`⚠️  文件已混淆，跳过: ${relativePath}`);
            return 'skip';
        }

        console.log(`  处理中... (${(code.length / 1024).toFixed(1)} KB)`);

        const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, obfuscationOptions).getObfuscatedCode();

        // 验证混淆结果
        if (!obfuscatedCode || obfuscatedCode.length === 0) {
            throw new Error('混淆结果为空');
        }

        // 写入混淆后的代码
        fs.writeFileSync(filePath, obfuscatedCode, 'utf8');
        console.log(`✓ 混淆完成: ${relativePath} (${(obfuscatedCode.length / 1024).toFixed(1)} KB)`);
        return 'success';

    } catch (error) {
        console.error(`✗ 混淆失败: ${relativePath}`);
        console.error(`  错误: ${error.message}`);

        // 对于内存错误，尝试轻量级混淆
        if (error.message.includes('heap') || error.message.includes('memory') || error.message.includes('out of memory')) {
            console.log(`  尝试轻量级混淆...`);
            try {
                const lightOptions = {
                    ...obfuscationOptions,
                    controlFlowFlattening: false,
                    deadCodeInjection: false,
                    stringArray: false,
                    numbersToExpressions: false,
                    transformObjectKeys: false
                };

                const code = fs.readFileSync(filePath, 'utf8');
                const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, lightOptions).getObfuscatedCode();
                fs.writeFileSync(filePath, obfuscatedCode, 'utf8');
                console.log(`✓ 轻量级混淆完成: ${relativePath}`);
                return 'success';
            } catch (lightError) {
                console.error(`✗ 轻量级混淆也失败: ${lightError.message}`);
                return 'error';
            }
        }

        return 'error';
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

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // 混淆所有文件
    for (let i = 0; i < jsFiles.length; i++) {
        const file = jsFiles[i];
        console.log(`[${i + 1}/${jsFiles.length}]`);

        // 获取文件统计信息
        const stats = fs.statSync(file);
        const result = obfuscateFile(file, stats);

        if (result === 'success') {
            successCount++;
        } else if (result === 'skip') {
            skipCount++;
        } else {
            errorCount++;
        }

        // 每处理5个文件显示一次进度
        if ((i + 1) % 5 === 0) {
            console.log(`进度: ${i + 1}/${jsFiles.length} (${successCount} 成功, ${skipCount} 跳过, ${errorCount} 失败)`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`混淆完成！共处理 ${jsFiles.length} 个文件`);
    console.log(`- 成功: ${successCount}`);
    console.log(`- 跳过: ${skipCount}`);
    console.log(`- 失败: ${errorCount}`);
    console.log('='.repeat(60));

    if (errorCount > 0) {
        console.error(`\n⚠️  有 ${errorCount} 个文件混淆失败，请检查上述错误信息。`);
        process.exit(1);
    }
}

// 执行
main();

