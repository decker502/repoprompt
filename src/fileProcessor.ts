import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IgnorePatterns } from './utils/ignoreUtils';
import { ProjectFile, ProjectFolder, ProcessingOptions } from './types';
import { normalizePath } from './utils/pathUtils';
import { FileHandler, IFileHandler } from './fileHandler';
import { IFolderHandler, FolderHandler } from './folderHandler';
import { XmlGenerator } from './xmlGenerator';

export interface ProcessingResult {
    structure: ProjectFolder[];
    files: ProjectFile[];
    rootPath: string;
    prompt?: string;
    chunkInfo?: {
        current: number;
        total: number;
    };
    xmlContent?: string;
}

export interface ProcessingProgress {
    report: (value: { message?: string; increment?: number }) => void;
}

export class ProcessingResultBuilder {
    private files: ProjectFile[] = [];
    private structure: ProjectFolder[] = [];
    private rootPath: string = '';
    private prompt: string = '';
    private xmlContent: string = '';

    constructor(rootPath: string = '', prompt: string = '') {
        this.rootPath = rootPath;
        this.prompt = prompt;
    }

    public addFile(...files: ProjectFile[]): void {
        this.files.push(...files);
    }

    public addToStructure(folder: ProjectFolder): void {
        this.structure.push(folder);
    }

    public setFiles(files: ProjectFile[]): void {
        this.files = files;
    }

    public setStructure(folders: ProjectFolder[]): void {
        this.structure = folders;
    }

    public setRootPath(path: string): void {
        this.rootPath = path;
    }

    public setPrompt(prompt?: string): void {
        this.prompt = prompt || '';
    }

    public setXmlContent(xml: string): void {
        this.xmlContent = xml;
    }

    public build(): ProcessingResult {
        return {
            files: this.files,
            structure: this.structure,
            rootPath: this.rootPath,
            prompt: this.prompt,
            xmlContent: this.xmlContent
        };
    }
}

export class FileProcessor {
    private fileHandler: IFileHandler;
    private folderHandler: IFolderHandler;
    private rootPath: string = '';
    private readonly MAX_CONCURRENT_OPERATIONS = 5;
    private readonly MAX_FOLDER_DEPTH = 10;
    private readonly processedPaths = new Set<string>();

    constructor(
        private options: ProcessingOptions,
        fileHandler?: IFileHandler,
        folderHandler?: IFolderHandler
    ) {
        this.fileHandler = fileHandler || new FileHandler(options);
        this.folderHandler = folderHandler || new FolderHandler(options, this.fileHandler);
    }

    private async processWithConcurrencyLimit<T>(
        items: T[],
        processor: (item: T) => Promise<void>,
    ): Promise<void> {
        for (let i = 0; i < items.length; i += this.MAX_CONCURRENT_OPERATIONS) {
            const chunk = items.slice(i, i + this.MAX_CONCURRENT_OPERATIONS);
            await Promise.all(chunk.map(processor));
        }
    }

    private async calculateCommonRootPath(uris: vscode.Uri[]): Promise<string> {
        if (!uris || uris.length === 0) {
            throw new Error('No files selected');
        }

        // 过滤掉无效的 URI
        const validUris = uris.filter(uri => {
            const isValid = uri && uri.fsPath && uri.path && this.validateUri(uri);
            if (!isValid) {
                this.logInvalidUri(uri);
            }
            return isValid;
        });

        if (validUris.length === 0) {
            throw new Error('No valid files selected');
        }

        if (validUris.length === 1) {
            const uri = validUris[0];
            try {
                const stat = await this.fileHandler.getFileStat(uri);
                return stat.type === vscode.FileType.Directory
                    ? uri.fsPath
                    : path.dirname(uri.fsPath);
            } catch (error) {
                console.warn(`Failed to get file stat for ${uri.fsPath}:`, error);
                // 如果获取文件状态失败，使用目录名作为根路径
                return path.dirname(uri.fsPath);
            }
        }

        // 使用有效的 URI 路径
        const paths = validUris.map(uri => uri.fsPath);
        const segments = paths.map(p => p.split(path.sep));
        const minLength = Math.min(...segments.map(s => s.length));
        const commonPath: string[] = [];

        for (let i = 0; i < minLength; i++) {
            const segment = segments[0][i];
            if (segments.every(s => s[i] === segment)) {
                commonPath.push(segment);
            } else {
                break;
            }
        }

        // 如果没有找到共同路径,使用第一个有效文件的目录
        if (commonPath.length === 0) {
            const uri = validUris[0];
            try {
                const stat = await this.fileHandler.getFileStat(uri);
                return stat.type === vscode.FileType.Directory
                    ? uri.fsPath
                    : path.dirname(uri.fsPath);
            } catch (error) {
                console.warn(`Failed to get file stat for ${uri.fsPath}:`, error);
                // 如果获取文件状态失败，使用目录名作为根路径
                return path.dirname(uri.fsPath);
            }
        }

        return commonPath.join(path.sep);
    }

