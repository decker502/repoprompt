import * as vscode from 'vscode';
import * as path from 'path';
import { FileProcessor, FileHandler } from '../fileProcessor';
import { ProcessingOptions } from '../types';

describe('FileProcessor', () => {
    let fileProcessor: FileProcessor;
    let fileHandler: FileHandler;
    const options: ProcessingOptions = {
        maxFileSize: 1048576,
        rootTag: 'project',
        includeComments: true,
        ignorePatterns: [],
        chunkSize: 1048576
    };

    beforeEach(() => {
        fileProcessor = new FileProcessor(options);
        fileHandler = new FileHandler(options);
        jest.clearAllMocks();
    });

    describe('FileHandler', () => {
        it('should read file content correctly', async () => {
            const uri = vscode.Uri.file('/test/file.txt');
            const mockContent = 'test content';
            
            (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(
                Buffer.from(mockContent)
            );

            const content = await fileHandler['readFileContent'](uri);
            expect(content).toBe(mockContent);
        });

        it('should get file stat correctly', async () => {
            const uri = vscode.Uri.file('/test/file.txt');
            const mockStat = {
                type: vscode.FileType.File,
                size: 100,
                ctime: Date.now(),
                mtime: Date.now()
            };
            
            (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue(mockStat);

            const stat = await fileHandler['getFileStat'](uri);
            expect(stat).toEqual(mockStat);
        });
    });

    describe('FileProcessor', () => {

        it('should correctly handle nested folder structure', async () => {
        const projectPath = '/test-project';
        const rootUri = vscode.Uri.file(projectPath);

        // Mock directory structure
        const mockDirectory = new Map([
            [projectPath, [['src', vscode.FileType.Directory]]],
            [`${projectPath}/src`, [['__pycache__', vscode.FileType.Directory]]],
            [`${projectPath}/src/__pycache__`, [['__init__.cpython-312.pyc', vscode.FileType.File]]]
        ]);

        // Mock readDirectory
        (vscode.workspace.fs.readDirectory as jest.Mock).mockImplementation(async (uri: vscode.Uri) => {
            return mockDirectory.get(uri.fsPath) || [];
        });

        // Mock stat
        (vscode.workspace.fs.stat as jest.Mock).mockImplementation(async (uri: vscode.Uri) => {
            const isDirectory = mockDirectory.has(uri.fsPath);
            return {
                type: isDirectory ? vscode.FileType.Directory : vscode.FileType.File,
                size: isDirectory ? 0 : 100,
                ctime: Date.now(),
                mtime: Date.now()
            };
        });

        // Mock readFile
        (vscode.workspace.fs.readFile as jest.Mock).mockImplementation(async () => {
            return Buffer.from('Mock content');
        });

        const { structure, rootPath } = await fileProcessor.processSelection([rootUri]);

        // 验证结构
        expect(structure.length).toBe(1);
        const rootFolder = structure[0];
        expect(rootFolder.path).toBe('');
        expect(rootFolder.name).toBe('test-project');

        const srcFolder = rootFolder.folders[0];
        expect(srcFolder.name).toBe('src');
        expect(srcFolder.path).toBe('src');

        const pycacheFolder = srcFolder.folders[0];
        expect(pycacheFolder.name).toBe('__pycache__');
        expect(pycacheFolder.path).toBe('src/__pycache__');
    });

        test('should process single file', async () => {
        const uri = { 
            fsPath: '/test/file.txt',
            scheme: 'file'
        } as vscode.Uri;

        // Mock vscode API
        (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({
            type: vscode.FileType.File,
            size: 100
        });
        
        (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(
            Buffer.from('test content')
        );

        const result = await fileProcessor.processSelection([uri]);
        
        expect(result.files.length).toBe(1);
        expect(result.files[0].name).toBe('file.txt');
        expect(result.files[0].content).toBe('test content');
    });

        test('should respect file size limit', async () => {
        const uri = { 
            fsPath: '/test/large.txt',
            scheme: 'file'
        } as vscode.Uri;

        (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({
            type: vscode.FileType.File,
            size: 2 * 1024 * 1024 // 2MB
        });

        const result = await fileProcessor.processSelection([uri]);
        
        expect(result.files[0].content).toBeUndefined();
        expect(result.files[0].summary).toBeDefined();
    });

        test('should calculate common root path correctly', async () => {
            const testCases = [
                {
                    description: 'multiple files in same directory',
                    uris: [
                        vscode.Uri.file('/project/src/file1.txt'),
                        vscode.Uri.file('/project/src/file2.txt')
                    ],
                    expected: '/project/src'
                },
                {
                    description: 'multiple files in same subdirectory',
                    uris: [
                        vscode.Uri.file('/project/src/module/file1.txt'),
                        vscode.Uri.file('/project/src/module/file2.txt')
                    ],
                    expected: '/project/src/module'
                },
                {
                    description: 'multiple files in nested subdirectory',
                    uris: [
                        vscode.Uri.file('/project/src/module/sub/file1.txt'),
                        vscode.Uri.file('/project/src/module/sub/file2.txt')
                    ],
                    expected: '/project/src/module/sub'
                },
                {
                    description: 'files in different subdirectories',
                    uris: [
                        vscode.Uri.file('/project/src/file1.txt'),
                        vscode.Uri.file('/project/src/module/file2.txt')
                    ],
                    expected: '/project/src'
                },
                {
                    description: 'root directory and subdirectory',
                    uris: [
                        vscode.Uri.file('/project/README.md'),
                        vscode.Uri.file('/project/src/file1.txt')
                    ],
                    expected: '/project'
                },
                {
                    description: 'single file selection',
                    uris: [
                        vscode.Uri.file('/project/src/file1.txt')
                    ],
                    expected: '/project/src'
                },
                {
                    description: 'single directory selection',
                    uris: [
                        vscode.Uri.file('/project/src')
                    ],
                    expected: '/project/src'
                },
                {
                    description: 'non-existent path',
                    uris: [
                        vscode.Uri.file('/project/non-existent/file.txt')
                    ],
                    expected: '/project/non-existent'
                }
            ];

            (vscode.workspace.fs.stat as jest.Mock).mockImplementation(async (uri: vscode.Uri) => {
                // 针对常见目录做判断
                if (uri.fsPath === '/project' || uri.fsPath === '/project/src' || 
                    uri.fsPath === '/project/src/module' || uri.fsPath === '/project/src/module/sub') {
                    return {
                        type: vscode.FileType.Directory,
                        size: 0,
                        ctime: Date.now(),
                        mtime: Date.now()
                    };
                }
                // 如果是 .txt 文件
                if (uri.fsPath.endsWith('.txt')) {
                    return {
                        type: vscode.FileType.File,
                        size: 100,
                        ctime: Date.now(),
                        mtime: Date.now()
                    };
                }
                // 默认返回文件
                return {
                    type: vscode.FileType.File,
                    size: 0,
                    ctime: 0,
                    mtime: 0
                };
            });

            for (const testCase of testCases) {
                console.log(`Test case: ${testCase.description}`);
                console.log('Testing with URIs:', testCase.uris.map(uri => uri.fsPath));
                const result = await fileProcessor.processSelection(testCase.uris);
                console.log('Calculated root path:', result.rootPath);
                expect(result.rootPath).toBe(testCase.expected);
                // Verify path normalization
                expect(result.rootPath).toBe(path.normalize(testCase.expected));
            }
        });

        test('should process single uri correctly', async () => {
            const uri = vscode.Uri.file('/test/file.txt');
            const allFiles: any[] = [];
            const rootFolders: any[] = [];

            // Mock vscode API
            (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({
                type: vscode.FileType.File,
                size: 100
            });
            
            (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(
                Buffer.from('test content')
            );

            await fileProcessor['processSingleUri'](uri, allFiles, rootFolders);
            
            expect(allFiles.length).toBe(1);
            expect(allFiles[0].name).toBe('file.txt');
        });
    });
});
