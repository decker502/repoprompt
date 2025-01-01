import * as vscode from 'vscode';
import { FileProcessor, FileHandler, FolderHandler } from '../fileProcessor';
import { XmlGenerator } from '../xmlGenerator';
import { ProcessingOptions, ProjectFile, ProjectFolder } from '../types';
import { mockFolderStructure, mockFileContent, mockGitignoreContent, mockProjectFiles } from './__mocks__/testData';
import { createFileProcessor, createXmlGenerator, mockFs, resetMocks } from './helpers';

describe('Extension Test Suite', () => {
    beforeAll(() => {
        vscode.window.showInformationMessage('Start all tests.');
    });

    describe('FileProcessor', () => {
        let processor: FileProcessor;

        beforeEach(() => {
            processor = createFileProcessor();
            resetMocks();
        });

        test('should process single file correctly', async () => {
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

            const result = await processor.processSelection([uri]);
            
            expect(result.files.length).toBe(1);
            expect(result.files[0].name).toBe('file.txt');
        });

        test('should respect .gitignore patterns', async () => {
            const fileHandler = new FileHandler(processor['options']);
            
            // Mock .gitignore content
            jest.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(async () => 
                Buffer.from('node_modules/\n*.log\n')
            );

            const shouldIgnore = await fileHandler['shouldIgnore']('node_modules/package.json');
            expect(shouldIgnore).toBeTruthy();
        });

        test('should handle multiple selections (files, folders, mixed)', async () => {
            const uris = [
                vscode.Uri.file('test/file1.txt'),
                vscode.Uri.file('test/folder1'),
                vscode.Uri.file('test/folder2')
            ];

            // Mock directory structure
            const mockDirectory = new Map([
                ['test/folder1', [['file2.txt', vscode.FileType.File]]],
                ['test/folder2', [['file3.txt', vscode.FileType.File]]]
            ]);

            // Mock vscode.workspace.fs.stat
            jest.spyOn(vscode.workspace.fs, 'stat').mockImplementation(async (uri) => {
                return {
                    type: uri.fsPath.endsWith('folder1') || uri.fsPath.endsWith('folder2') ? 
                        vscode.FileType.Directory : vscode.FileType.File,
                    size: 100,
                    ctime: 0,
                    mtime: 0
                };
            });

            // Mock vscode.workspace.fs.readDirectory
            jest.spyOn(vscode.workspace.fs, 'readDirectory').mockImplementation(async (uri) => {
                const entries = mockDirectory.get(uri.fsPath) || [];
                return entries.map(entry => [entry[0], entry[1]] as [string, vscode.FileType]);
            });

            // Mock vscode.workspace.fs.readFile
            jest.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(async () => {
                return Buffer.from('test content');
            });

            const result = await processor.processSelection(uris);
            expect(result.structure.length).toBe(3); // 三个文件夹（包括根目录）
            expect(result.files.length).toBe(3); // 三个文件
            expect(result.structure[0].name).toBe('test');
            expect(result.structure[1].name).toBe('folder1');
            expect(result.structure[2].name).toBe('folder2'); // 根目录
        });

        test('should generate file summaries', async () => {
            const fileHandler = new FileHandler(processor['options']);
            const mockFile: ProjectFile = {
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
        let generator: XmlGenerator;
        const options: ProcessingOptions = {
            maxFileSize: 1048576,
            ignorePatterns: [],
            rootTag: 'project',
            includeComments: true,
            chunkSize: 500000 // 500KB to ensure multiple chunks
        };

        beforeEach(() => {
            generator = new XmlGenerator(options);
        });

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

            const chunks = generator.generateXml([mockFolder], [mockFolder.files[0]]);
            const xml = chunks[0].content;
            expect(xml).toContain('<project chunk="1">');
            expect(xml).toContain('<structure>');
            expect(xml).toContain('<folder name="test">');
            expect(xml).toContain('<file name="file1.txt"');
        });

        test('should handle chunking correctly', () => {
            const mockFiles: ProjectFile[] = [];
            for (let i = 0; i < 10; i++) {
                mockFiles.push({
                    name: `file${i}.txt`,
                    path: `test/file${i}.txt`,
                    size: 200000, // 200KB per file
                    content: Array.from({length: 100}, () => Math.random().toString(36).substring(2)).join(''),
                    summary: 'Test summary'
                });
            }

            const chunks = generator.generateXml([], mockFiles);
            expect(chunks.length).toBeGreaterThan(1);
            chunks.forEach((chunk, index) => {
                expect(chunk.chunkNumber).toBe(index + 1);
                expect(chunk.totalChunks).toBe(chunks.length);
                expect(chunk.content).toContain(`<project chunk="${index + 1}">`);
            });
        });


    });
});
