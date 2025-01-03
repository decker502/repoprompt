import * as vscode from 'vscode';
import * as path from 'path';
import minimatch from 'minimatch';
import { ProjectFile, ProcessingOptions } from './types';
import { getRelativePath } from './utils/pathUtils';
import { IgnorePatterns } from './utils/ignoreUtils';
import { escapeCdata } from './utils/xmlUtils';

export interface IFileHandler {
    processFile(uri: vscode.Uri): Promise<ProjectFile | undefined>;
    setRootPath(rootPath: string): void;
    shouldIgnore(relativePath: string): Promise<boolean>;
    dispose(): void;
    getFileStat(uri: vscode.Uri): Promise<vscode.FileStat>;
    readFile(uri: vscode.Uri): Promise<string>;
    readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]>;
}

export class FileHandler implements IFileHandler {
    private options: ProcessingOptions;
    private rootPath: string = '';
    private readonly fileSystem: typeof vscode.workspace.fs;
    private gitignoreWatcher: vscode.FileSystemWatcher | null = null;
    private readonly maxFileSize: number = 100 * 1024 * 1024; // 100MB
    private ignorePatterns: IgnorePatterns | null = null;
    private fileCache: Map<string, ProjectFile> = new Map();
    
    constructor(
        options: ProcessingOptions,
        fileSystem: typeof vscode.workspace.fs = vscode.workspace.fs
    ) {
        this.options = options;
        this.fileSystem = fileSystem;
        // 在非测试环境下才设置文件监听
        if (process.env.NODE_ENV !== 'test') {
            this.setupGitignoreWatcher();
        }
    }

    private setupGitignoreWatcher(): void {
        try {
            this.gitignoreWatcher = vscode.workspace.createFileSystemWatcher('**/.gitignore');
            this.gitignoreWatcher.onDidChange(() => this.gitignoreCache = null);
            this.gitignoreWatcher.onDidDelete(() => this.gitignoreCache = null);
            this.gitignoreWatcher.onDidCreate(() => this.gitignoreCache = null);
        } catch (error) {
            console.warn('无法设置 .gitignore 文件监听:', error);
        }
    }

    dispose(): void {
        if (this.gitignoreWatcher) {
            this.gitignoreWatcher.dispose();
        }
    }

    public setRootPath(rootPath: string): void {
        this.rootPath = rootPath;
    }

    private async readFileContent(uri: vscode.Uri): Promise<string> {
        const content = await this.fileSystem.readFile(uri);
        return new TextDecoder('utf-8').decode(content);
    }

    public async getFileStat(uri: vscode.Uri): Promise<vscode.FileStat> {
        try {
            return await vscode.workspace.fs.stat(uri);
        } catch (error) {
            await this.handleFileError(uri, error);
            throw error;
        }
    }

    async processFile(uri: vscode.Uri): Promise<ProjectFile | undefined> {
        try {
            let relativePath = '';
            try {
                relativePath = getRelativePath(this.rootPath, uri.fsPath);
                
                if (await this.shouldIgnore(relativePath)) {
                    return undefined;
                }
            } catch (error) {
                console.error(`Error processing path for ${uri.fsPath}:`, error);
                return undefined;
            }

            const stat = await this.getFileStat(uri);
            
            // 检查文件大小
            if (stat.size > this.maxFileSize) {
                throw new Error(`文件大小超过限制 (${Math.round(stat.size / 1024 / 1024)}MB > ${Math.round(this.maxFileSize / 1024 / 1024)}MB)`);
            }

            const fileContent = await this.readFileContent(uri);

            return {
                name: path.basename(uri.fsPath),
                path: relativePath,
                size: stat.size,
                summary: this.generateSummary(fileContent),
                content: this.options.includeComments && stat.size <= this.options.maxFileSize 
                    ? fileContent 
                    : undefined,
                ignored: false
            };
        } catch (error) {
            await this.handleFileError(uri, error);
            return undefined;
        }
    }

