import * as vscode from 'vscode';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { ProjectFile, ProjectFolder, ProcessingOptions } from './types';

export class FileProcessor {
    private options: ProcessingOptions;
    private rootPath: string = '';

    constructor(options: ProcessingOptions) {
        this.options = options;
    }

    private shouldIgnore(relativePath: string): boolean {
        return this.options.ignorePatterns.some(pattern => 
            minimatch(relativePath, pattern, { dot: true })
        );
    }

    async processSelection(uris: vscode.Uri[]): Promise<{
        structure: ProjectFolder,
        files: ProjectFile[]
    }> {
        const allFiles: ProjectFile[] = [];
        this.rootPath = path.dirname(uris[0].fsPath);
        
        const rootFolder: ProjectFolder = {
            name: path.basename(this.rootPath),
            path: '.',
            folders: [],
            files: []
        };

        for (const uri of uris) {
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.type === vscode.FileType.Directory) {
                await this.processFolder(uri, rootFolder, allFiles);
            } else {
                const file = await this.processFile(uri);
                if (file) {
                    rootFolder.files.push(file);
                    allFiles.push(file);
                }
            }
        }

        return { structure: rootFolder, files: allFiles };
    }

    private async processFolder(
        uri: vscode.Uri,
        parentFolder: ProjectFolder,
        allFiles: ProjectFile[]
    ): Promise<void> {
        const relativePath = path.relative(this.rootPath, uri.fsPath);
        
        if (this.shouldIgnore(relativePath)) {
            return;
        }

        const folder: ProjectFolder = {
            name: path.basename(uri.fsPath),
            path: relativePath,
            folders: [],
            files: []
        };

        const entries = await vscode.workspace.fs.readDirectory(uri);
        
        for (const [name, type] of entries) {
            const entryUri = vscode.Uri.joinPath(uri, name);
            const entryRelativePath = path.relative(this.rootPath, entryUri.fsPath);
            
            if (this.shouldIgnore(entryRelativePath)) {
                continue;
            }
            
            if (type === vscode.FileType.Directory) {
                await this.processFolder(entryUri, folder, allFiles);
            } else if (type === vscode.FileType.File) {
                const file = await this.processFile(entryUri);
                if (file) {
                    folder.files.push(file);
                    allFiles.push(file);
                }
            }
        }

        if (folder.files.length > 0 || folder.folders.length > 0) {
            parentFolder.folders.push(folder);
        }
    }

    private async processFile(uri: vscode.Uri): Promise<ProjectFile | null> {
        try {
            const relativePath = path.relative(this.rootPath, uri.fsPath);
            
            if (this.shouldIgnore(relativePath)) {
                return null;
            }

            const stat = await vscode.workspace.fs.stat(uri);
            const content = await vscode.workspace.fs.readFile(uri);
            const fileContent = content.toString();

            const file: ProjectFile = {
                name: path.basename(uri.fsPath),
                path: relativePath,
                size: stat.size,
                summary: this.generateSummary(fileContent),
                content: stat.size <= this.options.maxFileSize ? fileContent : undefined
            };

            return file;
        } catch (error) {
            console.error(`Error processing file ${uri.fsPath}:`, error);
            return null;
        }
    }

    private generateSummary(content: string): string {
        const lines = content.split('\n');
        const summary = lines.slice(0, 5).join('\n');
        return summary.length > 200 ? summary.substring(0, 200) + '...' : summary;
    }
} 