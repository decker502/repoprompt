import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectFile, ProcessingOptions } from './types';
import { getRelativePath } from './utils/pathUtils';
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
    private readonly maxFileSize: number = 100 * 1024 * 1024; // 100MB
    private fileCache: Map<string, ProjectFile> = new Map();

    constructor(
        options: ProcessingOptions,
        fileSystem: typeof vscode.workspace.fs = vscode.workspace.fs
    ) {
        this.options = options;
        this.fileSystem = fileSystem;
    }

    dispose(): void {
        // 清理缓存
        this.fileCache.clear();
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
            const stat = await this.fileSystem.stat(uri);
            if (!stat) {
                // 如果获取不到文件状态，返回一个默认的文件状态
                return {
                    type: vscode.FileType.File,
                    ctime: 0,
                    mtime: 0,
                    size: 0
                };
            }
            // 创建一个新的对象，只包含必要的属性
            return {
                type: stat.type,
                ctime: stat.ctime,
                mtime: stat.mtime,
                size: stat.size
            };
        } catch (error) {
            // 如果获取文件状态失败，返回一个默认的文件状态
            return {
                type: vscode.FileType.File,
                ctime: 0,
                mtime: 0,
                size: 0
            };
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

    async shouldIgnore(relativePath: string): Promise<boolean> {
        // 获取 VSCode 的工作区配置
        const config = vscode.workspace.getConfiguration();
        const filesExclude = config.get<{ [key: string]: boolean }>('files.exclude') || {};
        const searchExclude = config.get<{ [key: string]: boolean }>('search.exclude') || {};
        
        // 合并 files.exclude 和 search.exclude 的规则
        const excludePatterns = { ...filesExclude, ...searchExclude };
        
        // 规范化路径
        const normalizedPath = relativePath.replace(/\\/g, '/');
        
        // 检查是否匹配任何排除规则
        for (const [pattern, isExcluded] of Object.entries(excludePatterns)) {
            if (isExcluded) {
                const globPattern = new vscode.RelativePattern(this.rootPath, pattern);
                const matches = await vscode.workspace.findFiles(globPattern, null, 1);
                if (matches.some(uri => uri.fsPath.includes(normalizedPath))) {
                    return true;
                }
            }
        }
        
        // 检查自定义的忽略规则
        if (this.options.ignorePatterns.length > 0) {
            for (const pattern of this.options.ignorePatterns) {
                const globPattern = new vscode.RelativePattern(this.rootPath, pattern);
                const matches = await vscode.workspace.findFiles(globPattern, null, 1);
                if (matches.some(uri => uri.fsPath.includes(normalizedPath))) {
                    return true;
                }
            }
        }
        
        return false;
    }

    async readFile(uri: vscode.Uri): Promise<string> {
        return this.readFileContent(uri);
    }

    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        return this.fileSystem.readDirectory(uri);
    }
}