    private async processSingleUri(
        uri: vscode.Uri,
        allFiles: ProjectFile[],
        rootFolders: ProjectFolder[],
        rootFolder: ProjectFolder
    ): Promise<void> {
        try {
            const stat = await this.fileHandler.getFileStat(uri);
            const relativePath = path.relative(this.rootPath, uri.fsPath);

            // 检查是否应该忽略该路径
            if (await this.fileHandler.shouldIgnore(uri.fsPath)) {
                return;
            }

            if (stat.type === vscode.FileType.File) {
                const file = await this.fileHandler.processFile(uri);
                if (file) {
                    const parentPath = path.dirname(relativePath);
                    const filePath = parentPath === '.' ? file.name : path.join(parentPath, file.name);
                    const normalizedFile = {
                        ...file,
                        path: filePath.split(path.sep).join('/')
                    };
                    
                    if (!allFiles.some(f => f.path === normalizedFile.path)) {
                        allFiles.push(normalizedFile);
                        if (parentPath === '.' || parentPath === '') {
                            rootFolder.files.push(normalizedFile);
                        } else {
                            this.addFileToParentFolder(normalizedFile, rootFolders);
                        }
                    }
                }
            } else if (stat.type === vscode.FileType.Directory) {
                const folder = await this.folderHandler.processFolder(uri);
                if (folder) {
                    const folderName = path.basename(uri.fsPath);
                    const folderPath = relativePath === '.' ? folderName : relativePath;
                    const newFolder: ProjectFolder = {
                        name: folderName,
                        path: folderPath.split(path.sep).join('/'),
                        files: [],
                        folders: []
                    };

                    if (folder.files) {
                        for (const file of folder.files) {
                            const filePath = path.join(folderPath, file.name);
                            const fileUri = vscode.Uri.file(path.join(uri.fsPath, file.name));
                            
                            // 检查是否应该忽略该文件
                            if (await this.fileHandler.shouldIgnore(fileUri.fsPath)) {
                                continue;
                            }
                            
                            const processedFile = await this.fileHandler.processFile(fileUri);
                            
                            if (processedFile) {
                                const normalizedFile = {
                                    ...processedFile,
                                    path: filePath.split(path.sep).join('/')
                                };
                                
                                if (!allFiles.some(f => f.path === normalizedFile.path)) {
                                    newFolder.files.push(normalizedFile);
                                    allFiles.push(normalizedFile);
                                }
                            }
                        }
                    }

                    if (folder.folders) {
                        for (const subFolder of folder.folders) {
                            const subFolderUri = vscode.Uri.file(path.join(uri.fsPath, subFolder.name));
                            await this.processSingleUri(subFolderUri, allFiles, newFolder.folders, newFolder);
                        }
                    }

                    if (newFolder.files.length > 0 || (this.options.includeEmptyFolders && newFolder.folders.length > 0)) {
                        rootFolders.push(newFolder);
                    }
                }
            }
        } catch (error) {
            this.handleProcessingError(error, uri.fsPath);
        }
    }

    private collectFiles(folder: ProjectFolder, allFiles: ProjectFile[]): void {
        // 收集当前文件夹的文件
        folder.files.forEach(file => {
            // 确保文件路径包含文件夹路径
            const filePath = folder.path === '' ? file.name : path.join(folder.path, file.name).split(path.sep).join('/');
            const updatedFile = {
                ...file,
                path: filePath
            };
            if (!allFiles.some(f => f.path === updatedFile.path)) {
                allFiles.push(updatedFile);
            }
        });

        // 递归收集子文件夹的文件
        folder.folders.forEach(subFolder => {
            // 确保子文件夹路径包含父文件夹路径
            const folderPath = folder.path === '' ? subFolder.name : path.join(folder.path, subFolder.name).split(path.sep).join('/');
            const updatedFolder = {
                ...subFolder,
                path: folderPath,
                files: subFolder.files.map(f => ({
                    ...f,
                    path: path.join(folderPath, f.name).split(path.sep).join('/')
                }))
            };
            this.collectFiles(updatedFolder, allFiles);
        });
    }

