import * as vscode from 'vscode';
import { ProcessingOptions } from './types';

export class Config {
    static getProcessingOptions(): ProcessingOptions {
        const config = vscode.workspace.getConfiguration('projectToXml');
        return {
            maxFileSize: config.get<number>('fileSizeThreshold') || 1048576,
            ignorePatterns: config.get<string[]>('ignorePatterns') || [],
            rootTag: config.get<string>('rootTag') || 'project',
            includeComments: config.get<boolean>('includeComments') || true,
            chunkSize: config.get<number>('chunkSize') || 1024 * 1024 // 1MB
        };
    }

    static getDefaultOutputPath(): string {
        const config = vscode.workspace.getConfiguration('projectToXml');
        return config.get<string>('outputPath') || '${workspaceFolder}/project.xml';
    }

    static shouldCopyToClipboard(): boolean {
        const config = vscode.workspace.getConfiguration('projectToXml');
        return config.get<boolean>('copyToClipboard') || false;
    }
}
