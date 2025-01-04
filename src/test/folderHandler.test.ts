import * as vscode from 'vscode';
import { FolderHandler } from '../folderHandler';
import { IFileHandler } from '../fileHandler';
import { ProcessingOptions } from '../types';
import * as path from 'path';

describe('FolderHandler', () => {
    let mockFileHandler: jest.Mocked<IFileHandler>;
    let mockFileSystem: jest.Mocked<typeof vscode.workspace.fs>;
    let folderHandler: FolderHandler;
    let options: ProcessingOptions;

    beforeEach(() => {
        options = {
            ignorePatterns: ['**/node_modules/**'],
            maxFileSize: 1024 * 1024,
            rootTag: 'project',
            includeComments: true,
            chunkSize: 1024 * 1024,
            includeEmptyFolders: false
        };

        mockFileSystem = {
            readFile: jest.fn().mockResolvedValue(new Uint8Array(Buffer.from('test content'))),
            writeFile: jest.fn(),
            readDirectory: jest.fn(),
            stat: jest.fn(),
            createDirectory: jest.fn(),
            delete: jest.fn(),
            rename: jest.fn(),
            copy: jest.fn()
        } as any;

        mockFileHandler = {
            processFile: jest.fn(),
            setRootPath: jest.fn(),
            shouldIgnore: jest.fn().mockResolvedValue(false),
            dispose: jest.fn(),
            getFileStat: jest.fn(),
            readFile: jest.fn(),
            readDirectory: jest.fn()
        } as jest.Mocked<IFileHandler>;

        folderHandler = new FolderHandler(options, mockFileHandler, mockFileSystem);
        folderHandler.setRootPath('/test');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should handle file system errors gracefully', async () => {
        // 设置测试数据
        const uri = vscode.Uri.file('/test');
        mockFileSystem.readDirectory.mockRejectedValue(new Error('File system error'));

        // 执行测试
        const result = await folderHandler.processFolder(uri);

        // 验证结果
        expect(result).toBeDefined();
        expect(result?.truncated).toBe(true);
        expect(result?.files).toEqual([]);
        expect(result?.folders).toEqual([]);
    });

    it('should process empty folder correctly', async () => {
        // 设置测试数据
        const uri = vscode.Uri.file('/test');
        mockFileSystem.readDirectory.mockResolvedValue([]);

        // 执行测试
        const result = await folderHandler.processFolder(uri);

        // 验证结果
        expect(result).toBeDefined();
        expect(result?.files).toEqual([]);
        expect(result?.folders).toEqual([]);
    });

    it('should handle files in folder', async () => {
        // 设置测试数据
        const uri = vscode.Uri.file('/test');
        mockFileSystem.readDirectory.mockResolvedValue([
            ['file1.txt', vscode.FileType.File],
            ['file2.txt', vscode.FileType.File]
        ]);

        mockFileHandler.processFile.mockResolvedValue({
            name: 'test.txt',
            path: 'test.txt',
            content: 'test content',
            size: 100
        });

        // 执行测试
        const result = await folderHandler.processFolder(uri);

        // 验证结果
        expect(result).toBeDefined();
        expect(result?.files.length).toBe(2);
        expect(mockFileHandler.processFile).toHaveBeenCalledTimes(2);
    });

    it('should handle nested folders', async () => {
        // 设置测试数据
        const uri = vscode.Uri.file('/test');
        mockFileSystem.readDirectory.mockResolvedValue([
            ['subfolder', vscode.FileType.Directory],
            ['file1.txt', vscode.FileType.File]
        ]);

        mockFileHandler.processFile.mockResolvedValue({
            name: 'test.txt',
            path: 'test.txt',
            content: 'test content',
            size: 100
        });

        // 执行测试
        const result = await folderHandler.processFolder(uri);

        // 验证结果
        expect(result).toBeDefined();
        expect(result?.files.length).toBe(1);
        expect(result?.folders.length).toBe(1);
    });

    it('should handle symlinks correctly', async () => {
        // 设置测试数据
        const uri = vscode.Uri.file('/test');
        mockFileSystem.stat.mockResolvedValue({ type: vscode.FileType.SymbolicLink } as vscode.FileStat);

        // 执行测试
        const result = await folderHandler.processFolder(uri);

        // 验证结果
        expect(result).toBeDefined();
        expect(result?.truncated).toBe(true);
    });

    test('should handle ignored paths', async () => {
        // 准备测试数据
        const uri = vscode.Uri.file('/test/node_modules');
        mockFileSystem.readDirectory.mockResolvedValue([]);
        mockFileSystem.stat.mockResolvedValue({ type: vscode.FileType.Directory } as vscode.FileStat);
        mockFileHandler.shouldIgnore.mockResolvedValue(true);
        
        // 处理文件夹
        const result = await folderHandler.processFolder(uri);
        
        // 验证结果
        expect(result).toBeUndefined();
    });
});