    private mergeFolders(target: ProjectFolder, source: ProjectFolder): void {
        // 合并文件，使用规范化的路径进行比较
        source.files.forEach(file => {
            const normalizedPath = path.normalize(file.path);
            if (!target.files.some(f => path.normalize(f.path) === normalizedPath)) {
                target.files.push({
                    ...file,
                    path: normalizedPath
                });
            }
        });

        // 合并子文件夹
        source.folders.forEach(sourceFolder => {
            const normalizedSourcePath = path.normalize(sourceFolder.path);
            let targetFolder = target.folders.find(f => 
                path.normalize(f.path) === normalizedSourcePath
            );

            if (!targetFolder) {
                // 如果目标文件夹不存在，创建一个新的
                targetFolder = {
                    name: sourceFolder.name,
                    path: normalizedSourcePath,
                    files: [],
                    folders: []
                };
                target.folders.push(targetFolder);
            }

            // 递归合并子文件夹
            this.mergeFolders(targetFolder, sourceFolder);
        });

        // 确保所有文件路径都是规范化的
        target.files = target.files.map(file => ({
            ...file,
            path: path.normalize(file.path)
        }));

        // 确保所有文件夹路径都是规范化的
        target.folders = target.folders.map(folder => ({
            ...folder,
            path: path.normalize(folder.path)
        }));
    }

    private async shouldIgnoreFile(filePath: string): Promise<boolean> {
        // 在测试环境中，不忽略任何文件
        if (process.env.NODE_ENV === 'test') {
            return false;
        }

        // 首先检查 .vscode/settings.json 中的自定义忽略规则
        const settingsPath = path.join(this.rootPath, '.vscode', 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(await fs.promises.readFile(settingsPath, 'utf-8'));
            if (settings['repoprompt.ignorePatterns']) {
                const ignorePatterns = new IgnorePatterns(settings['repoprompt.ignorePatterns']);
                if (await ignorePatterns.shouldIgnore(filePath)) {
                    return true;
                }
            }
        }

        // 然后检查全局配置中的忽略规则
        if (this.options.ignorePatterns.length > 0) {
            const ignorePatterns = new IgnorePatterns(this.options.ignorePatterns);
            if (await ignorePatterns.shouldIgnore(filePath)) {
                return true;
            }
        }

        // 最后检查 .gitignore
        const gitignorePath = path.join(this.rootPath, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const gitignore = await fs.promises.readFile(gitignorePath, 'utf-8');
            const gitignorePatterns = new IgnorePatterns(gitignore.split('\n'));
            if (await gitignorePatterns.shouldIgnore(filePath)) {
                return true;
            }
        }

        return false;
    }

    private async processPath(uri: vscode.Uri, stat: vscode.FileStat): Promise<string> {
        const relativePath = uri.fsPath.substring(this.rootPath.length + 1);
        return relativePath || '.';
    }

    private async processDirectory(
        uri: vscode.Uri,
        relativePath: string,
        depth: number = 0
    ): Promise<ProjectFolder | undefined> {
        if (depth >= this.MAX_FOLDER_DEPTH) {
            return {
                name: path.basename(uri.fsPath),
                path: relativePath,
                files: [],
                folders: [],
                truncated: true,
                isSelected: false,
                isExpanded: false
            };
        }

        const folder = await this.folderHandler.processFolder(uri);
        if (!folder) {
            return undefined;
        }

        const cleanFolder: ProjectFolder = {
            name: folder.name,
            path: folder.path,
            files: [],
            folders: [],
            truncated: true,
            isSelected: false,
            isExpanded: false
        };

        // 处理文件
        for (const file of folder.files) {
            cleanFolder.files.push({
                ...file,
                isSelected: false
            });
        }

        // 处理子文件夹
        for (const subFolder of folder.folders) {
            const subFolderUri = vscode.Uri.file(path.join(uri.fsPath, subFolder.name));
            const processedSubFolder = await this.processDirectory(
                subFolderUri,
                path.join(relativePath, subFolder.name),
                depth + 1
            );
            if (processedSubFolder) {
                cleanFolder.folders.push(processedSubFolder);
            }
        }

        return cleanFolder;
    }

    private addFilesToCollection(folder: ProjectFolder, files: ProjectFile[]): void {
        if (!folder || !files) return;
        
        if (folder.files) {
            folder.files.forEach(file => {
                if (file) files.push(file);
            });
        }
        
        if (folder.folders) {
            folder.folders.forEach(subFolder => {
                if (subFolder) this.addFilesToCollection(subFolder, files);
            });
        }
    }

    private async processFile(
        uri: vscode.Uri,
        relativePath: string,
        allFiles: ProjectFile[],
        rootFolders: ProjectFolder[]
    ): Promise<void> {
        try {
            const file = await this.fileHandler.processFile(uri);
            if (file) {
                const normalizedFile = this.createProjectFile(file, relativePath);
                allFiles.push(normalizedFile);
                this.addFileToParentFolder(normalizedFile, rootFolders);
            }
        } catch (error) {
            this.handleProcessingError(error, uri.fsPath);
        }
    }