    private async handleFileError(uri: vscode.Uri, error: unknown): Promise<void> {
        let errorMessage = `处理文件时出错: ${uri.fsPath}\n`;
        let errorDetails = '';
        
        if (error instanceof vscode.FileSystemError) {
            switch (error.code) {
                case 'FileNotFound':
                    errorMessage += '文件不存在';
                    errorDetails = `路径: ${uri.fsPath}\n请检查文件是否存在或路径是否正确。`;
                    break;
                case 'NoPermissions':
                    errorMessage += '没有访问权限';
                    errorDetails = `路径: ${uri.fsPath}\n请检查文件权限或尝试以管理员身份运行。`;
                    break;
                case 'FileExists':
                    errorMessage += '文件已存在';
                    errorDetails = `路径: ${uri.fsPath}\n文件已存在，无需重复处理。`;
                    break;
                default:
                    errorMessage += `文件系统错误: ${error.message}`;
                    errorDetails = `错误代码: ${error.code}\n路径: ${uri.fsPath}`;
            }
        } else if (error instanceof Error) {
            errorMessage += `错误详情: ${error.message}`;
            errorDetails = `错误堆栈: ${error.stack || '无堆栈信息'}`;
        } else {
            errorMessage += `未知错误: ${error}`;
            errorDetails = `错误类型: ${typeof error}`;
        }
        
        console.error(`[ERROR] ${errorMessage}\n${errorDetails}`);
        
        const selection = await vscode.window.showErrorMessage(
            errorMessage,
            { modal: true },
            '查看详情'
        );
        
        if (selection === '查看详情') {
            await vscode.window.showErrorMessage(errorDetails, { modal: true });
        }
    }

    private generateSummary(content: string): string {
        try {
            const cleanedContent = this.cleanContent(content);
            const lines = cleanedContent.split('\n');
            let summary = lines
                .filter(line => line.trim().length > 0)
                .slice(0, 5)
                .join('\n');
                
            if (summary.length > 200) {
                summary = summary.substring(0, 197) + '...';
            }
            
            return escapeCdata(summary);
        } catch (error) {
            return '无法生成摘要';
        }
    }

    private cleanContent(content: string): string {
        const lines = content.split('\n')
            .filter(line => line.trim() !== '')
            .filter(line => !line.trim().startsWith('//') && 
                           !line.trim().startsWith('#') && 
                           !line.trim().startsWith('/*') && 
                           !line.trim().startsWith('*'));
        return lines.join('\n');
    }

    private gitignoreCache: { patterns: string[], timestamp: number } | null = null;

    async shouldIgnore(relativePath: string): Promise<boolean> {
        if (!this.ignorePatterns) {
            const patterns = await this.loadGitignorePatterns();
            this.ignorePatterns = new IgnorePatterns(patterns);
        }
        
        let normalizedPath = relativePath.replace(/\\/g, '/');
        
        // 确保路径以 ./ 开头
        if (!normalizedPath.startsWith('./')) {
            normalizedPath = `./${normalizedPath}`;
        }
        
        // 处理 .gitignore 模式
        for (const pattern of this.options.ignorePatterns) {
            if (this.matchPattern(normalizedPath, pattern)) {
                return true;
            }
        }
        
        // 处理 node_modules 等特殊路径
        if (normalizedPath.includes('node_modules')) {
            return true;
        }
        
        return this.ignorePatterns.shouldIgnore(normalizedPath);
    }

    private matchPattern(path: string, pattern: string): boolean {
        if (pattern.startsWith('!')) {
            return !minimatch(path, pattern.slice(1));
        }
        return minimatch(path, pattern);
    }

    private async loadGitignorePatterns(): Promise<string[]> {
        try {
            const gitignoreUri = vscode.Uri.joinPath(vscode.Uri.file(this.rootPath), '.gitignore');
            
            const stat = await vscode.workspace.fs.stat(gitignoreUri);
            if (this.gitignoreCache && this.gitignoreCache.timestamp === stat.mtime) {
                return this.gitignoreCache.patterns;
            }

            const content = await vscode.workspace.fs.readFile(gitignoreUri);
            const patterns = content.toString()
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'))
                .map(pattern => {
                    if (pattern.startsWith('!')) {
                        return pattern;
                    }
                    if (pattern.startsWith('/')) {
                        pattern = pattern.slice(1);
                    }
                    if (pattern.endsWith('/')) {
                        pattern += '**';
                    }
                    return pattern;
                });

            this.gitignoreCache = {
                patterns: [...this.options.ignorePatterns, ...patterns],
                timestamp: stat.mtime
            };

            return this.gitignoreCache.patterns;
        } catch (error) {
            return this.options.ignorePatterns;
        }
    }

    async readFile(uri: vscode.Uri): Promise<string> {
        return this.readFileContent(uri);
    }

    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        return this.fileSystem.readDirectory(uri);
    }
}
