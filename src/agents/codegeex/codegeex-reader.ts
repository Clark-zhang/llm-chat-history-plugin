/**
 * CodeGeeX 数据读取器
 */

import * as fs from 'fs';
import * as path from 'path';
import { CodeGeeXConversation } from './codegeex-types';

export class CodeGeeXReader {
    private storageDir: string;

    constructor(storageDir: string) {
        // storageDir参数已经是完整的存储目录路径，不需要再添加ID
        this.storageDir = storageDir;
        console.log(`[CodeGeeX] Using storage directory: ${this.storageDir}`);
    }

    getAllConversations(): CodeGeeXConversation[] {
        console.log('[CodeGeeX] === getAllConversations() called ===');
        console.log('[CodeGeeX] Looking for conversations in:', this.storageDir);

        if (!fs.existsSync(this.storageDir)) {
            console.log('[CodeGeeX] ❌ Storage directory not found:', this.storageDir);
            return [];
        }

        // 检查存储目录结构
        try {
            const files = fs.readdirSync(this.storageDir);
            console.log('[CodeGeeX] 📁 Files in storage directory:', files);

            // 检查是否有agent目录
            const agentDir = path.join(this.storageDir, 'agent');
            if (fs.existsSync(agentDir)) {
                console.log('[CodeGeeX] 🔍 Found agent directory');
                const agentFiles = fs.readdirSync(agentDir);
                console.log('[CodeGeeX] 📁 Files in agent directory:', agentFiles);

                // 检查history.json
                const historyFile = path.join(agentDir, 'history.json');
                if (fs.existsSync(historyFile)) {
                    console.log('[CodeGeeX] 📄 Found history.json file');
                    try {
                        const content = fs.readFileSync(historyFile, 'utf-8');
                        console.log('[CodeGeeX] 📊 History file content length:', content.length);

                        if (content.trim() === '{}' || content.trim() === '') {
                            console.log('[CodeGeeX] 📝 History file is empty or just {}');
                        } else {
                            console.log('[CodeGeeX] 📝 History file content preview:', content.substring(0, 200));
                        }
                    } catch (error) {
                        console.log('[CodeGeeX] ❌ Error reading history file:', error);
                    }
                }
            }

            // 检查projectmap目录
            const projectmapDir = path.join(this.storageDir, 'projectmap');
            if (fs.existsSync(projectmapDir)) {
                console.log('[CodeGeeX] 🔍 Found projectmap directory');
                const projectmapFiles = fs.readdirSync(projectmapDir);
                console.log('[CodeGeeX] 📁 Files in projectmap directory:', projectmapFiles);
            }

            // 检查.fileHistory目录
            const fileHistoryDir = path.join(this.storageDir, '.fileHistory');
            if (fs.existsSync(fileHistoryDir)) {
                console.log('[CodeGeeX] 🔍 Found .fileHistory directory');
                const fileHistoryFiles = fs.readdirSync(fileHistoryDir);
                console.log('[CodeGeeX] 📁 Files in .fileHistory directory:', fileHistoryFiles);

                // 检查是否有历史文件
                for (const file of fileHistoryFiles) {
                    const filePath = path.join(fileHistoryDir, file);
                    if (fs.statSync(filePath).isFile()) {
                        console.log(`[CodeGeeX] 📄 Found file history: ${file}`);
                        try {
                            const content = fs.readFileSync(filePath, 'utf-8');
                            console.log(`[CodeGeeX] 📊 ${file} content length:`, content.length);
                            if (content.length > 0 && content.length < 1000) {
                                console.log(`[CodeGeeX] 📝 ${file} content preview:`, content.substring(0, 200));
                            } else if (content.length === 0) {
                                console.log(`[CodeGeeX] 📝 ${file} is empty`);
                            } else {
                                console.log(`[CodeGeeX] 📝 ${file} is binary or too large (${content.length} chars)`);
                                // 尝试作为二进制数据读取
                                const buffer = fs.readFileSync(filePath);
                                console.log(`[CodeGeeX] 📊 ${file} buffer length:`, buffer.length);
                                console.log(`[CodeGeeX] 📝 ${file} first 50 bytes:`, buffer.slice(0, 50).toString('hex'));
                            }
                        } catch (error) {
                            console.log(`[CodeGeeX] ❌ Error reading ${file}:`, error);
                        }
                    } else if (fs.statSync(filePath).isDirectory()) {
                        console.log(`[CodeGeeX] 📂 Found directory: ${file}`);
                        const subFiles = fs.readdirSync(filePath);
                        console.log(`[CodeGeeX] 📁 Files in ${file}:`, subFiles);

                        // 递归检查子目录（Git 风格对象存储）
                        for (const subFile of subFiles) {
                            const subFilePath = path.join(filePath, subFile);
                            if (fs.statSync(subFilePath).isDirectory()) {
                                console.log(`[CodeGeeX] 📂 Subdirectory: ${file}/${subFile}`);
                                const subSubFiles = fs.readdirSync(subFilePath);
                                console.log(`[CodeGeeX] 📁 Files in ${file}/${subFile}:`, subSubFiles);

                                // 检查对象文件
                                for (const objFile of subSubFiles) {
                                    const objFilePath = path.join(subFilePath, objFile);
                                    if (fs.statSync(objFilePath).isFile()) {
                                        console.log(`[CodeGeeX] 📄 Object file: ${file}/${subFile}/${objFile}`);
                                        try {
                                            const buffer = fs.readFileSync(objFilePath);
                                            console.log(`[CodeGeeX] 📊 Object size: ${buffer.length} bytes`);
                                            console.log(`[CodeGeeX] 📝 First 100 bytes (hex):`, buffer.slice(0, 100).toString('hex'));

                                            // 尝试解压缩（如果可能是压缩的）
                                            if (buffer.length > 0) {
                                                try {
                                                    const zlib = require('zlib');
                                                    const decompressed = zlib.gunzipSync(buffer);
                                                    console.log(`[CodeGeeX] 📝 Decompressed content (${decompressed.length} chars):`, decompressed.toString().substring(0, 200));
                                                } catch (decompressError) {
                                                    console.log(`[CodeGeeX] 📝 Not compressed or decompression failed`);
                                                }
                                            }
                                        } catch (error) {
                                            console.log(`[CodeGeeX] ❌ Error reading object ${file}/${subFile}/${objFile}:`, error);
                                        }
                                    }
                                }
                            } else if (fs.statSync(subFilePath).isFile()) {
                                console.log(`[CodeGeeX] 📄 File in ${file}: ${subFile}`);
                                try {
                                    const content = fs.readFileSync(subFilePath, 'utf-8');
                                    console.log(`[CodeGeeX] 📊 ${subFile} content length:`, content.length);
                                    if (content.length > 0 && content.length < 1000) {
                                        console.log(`[CodeGeeX] 📝 ${subFile} content:`, content.substring(0, 200));
                                    }
                                } catch (error) {
                                    console.log(`[CodeGeeX] ❌ Error reading ${subFile}:`, error);
                                }
                            }
                        }
                    }
                }
            }

        } catch (error) {
            console.log('[CodeGeeX] ❌ Error exploring storage directory:', error);
        }

        // 目前CodeGeeX没有找到合适的对话数据格式
        console.log('[CodeGeeX] ⚠️ No compatible conversation format found for CodeGeeX');
        return [];
    }

