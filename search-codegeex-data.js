#!/usr/bin/env node

/**
 * CodeGeeX 数据位置搜索程序
 * 搜索 C:/ 盘中所有可能存储 CodeGeeX 聊天数据的地方
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 开始搜索 CodeGeeX 数据位置...\n');

// 可能的搜索路径
const searchPaths = [
    'C:\\Users',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\ProgramData'
];

// 特别检查的用户数据路径
const userDataPaths = [
    'C:\\Users\\85786\\AppData\\Local',
    'C:\\Users\\85786\\AppData\\Roaming',
    'C:\\Users\\85786\\AppData\\LocalLow',
    'C:\\Users\\85786\\.vscode',
    'C:\\Users\\85786\\Documents',
    'C:\\Users\\85786\\Desktop'
];

// VS Code 相关的所有可能路径
const vscodeRelatedPaths = [
    'C:\\Users\\85786\\.vscode\\extensions',
    'C:\\Users\\85786\\AppData\\Roaming\\Code\\User',
    'C:\\Users\\85786\\AppData\\Roaming\\Code\\logs',
    'C:\\Users\\85786\\AppData\\Roaming\\Code\\User\\workspaceStorage',
    'C:\\Users\\85786\\AppData\\Roaming\\Code\\User\\globalStorage',
    'C:\\Users\\85786\\AppData\\Roaming\\Code - Insiders\\User\\globalStorage',
    'C:\\Users\\85786\\AppData\\Roaming\\Cursor\\User\\globalStorage',
    'C:\\Users\\85786\\AppData\\Local\\Programs\\Microsoft VS Code\\resources',
    'C:\\Users\\85786\\AppData\\Local\\Programs\\Microsoft VS Code\\User Data'
];

// CodeGeeX 相关的关键词
const codegeexKeywords = [
    'codegeex',
    'aminer',
    'zhipuai',
    'glm',
    'z.ai'
];

// 可能的目录名模式
const possibleDirPatterns = [
    'codegeex',
    'aminer.codegeex',
    'codegeex.codegeex',
    'zhipuai.codegeex',
    'globalStorage',
    'chat',
    'conversation',
    'history',
    'data',
    'storage',
    'cache',
    'temp'
];

// 可能的数据库文件扩展名
const dbExtensions = ['.db', '.sqlite', '.sqlite3', '.sql'];

let foundLocations = [];

// 递归搜索函数
function searchDirectory(dirPath, depth = 0) {
    if (depth > 4) return; // 限制搜索深度

    try {
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
            const fullPath = path.join(dirPath, item);

            try {
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    // 检查目录名是否包含相关关键词
                    const lowerItem = item.toLowerCase();
                    const hasKeyword = codegeexKeywords.some(keyword =>
                        lowerItem.includes(keyword.toLowerCase())
                    );

                    if (hasKeyword) {
                        console.log(`🎯 发现可疑目录: ${fullPath}`);
                        foundLocations.push({
                            path: fullPath,
                            type: 'directory',
                            reason: '包含关键词'
                        });

                        // 深入检查这个目录
                        checkCodeGeeXDirectory(fullPath);
                    }

                    // 如果是 globalStorage 目录，特别关注
                    if (lowerItem === 'globalstorage') {
                        console.log(`📂 发现 globalStorage: ${fullPath}`);
                        checkGlobalStorage(fullPath);
                    }

                    // 递归搜索，但只对特定目录
                    if (hasKeyword || lowerItem.includes('app') || lowerItem.includes('data')) {
                        searchDirectory(fullPath, depth + 1);
                    }

                } else if (stat.isFile()) {
                    // 检查文件名是否包含相关关键词
                    const lowerItem = item.toLowerCase();
                    if (codegeexKeywords.some(keyword => lowerItem.includes(keyword.toLowerCase()))) {
                        console.log(`📄 发现可疑文件: ${fullPath}`);
                        foundLocations.push({
                            path: fullPath,
                            type: 'file',
                            reason: '文件名包含关键词'
                        });
                    }

                    // 检查数据库文件
                    if (dbExtensions.some(ext => lowerItem.endsWith(ext))) {
                        console.log(`🗄️  发现数据库文件: ${fullPath}`);
                        checkDatabaseFile(fullPath);
                    }

                    // 检查是否是JSON文件且包含聊天相关内容
                    if (lowerItem.endsWith('.json') && (lowerItem.includes('chat') || lowerItem.includes('conversation') || lowerItem.includes('history'))) {
                        checkJSONFile(fullPath);
                    }

                    // 检查所有JSON文件，看看是否包含CodeGeeX相关内容
                    if (lowerItem.endsWith('.json')) {
                        checkJSONFileForCodeGeeX(fullPath);
                    }
                }

            } catch (error) {
                // 忽略访问权限错误
                if (error.code !== 'EPERM' && error.code !== 'EACCES') {
                    console.log(`⚠️  访问 ${fullPath} 时出错: ${error.message}`);
                }
            }
        }

    } catch (error) {
        if (error.code !== 'EPERM' && error.code !== 'EACCES') {
            console.log(`❌ 无法读取目录 ${dirPath}: ${error.message}`);
        }
    }
}

// 检查 globalStorage 目录
function checkGlobalStorage(storagePath) {
    try {
        const items = fs.readdirSync(storagePath);

        for (const item of items) {
            const fullPath = path.join(storagePath, item);

            if (codegeexKeywords.some(keyword => item.toLowerCase().includes(keyword.toLowerCase()))) {
                console.log(`🚀 发现 CodeGeeX 插件目录: ${fullPath}`);
                foundLocations.push({
                    path: fullPath,
                    type: 'plugin_directory',
                    reason: '在 globalStorage 中发现 CodeGeeX 相关目录'
                });

                checkCodeGeeXDirectory(fullPath);
            }
        }
    } catch (error) {
        console.log(`⚠️  检查 globalStorage 时出错: ${error.message}`);
    }
}

// 检查 CodeGeeX 目录内容
function checkCodeGeeXDirectory(dirPath) {
    try {
        const items = fs.readdirSync(dirPath);

        console.log(`\n📂 检查 CodeGeeX 目录: ${dirPath}`);
        console.log(`📁 内容: ${items.join(', ')}\n`);

        for (const item of items) {
            const fullPath = path.join(dirPath, item);

            try {
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    // 特别关注这些目录
                    if (['.fileHistory', 'agent', 'projectmap', 'conversations', 'chat', 'data'].includes(item)) {
                        console.log(`📂 重要子目录: ${fullPath}`);
                        checkImportantDirectory(fullPath);
                    }
                } else if (stat.isFile()) {
                    // 检查重要文件
                    if (item === 'history.json' || item.includes('chat') || item.includes('conversation')) {
                        console.log(`📄 重要文件: ${fullPath}`);
                        checkJSONFile(fullPath);
                    }
                }

            } catch (error) {
                console.log(`⚠️  检查 ${fullPath} 时出错: ${error.message}`);
            }
        }

    } catch (error) {
        console.log(`❌ 检查 CodeGeeX 目录时出错: ${error.message}`);
    }
}

// 检查重要目录
function checkImportantDirectory(dirPath) {
    try {
        const items = fs.readdirSync(dirPath);
        const dirName = path.basename(dirPath);

        console.log(`  📂 ${dirName}/ 包含: ${items.length} 个项目`);

        if (items.length === 0) {
            console.log(`  📝 ${dirName} 目录为空`);
        } else {
            console.log(`  📝 ${dirName} 内容: ${items.slice(0, 10).join(', ')}${items.length > 10 ? '...' : ''}`);

            // 如果是 .fileHistory，检查子目录
            if (dirName === '.fileHistory') {
                for (const item of items) {
                    const subPath = path.join(dirPath, item);
                    if (fs.statSync(subPath).isDirectory()) {
                        const subItems = fs.readdirSync(subPath);
                        console.log(`    📂 ${dirName}/${item}/: ${subItems.length} 个文件`);
                    }
                }
            }
        }

    } catch (error) {
        console.log(`⚠️  检查重要目录 ${dirPath} 时出错: ${error.message}`);
    }
}

// 检查 JSON 文件是否包含 CodeGeeX 内容
function checkJSONFileForCodeGeeX(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // 查找 CodeGeeX 特有的标识文本
        const codegeexIndicators = [
            'Z.ai',
            'GLM',
            'aminer',
            '您好！我是由Z.ai训练的GLM',
            '编程、代码和计算机相关领域',
            'CodeGeeX'
        ];

        const hasCodeGeeXContent = codegeexIndicators.some(indicator =>
            content.includes(indicator)
        );

        if (hasCodeGeeXContent) {
            console.log(`🎯 发现包含 CodeGeeX 内容的 JSON 文件: ${filePath}`);
            foundLocations.push({
                path: filePath,
                type: 'codegeex_chat_data',
                reason: 'JSON 文件包含 CodeGeeX 特有的聊天内容'
            });

            // 显示文件大小和部分内容
            const size = content.length;
            console.log(`   📊 文件大小: ${size} 字符`);
            console.log(`   📝 内容预览: ${content.substring(0, 200)}...`);

            return true;
        }

    } catch (error) {
        // 静默忽略读取错误
    }

    return false;
}

// 检查数据库文件
function checkDatabaseFile(filePath) {
    try {
        const fs = require('fs');
        const fileSize = fs.statSync(filePath).size;

        console.log(`🗄️  数据库文件: ${filePath} (${fileSize} 字节)`);

        // 对于 SQLite 文件，我们可以尝试一些基本的检查
        if (fileSize > 100) { // SQLite 文件头通常大于100字节
            const buffer = fs.readFileSync(filePath, null, 16);
            // SQLite 文件以 "SQLite format 3" 开头
            if (buffer.toString('ascii', 0, 16) === 'SQLite format 3\x00') {
                console.log(`   ✅ 这是有效的 SQLite 数据库文件`);
                foundLocations.push({
                    path: filePath,
                    type: 'sqlite_database',
                    reason: '发现 SQLite 数据库文件'
                });

                // 这里可以进一步检查数据库内容，但需要 sqlite3 模块
                // 暂时只记录位置
            }
        }

    } catch (error) {
        console.log(`❌ 检查数据库文件时出错: ${error.message}`);
    }
}

// 检查 JSON 文件
function checkJSONFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const size = content.length;

        console.log(`📄 JSON 文件: ${filePath} (${size} 字符)`);

        if (size > 0 && size < 10000) {
            try {
                const data = JSON.parse(content);

                // 检查是否包含聊天相关内容
                if (Array.isArray(data)) {
                    console.log(`  📊 包含数组，长度: ${data.length}`);
                    if (data.length > 0 && data[0].text) {
                        console.log(`  💬 可能包含聊天消息！`);
                        foundLocations.push({
                            path: filePath,
                            type: 'chat_data',
                            reason: 'JSON 文件包含聊天相关数据'
                        });
                    }
                } else if (typeof data === 'object') {
                    const keys = Object.keys(data);
                    console.log(`  📊 对象键: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);

                    if (keys.some(key => key.includes('chat') || key.includes('conversation') || key.includes('message'))) {
                        console.log(`  💬 可能包含聊天数据！`);
                        foundLocations.push({
                            path: filePath,
                            type: 'chat_data',
                            reason: 'JSON 对象包含聊天相关键'
                        });
                    }
                }

            } catch (parseError) {
                console.log(`  ⚠️  JSON 解析失败: ${parseError.message}`);
                // 即使解析失败，也可能是压缩数据或特殊格式
                if (content.includes('GLM') || content.includes('Z.ai') || content.includes('aminer')) {
                    console.log(`  🎯 包含 CodeGeeX 相关文本！`);
                    foundLocations.push({
                        path: filePath,
                        type: 'text_data',
                        reason: '文件包含 CodeGeeX 相关文本'
                    });
                }
            }
        } else if (size === 0) {
            console.log(`  📝 文件为空`);
        } else {
            console.log(`  📝 文件较大，可能包含大量数据`);
        }

    } catch (error) {
        console.log(`❌ 读取 JSON 文件时出错: ${error.message}`);
    }
}

// 开始搜索
console.log('🔍 搜索主要路径...\n');

for (const searchPath of searchPaths) {
    console.log(`\n📂 搜索路径: ${searchPath}`);
    searchDirectory(searchPath);
}

// 特别搜索用户数据路径
console.log('\n🔍 深度搜索用户数据路径...\n');

for (const userPath of userDataPaths) {
    if (fs.existsSync(userPath)) {
        console.log(`\n👤 搜索用户路径: ${userPath}`);
        searchDirectory(userPath, 0); // 从深度0开始，允许更深入搜索
    } else {
        console.log(`⚠️  用户路径不存在: ${userPath}`);
    }
}

// 专门搜索 VS Code 相关路径
console.log('\n🔍 专门搜索 VS Code 相关路径...\n');

for (const vscodePath of vscodeRelatedPaths) {
    if (fs.existsSync(vscodePath)) {
        console.log(`\n💻 搜索 VS Code 路径: ${vscodePath}`);
        searchDirectory(vscodePath, 0);
    } else {
        console.log(`⚠️  VS Code 路径不存在: ${vscodePath}`);
    }
}

// 输出总结
console.log('\n' + '='.repeat(60));
console.log('📊 搜索结果总结');
console.log('='.repeat(60));

if (foundLocations.length === 0) {
    console.log('❌ 未发现任何 CodeGeeX 相关位置');
} else {
    console.log(`✅ 发现 ${foundLocations.length} 个可疑位置:\n`);

    foundLocations.forEach((location, index) => {
        console.log(`${index + 1}. ${location.type.toUpperCase()}: ${location.path}`);
        console.log(`   原因: ${location.reason}\n`);
    });
}

console.log('🔍 搜索完成！');

// 特别检查已知的 VS Code 插件路径
console.log('\n🔍 检查已知 VS Code 插件路径...');

const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\Default';
const vscodePaths = [
    path.join(userHome, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage'),
    path.join(userHome, 'AppData', 'Roaming', 'Code - Insiders', 'User', 'globalStorage'),
    path.join(userHome, 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage')
];

vscodePaths.forEach(vscodePath => {
    if (fs.existsSync(vscodePath)) {
        console.log(`📂 检查 VS Code 路径: ${vscodePath}`);
        checkGlobalStorage(vscodePath);
    }
});

// 检查已知的 CodeGeeX 目录
console.log('\n🔍 详细检查已知的 CodeGeeX 目录...\n');

const knownCodeGeeXPath = 'C:\\Users\\85786\\AppData\\Roaming\\Code\\User\\globalStorage\\aminer.codegeex';
if (fs.existsSync(knownCodeGeeXPath)) {
    console.log(`🎯 详细检查已知 CodeGeeX 目录: ${knownCodeGeeXPath}`);
    deepInspectDirectory(knownCodeGeeXPath);
}

console.log('\n🎯 CodeGeeX 数据搜索程序执行完毕！');

// 深度检查目录的函数
function deepInspectDirectory(dirPath, currentDepth = 0, maxDepth = 5) {
    if (currentDepth > maxDepth) return;

    try {
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
            const fullPath = path.join(dirPath, item);

            try {
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    console.log(`${'  '.repeat(currentDepth)}📂 ${item}/`);
                    deepInspectDirectory(fullPath, currentDepth + 1, maxDepth);
                } else if (stat.isFile()) {
                    const size = stat.size;
                    console.log(`${'  '.repeat(currentDepth)}📄 ${item} (${size} bytes)`);

                    // 检查文件内容
                    if (size > 0 && size < 10000) {
                        try {
                            const content = fs.readFileSync(fullPath, 'utf-8');
                            if (content.includes('GLM') || content.includes('Z.ai') || content.includes('aminer') || content.includes('CodeGeeX')) {
                                console.log(`${'  '.repeat(currentDepth)}  🎯 包含 CodeGeeX 相关内容！`);
                                console.log(`${'  '.repeat(currentDepth)}  📝 预览: ${content.substring(0, 100)}...`);
                                foundLocations.push({
                                    path: fullPath,
                                    type: 'codegeex_content',
                                    reason: '文件包含 CodeGeeX 特有内容'
                                });
                            }
                        } catch (error) {
                            // 如果是二进制文件，显示十六进制
                            if (size <= 1024) {
                                try {
                                    const buffer = fs.readFileSync(fullPath);
                                    console.log(`${'  '.repeat(currentDepth)}  📊 十六进制: ${buffer.slice(0, 50).toString('hex')}`);
                                } catch (hexError) {
                                    // 忽略
                                }
                            }
                        }
                    }
                }

            } catch (error) {
                console.log(`${'  '.repeat(currentDepth)}❌ 访问 ${item} 时出错: ${error.message}`);
            }
        }

    } catch (error) {
        console.log(`❌ 深度检查目录时出错: ${error.message}`);
    }
}
