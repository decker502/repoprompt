import * as vscode from 'vscode';
import { ProcessingOptions } from './types';

export class Config {
    static getProcessingOptions(): ProcessingOptions {
        const config = vscode.workspace.getConfiguration('repoprompt');
        
        // 处理无效配置值
        const maxFileSize = parseInt(config.get<string>('maxFileSize') || '1048576', 10);
        const chunkSize = parseInt(config.get<string>('chunkSize') || '5242880', 10);
        const maxTotalSize = parseInt(config.get<string>('maxTotalSize') || '104857600', 10);
        const maxDepth = parseInt(config.get<string>('maxDepth') || '10', 10);
        
        return {
            maxFileSize: isNaN(maxFileSize) ? 1048576 : maxFileSize,
            maxTotalSize: isNaN(maxTotalSize) ? 104857600 : maxTotalSize,
            maxDepth: isNaN(maxDepth) ? 10 : maxDepth,
            ignorePatterns: Array.isArray(config.get('ignorePatterns')) 
                ? config.get<string[]>('ignorePatterns') || []
                : [],
            rootTag: typeof config.get('rootTag') === 'string'
                ? config.get<string>('rootTag') || 'project'
                : 'project',
            includeComments: typeof config.get('includeComments') === 'boolean'
                ? config.get<boolean>('includeComments') !== false
                : true,
            chunkSize: isNaN(chunkSize) ? 5242880 : chunkSize,
            keepEmptyFolders: typeof config.get('keepEmptyFolders') === 'boolean'
                ? config.get<boolean>('keepEmptyFolders') === true
                : false,
            includeEmptyFolders: typeof config.get('includeEmptyFolders') === 'boolean'
                ? config.get<boolean>('includeEmptyFolders') === true
                : false
        };
    }

    static getDefaultOutputPath(): string {
        const config = vscode.workspace.getConfiguration('repoprompt');
        return config.get<string>('outputPath') || '${workspaceFolder}/project.xml';
    }

    static shouldCopyToClipboard(): boolean {
        const config = vscode.workspace.getConfiguration('repoprompt');
        return config.get<boolean>('copyToClipboard') || false;
    }

    static getPrompt(): string | undefined {
        const config = vscode.workspace.getConfiguration('repoprompt');
        return config.get<string>('prompt');
    }

    static getConfig(): ProcessingOptions {
        return {
            maxFileSize: vscode.workspace.getConfiguration('repoprompt').get<number>('maxFileSize', 1024 * 1024),
            maxTotalSize: vscode.workspace.getConfiguration('repoprompt').get<number>('maxTotalSize', 10 * 1024 * 1024),
            maxDepth: vscode.workspace.getConfiguration('repoprompt').get<number>('maxDepth', 10),
            ignorePatterns: vscode.workspace.getConfiguration('repoprompt').get<string[]>('ignorePatterns', [
                '**/node_modules/**',
                '**/.git/**',
                '**/dist/**',
                '**/build/**',
                '**/coverage/**'
            ]),
            rootTag: vscode.workspace.getConfiguration('repoprompt').get<string>('rootTag', 'project'),
            includeComments: vscode.workspace.getConfiguration('repoprompt').get<boolean>('includeComments', true),
            chunkSize: vscode.workspace.getConfiguration('repoprompt').get<number>('chunkSize', 1024 * 1024),
            keepEmptyFolders: vscode.workspace.getConfiguration('repoprompt').get<boolean>('keepEmptyFolders', false),
            includeEmptyFolders: vscode.workspace.getConfiguration('repoprompt').get<boolean>('includeEmptyFolders', false)
        };
    }
}
