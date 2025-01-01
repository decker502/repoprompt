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

export class FileHandler {
    private options: ProcessingOptions;
    private rootPath: string = '';
    
    constructor(options: ProcessingOptions) {
        this.options = options;
    }

    setRootPath(rootPath: string) {
        this.rootPath = rootPath;
    }

    private async readFileContent(uri: vscode.Uri): Promise<string> {
        const content = await vscode.workspace.fs.readFile(uri);
        return content.toString();
    }

    private async getFileStat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return await vscode.workspace.fs.stat(uri);
    }

    async processFile(uri: vscode.Uri): Promise<ProjectFile | null> {
        try {
            const relativePath = path.relative(this.rootPath, uri.fsPath) || '';
            
            if (await this.shouldIgnore(relativePath)) {
                return null;
            }

            const [stat, fileContent] = await Promise.all([
                this.getFileStat(uri),
                this.readFileContent(uri)
            ]);

            return {
                name: path.basename(uri.fsPath),
                path: relativePath,
                size: stat.size,
                summary: this.generateSummary(fileContent),
                content: this.options.includeComments && stat.size <= this.options.maxFileSize 
                    ? fileContent 
                    : undefined
            };
        } catch (error) {
            console.error(`Error processing file ${uri.fsPath}:`, error);
            return null;
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
            
            return this.escapeXml(summary);
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

    private escapeXml(content: string): string {
        return content
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '"')
            .replace(/'/g, '\'');
    }

    private async shouldIgnore(relativePath: string): Promise<boolean> {
        const ignorePatterns = await this.loadGitignorePatterns();
        return ignorePatterns.some(pattern => {
            if (pattern.endsWith('/**')) {
                pattern = pattern.slice(0, -3);
            }
            return minimatch(relativePath, `**/${pattern}/**`, { dot: true }) ||
                   minimatch(relativePath, `**/${pattern}`, { dot: true });
        });
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
                    if (pattern.startsWith('/')) {
                        pattern = pattern.slice(1);
                    }
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
}

export class FolderHandler {
    private options: ProcessingOptions;
    private fileHandler: FileHandler;
    private rootPath: string = '';
    
    constructor(options: ProcessingOptions, fileHandler: FileHandler) {
        this.options = options;
        this.fileHandler = fileHandler;
    }

    setRootPath(rootPath: string) {
        this.rootPath = rootPath;
        this.fileHandler.setRootPath(rootPath);
    }

    async processFolder(uri: vscode.Uri): Promise<ProjectFolder> {
        const relativePath = path.relative(this.rootPath, uri.fsPath);
        
        // 如果是根目录，path 应为空字符串
        const isRoot = path.resolve(uri.fsPath) === path.resolve(this.rootPath);
        const folderPath = isRoot ? '' : (relativePath || '');
        
        if (await this.shouldIgnore(relativePath)) {
            return {
                name: path.basename(uri.fsPath),
                path: folderPath,
                folders: [],
                files: []
            };
        }

        const folder: ProjectFolder = {
            name: path.basename(uri.fsPath),
            path: folderPath,
            folders: [],
            files: []
        };

        const entries = await vscode.workspace.fs.readDirectory(uri);
        if (!entries || !Array.isArray(entries)) {
            throw new Error(`Invalid directory entries for ${uri.fsPath}`);
        }
        
        const directories = entries.filter(([_, type]) => type === vscode.FileType.Directory);
        for (const [name, type] of directories) {
            const entryUri = vscode.Uri.joinPath(uri, name);
            const entryRelativePath = path.relative(this.rootPath, entryUri.fsPath) || '';
            
            if (await this.shouldIgnore(entryRelativePath)) {
                continue;
            }
            
            const subfolder = await this.processFolder(entryUri);
            folder.folders.push(subfolder);
        }

        const files = entries.filter(([_, type]) => type === vscode.FileType.File);
        for (const [name, type] of files) {
            const entryUri = vscode.Uri.joinPath(uri, name);
            const entryRelativePath = path.relative(this.rootPath, entryUri.fsPath) || '';
            
            if (await this.shouldIgnore(entryRelativePath)) {
                continue;
            }
            
            const file = await this.fileHandler.processFile(entryUri);
            if (file) {
                folder.files.push(file);
            }
        }

        return folder;
    }

    private async shouldIgnore(relativePath: string): Promise<boolean> {
        return this.fileHandler['shouldIgnore'](relativePath);
    }
}

export class FileProcessor {
    private fileHandler: FileHandler;
    private folderHandler: FolderHandler;
    private rootPath: string = '';

    constructor(private options: ProcessingOptions) {
        this.fileHandler = new FileHandler(options);
        this.folderHandler = new FolderHandler(options, this.fileHandler);
    }

    private async calculateCommonRootPath(uris: vscode.Uri[]): Promise<string> {
        if (uris.length === 0) {
            return '';
        }

        // ---------- [1] 如果只有一个 URI，单独处理 ----------
        if (uris.length === 1) {
            const singleUri = uris[0];
            const stat = await vscode.workspace.fs.stat(singleUri);
            // 若是目录，直接返回该目录
            if (stat.type === vscode.FileType.Directory) {
                return singleUri.fsPath;  
            }
            // 若是文件，返回父目录
            return path.dirname(singleUri.fsPath);
        }

        // ---------- [2] 多 URI 时，用公共前缀策略 ----------
        const pathSegments = uris.map(uri => {
            const absolutePath = path.resolve(uri.fsPath);
            return path.normalize(absolutePath).split(path.sep);
        });

        // 找到最小的分段长度
        const minLength = Math.min(...pathSegments.map(segments => segments.length));
        let commonSegments: string[] = [];

        // 依次比较相同索引下的 segment
        for (let i = 0; i < minLength; i++) {
            const segment = pathSegments[0][i];
            if (pathSegments.every(segments => segments[i] === segment)) {
                commonSegments.push(segment);
            } else {
                break;
            }
        }

        // 如果压根没有公共段，就以第一个文件/文件夹的父目录为根
        if (commonSegments.length === 0) {
            const firstUri = uris[0];
            const stat = await vscode.workspace.fs.stat(firstUri);
            return stat.type === vscode.FileType.Directory 
                ? firstUri.fsPath 
                : path.dirname(firstUri.fsPath);
        }

        // 拼出公共前缀
        let commonPath = path.join(...commonSegments);
        // 对于 *nix，可能需要确保带上根斜杠
        if (!path.isAbsolute(commonPath)) {
            commonPath = path.sep + commonPath;
        }

        // 如果 stat 抛错，说明这个路径不一定真实存在，就直接返回
        let stat;
        try {
            stat = await vscode.workspace.fs.stat(vscode.Uri.file(commonPath));
        } catch (error) {
            // 如果这里抛错，说明无权访问或不存在等情况，直接返回当前 commonPath 即可
            return path.normalize(commonPath);
        }

        // 对于多个文件，返回它们的最深公共目录
        let finalPath = commonPath;
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(commonPath));
            if (stat.type === vscode.FileType.File) {
                finalPath = path.dirname(commonPath);
            } else if (stat.type === vscode.FileType.Directory) {
                // 检查所有 URI 是否都在这个目录下
                const allInSameDir = uris.every(uri => {
                    const uriPath = path.dirname(uri.fsPath);
                    return uriPath === commonPath || uriPath.startsWith(commonPath + path.sep);
                });
                if (!allInSameDir) {
                    // 如果不是所有文件都在这个目录下，返回上一级目录
                    finalPath = path.dirname(commonPath);
                }
            }
        } catch (error) {
            // 如果无法获取文件状态，保持原路径
        }
        return path.normalize(finalPath);
    }

    private async processSingleUri(
        uri: vscode.Uri,
        allFiles: ProjectFile[],
        rootFolders: ProjectFolder[]
    ): Promise<void> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            const relativePath = path.relative(this.rootPath, uri.fsPath);
            
            if (stat.type === vscode.FileType.Directory) {
                const processedFolder = await this.folderHandler.processFolder(uri);
                if (processedFolder) {
                    rootFolders.push(processedFolder);
                    // 将文件夹中的所有文件添加到allFiles
                    const collectFiles = (folder: ProjectFolder) => {
                        allFiles.push(...folder.files);
                        folder.folders.forEach(collectFiles);
                    };
                    collectFiles(processedFolder);
                }
            } else if (stat.type === vscode.FileType.File) {
                const file = await this.fileHandler.processFile(uri);
                if (file) {
                    allFiles.push(file);
                    
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
                }
            }
        } catch (error) {
            console.error(`Error processing selection ${uri.fsPath}:`, error);
        }
    }

    async processSelection(uris: vscode.Uri[], prompt?: string): Promise<ProcessingResult> {
        const allFiles: ProjectFile[] = [];
        const rootFolders: ProjectFolder[] = [];
        
        // Calculate the common root path for all selected items
        this.rootPath = await this.calculateCommonRootPath(uris);
        if (!this.rootPath) {
            throw new Error('无法确定所选项目的根路径');
        }

        this.fileHandler.setRootPath(this.rootPath);
        this.folderHandler.setRootPath(this.rootPath);

        // Process each selected item
        await Promise.all(uris.map(uri => 
            this.processSingleUri(uri, allFiles, rootFolders)
        ));

        // If no files were found but folders were processed, include them in the structure
        if (allFiles.length === 0 && rootFolders.length > 0) {
            return {
                structure: rootFolders,
                files: allFiles,
                rootPath: this.rootPath,
                prompt
            };
        }

        // If files were found but no folders, create a root folder structure
        if (allFiles.length > 0 && rootFolders.length === 0) {
            const rootFolder: ProjectFolder = {
                name: path.basename(this.rootPath),
                path: '',
                folders: [],
                files: allFiles
            };
            return {
                structure: [rootFolder],
                files: allFiles,
                rootPath: this.rootPath,
                prompt
            };
        }

        return { 
            structure: rootFolders, 
            files: allFiles,
            rootPath: this.rootPath,
            prompt
        };
    }
}
