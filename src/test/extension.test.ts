import * as vscode from 'vscode';
import { FileProcessor } from '../fileProcessor';
import { XmlGenerator } from '../xmlGenerator';
import { ProcessingOptions, ProjectFile, ProjectFolder } from '../types';

describe('Extension Test Suite', () => {
    beforeAll(() => {
        vscode.window.showInformationMessage('Start all tests.');
    });

    describe('FileProcessor', () => {
        let processor: FileProcessor;
        const options: ProcessingOptions = {
            maxFileSize: 1048576,
            ignorePatterns: [],
            rootTag: 'project',
            includeComments: true,
            chunkSize: 1048576
        };

        beforeEach(() => {
            processor = new FileProcessor(options);
        });

        test('should recursively scan folders', async () => {
            // Mock folder structure
            const mockFolder: ProjectFolder = {
                name: 'test',
                path: 'test',
                folders: [],
                files: []
            };

            // Mock vscode.workspace.fs.readDirectory to simulate a folder structure
            jest.spyOn(vscode.workspace.fs, 'readDirectory').mockImplementation(async (uri) => {
                if (uri.fsPath.endsWith('test')) {
                    return [
                        ['file1.txt', vscode.FileType.File],
                        ['subfolder', vscode.FileType.Directory]
                    ];
                } else if (uri.fsPath.endsWith('subfolder')) {
                    return [
                        ['file2.txt', vscode.FileType.File]
                    ];
                }
                return [];
            });

            // Mock vscode.workspace.fs.stat
            jest.spyOn(vscode.workspace.fs, 'stat').mockImplementation(async (uri) => {
                return {
                    type: uri.fsPath.endsWith('subfolder') ? vscode.FileType.Directory : vscode.FileType.File,
                    size: 100,
                    ctime: 0,
                    mtime: 0
                };
            });

            // Mock vscode.workspace.fs.readFile
            jest.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(async () => {
                return Buffer.from('test content');
            });

            await processor.processFolder(vscode.Uri.file('test'), mockFolder, []);
            expect(mockFolder.files.length).toBe(1);
            expect(mockFolder.folders.length).toBe(1);

            // Check the subfolder content
            const subfolder = mockFolder.folders[0];
            expect(subfolder.files.length).toBe(1);
            expect(subfolder.files[0].name).toBe('file2.txt');
        });

        test('should respect .gitignore patterns', async () => {
            // Mock .gitignore content
            jest.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(async () => 
                Buffer.from('node_modules/\n*.log\n')
            );

            const shouldIgnore = await processor['shouldIgnore']('node_modules/package.json');
            expect(shouldIgnore).toBeTruthy();
        });

        test('should handle multiple selections (files, folders, mixed)', async () => {
            const uris = [
                vscode.Uri.file('test/file1.txt'),
                vscode.Uri.file('test/folder1')
            ];

            // Mock vscode.workspace.fs.stat
            jest.spyOn(vscode.workspace.fs, 'stat').mockImplementation(async (uri) => {
                return {
                    type: uri.fsPath.endsWith('folder1') ? vscode.FileType.Directory : vscode.FileType.File,
                    size: 100,
                    ctime: 0,
                    mtime: 0
                };
            });

            // Mock vscode.workspace.fs.readFile
            jest.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(async () => {
                return Buffer.from('test content');
            });

            const result = await processor.processSelection(uris);
            expect(result.structure.length).toBeGreaterThan(0);
            expect(result.files.length).toBeGreaterThan(0);
        });

        test('should generate file summaries', async () => {
            const mockFile: ProjectFile = {
                name: 'test.txt',
                path: 'test.txt',
                size: 100,
                content: 'This is a test file\nWith multiple lines\nOf content',
                summary: ''
            };

            const summary = processor['generateSummary'](mockFile.content!);
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
            chunkSize: 1048576
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
            expect(xml).toContain('<project>');
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
                    content: 'a'.repeat(200000),
                    summary: 'Test summary'
                });
            }

            const chunks = generator.generateXml([], mockFiles);
            expect(chunks.length).toBeGreaterThan(1);
            chunks.forEach((chunk, index) => {
                expect(chunk.chunkNumber).toBe(index + 1);
                expect(chunk.totalChunks).toBe(chunks.length);
            });
        });

        test('should escape XML special characters', () => {
            const mockFile: ProjectFile = {
                name: 'test.xml',
                path: 'test.xml',
                size: 100,
                content: '<test>&"\'</test>',
                summary: ''
            };

            const chunks = generator.generateXml([], [mockFile]);
            const xml = chunks[0].content;
            expect(xml).toContain('&lt;test&gt;&amp;&quot;&apos;&lt;/test&gt;');
        });
    });
});
