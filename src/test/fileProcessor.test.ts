import * as vscode from 'vscode';
import { FileProcessor, ProcessingResultBuilder } from '../fileProcessor';
import { ProcessingOptions, ProjectFile, ProjectFolder } from '../types';
import path from 'path';
import { IFileHandler } from '../fileHandler';
import { IFolderHandler } from '../folderHandler';

// Mock vscode.workspace.fs
const mockStat = jest.fn();
const mockReadFile = jest.fn();
const mockReadDirectory = jest.fn();

jest.mock('vscode', () => ({
    workspace: {
        fs: {
            stat: (...args: any[]) => mockStat(...args),
            readFile: (...args: any[]) => mockReadFile(...args),
            readDirectory: (...args: any[]) => mockReadDirectory(...args)
        }
    },
    FileType: {
        File: 1,
        Directory: 2,
        SymbolicLink: 64
    },
    Uri: {
        file: (path: string) => ({ 
            fsPath: path,
            path: path,
            scheme: 'file',
            authority: '',
            query: '',
            fragment: '',
            with: function(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }) {
                return {
                    ...this,
                    ...change
                };
            },
            toJSON: function() {
                return {
                    $mid: 1,
                    fsPath: this.fsPath,
                    path: this.path,
                    scheme: this.scheme
                };
            }
        })
    }
}));

// 基础测试工具函数
const createMockFile = (name: string, relativePath: string, content = 'test content'): ProjectFile => ({
    name,
    path: relativePath,
    content
});

const createMockFolder = (name: string, relativePath: string, files: ProjectFile[] = [], folders: ProjectFolder[] = []): ProjectFolder => ({
    name,
    path: relativePath,
    files,
    folders
});

describe('ProcessingResultBuilder', () => {
    let builder: ProcessingResultBuilder;

    beforeEach(() => {
        builder = new ProcessingResultBuilder('/test/path', 'test prompt');
    });

    afterEach(() => {
        // Clean up resources by creating a new empty instance
        builder = new ProcessingResultBuilder('', '');
    });

    it('should initialize with correct values', () => {
        const result = builder.build();
        expect(result.rootPath).toBe('/test/path');
        expect(result.prompt).toBe('test prompt');
        expect(result.files).toEqual([]);
        expect(result.structure).toEqual([]);
        expect(result.xmlContent).toBeDefined();
    });

    it('should add file correctly', () => {
        const testFile = createMockFile('test.txt', 'test.txt');
        builder.addFile(testFile);
        expect(builder.build().files).toContainEqual(testFile);
    });

    it('should add folder to structure correctly', () => {
        const testFolder = createMockFolder('test', 'test');
        builder.addToStructure(testFolder);
        expect(builder.build().structure).toContainEqual(testFolder);
    });

    it('should set XML content correctly', () => {
        const xml = '<test>content</test>';
        builder.setXmlContent(xml);
        expect(builder.build().xmlContent).toBe(xml);
    });
});

