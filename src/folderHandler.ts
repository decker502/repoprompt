import * as vscode from 'vscode';
import * as path from 'path';
import { ProcessingOptions, ProjectFolder, ProjectFile } from './types';
import { IFileHandler } from './fileHandler';
import { normalizePath, isSubPath } from './utils/pathUtils';
import { IgnorePatterns } from './utils/ignoreUtils';

export interface IFolderHandler {
    processFolder(uri: vscode.Uri): Promise<ProjectFolder | undefined>;
    setRootPath(rootPath: string): void;
    dispose(): void;
}

export class FolderHandler implements IFolderHandler {
    private options: ProcessingOptions;
    private fileHandler: IFileHandler;
    private rootPath: string = '';
    private readonly fileSystem: typeof vscode.workspace.fs;
    private readonly processedPaths = new Set<string>();
    private readonly MAX_RETRIES = 3;
    private ignorePatterns: IgnorePatterns | null = null;
    private readonly maxDepth: number = 10;
    private readonly MAX_CONCURRENT_OPERATIONS = 5;
    
    constructor(
        options: ProcessingOptions,
        fileHandler: IFileHandler,
        fileSystem: typeof vscode.workspace.fs = vscode.workspace.fs
    ) {
        this.options = options;
        this.fileHandler = fileHandler;
        this.fileSystem = fileSystem;
    }

    dispose(): void {
        this.processedPaths.clear();
    }

    public setRootPath(rootPath: string): void {
        this.rootPath = rootPath;
    }

    public async processFolder(uri: vscode.Uri): Promise<ProjectFolder | undefined> {
        try {
            const relativePath = path.relative(this.rootPath, uri.fsPath);
            const folder: ProjectFolder = {
                name: path.basename(uri.fsPath),
                path: relativePath || '.',
                files: [],
                folders: []
            };

            // 检查是否为符号链接
            const stat = await this.fileSystem.stat(uri);
            if (stat && (stat.type & vscode.FileType.SymbolicLink)) {
                folder.truncated = true;
                return folder;
            }

            const entries = await this.readDirectory(uri);
            if (!entries) {
                folder.truncated = true;
                return folder;
            }

            // 处理文件和文件夹
            for (const [name, type] of entries) {
                const entryUri = vscode.Uri.file(path.join(uri.fsPath, name));
                const entryPath = path.join(relativePath || '.', name);

                if (await this.fileHandler.shouldIgnore(entryPath)) {
                    continue;
                }

                if (type === vscode.FileType.File) {
                    const file = await this.fileHandler.processFile(entryUri);
                    if (file) {
                        folder.files.push({
                            ...file,
                            path: entryPath
                        });
                    }
                } else if (type === vscode.FileType.Directory) {
                    const subFolder = await this.processFolder(entryUri);
                    if (subFolder) {
                        folder.folders.push(subFolder);
                    }
                }
            }

            // 如果文件夹为空且配置不保留空文件夹，返回 undefined
            if (folder.files.length === 0 && folder.folders.length === 0 && !this.options.includeEmptyFolders) {
                return undefined;
            }

            return folder;
        } catch (error) {
            console.error(`处理文件夹失败: ${uri.fsPath}`, error);
            return {
                name: path.basename(uri.fsPath),
                path: path.relative(this.rootPath, uri.fsPath) || '.',
                files: [],
                folders: [],
                truncated: true
            };
        }
    }

