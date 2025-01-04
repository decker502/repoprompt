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

        it('should handle multiple selections (files, folders, mixed)', async () => {
            // 设置测试数据
            const rootPath = '/test';
            const file1Uri = vscode.Uri.file('/test/file1.txt');
            const folder1Uri = vscode.Uri.file('/test/folder1');
            const folder2Uri = vscode.Uri.file('/test/folder2');

            // Mock 文件状态
            mockFileHandler.getFileStat.mockImplementation((uri) => {
                if (uri.fsPath === file1Uri.fsPath) {
                    return Promise.resolve({ type: vscode.FileType.File } as vscode.FileStat);
                } else {
                    return Promise.resolve({ type: vscode.FileType.Directory } as vscode.FileStat);
                }
            });

            // Mock 文件处理
            mockFileHandler.processFile.mockImplementation((uri) => {
                const fileName = path.basename(uri.fsPath);
                const filePath = path.relative(rootPath, uri.fsPath);
                return Promise.resolve({
                    name: fileName,
                    path: filePath,
                    content: 'test content'
                });
            });

            // Mock 文件夹处理
            mockFolderHandler.processFolder.mockImplementation((uri) => {
                const folderName = path.basename(uri.fsPath);
                const folderPath = path.relative(rootPath, uri.fsPath);
                
                // 创建文件 URI
                const fileUri = vscode.Uri.file(path.join(uri.fsPath, `file${folderName === 'folder1' ? '2' : '3'}.txt`));
                
                // 处理文件
                const file = mockFileHandler.processFile(fileUri);
                
                return Promise.resolve({
                    name: folderName,
                    path: folderPath,
                    files: [{
                        name: `file${folderName === 'folder1' ? '2' : '3'}.txt`,
                        path: `${folderPath}/file${folderName === 'folder1' ? '2' : '3'}.txt`,
                        content: 'test content'
                    }],
                    folders: [],
                    isSelected: false,
                    isExpanded: false
                });
            });

            // 执行测试
            const result = await fileProcessor.processSelection([file1Uri, folder1Uri, folder2Uri]);

            // 验证结果
            expect(result.files.length).toBe(3); // file1.txt + folder1/file2.txt + folder2/file3.txt
            expect(result.structure.length).toBe(2); // folder1 和 folder2
            expect(mockFileHandler.processFile).toHaveBeenCalledTimes(3); // 处理所有文件
            expect(mockFolderHandler.processFolder).toHaveBeenCalledTimes(2); // 处理两个文件夹

            // 验证文件路径是否正确
            expect(result.files.map(f => f.path).sort()).toEqual([
                'file1.txt',
                'folder1/file2.txt',
                'folder2/file3.txt'
            ].sort());

            // 验证文件夹结构
            expect(result.structure.map(f => f.path).sort()).toEqual([
                'folder1',
                'folder2'
            ].sort());

            // 验证每个文件都被正确处理
            expect(mockFileHandler.processFile).toHaveBeenCalledWith(file1Uri);
            expect(mockFileHandler.processFile).toHaveBeenCalledWith(
                expect.objectContaining({ fsPath: expect.stringContaining('folder1/file2.txt') })
            );
            expect(mockFileHandler.processFile).toHaveBeenCalledWith(
                expect.objectContaining({ fsPath: expect.stringContaining('folder2/file3.txt') })
            );
        });

        test('should process single file correctly', async () => {
            // 设置测试数据
            const uri = vscode.Uri.file('/test/file.txt');
            
            // Mock 文件状态
            mockFileHandler.getFileStat.mockResolvedValue({ 
                type: vscode.FileType.File, 
                size: 100 
            } as vscode.FileStat);

            // Mock 文件处理
            mockFileHandler.processFile.mockResolvedValue({
                name: 'file.txt',
                path: 'file.txt',
                content: 'test content',
                size: 100
            });

            // 执行测试
            const result = await fileProcessor.processSelection([uri]);
            
            // 验证结果
            expect(result.files.length).toBe(1);
            expect(result.files[0].name).toBe('file.txt');
            expect(mockFileHandler.processFile).toHaveBeenCalledTimes(1);
        });

        test('should respect .gitignore patterns', async () => {
            // 准备测试数据
            const mockFs = {
                readDirectory: jest.fn().mockResolvedValue([]),
                stat: jest.fn().mockResolvedValue({ type: vscode.FileType.Directory })
            };
            
            // 创建 mock FileHandler
            const mockFileHandler = {
                processFile: jest.fn(),
                setRootPath: jest.fn(),
                shouldIgnore: jest.fn().mockResolvedValue(true),
                dispose: jest.fn(),
                getFileStat: jest.fn(),
                readFile: jest.fn(),
                readDirectory: jest.fn()
            } as jest.Mocked<IFileHandler>;
            
            // 创建 mock FolderHandler
            const mockFolderHandler = {
                processFolder: jest.fn(),
                setRootPath: jest.fn(),
                dispose: jest.fn()
            } as jest.Mocked<IFolderHandler>;
            
            // 创建 FileProcessor 实例
            const fileProcessor = new FileProcessor(options, mockFileHandler, mockFolderHandler);
            
            // 测试忽略规则
            const shouldIgnore = await mockFileHandler.shouldIgnore('node_modules/test.js');
            
            // 验证结果
            expect(shouldIgnore).toBe(true);
        });

        test('should generate file summaries', async () => {
            // 设置测试数据
            const fileHandler = new FileHandler(options);
            const mockContent = 'This is a test file\nWith multiple lines\nOf content';

            // 执行测试
            const summary = fileHandler['generateSummary'](mockContent);
            
            // 验证结果
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

        it('should handle duplicate folder structures correctly', () => {
            const result: ProcessingResult = {
                prompt: 'test',
                rootPath: '/test',
                structure: [
                    {
                        name: 'project',
                        path: 'project',
                        folders: [
                            {
                                name: 'src',
                                path: 'project/src',
                                files: [
                                    { name: 'file1.py', path: 'src/file1.py' },
                                    { name: 'file2.txt', path: 'src/file2.txt' }
                                ],
                                folders: []
                            }
                        ],
                        files: []
                    }
                ],
                files: [
                    { 
                        name: 'file1.py',
                        path: 'src/file1.py',
                        content: 'test content'
                    },
                    {
                        name: 'file2.txt',
                        path: 'src/file2.txt',
                        content: 'test content'
                    }
                ]
            };

            const xml = XmlGenerator.generateXml(result);
            
            // 验证文件夹结构只出现一次
            const srcFolderCount = (xml.match(/<folder name="src">/g) || []).length;
            expect(srcFolderCount).toBe(1);
            
            // 验证文件路径格式正确
            expect(xml).toContain('path="project/src/file1.py"');
            expect(xml).toContain('path="project/src/file2.txt"');
        });
    });
});