describe('FileProcessor', () => {
    let mockFileHandler: jest.Mocked<IFileHandler>;
    let mockFolderHandler: jest.Mocked<IFolderHandler>;
    let fileProcessor: FileProcessor;
    const options: ProcessingOptions = {
        maxFileSize: 1024 * 1024,
        rootTag: 'project',
        includeComments: true,
        ignorePatterns: [],
        chunkSize: 1024 * 1024,
        includeEmptyFolders: false
    };

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        mockStat.mockReset();
        mockReadFile.mockReset();
        mockReadDirectory.mockReset();

        mockFileHandler = {
            processFile: jest.fn(),
            setRootPath: jest.fn(),
            shouldIgnore: jest.fn(),
            dispose: jest.fn(),
            getFileStat: jest.fn(),
            readFile: jest.fn(),
            readDirectory: jest.fn()
        } as jest.Mocked<IFileHandler>;

        mockFolderHandler = {
            processFolder: jest.fn(),
            setRootPath: jest.fn(),
            dispose: jest.fn()
        } as jest.Mocked<IFolderHandler>;

        fileProcessor = new FileProcessor(options, mockFileHandler, mockFolderHandler);
    });

    afterEach(() => {
        // Clean up resources
        if (mockFileHandler.dispose) {
            mockFileHandler.dispose();
        }
        if (mockFolderHandler.dispose) {
            mockFolderHandler.dispose();
        }
        jest.resetAllMocks();
    });

    describe('Basic File Operations', () => {
        it('should process single file correctly', async () => {
            const fileUri = vscode.Uri.file('/root/test.txt');
            const mockFile = createMockFile('test.txt', 'test.txt');

            mockStat.mockResolvedValue({ type: vscode.FileType.File });
            mockFileHandler.getFileStat.mockResolvedValue({ type: vscode.FileType.File } as vscode.FileStat);
            mockFileHandler.processFile.mockResolvedValue(mockFile);
            mockFileHandler.shouldIgnore.mockResolvedValue(false);

            const result = await fileProcessor.processSelection([fileUri]);
            expect(result.files.length).toBe(1);
            expect(result.files[0].path).toBe('test.txt');
        });

        it('should process folder correctly', async () => {
            const folderUri = vscode.Uri.file('/root/folder');
            const mockFile = createMockFile('test.txt', 'folder/test.txt');
            const mockFolder = createMockFolder('folder', 'folder', [mockFile], []);

            mockStat.mockResolvedValue({ type: vscode.FileType.Directory });
            mockFileHandler.getFileStat.mockResolvedValue({ type: vscode.FileType.Directory } as vscode.FileStat);
            mockFolderHandler.processFolder.mockImplementation((uri: vscode.Uri) => {
                return Promise.resolve({
                    name: 'folder',
                    path: 'folder',
                    files: [{
                        name: 'test.txt',
                        path: 'folder/test.txt',
                        content: 'test content'
                    }],
                    folders: []
                });
            });

            mockFileHandler.shouldIgnore.mockImplementation((path: string) => {
                return Promise.resolve(false);
            });

            mockFileHandler.processFile.mockImplementation((uri: vscode.Uri) => {
                return Promise.resolve({
                    name: 'test.txt',
                    path: 'folder/test.txt',
                    content: 'test content'
                });
            });

            const result = await fileProcessor.processSelection([folderUri]);
            expect(result.files.length).toBe(1);
            expect(result.files[0].path).toBe('folder/test.txt');
            expect(result.structure.length).toBe(1);
            expect(result.structure[0].name).toBe('folder');
        });
    });

    describe('Error Handling', () => {
        it('should handle file not found error gracefully', async () => {
            const fileUri = vscode.Uri.file('/root/test.txt');
            
            mockStat.mockResolvedValue({ type: vscode.FileType.File });
            mockFileHandler.getFileStat.mockResolvedValue({ type: vscode.FileType.File } as vscode.FileStat);
            mockFileHandler.processFile.mockResolvedValue(undefined);

            await expect(fileProcessor.processSelection([fileUri])).rejects.toThrow('No files were processed');
        });

        it('should handle file system errors gracefully', async () => {
            const fileUri = vscode.Uri.file('/root/error.txt');
            
            mockStat.mockRejectedValue(new Error('File system error'));
            mockFileHandler.getFileStat.mockRejectedValue(new Error('File system error'));

            await expect(fileProcessor.processSelection([fileUri])).rejects.toThrow();
        });
    });

    describe('Path Processing', () => {
        it('should calculate common root path correctly', async () => {
            const file1Uri = vscode.Uri.file('/root/folder1/test1.txt');
            const file2Uri = vscode.Uri.file('/root/folder1/test2.txt');
            
            mockStat.mockResolvedValue({ type: vscode.FileType.File });
            mockFileHandler.getFileStat.mockResolvedValue({ type: vscode.FileType.File } as vscode.FileStat);
            mockFileHandler.processFile.mockImplementation((uri) => {
                const name = path.basename(uri.fsPath);
                return Promise.resolve(createMockFile(name, `folder1/${name}`));
            });

            const result = await fileProcessor.processSelection([file1Uri, file2Uri]);
            expect(result.rootPath).toBe('/root/folder1');
            expect(result.files.length).toBe(2);
        });
    });

    describe('Folder Structure', () => {
        it('should handle nested folders correctly', async () => {
            const rootUri = vscode.Uri.file('/root/src');
            const mockFile = createMockFile('test.txt', 'src/sub/test.txt');
            const mockSubFolder = createMockFolder('sub', 'src/sub', [mockFile], []);
            const mockRootFolder = createMockFolder('src', 'src', [], [mockSubFolder]);

            mockStat.mockResolvedValue({ type: vscode.FileType.Directory });
            mockFileHandler.getFileStat.mockResolvedValue({ type: vscode.FileType.Directory } as vscode.FileStat);
            
            // 修改 mock 实现，确保只返回一次预定义的文件夹结构
            let folderCallCount = 0;
            mockFolderHandler.processFolder.mockImplementation((uri: vscode.Uri) => {
                folderCallCount++;
                if (folderCallCount === 1) {
                    return Promise.resolve({
                        name: 'src',
                        path: 'src',
                        files: [],
                        folders: [{
                            name: 'sub',
                            path: 'src/sub',
                            files: [{
                                name: 'test.txt',
                                path: 'src/sub/test.txt',
                                content: 'test content'
                            }],
                            folders: []
                        }]
                    });
                }
                return Promise.resolve({
                    name: 'sub',
                    path: 'src/sub',
                    files: [{
                        name: 'test.txt',
                        path: 'src/sub/test.txt',
                        content: 'test content'
                    }],
                    folders: []
                });
            });

            mockFileHandler.shouldIgnore.mockImplementation((path: string) => {
                return Promise.resolve(false);
            });

            mockFileHandler.processFile.mockImplementation((uri: vscode.Uri) => {
                return Promise.resolve({
                    name: 'test.txt',
                    path: 'src/sub/test.txt',
                    content: 'test content'
                });
            });

            const result = await fileProcessor.processSelection([rootUri]);
            expect(result.structure.length).toBe(1);
            expect(result.structure[0].folders.length).toBe(1);
            expect(result.files.length).toBe(1);
            expect(result.files[0].path).toBe('src/sub/test.txt');
            expect(mockFolderHandler.processFolder).toHaveBeenCalledTimes(2); // 只应该调用两次：一次是根文件夹，一次是子文件夹
        });
    });

    describe('URI Validation', () => {
        it('should handle valid file paths', async () => {
            const validPaths = [
                '/test/file.txt',
                '/test/folder/file.txt',
                '/test/folder with spaces/file.txt'
            ];

            for (const validPath of validPaths) {
                const uri = vscode.Uri.file(validPath);
                const result = await fileProcessor['validateUri'](uri);
                expect(result).toBe(true);
            }
        });

        it('should reject invalid file paths', async () => {
            const invalidPaths = [
                '',
                ' ',
                '/test/file*.txt',
                '/test/file?.txt',
                '/test/file<>.txt'
            ];

            for (const invalidPath of invalidPaths) {
                const uri = vscode.Uri.file(invalidPath);
                const result = await fileProcessor['validateUri'](uri);
                expect(result).toBe(false);
            }
        });

        it('should handle Windows-style paths correctly', async () => {
            // 模拟 Windows 环境
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                configurable: true
            });

            // 模拟 path.isAbsolute 方法
            const originalIsAbsolute = path.isAbsolute;
            path.isAbsolute = (pathString: string) => {
                // Windows 路径以盘符开头（如 C:\）被认为是绝对路径
                return /^[A-Za-z]:\\/.test(pathString);
            };

            try {
                const validWindowsPaths = [
                    'C:\\test\\file.txt',
                    'D:\\folder\\file.txt',
                    'C:\\Program Files\\test.txt'
                ];

                for (const validPath of validWindowsPaths) {
                    const uri = vscode.Uri.file(validPath);
                    const result = await fileProcessor['validateUri'](uri);
                    expect(result).toBe(true);
                }

                const invalidWindowsPaths = [
                    'test\\file.txt', // 相对路径
                    '\\test\\file.txt', // 没有驱动器号
                    'CC:\\test\\file.txt', // 无效的驱动器号
                    'C:\\test\\file*.txt', // 包含通配符
                    'C:\\test\\file|.txt' // 包含无效字符
                ];

                for (const invalidPath of invalidWindowsPaths) {
                    const uri = vscode.Uri.file(invalidPath);
                    const result = await fileProcessor['validateUri'](uri);
                    expect(result).toBe(false);
                }
            } finally {
                // 恢复原始环境
                Object.defineProperty(process, 'platform', {
                    value: originalPlatform,
                    configurable: true
                });
                path.isAbsolute = originalIsAbsolute;
            }
        });
    });

    it('should process selection with prompt', async () => {
        const mockUri = { 
            fsPath: '/test/file.txt',
            path: '/test/file.txt', 
            scheme: 'file',
            authority: '',
            query: '',
            fragment: ''
        } as vscode.Uri;
        const testPrompt = '请分析这段代码';
        
        // 设置 mock 返回值
        mockFileHandler.getFileStat.mockResolvedValue({
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: 100
        });
        mockFileHandler.processFile.mockResolvedValue({
            name: 'file.txt',
            path: 'file.txt',
            content: 'test content'
        });

        const processor = new FileProcessor(
            {
                maxFileSize: 1024 * 1024,
                maxTotalSize: 10 * 1024 * 1024,
                maxDepth: 10,
                ignorePatterns: [],
                rootTag: 'project',
                includeComments: true,
                chunkSize: 1024 * 1024,
                keepEmptyFolders: false,
                includeEmptyFolders: false
            },
            mockFileHandler,
            mockFolderHandler
        );

        const result = await processor.processSelection([mockUri], testPrompt);

        expect(result.prompt).toBe(testPrompt);
        expect(result.files.length).toBe(1);
        expect(result.files[0].path).toBe('file.txt');
    });
});
