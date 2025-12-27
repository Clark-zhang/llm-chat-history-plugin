/**
 * Diagnostic script for debugging the extension on different platforms
 * Run in VS Code/Cursor Developer Tools Console
 * 
 * Usage: 
 * 1. Open Developer Tools (Ctrl+Shift+I or Help → Toggle Developer Tools)
 * 2. Go to Console tab
 * 3. Copy and paste this entire script and press Enter
 */

(async function diagnose() {
    // Get process from electron's remote or require
    let proc;
    try {
        proc = require('process');
    } catch (e) {
        try {
            proc = require('@electron/remote').process;
        } catch (e2) {
            // Fallback: try to get from global
            proc = globalThis.process || window.process;
        }
    }
    
    if (!proc) {
        console.error('❌ Cannot access process object. Try running this in the Extension Host console instead.');
        console.log('💡 Alternative: Go to Help → Toggle Developer Tools, then in the dropdown at the top left of Console, select "Extension Host"');
        return;
    }

    const path = require('path');
    const fs = require('fs');
    
    console.log('='.repeat(60));
    console.log('🔍 LLM Chat History Extension Diagnostic');
    console.log('='.repeat(60));
    
    // 1. Platform info
    console.log('\n📋 Platform Information:');
    console.log(`  OS Platform: ${proc.platform}`);
    console.log(`  Architecture: ${proc.arch}`);
    console.log(`  Node Version: ${proc.version}`);
    console.log(`  Electron Version: ${proc.versions?.electron || 'N/A'}`);
    console.log(`  Home Directory: ${proc.env.HOME || proc.env.USERPROFILE}`);
    
    // 2. Check Cursor database path
    const homeDir = proc.env.HOME || proc.env.USERPROFILE || '';
    
    let dbPath;
    if (proc.platform === 'win32') {
        dbPath = path.join(homeDir, 'AppData/Roaming/Cursor/User/globalStorage/state.vscdb');
    } else if (proc.platform === 'darwin') {
        dbPath = path.join(homeDir, 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');
    } else {
        dbPath = path.join(homeDir, '.config/Cursor/User/globalStorage/state.vscdb');
    }
    
    console.log('\n📂 Database Path:');
    console.log(`  Expected path: ${dbPath}`);
    console.log(`  File exists: ${fs.existsSync(dbPath)}`);
    
    if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        console.log(`  File size: ${stats.size} bytes`);
        console.log(`  Last modified: ${stats.mtime}`);
    }
    
    // 3. Check SQLite binary
    console.log('\n📦 SQLite Binary Check:');
    try {
        const Database = require('better-sqlite3');
        const testDb = new Database(':memory:');
        testDb.close();
        console.log('  ✅ better-sqlite3 loaded successfully!');
    } catch (error) {
        console.log('  ❌ better-sqlite3 failed to load:');
        console.log(`     ${error.message}`);
        if (error.message.includes('NODE_MODULE_VERSION')) {
            console.log('  💡 This is a binary compatibility issue. The extension needs a recompiled binary for your Electron version.');
        }
    }
    
    // 4. Check workspace
    console.log('\n📁 Workspace Check:');
    let vscode;
    try {
        vscode = require('vscode');
    } catch (e) {
        console.log('  ⚠️ vscode module not available in this context');
        vscode = null;
    }
    
    if (vscode && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        console.log(`  Workspace root: ${workspaceRoot}`);
        
        // Check if output directory exists
        const config = vscode.workspace.getConfiguration('chatHistory');
        const outputDir = config.get('outputDirectory', '.llm-chat-history/history');
        const outputPath = path.join(workspaceRoot, outputDir);
        console.log(`  Output directory: ${outputPath}`);
        console.log(`  Output exists: ${fs.existsSync(outputPath)}`);
        
        if (fs.existsSync(outputPath)) {
            const files = fs.readdirSync(outputPath);
            console.log(`  Files in output: ${files.length}`);
            if (files.length > 0) {
                console.log(`  Latest files: ${files.slice(-3).join(', ')}`);
            }
        }
        
        // 6. Configuration check
        console.log('\n⚙️ Extension Configuration:');
        console.log(`  autoSave: ${config.get('autoSave')}`);
        console.log(`  outputDirectory: ${config.get('outputDirectory')}`);
        console.log(`  locale: ${config.get('locale')}`);
        console.log(`  cloudSync.enabled: ${config.get('cloudSync.enabled')}`);
    } else if (vscode) {
        console.log('  ❌ No workspace folder open!');
    }
    
    // 5. Try to read database
    console.log('\n💾 Database Content Check:');
    if (fs.existsSync(dbPath)) {
        try {
            const Database = require('better-sqlite3');
            const db = new Database(dbPath, { readonly: true });
            
            // Check for composer data
            const composerKeys = db.prepare(`
                SELECT key FROM ItemTable 
                WHERE key LIKE 'composer.composerData%' 
                LIMIT 5
            `).all();
            
            console.log(`  Found ${composerKeys.length} composer entries (showing first 5)`);
            
            // Try to parse one
            if (composerKeys.length > 0) {
                const firstKey = composerKeys[0].key;
                const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(firstKey);
                if (row && row.value) {
                    try {
                        const parsed = JSON.parse(row.value);
                        console.log(`  Sample composer: "${parsed.name || 'Untitled'}"`);
                        console.log(`  Created: ${new Date(parsed.createdAt).toISOString()}`);
                        console.log(`  Messages count: ${(parsed.fullConversationHeadersOnly || []).length}`);
                    } catch (e) {
                        console.log(`  Could not parse composer data: ${e.message}`);
                    }
                }
            }
            
            db.close();
        } catch (error) {
            console.log(`  ❌ Failed to read database: ${error.message}`);
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('Diagnostic complete! Share this output for debugging.');
    console.log('='.repeat(60));
})();

