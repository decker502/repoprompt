import * as vscode from 'vscode';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { ProjectFile, ProjectFolder, ProcessingOptions } from './types';

export interface ProcessingResult {
    structure: ProjectFolder[];
    files: ProjectFile[];
    rootPath: string;
    prompt?: string;
}

export class FileProcessor {
    private options: ProcessingOptions;
    private rootPath: string = '';

    constructor(options: ProcessingOptions) {
        this.options = options;
    }

    private async loadGitignorePatterns(): Promise<string[]> {
        try {
            const gitignoreUri = vscode.Uri.joinPath(vscode.Uri.file(this.rootPath), '.gitignore');
            const content = await vscode.workspace.fs.readFile(gitignoreUri);
            const patterns = content.toString()
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'))
                .map(pattern => {
                    // Remove leading slash if present
                    if (pattern.startsWith('/')) {
                        pattern = pattern.slice(1);
                    }
                    // Ensure directory patterns end with /**
                    if (pattern.endsWith('/')) {
                        pattern += '**';
                    }
                    return pattern;
                });
            return [...this.options.ignorePatterns, ...patterns];
        } catch (error) {
            return this.options.ignorePatterns;
        }
    }

    private async shouldIgnore(relativePath: string): Promise<boolean> {
        const ignorePatterns = await this.loadGitignorePatterns();
        return ignorePatterns.some(pattern => {
            // Convert pattern to match all levels
            if (pattern.endsWith('/**')) {
                pattern = pattern.slice(0, -3); // Remove /**
            }
            // Match at any level
            return minimatch(relativePath, `**/${pattern}/**`, { dot: true }) ||
                   minimatch(relativePath, `**/${pattern}`, { dot: true });
        });
    }

    async processSelection(uris: vscode.Uri[], prompt?: string): Promise<ProcessingResult> {
        const allFiles: ProjectFile[] = [];
        const rootFolders: ProjectFolder[] = [];
        let commonRootPath = '';

        // Find common root path for all selected items
        if (uris.length > 1) {
            const paths = uris.map(uri => uri.fsPath);
            commonRootPath = paths.reduce((prev, curr) => {
                let i = 0;
                while (i < prev.length && i < curr.length && prev[i] === curr[i]) {
                    i++;
                }
                return prev.slice(0, i);
            });
            commonRootPath = path.dirname(commonRootPath);
        } else {
            commonRootPath = uris[0].fsPath;
            if (uris[0].fsPath.endsWith(path.sep)) {
                commonRootPath = path.dirname(commonRootPath);
            }
        }

        this.rootPath = commonRootPath;

        for (const uri of uris) {
            const stat = await vscode.workspace.fs.stat(uri);
            const relativePath = path.relative(this.rootPath, uri.fsPath);
            
            if (stat.type === vscode.FileType.Directory) {
            const folder: ProjectFolder = {
                name: path.basename(uri.fsPath),
                path: path.relative(this.rootPath, uri.fsPath),
                folders: [],
                files: []
            };
                
                await this.processFolder(uri, folder, allFiles);
                rootFolders.push(folder);
            } else {
                const file = await this.processFile(uri);
                if (file) {
                    // Create folder structure for the file
                    const folderPath = path.dirname(relativePath);
                    const folderName = path.basename(folderPath);
                    
                    let parentFolder = rootFolders.find(f => f.path === folderPath);
                    if (!parentFolder) {
                        parentFolder = {
                            name: folderName,
                            path: folderPath,
                            folders: [],
                            files: []
                        };
                        rootFolders.push(parentFolder);
                    }
                    
                    parentFolder.files.push(file);
                    allFiles.push(file);
                }
            }
        }

        return { 
            structure: rootFolders, 
            files: allFiles,
            rootPath: this.rootPath,
            prompt
        };
    }

    public async processFolder(
        uri: vscode.Uri,
        parentFolder: ProjectFolder,
        allFiles: ProjectFile[]
    ): Promise<void> {
        const relativePath = path.relative(this.rootPath, uri.fsPath);
        
        if (await this.shouldIgnore(relativePath)) {
            return;
        }

        // Only create folder if it's not already in the parent
        if (!parentFolder.folders.some(f => f.path === relativePath)) {
            // Ensure path is relative to the root
            const folderPath = path.relative(this.rootPath, uri.fsPath);
            const folderName = path.basename(uri.fsPath);
            
            const folder: ProjectFolder = {
                name: folderName,
                path: path.relative(this.rootPath, uri.fsPath),
                folders: [],
                files: []
            };

            const entries = await vscode.workspace.fs.readDirectory(uri);
            
            for (const [name, type] of entries) {
                const entryUri = vscode.Uri.joinPath(uri, name);
                const entryRelativePath = path.relative(this.rootPath, entryUri.fsPath);
                
                if (await this.shouldIgnore(entryRelativePath)) {
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
    }

    private async processFile(uri: vscode.Uri): Promise<ProjectFile | null> {
        try {
            const relativePath = path.relative(this.rootPath, uri.fsPath);
            
            if (await this.shouldIgnore(relativePath)) {
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
                content: this.options.includeComments && stat.size <= this.options.maxFileSize 
                    ? fileContent 
                    : undefined
            };

            return file;
        } catch (error) {
            console.error(`Error processing file ${uri.fsPath}:`, error);
            return null;
        }
    }

    private escapeXml(content: string): string {
        return content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    private cleanContent(content: string): string {
        // Remove empty lines and comments
        const lines = content.split('\n')
            .filter(line => line.trim() !== '')
            .filter(line => !line.trim().startsWith('//') && 
                           !line.trim().startsWith('#') && 
                           !line.trim().startsWith('/*') && 
                           !line.trim().startsWith('*'));
        return lines.join('\n');
    }

    private generateSummary(content: string): string {
        try {
            const cleanedContent = this.cleanContent(content);
            const lines = cleanedContent.split('\n');
            let summary = lines
                .filter(line => line.trim().length > 0)
                .slice(0, 5)
                .join('\n');
                
            // 如果总长度超过200，截取并添加省略号
            if (summary.length > 200) {
                summary = summary.substring(0, 197) + '...';
            }
            
            return this.escapeXml(summary);
        } catch (error) {
            return '无法生成摘要';
        }
    }

    private processFileContent(content: string, includeFullContent: boolean): string | undefined {
        const cleanedContent = this.cleanContent(content);
        const escapedContent = this.escapeXml(cleanedContent);
        return includeFullContent ? escapedContent : undefined;
    }
}
