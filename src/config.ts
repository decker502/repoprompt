import * as vscode from 'vscode';
import { ProcessingOptions } from './types';

export class Config {
    private static readonly CONFIG_SECTION = 'repoprompt';

    static getProcessingOptions(): ProcessingOptions {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        
        return {
            maxFileSize: config.get<number>('maxFileSize', 1024 * 1024),
            ignorePatterns: config.get<string[]>('ignorePatterns', [
                'node_modules/**',
                '.git/**',
                'dist/**',
                'build/**',
                '*.log'
            ]),
            rootTag: config.get<string>('rootTag', 'project'),
            includeComments: config.get<boolean>('includeComments', true),
            chunkSize: config.get<number>('chunkSize', 1024 * 1024)
        };
    }

    static getDefaultOutputPath(): string {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        return config.get<string>('outputPath', '${workspaceFolder}/project.xml');
    }

    static shouldCopyToClipboard(): boolean {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        return config.get<boolean>('copyToClipboard', true);
    }

}