    private addFileToParentFolder(file: ProjectFile, folders: ProjectFolder[]): void {
        const parentPath = path.dirname(file.path);
        if (parentPath === '.' || parentPath === '') {
            return;
        }

        // 查找或创建父文件夹
        let parentFolder = folders.find(f => f.path === parentPath);
        if (!parentFolder) {
            // 创建完整的文件夹路径
            const pathParts = parentPath.split('/').filter(Boolean);
            let currentPath = '';
            
            for (const part of pathParts) {
                const folderPath = currentPath ? `${currentPath}/${part}` : part;
                let folder = folders.find(f => f.path === folderPath);
                
                if (!folder) {
                    folder = {
                        name: part,
                        path: folderPath,
                        files: [],
                        folders: [],
                        isSelected: false,
                        type: vscode.FileType.Directory,
                        isExpanded: false
                    };
                    folders.push(folder);
                }
                
                currentPath = folderPath;
                parentFolder = folder;
            }
        }

        // 添加文件到父文件夹，确保不重复添加
        if (parentFolder && !parentFolder.files.some(f => f.path === file.path)) {
            const normalizedFile = {
                ...file,
                type: vscode.FileType.File,
                isSelected: false
            };
            parentFolder.files.push(normalizedFile);
        }
    }

    private handleProcessingError(error: unknown, filePath: string): void {
        if (this.isFileNotFoundError(error)) {
            console.warn(`File not found: ${filePath}`);
            return;
        }

        if (error instanceof Error) {
            if (error.message.includes('No files were processed')) {
                console.warn(`No files were processed in ${filePath}, possibly all files were ignored.`);
                return;
            }
            if (error.message.includes('Converting circular structure to JSON')) {
                console.warn(`Circular reference detected while processing ${filePath}, attempting to fix...`);
                return;
            }
            if (error.message.includes('FileSystemError')) {
                console.warn(`File system error while processing ${filePath}, using default values.`);
                return;
            }
            if (error.message.includes('Invalid file path') || 
                error.message.includes('No valid files selected') ||
                error.message.includes('The "path" argument must be of type string')) {
                console.warn(`Invalid file path encountered while processing ${filePath}`);
                this.showError('无法处理选中的文件：文件路径无效。请重新选择文件。');
                return;
            }
            throw error;
        }

        const errorMessage = String(error);
        throw new Error(`Error processing file ${filePath}: ${errorMessage}`);
    }

