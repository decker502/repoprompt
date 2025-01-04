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

    private createFileObject(file: ProjectFile, entryPath: string): ProjectFile {
        // 创建一个全新的文件对象,避免循环引用
        return {
            name: file.name,
            path: entryPath,
            content: file.content ? String(file.content) : undefined,
            size: Number(file.size) || 0,
            summary: file.summary ? String(file.summary) : undefined,
            isSelected: false,
            type: vscode.FileType.File
        };
    }

    private createFolderObject(name: string, path: string): ProjectFolder {
        // 创建一个全新的文件夹对象,避免循环引用
        return {
            name: String(name),
            path: String(path),
            files: [],
            folders: [],
            isSelected: false,
            isExpanded: name === 'src',
            type: vscode.FileType.Directory
        };
    }

    public async processFolder(uri: vscode.Uri): Promise<ProjectFolder | undefined> {
        try {
            const relativePath = path.relative(this.rootPath, uri.fsPath);
            const folderName = path.basename(uri.fsPath);
            
            // 检查是否应该忽略该文件夹
            if (await this.fileHandler.shouldIgnore(relativePath)) {
                return undefined;
            }
            
            // 创建基础文件夹结构
            const folder = this.createFolderObject(folderName, relativePath || '.');

            // 检查是否为符号链接
            if (await this.isSymlink(uri)) {
                folder.truncated = true;
                return folder;
            }

            const entries = await this.readDirectory(uri);
            if (!entries) {
                folder.truncated = true;
                return folder;
            }

            // 处理文件
            for (const [name, type] of entries) {
                // 创建新的 Uri 对象而不是修改原始对象
                const entryUri = vscode.Uri.file(path.join(uri.fsPath, name));
                const entryPath = relativePath ? path.join(relativePath, name) : name;

                if (await this.fileHandler.shouldIgnore(entryPath)) {
                    continue;
                }

                if (type === vscode.FileType.File) {
                    const file = await this.fileHandler.processFile(entryUri);
                    if (file) {
                        folder.files.push(this.createFileObject(file, entryPath));
                    }
                }
            }

            // 处理文件夹（不递归，让 FileProcessor 处理递归）
            for (const [name, type] of entries) {
                if (type === vscode.FileType.Directory) {
                    // 创建新的 Uri 对象而不是修改原始对象
                    const subFolderUri = vscode.Uri.file(path.join(uri.fsPath, name));
                    const subFolderPath = relativePath ? path.join(relativePath, name) : name;
                    
                    if (await this.fileHandler.shouldIgnore(subFolderPath)) {
                        continue;
                    }

                    folder.folders.push(this.createFolderObject(name, subFolderPath));
                }
            }

            return folder;
        } catch (error) {
            console.error(`处理文件夹失败: ${uri.fsPath}`, error);
            return undefined;
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
                    // 保留子文件夹的文件夹结构，但避免循环引用
                    folder.folders = folder.folders.map(subFolder => ({
                        name: subFolder.name,
                        path: path.join(folder.path, subFolder.name),
                        files: subFolder.files,
                        folders: subFolder.folders,
                        truncated: subFolder.truncated
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
        const newPath = path.join(parentPath, folder.name);
        folder.path = newPath;
        
        // 更新文件路径
        folder.files = folder.files.map(file => ({
            name: file.name,
            path: path.join(newPath, file.name),
            content: file.content,
            size: file.size,
            summary: file.summary,
            ignored: file.ignored
        }));

        // 更新子文件夹路径
        folder.folders = folder.folders.map(subFolder => {
            const updatedFolder: ProjectFolder = {
                name: subFolder.name,
                path: path.join(newPath, subFolder.name),
                files: subFolder.files,
                folders: subFolder.folders,
                truncated: subFolder.truncated
            };
            this.updateFolderPaths(updatedFolder, newPath);
            return updatedFolder;
        });
    }

    protected collectFilesFromFolder(folder: ProjectFolder, allFiles: ProjectFile[], processedPaths = new Set<string>()): void {
        if (processedPaths.has(folder.path)) {
            return;
        }
        processedPaths.add(folder.path);

        // 创建文件副本并添加到集合中
        const files = folder.files.map(file => ({
            name: file.name,
            path: file.path,
            content: file.content,
            size: file.size,
            summary: file.summary,
            ignored: file.ignored
        }));
        allFiles.push(...files);

        // 递归处理子文件夹
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
