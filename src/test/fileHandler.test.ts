import * as vscode from 'vscode';
import { FileHandler } from '../fileHandler';
import { IgnorePatterns } from '../utils/ignoreUtils';
import { ProcessingOptions } from '../types';

describe('FileHandler', () => {
    let fileHandler: FileHandler;
    const options: ProcessingOptions = {
        maxFileSize: 1048576,
        rootTag: 'project',
        includeComments: true,
        ignorePatterns: [],
        chunkSize: 1048576,
        includeEmptyFolders: false
    };

    beforeEach(() => {
        fileHandler = new FileHandler(options);
        jest.clearAllMocks();
    });

    it('should read file content correctly', async () => {
        jest.useFakeTimers();
        const uri = vscode.Uri.file('/test/file.txt');
        const mockContent = 'test content';
        
        (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(
            Buffer.from(mockContent)
        );

        const promise = fileHandler['readFileContent'](uri);
        jest.runAllTimers();
        const content = await promise;
        expect(content).toBe(mockContent);
        jest.useRealTimers();
    });

    it('should get file stat correctly', async () => {
        jest.useFakeTimers();
        const uri = vscode.Uri.file('/test/file.txt');
        const mockStat = {
            type: vscode.FileType.File,
            size: 100,
            ctime: Date.now(),
            mtime: Date.now()
        };
        
        (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue(mockStat);

        const promise = fileHandler['getFileStat'](uri);
        jest.runAllTimers();
        const stat = await promise;
        expect(stat).toEqual(mockStat);
        jest.useRealTimers();
    });

    it('should respect .gitignore patterns', async () => {
        jest.useFakeTimers();
        const uri = vscode.Uri.file('/test/node_modules/package.json');
        
        jest.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(async () => 
            Buffer.from('node_modules/\n*.log\n')
        );

        jest.spyOn(fileHandler, 'shouldIgnore').mockResolvedValue(true);

        const promise = fileHandler.shouldIgnore('node_modules/package.json');
        jest.runAllTimers();
        const result = await promise;
        expect(result).toBe(true);
        jest.useRealTimers();
    });

    it('should respect custom ignore patterns', async () => {
        jest.useFakeTimers();
        const uri = vscode.Uri.file('/test/build/index.js');
        
        fileHandler['options'].ignorePatterns = ['**/build/**'];
        jest.spyOn(fileHandler, 'shouldIgnore').mockResolvedValue(true);

        const promise = fileHandler.shouldIgnore('build/index.js');
        jest.runAllTimers();
        const result = await promise;
        expect(result).toBe(true);
        jest.useRealTimers();
    });

    it('should handle complex glob patterns', async () => {
        jest.useFakeTimers();
        const testCases = [
            {
                pattern: '**/node_modules/**',
                path: 'src/node_modules/lodash/index.js',
                shouldIgnore: true
            },
            {
                pattern: '*.log',
                path: 'logs/error.log',
                shouldIgnore: true
            },
            {
                pattern: '**/dist/**',
                path: 'src/dist/index.js',
                shouldIgnore: true
            },
            {
                pattern: '!src/dist/index.js',
                path: 'src/dist/index.js',
                shouldIgnore: false
            },
            {
                pattern: '**/*.spec.js',
                path: 'src/test/example.spec.js',
                shouldIgnore: true
            }
        ];

        for (const testCase of testCases) {
            fileHandler['options'].ignorePatterns = [testCase.pattern];
            jest.spyOn(fileHandler, 'shouldIgnore').mockResolvedValue(testCase.shouldIgnore);
            
            const promise = fileHandler.shouldIgnore(testCase.path);
            jest.runAllTimers();
            const result = await promise;
            expect(result).toBe(testCase.shouldIgnore);
        }
        jest.useRealTimers();
    });

    it('should handle processing error gracefully', async () => {
        jest.useFakeTimers();
        const uri = vscode.Uri.file('/test/invalid.txt');
        const mockError = new Error('Processing error');
        
        jest.spyOn(fileHandler, 'processFile').mockRejectedValue(mockError);
        
        const promise = fileHandler.processFile(uri);
        jest.runAllTimers();
        await expect(promise).rejects.toThrow(mockError);
        jest.useRealTimers();
    });

    it('should handle file not found error gracefully', async () => {
        jest.useFakeTimers();
        const uri = vscode.Uri.file('/test/nonexistent.txt');
        const mockError = new Error('File not found');
        
        jest.spyOn(fileHandler, 'processFile').mockRejectedValue(mockError);
        
        const promise = fileHandler.processFile(uri);
        jest.runAllTimers();
        await expect(promise).rejects.toThrow(mockError);
        jest.useRealTimers();
    });
});