    private isFileNotFoundError(error: unknown): boolean {
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            return message.includes('enoent') || 
                   message.includes('file not found') ||
                   message.includes('no such file or directory') ||
                   message.includes('filesystemerror') ||
                   message.includes('converting circular structure to json') ||
                   message.includes('invalid file path') ||
                   message.includes('no valid files selected') ||
                   message.includes('the "path" argument must be of type string');
        }
        return false;
    }

    private ensureSerializable(obj: any): any {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        const seen = new WeakSet();
        const replacer = (key: string, value: any) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return undefined; // 移除循环引用
                }
                seen.add(value);
            }
            return value;
        };

        try {
            // 先转换成字符串再解析回对象，确保移除所有循环引用
            return JSON.parse(JSON.stringify(obj, replacer));
        } catch (error) {
            console.warn('Failed to serialize object, returning simplified version');
            // 如果序列化失败，返回一个简化版本
            return {
                files: obj.files?.map((f: any) => ({
                    name: f.name,
                    path: f.path,
                    type: f.type
                })) || [],
                structure: obj.structure?.map((f: any) => ({
                    name: f.name,
                    path: f.path,
                    type: f.type,
                    files: [],
                    folders: []
                })) || [],
                rootPath: obj.rootPath || ''
            };
        }
    }

    private validateUri(input: any): boolean {
        let uri: vscode.Uri | undefined;
        try {
            // 从输入中获取 URI 对象
            uri = input && input.uri && typeof input.uri === 'object' && 'fsPath' in input.uri ? input.uri : input;

            if (!uri || typeof uri !== 'object' || !('fsPath' in uri)) {
                console.warn('validateUri: Input is not a valid URI:', input);
                return false;
            }

            console.log('validateUri: Validating URI:', {
                uri: uri.toString?.() || uri.fsPath,
                fsPath: uri.fsPath,
                path: uri.path,
                scheme: uri.scheme,
                authority: uri.authority,
                query: uri.query,
                fragment: uri.fragment
            });

            // 检查必要的属性
            if (!uri.fsPath || typeof uri.fsPath !== 'string') {
                console.warn('validateUri: fsPath is invalid:', uri.fsPath);
                return false;
            }
            
            if (!uri.path || typeof uri.path !== 'string') {
                console.warn('validateUri: path is invalid:', uri.path);
                return false;
            }

            // 检查路径是否为空或只包含空白字符
            if (!uri.fsPath.trim()) {
                console.warn('validateUri: fsPath is empty or whitespace');
                return false;
            }
            
            if (!uri.path.trim()) {
                console.warn('validateUri: path is empty or whitespace');
                return false;
            }

            // 检查 scheme 是否为 file
            if (uri.scheme !== 'file') {
                console.warn('validateUri: Invalid scheme:', uri.scheme);
                return false;
            }

            // 在 Windows 系统上，路径中的冒号是合法的（如 C:\）
            const isWindows = process.platform === 'win32';
            const invalidChars = isWindows ? 
                /[\0<>"|?*]/ :  // Windows 系统的无效字符
                /[\0<>:"|?*]/;  // Unix 系统的无效字符

            // 对于 Windows 系统，允许路径中的冒号出现在驱动器号位置
            if (isWindows) {
                // 检查是否是有效的 Windows 路径格式
                if (!/^[A-Za-z]:\\/.test(uri.fsPath)) {
                    // 如果不是 Windows 格式，尝试使用标准路径格式
                    if (!path.isAbsolute(uri.fsPath)) {
                        console.warn('validateUri: Invalid Windows path format:', uri.fsPath);
                        return false;
                    }
                }

                // 分离驱动器号和路径
                const pathWithoutDrive = uri.fsPath.substring(3); // 跳过 "C:\"
                
                // 验证路径部分
                if (invalidChars.test(pathWithoutDrive)) {
                    console.warn('validateUri: Windows path contains invalid characters:', pathWithoutDrive);
                    return false;
                }
            } else {
                // Unix 系统路径验证
                if (!path.isAbsolute(uri.fsPath)) {
                    console.warn('validateUri: Not an absolute path on Unix:', uri.fsPath);
                    return false;
                }

                if (invalidChars.test(uri.fsPath)) {
                    console.warn('validateUri: Unix path contains invalid characters:', uri.fsPath);
                    return false;
                }
            }

            // 检查路径长度是否合理
            const maxPathLength = isWindows ? 260 : 4096;
            if (uri.fsPath.length > maxPathLength) {
                console.warn('validateUri: Path exceeds maximum length:', uri.fsPath.length);
                return false;
            }

            // 在测试环境中跳过文件存在检查
            if (process.env.NODE_ENV !== 'test') {
                if (!fs.existsSync(uri.fsPath)) {
                    console.warn('validateUri: File does not exist:', uri.fsPath);
                    return false;
                }
            }

            console.log('validateUri: Path validation successful:', uri.fsPath);
            return true;
        } catch (error) {
            console.warn(`validateUri: Validation failed for path: ${uri?.fsPath || 'undefined'}`, error);
            return false;
        }
    }

    private logInvalidUri(uri: vscode.Uri | undefined): void {
        try {
            if (!uri) {
                console.warn('logInvalidUri: URI is undefined');
                return;
            }

            const details: Record<string, any> = {
                fsPath: uri.fsPath || 'undefined',
                path: uri.path || 'undefined',
                scheme: uri.scheme || 'undefined',
                isAbsolute: uri.fsPath ? path.isAbsolute(uri.fsPath) : false,
                length: uri.fsPath ? uri.fsPath.length : 0,
                hasInvalidChars: uri.fsPath ? /[\0<>:"|?*]/.test(uri.fsPath) : false,
                platform: process.platform,
                exists: uri.fsPath ? fs.existsSync(uri.fsPath) : false
            };

            console.warn('Invalid URI details:', JSON.stringify(details, null, 2));
        } catch (error) {
            console.warn('Failed to log invalid URI details:', {
                error: error instanceof Error ? error.message : String(error),
                uri: uri ? 'URI object exists' : 'URI is undefined'
            });
        }
    }

    private showError(message: string): void {
        // 在测试环境中不显示错误消息
        if (process.env.NODE_ENV !== 'test') {
            vscode.window.showErrorMessage(message);
        }
    }

    private showWarning(message: string): void {
        // 在测试环境中不显示警告消息
        if (process.env.NODE_ENV !== 'test') {
            vscode.window.showWarningMessage(message);
        }
    }

    public async processSelection(items: any[], prompt?: string, progress?: ProcessingProgress): Promise<ProcessingResult> {
        try {
            // 从树节点对象中提取 URI
            const uris = items.map(item => {
                if (item && item.uri && typeof item.uri === 'object' && 'fsPath' in item.uri) {
                    return item.uri;
                } else if (typeof item === 'object' && 'fsPath' in item) {
                    return item;
                }
                console.warn('Invalid item:', item);
                return null;
            }).filter(Boolean) as vscode.Uri[];

            // 验证输入的 URIs
            if (!uris || uris.length === 0) {
                this.showError('请选择要处理的文件或文件夹。');
                throw new Error('No files selected');
            }

            // 确保所有的 URI 都是有效的 vscode.Uri 实例
            const validUris = uris.filter(uri => {
                if (!uri || typeof uri !== 'object' || !('fsPath' in uri)) {
                    console.warn('Invalid URI object:', uri);
                    return false;
                }
                const isValid = this.validateUri(uri);
                if (!isValid) {
                    this.logInvalidUri(uri);
                }
                return isValid;
            });

            if (validUris.length === 0) {
                this.showError('选择的文件路径无效。请重新选择有效的文件或文件夹。');
                throw new Error('No valid files selected');
            }

            // 如果有些 URI 无效，显示警告
            if (validUris.length < uris.length) {
                this.showWarning(`已跳过 ${uris.length - validUris.length} 个无效的文件路径。`);
            }

            // 计算根路径
            this.rootPath = await this.calculateCommonRootPath(validUris);
            this.fileHandler.setRootPath(this.rootPath);
            this.folderHandler.setRootPath(this.rootPath);

            const allFiles: ProjectFile[] = [];
            const rootFolders: Map<string, ProjectFolder> = new Map();
            const processedPaths = new Set<string>();

            // 先处理文件夹
            let processedCount = 0;
            const totalCount = validUris.length;
            
            for (const uri of validUris) {
                try {
                    const stat = await this.fileHandler.getFileStat(uri);
                    if (!stat) continue;

                    if (stat.type === vscode.FileType.Directory) {
                        const relativePath = path.relative(this.rootPath, uri.fsPath);
                        const processedFolder = await this.processDirectory(
                            uri,
                            relativePath === '' ? '.' : relativePath
                        );

                        if (processedFolder) {
                            const cleanFolder = this.createCleanFolder(processedFolder);
                            // 使用规范化的路径作为键
                            const folderKey = cleanFolder.path.split(path.sep).join('/');
                            rootFolders.set(folderKey, cleanFolder);
                            this.collectAllFiles(cleanFolder, allFiles);
                        }
                    }
                    
                    processedCount++;
                    if (progress) {
                        const percent = Math.round((processedCount / totalCount) * 100);
                        progress.report({ 
                            message: `正在处理: ${path.basename(uri.fsPath)}`,
                            increment: percent / totalCount
                        });
                    }
                } catch (error) {
                    console.warn(`跳过处理文件夹 ${uri.fsPath}:`, error);
                    continue;
                }
            }

            // 再处理单独的文件
            for (const uri of validUris) {
                try {
                    const stat = await this.fileHandler.getFileStat(uri);
                    if (!stat || stat.type !== vscode.FileType.File) continue;

                    const file = await this.fileHandler.processFile(uri);
                    if (file) {
                        const relativePath = path.relative(this.rootPath, uri.fsPath);
                        const normalizedFile: ProjectFile = {
                            name: file.name,
                            path: relativePath,
                            content: file.content,
                            size: file.size,
                            summary: file.summary,
                            isSelected: false,
                            type: vscode.FileType.File
                        };
                        
                        if (!allFiles.some(f => f.path === normalizedFile.path)) {
                            allFiles.push(normalizedFile);
                            const parentPath = path.dirname(relativePath);
                            if (parentPath !== '.' && parentPath !== '') {
                                // 只有当文件不在根目录时，才添加到父文件夹
                                this.addFileToParentFolder(normalizedFile, Array.from(rootFolders.values()));
                            }
                        }
                    }
                    
                    processedCount++;
                    if (progress) {
                        const percent = Math.round((processedCount / totalCount) * 100);
                        progress.report({ 
                            message: `正在处理: ${path.basename(uri.fsPath)}`,
                            increment: percent / totalCount
                        });
                    }
                } catch (error) {
                    console.warn(`跳过处理文件 ${uri.fsPath}:`, error);
                    continue;
                }
            }

            if (allFiles.length === 0) {
                if (this.options.includeEmptyFolders && rootFolders.size > 0) {
                    // 如果允许包含空文件夹，且有文件夹被处理，则继续
                    console.warn('No files were processed, but empty folders are included.');
                } else {
                    this.showError('没有找到可处理的文件。请检查文件是否被忽略或是否有访问权限。');
                    throw new Error('No files were processed. Check if all files were ignored.');
                }
            }

            const result: ProcessingResult = {
                files: this.removeDuplicateFiles(allFiles),
                structure: this.cleanFolderStructure(Array.from(rootFolders.values())),
                rootPath: this.rootPath,
                prompt: prompt
            };

            // 确保结果可以序列化
            const serializedResult = this.ensureSerializable(result);
            this.validateProcessingResult(serializedResult);
            return serializedResult;

        } catch (error) {
            this.handleProcessingError(error, '');
            throw error;
        } finally {
            this.processedPaths.clear();
            this.fileHandler.dispose();
            this.folderHandler.dispose();
        }
    }

    private cleanFolderStructure(folders: ProjectFolder[], processedPaths: Set<string> = new Set()): ProjectFolder[] {
        return folders.map(folder => {
            // 如果已经处理过这个路径，返回一个没有子文件夹的副本
            if (processedPaths.has(folder.path)) {
                return {
                    name: folder.name,
                    path: folder.path,
                    files: folder.files.map(file => ({
                        ...file,
                        type: vscode.FileType.File,
                        isSelected: false
                    })),
                    folders: [],
                    truncated: true,
                    type: vscode.FileType.Directory,
                    isSelected: false
                };
            }

            // 标记当前路径为已处理
            processedPaths.add(folder.path);

            // 递归处理子文件夹
            const cleanedFolders = this.cleanFolderStructure(
                folder.folders,
                new Set(processedPaths)
            );

            return {
                name: folder.name,
                path: folder.path,
                files: folder.files.map(file => ({
                    ...file,
                    type: vscode.FileType.File,
                    isSelected: false
                })),
                folders: cleanedFolders,
                truncated: folder.truncated,
                type: vscode.FileType.Directory,
                isSelected: false
            };
        });
    }

    private shouldAddRootFolder(rootFolder: ProjectFolder, result: ProcessingResult): boolean {
        // 如果根文件夹有文件，应该添加
        if (rootFolder.files.length > 0) {
            return true;
        }

        // 如果配置允许包含空文件夹
        if (this.options.includeEmptyFolders) {
            // 如果没有其他文件夹，或者根文件夹有子文件夹，也应该添加
            return result.structure.length === 0 || rootFolder.folders.length > 0;
        }

        // 如果根文件夹有内容（包括子文件夹中的文件），也应该添加
        return this.hasFolderContent(rootFolder);
    }

    private hasFolderContent(folder: ProjectFolder): boolean {
        // 检查当前文件夹是否有文件
        if (folder.files.length > 0) {
            return true;
        }

        // 递归检查子文件夹
        for (const subFolder of folder.folders) {
            if (this.hasFolderContent(subFolder)) {
                return true;
            }
        }

        return false;
    }

    private createProjectFile(file: ProjectFile, relativePath: string): ProjectFile {
        // 确保路径使用正斜杠，并正确处理文件路径
        const normalizedPath = path.join(
            path.dirname(relativePath),
            file.name
        ).split(path.sep).join('/');

        return {
            name: file.name,
            path: normalizedPath,
            content: file.content,
            size: file.size,
            summary: file.summary,
            isSelected: false,
            type: vscode.FileType.File
        };
    }

    private normalizeRelativePath(filePath: string, rootPath: string): string {
        // 确保路径使用正斜杠
        return filePath.split(path.sep).join('/');
    }

    private removeDuplicateFiles(files: ProjectFile[]): ProjectFile[] {
        const seen = new Set<string>();
        return files.filter(file => {
            const key = file.path;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    private collectAllFiles(folder: ProjectFolder, allFiles: ProjectFile[]): void {
        // 收集当前文件夹的文件
        folder.files.forEach(file => {
            if (!allFiles.some(f => f.path === file.path)) {
                allFiles.push(file);
            }
        });

        // 递归收集子文件夹的文件
        folder.folders.forEach(subFolder => {
            this.collectAllFiles(subFolder, allFiles);
        });
    }

    private async processRootDirectory(
        uri: vscode.Uri,
        resultBuilder: ProcessingResultBuilder,
        rootFolder: ProjectFolder
    ): Promise<void> {
        const processedFolder = await this.folderHandler.processFolder(uri);
        if (!processedFolder) return;

        // 更新根文件夹的属性
        rootFolder.files = processedFolder.files;
        rootFolder.folders = processedFolder.folders;

        resultBuilder.addToStructure(rootFolder);
        
        // 创建临时数组来收集文件
        const allFiles: ProjectFile[] = [];
        this.collectAllFiles(rootFolder, allFiles);
        
        // 将收集到的文件添加到结果中
        allFiles.forEach(file => resultBuilder.addFile(file));
    }

    private validateProcessingResult(result: ProcessingResult): void {
        if (!result.files || result.files.length === 0) {
            if (!this.options.includeEmptyFolders || !result.structure || result.structure.length === 0) {
                throw new Error('No files were processed. Check if all files were ignored.');
            }
        }

        const seenPaths = new Set<string>();
        for (const file of result.files) {
            if (!file.path) {
                throw new Error('Invalid file path: path is empty');
            }
            if (seenPaths.has(file.path)) {
                console.warn(`Duplicate file path found: ${file.path}`);
            }
            seenPaths.add(file.path);
        }

        const validateFolder = (folder: ProjectFolder, parentPath: string = ''): void => {
            if (!folder.path && folder.path !== '') {
                throw new Error('Invalid folder path: path is undefined');
            }

            // 特殊处理根目录的情况
            const expectedPath = parentPath ? path.join(parentPath, folder.name) : folder.name;
            if (folder.path !== expectedPath && folder.path !== '' && folder.path !== '.') {
                console.warn(`Folder path mismatch: expected ${expectedPath}, got ${folder.path}`);
            }

            folder.files.forEach(file => {
                // 处理根目录的情况
                const expectedFilePath = folder.path === '.' ? 
                    file.name : 
                    path.join(folder.path, file.name).split(path.sep).join('/');

                if (file.path !== expectedFilePath) {
                    console.warn(`File path mismatch in folder ${folder.path}: expected ${expectedFilePath}, got ${file.path}`);
                }
                // 确保文件类型正确
                if (!file.type) {
                    file.type = vscode.FileType.File;
                }
            });

            folder.folders.forEach(subFolder => {
                // 确保文件夹类型正确
                if (!subFolder.type) {
                    subFolder.type = vscode.FileType.Directory;
                }
                validateFolder(subFolder, folder.path === '.' ? '' : folder.path);
            });
        };

        result.structure.forEach(folder => validateFolder(folder));
    }

    private createProjectFolder(
        name: string,
        relativePath: string,
        files: ProjectFile[] = [],
        folders: ProjectFolder[] = [],
        depth: number = 0,
        processedPaths: Set<string> = new Set()
    ): ProjectFolder {
        // 确保路径使用正斜杠
        const normalizedPath = relativePath.split(path.sep).join('/');

        // 检测循环引用
        if (processedPaths.has(normalizedPath)) {
            return {
                name,
                path: normalizedPath,
                files: [],
                folders: [],
                type: vscode.FileType.Directory,
                isSelected: false,
                isExpanded: false
            };
        }

        // 将当前路径添加到已处理路径集合
        const newProcessedPaths = new Set(processedPaths);
        newProcessedPaths.add(normalizedPath);

        // 如果超过最大深度，返回没有子文件夹的文件夹，但保留文件
        if (depth >= this.MAX_FOLDER_DEPTH) {
            return {
                name,
                path: normalizedPath,
                files: [...files].map(file => ({
                    ...file,
                    path: path.join(normalizedPath, file.name).split(path.sep).join('/'),
                    type: vscode.FileType.File,
                    isSelected: false
                })),
                folders: [],
                type: vscode.FileType.Directory,
                isSelected: false,
                isExpanded: false
            };
        }

        // 处理子文件夹，确保路径正确
        const processedFolders = folders
            .filter(f => !newProcessedPaths.has(path.join(normalizedPath, f.name)))
            .map(f => this.createProjectFolder(
                f.name,
                path.join(normalizedPath, f.name),
                f.files,
                f.folders,
                depth + 1,
                newProcessedPaths
            ));

        // 处理当前文件夹的文件，确保路径正确
        const processedFiles = files.map(file => ({
            ...file,
            path: path.join(normalizedPath, file.name).split(path.sep).join('/'),
            type: vscode.FileType.File,
            isSelected: false
        }));

        return {
            name,
            path: normalizedPath,
            files: processedFiles,
            folders: processedFolders,
            type: vscode.FileType.Directory,
            isSelected: false,
            isExpanded: false
        };
    }

    private collectFilesFromFolderStructure(folder: ProjectFolder): ProjectFile[] {
        const files: ProjectFile[] = [...folder.files];
        folder.folders.forEach(subFolder => {
            files.push(...this.collectFilesFromFolderStructure(subFolder));
        });
        return files;
    }

    private createCleanFolder(folder: ProjectFolder): ProjectFolder {
        return {
            name: folder.name,
            path: folder.path,
            files: folder.files.map(file => ({
                ...file,
                type: vscode.FileType.File,
                isSelected: false
            })),
            folders: folder.folders.map(subFolder => this.createCleanFolder(subFolder)),
            isSelected: false,
            isExpanded: false,
            truncated: folder.truncated,
            type: vscode.FileType.Directory
        };
    }
}




