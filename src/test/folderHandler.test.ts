import * as vscode from 'vscode';
import { FolderHandler } from '../folderHandler';
import { IFileHandler } from '../fileHandler';
import { ProcessingOptions, ProjectFolder } from '../types';

describe('FolderHandler', () => {
    let mockFileHandler: jest.Mocked<IFileHandler>;
    let folderHandler: FolderHandler;
    let mockFileSystem: jest.Mocked<typeof vscode.workspace.fs>;
    const options: ProcessingOptions = { 
        maxFileSize: 1048576, 
        rootTag: 'project', 
        includeComments: true, 
        ignorePatterns: [],
        chunkSize: 1048576,
        includeEmptyFolders: true
    };

    beforeEach(() => {
        mockFileHandler = {
            processFile: jest.fn(),
            setRootPath: jest.fn(),
            shouldIgnore: jest.fn(),
            dispose: jest.fn(),
            getFileStat: jest.fn(),
            readFile: jest.fn(),
            readDirectory: jest.fn()
        } as jest.Mocked<IFileHandler>;

        mockFileSystem = {
            readDirectory: jest.fn(),
            stat: jest.fn()
        } as unknown as jest.Mocked<typeof vscode.workspace.fs>;

        folderHandler = new FolderHandler(options, mockFileHandler, mockFileSystem);
        folderHandler.setRootPath('/root');
    });

    it('should process empty folder correctly', async () => {
        const uri = vscode.Uri.file('/test');
        mockFileSystem.readDirectory.mockResolvedValue([]);
        mockFileHandler.readDirectory.mockResolvedValue([]);
        
        const result = await folderHandler.processFolder(uri);
        expect(result).toBeDefined();
        if (!result) return;
        
        expect(result.name).toBe('test');
        expect(result.files.length).toBe(0);
        expect(result.folders.length).toBe(0);
    });

    it('should handle files in folder', async () => {
        mockFileSystem.readDirectory.mockResolvedValue([
            ['file.txt', vscode.FileType.File]
        ]);
        mockFileSystem.stat.mockResolvedValue({
            type: vscode.FileType.File
        } as vscode.FileStat);
        mockFileHandler.processFile.mockResolvedValue({
            name: 'file.txt',
            path: 'test/file.txt',
            content: 'test content'
        });

        const result = await folderHandler.processFolder(vscode.Uri.file('/test'));
        expect(result).toBeDefined();
        if (!result) return;
        
        expect(result.name).toBe('test');
        expect(result.files.length).toBe(1);
        expect(result.files[0].name).toBe('file.txt');
    });

    it('should handle nested folders', async () => {
        mockFileSystem.readDirectory
            .mockResolvedValueOnce([
                ['subfolder', vscode.FileType.Directory]
            ])
            .mockResolvedValueOnce([
                ['test.txt', vscode.FileType.File]
            ]);
        mockFileSystem.stat.mockResolvedValue({
            type: vscode.FileType.Directory
        } as vscode.FileStat);
        mockFileHandler.processFile.mockResolvedValue({
            name: 'test.txt',
            path: 'test/subfolder/test.txt',
            content: 'test content'
        });

        const result = await folderHandler.processFolder(vscode.Uri.file('/test'));
        expect(result).toBeDefined();
        if (!result) return;
        
        expect(result.name).toBe('test');
        expect(result.folders.length).toBe(1);
        expect(result.folders[0].name).toBe('subfolder');
    });

    it('should handle symlinks correctly', async () => {
        const uri = vscode.Uri.file('/test');
        mockFileSystem.readDirectory.mockResolvedValue([
            ['file.txt', vscode.FileType.SymbolicLink | vscode.FileType.File]
        ]);
        mockFileHandler.readDirectory.mockResolvedValue([
            ['file.txt', vscode.FileType.SymbolicLink | vscode.FileType.File]
        ]);
        mockFileHandler.processFile.mockResolvedValue({
            name: 'file.txt',
            path: 'test/file.txt',
            content: 'test content'
        });

        const result = await folderHandler.processFolder(uri);
        expect(result).toBeDefined();
        if (!result) return;
        
        expect(result.name).toBe('test');
        expect(result.files.length).toBe(1);
        expect(result.files[0].name).toBe('file.txt');
    });

    it('should handle ignored paths', async () => {
        const uri = vscode.Uri.file('/test');
        mockFileHandler.shouldIgnore.mockResolvedValue(true);
        
        const result = await folderHandler.processFolder(uri);
        expect(result).toBeDefined();
        if (!result) return;
        
        expect(result.name).toBe('test');
        expect(result.files.length).toBe(0);
        expect(result.folders.length).toBe(0);
    });

    it('should handle file system errors', async () => {
        const uri = vscode.Uri.file('/test');
        mockFileSystem.readDirectory.mockRejectedValue(new Error('File system error'));
        
        const result = await folderHandler.processFolder(uri);
        expect(result).toBeDefined();
        if (!result) return;
        
        expect(result.name).toBe('test');
        expect(result.truncated).toBe(true);
    });
});