    getConversation(id: string): CodeGeeXConversation | null {
        const conversationsDir = path.join(this.storageDir, 'conversations');
        const filePath = path.join(conversationsDir, `${id}.json`);

        if (!fs.existsSync(filePath)) {
            return null;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(content) as CodeGeeXConversation;
        } catch (error) {
            console.error(`[CodeGeeX] Failed to read conversation ${id}:`, error);
            return null;
        }
    }

    exists(): boolean {
        return fs.existsSync(this.storageDir);
    }
}

export function getCodeGeeXStoragePath(): string {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';

    const isVSCode = process.env.VSCODE_CWD !== undefined || process.env.VSCODE_PID !== undefined;
    const isCursor = process.env.CURSOR_PID !== undefined || process.env.CURSOR_DATA_FOLDER !== undefined;

    let appName = 'Code';
    if (isCursor && !isVSCode) {
        appName = 'Cursor';
    }

    if (platform === 'win32') {
        // 尝试多个可能的CodeGeeX扩展ID
        const possibleIds = ['aminer.codegeex', 'codegeex.codegeex', 'zhipuai.codegeex'];
        for (const id of possibleIds) {
            const testPath = path.join(homeDir, `AppData/Roaming/${appName}/User/globalStorage/${id}`);
            if (fs.existsSync(testPath)) {
                console.log(`[CodeGeeX] ✅ Found CodeGeeX storage at: ${testPath} (using ID: ${id})`);
                return testPath;
            }
        }
        // 如果都没有找到，返回默认路径
        const defaultPath = path.join(homeDir, `AppData/Roaming/${appName}/User/globalStorage/aminer.codegeex`);
        console.log(`[CodeGeeX] ⚠️ No CodeGeeX storage found, using default: ${defaultPath}`);
        return defaultPath;
    } else if (platform === 'darwin') {
        const possibleIds = ['aminer.codegeex', 'codegeex.codegeex', 'zhipuai.codegeex'];
        for (const id of possibleIds) {
            const testPath = path.join(homeDir, `Library/Application Support/${appName}/User/globalStorage/${id}`);
            if (fs.existsSync(testPath)) {
                console.log(`[CodeGeeX] ✅ Found CodeGeeX storage at: ${testPath} (using ID: ${id})`);
                return testPath;
            }
        }
        const defaultPath = path.join(homeDir, `Library/Application Support/${appName}/User/globalStorage/aminer.codegeex`);
        console.log(`[CodeGeeX] ⚠️ No CodeGeeX storage found, using default: ${defaultPath}`);
        return defaultPath;
    } else {
        const possibleIds = ['aminer.codegeex', 'codegeex.codegeex', 'zhipuai.codegeex'];
        for (const id of possibleIds) {
            const testPath = path.join(homeDir, `.config/${appName}/User/globalStorage/${id}`);
            if (fs.existsSync(testPath)) {
                console.log(`[CodeGeeX] ✅ Found CodeGeeX storage at: ${testPath} (using ID: ${id})`);
                return testPath;
            }
        }
        const defaultPath = path.join(homeDir, `.config/${appName}/User/globalStorage/aminer.codegeex`);
        console.log(`[CodeGeeX] ⚠️ No CodeGeeX storage found, using default: ${defaultPath}`);
        return defaultPath;
    }
}
