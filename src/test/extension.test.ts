import * as vscode from 'vscode';
import { FileProcessor } from '../fileProcessor';
import { IFolderHandler } from '../folderHandler';
import { FileHandler, IFileHandler } from '../fileHandler';
import { XmlGenerator } from '../xmlGenerator';
import { ProcessingOptions, ProjectFile, ProjectFolder, ProcessingResult } from '../types';
import { mockFolderStructure, mockFileContent, mockGitignoreContent, mockProjectFiles } from './__mocks__/testData';
import { createFileProcessor, createXmlGenerator, mockFs, resetMocks } from './helpers';
import * as path from 'path';

describe('Extension Test Suite', () => {
    let mockVscode: any;

    beforeAll(() => {
        jest.mock('vscode');
        mockVscode = require('vscode');
        mockVscode.window.showInformationMessage('Start all tests.');
    });

    describe('FileProcessor', () => {
        let processor: FileProcessor;
        const options: ProcessingOptions = {
            maxFileSize: 1048576,
            ignorePatterns: [],
            rootTag: 'project',
            includeComments: true,
            chunkSize: 1048576,
            includeEmptyFolders: false
        };

        beforeEach(() => {
            // Reset all mocks
            jest.clearAllMocks();
            
            // Reset workspace.fs mocks
            mockVscode.workspace.fs.readDirectory.mockReset();
            mockVscode.workspace.fs.stat.mockReset();
            mockVscode.workspace.fs.readFile.mockReset();
        });

        test('should process single file correctly', async () => {
            const uri = { 
                fsPath: '/test/file.txt',
                path: '/test/file.txt',
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
            };
            mockVscode.workspace.fs.stat.mockResolvedValueOnce({ type: mockVscode.FileType.File, size: 100 });
            mockVscode.workspace.fs.readFile.mockResolvedValueOnce(Buffer.from('test content'));

            processor = new FileProcessor(options);
            const result = await processor.processSelection([uri]);
            
            expect(result.files.length).toBe(1);
            expect(result.files[0].name).toBe('file.txt');
        });

        test('should respect .gitignore patterns', async () => {
            mockVscode.workspace.fs.readFile.mockResolvedValueOnce(Buffer.from('node_modules/\n*.log\n'));
            
            const fileHandler = new FileHandler(options);
            const shouldIgnore = await fileHandler['shouldIgnore']('/node_modules/package.json');
            expect(shouldIgnore).toBe(true);
        });

        test('should handle multiple selections (files, folders, mixed)', async () => {
            const uris = [
                vscode.Uri.file('/root/file1.txt'),
                vscode.Uri.file('/root/folder1'),
                vscode.Uri.file('/root/folder2')
            ];

            const mockFileHandler = {
                processFile: jest.fn().mockImplementation((uri: any) => {
                    const name = path.basename(uri.fsPath);
                    const relativePath = path.relative('/root', uri.fsPath);
                    return Promise.resolve({
                        name,
                        path: relativePath,
                        content: 'test content'
                    });
                }),
                setRootPath: jest.fn(),
                shouldIgnore: jest.fn().mockReturnValue(false),
                dispose: jest.fn(),
                getFileStat: jest.fn().mockImplementation((uri: any) => Promise.resolve({
                    type: uri.fsPath.endsWith('folder1') || uri.fsPath.endsWith('folder2') ? 
                        mockVscode.FileType.Directory : mockVscode.FileType.File
                })),
                readFile: jest.fn().mockResolvedValue('test content'),
                readDirectory: jest.fn().mockImplementation((uri: any) => {
                    const entries = uri.fsPath.endsWith('folder1') ? 
                        [['file2.txt', mockVscode.FileType.File]] :
                        [['file3.txt', mockVscode.FileType.File]];
                    return Promise.resolve(entries);
                })
            } as jest.Mocked<IFileHandler>;

            // 修改 mockFolderHandler 实现，确保每个文件夹只处理一次
            const processedFolders = new Set<string>();
            const mockFolderHandler = {
                processFolder: jest.fn().mockImplementation((uri: any) => {
                    const relativePath = path.relative('/root', uri.fsPath);
                    if (processedFolders.has(relativePath)) {
                        return Promise.resolve({
                            name: path.basename(uri.fsPath),
                            path: relativePath,
                            files: [],
                            folders: []
                        });
                    }
                    processedFolders.add(relativePath);

                    const fileName = uri.fsPath.endsWith('folder1') ? 'file2.txt' : 'file3.txt';
                    return Promise.resolve({
                        name: path.basename(uri.fsPath),
                        path: relativePath,
                        files: [{
                            name: fileName,
                            path: `${relativePath}/${fileName}`,
                            content: 'test content'
                        }],
                        folders: []
                    });
                }),
                setRootPath: jest.fn(),
                dispose: jest.fn()
            } as jest.Mocked<IFolderHandler>;

            processor = new FileProcessor(options, mockFileHandler, mockFolderHandler);
            const result = await processor.processSelection(uris);
            
            // 验证结果
            expect(result.files.length).toBe(3); // file1.txt + folder1/file2.txt + folder2/file3.txt
            expect(result.structure.length).toBe(2); // folder1 和 folder2
            expect(mockFileHandler.processFile).toHaveBeenCalledTimes(3); // 处理 file1.txt + folder1/file2.txt + folder2/file3.txt
            expect(mockFolderHandler.processFolder).toHaveBeenCalledTimes(2); // 处理 folder1 和 folder2
            
            // 验证文件路径是否正确
            expect(result.files.map(f => f.path).sort()).toEqual([
                'file1.txt',
                'folder1/file2.txt',
                'folder2/file3.txt'
            ].sort());
        });

        test('should generate file summaries', async () => {
            const fileHandler = new FileHandler(options);
            const mockFile = {
                name: 'test.txt',
                path: 'test.txt',
                size: 100,
                content: 'This is a test file\nWith multiple lines\nOf content',
                summary: ''
            };

            const summary = fileHandler['generateSummary'](mockFile.content!);
            expect(summary).toBeDefined();
            expect(summary.length).toBeLessThanOrEqual(200);
        });
    });

    describe('XmlGenerator', () => {
        const options: ProcessingOptions = {
            maxFileSize: 1048576,
            ignorePatterns: [],
            rootTag: 'project',
            includeComments: true,
            chunkSize: 500000, // 500KB to ensure multiple chunks
            includeEmptyFolders: false
        };

        test('should generate valid XML structure', () => {
            const mockFolder: ProjectFolder = {
                name: 'test',
                path: 'test',
                folders: [],
                files: [{
                    name: 'file1.txt',
                    path: 'test/file1.txt',
                    size: 100,
                    content: 'Test content',
                    summary: 'Test summary'
                }]
            };

            const result: ProcessingResult = {
                structure: [mockFolder],
                files: mockFolder.files,
                rootPath: 'test'
            };

            const xml = XmlGenerator.generateXml(result);
            expect(xml).toContain('<project>');
            expect(xml).toContain('<structure>');
            expect(xml).toContain('<folder name="test">');
            expect(xml).toContain('<file name="file1.txt"');
        });

        test('should handle chunk information', () => {
            const mockFolder: ProjectFolder = {
                name: 'test',
                path: 'test',
                folders: [],
                files: [{
                    name: 'file1.txt',
                    path: 'test/file1.txt',
                    size: 100,
                    content: 'Test content',
                    summary: 'Test summary'
                }]
            };

            const result: ProcessingResult = {
                structure: [mockFolder],
                files: mockFolder.files,
                rootPath: 'test',
                chunkInfo: {
                    current: 1,
                    total: 3
                }
            };

            const xml = XmlGenerator.generateXml(result);
            expect(xml).toContain('<project chunk="1/3">');
        });
    });
});