    private async retryOperation<T>(
        operation: () => Thenable<T>,
        errorMessage: string,
        maxRetries: number = 3,
        retryDelay: number = 1000
    ): Promise<T> {
        let lastError: Error | undefined;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }
        throw new Error(`${errorMessage}: ${lastError?.message || 'Unknown error'}`);
    }

    private async processSubfolders(
        uri: vscode.Uri,
        entries: [string, vscode.FileType][]
    ): Promise<(ProjectFolder | null)[]> {
        const directories = entries.filter(([_, type]) => type === vscode.FileType.Directory);
        const results: (ProjectFolder | null)[] = [];

        // 串行处理子文件夹，避免并发问题
        for (const [name] of directories) {
            try {
                const entryUri = vscode.Uri.joinPath(uri, name);
                const entryRelativePath = path.relative(this.rootPath, entryUri.fsPath);
                
                if (await this.shouldIgnore(entryRelativePath)) {
                    continue;
                }
                
                const folder = await this.processFolder(entryUri);
                if (folder) {
                    // 更新子文件夹的路径
                    folder.path = path.join(path.relative(this.rootPath, uri.fsPath), name);
                    // 保留子文件夹的文件夹结构
                    folder.folders = folder.folders.map(subFolder => ({
                        ...subFolder,
                        path: path.join(folder.path, subFolder.name)
                    }));
                    results.push(folder);
                }
            } catch (error) {
                console.error(`处理子文件夹失败: ${name}`, error);
            }
        }

        return results;
    }

    private async processFiles(
        uri: vscode.Uri,
        entries: [string, vscode.FileType][]
    ): Promise<(ProjectFile | null)[]> {
        const files = entries.filter(([_, type]) => type === vscode.FileType.File);
        const results: (ProjectFile | null)[] = [];

        // 串行处理文件，避免并发问题
        for (const [name] of files) {
            try {
                const entryUri = vscode.Uri.joinPath(uri, name);
                const entryRelativePath = path.relative(this.rootPath, entryUri.fsPath);
                
                if (await this.shouldIgnore(entryRelativePath)) {
                    continue;
                }
                
                const file = await this.fileHandler.processFile(entryUri);
                if (file) {
                    // 更新文件路径
                    file.path = path.join(path.relative(this.rootPath, uri.fsPath), name);
                    results.push(file);
                }
            } catch (error) {
                console.error(`处理文件失败: ${name}`, error);
            }
        }

        return results;
    }

    private async shouldIgnore(relativePath: string): Promise<boolean> {
        if (!this.fileHandler.shouldIgnore) {
            return false;
        }
        return this.fileHandler.shouldIgnore(relativePath);
    }

    protected updateFolderPaths(folder: ProjectFolder, parentPath: string): void {
        folder.path = path.join(parentPath, folder.name);
        folder.files.forEach(file => {
            file.path = path.join(folder.path, file.name);
        });
        folder.folders.forEach(subFolder => {
            this.updateFolderPaths(subFolder, folder.path);
        });
    }

    protected collectFilesFromFolder(folder: ProjectFolder, allFiles: ProjectFile[], processedPaths = new Set<string>()): void {
        if (processedPaths.has(folder.path)) {
            return;
        }
        processedPaths.add(folder.path);

        allFiles.push(...folder.files);
        folder.folders.forEach(subFolder => {
            this.collectFilesFromFolder(subFolder, allFiles, processedPaths);
        });
    }

    private async isSymlink(uri: vscode.Uri): Promise<boolean> {
        try {
            const stat = await this.fileSystem.stat(uri);
            return Boolean(stat && (stat.type & vscode.FileType.SymbolicLink));
        } catch (error) {
            console.error(`检查符号链接失败: ${uri.fsPath}`, error);
            return false;
        }
    }

    private async processWithConcurrencyLimit<T>(
        items: T[],
        processor: (item: T) => Promise<void>,
    ): Promise<void> {
        const MAX_CONCURRENT_OPERATIONS = 5;
        const chunks: T[][] = [];
        for (let i = 0; i < items.length; i += MAX_CONCURRENT_OPERATIONS) {
            chunks.push(items.slice(i, i + MAX_CONCURRENT_OPERATIONS));
        }
        for (const chunk of chunks) {
            await Promise.all(chunk.map(processor));
        }
    }

    private async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][] | undefined> {
        try {
            return await this.fileSystem.readDirectory(uri);
        } catch (error) {
            console.error(`读取目录失败: ${uri.fsPath}`, error);
            return undefined;
        }
    }
}
