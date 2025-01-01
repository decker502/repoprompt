import { XmlGenerator } from '../xmlGenerator';
import { ProjectFolder, ProjectFile, ProcessingOptions } from '../types';

describe('XmlGenerator', () => {
    let generator: XmlGenerator;
    
    beforeEach(() => {
        const options: ProcessingOptions = {
            maxFileSize: 1024 * 1024,
            ignorePatterns: [],
            rootTag: 'project',
            includeComments: true,
            chunkSize: 1024 * 1024  // 添加这一行
        };
        generator = new XmlGenerator(options);
    });

    test('should generate valid XML', () => {
        const structure: ProjectFolder[] = [{
            name: 'test',
            path: 'test',
            folders: [],
            files: [{
                name: 'test.txt',
                path: 'test/test.txt',
                size: 100
            }]
        }];

        const files: ProjectFile[] = [{
            name: 'test.txt',
            path: 'test/test.txt',
            size: 100,
            content: 'test content'
        }];

        const result = generator.generateXml(structure, files, 'test prompt');
        
        expect(result.length).toBe(1);
        expect(result[0].content).toContain('<?xml');
        expect(result[0].content).toContain('<project chunk="1">');
        expect(result[0].content).toContain('test prompt');
        expect(result[0].content).toContain('test content');
    });

    test('should handle special characters', () => {
        const files: ProjectFile[] = [{
            name: 'test.txt',
            path: 'test/test.txt',
            size: 100,
            content: '<test>&"\'</test>'
        }];

        const result = generator.generateXml([], files);
        
        expect(result[0].content).toContain('&lt;test&gt;&amp;&quot;&apos;&lt;/test&gt;');
    });

    it('should generate XML with multiple root folders', () => {
        const folders: ProjectFolder[] = [
            {
                name: 'folder1',
                path: 'folder1',
                folders: [],
                files: []
            },
            {
                name: 'folder2',
                path: 'folder2',
                folders: [],
                files: []
            }
        ];

        const files: ProjectFile[] = [];
        const chunks = generator.generateXml(folders, files, 'Test prompt', '/test-project');

        expect(chunks.length).toBe(1);
        const xml = chunks[0].content;
        expect(xml).toContain('<project chunk="1">');
        expect(xml).toContain('<prompt><![CDATA[\n  Test prompt\n  ]]></prompt>');
        expect(xml).toContain('<root path="/test-project">');
        expect(xml).toContain('<folder name="folder1">');
        expect(xml).toContain('<folder name="folder2">');
    });

    it('should split large XML into chunks', () => {
        const folders: ProjectFolder[] = [];
        const files: ProjectFile[] = [];
        
        // Create large content
        // Add files with small content to test chunking logic
        for (let i = 0; i < 10; i++) {
            files.push({
                name: `file${i}.txt`,
                path: `file${i}.txt`,
                content: `File ${i} content`,
                size: 100,
                summary: 'Test file summary'
            });
        }

        // Reduce chunk size to force splitting
        generator['options'].chunkSize = 500;

        const chunks = generator.generateXml(folders, files, 'Test prompt', '/test-project');
        
        // Verify chunking metadata
        expect(chunks.length).toBeGreaterThan(1);
        chunks.forEach((chunk, index) => {
            expect(chunk.chunkNumber).toBe(index + 1);
            expect(chunk.totalChunks).toBe(chunks.length);
            expect(chunk.filesProcessed).toBeLessThanOrEqual(files.length);
            expect(chunk.totalFiles).toBe(files.length);
        });
    });

    it('should handle empty selection', () => {
        const folders: ProjectFolder[] = [];
        const files: ProjectFile[] = [];
        const chunks = generator.generateXml(folders, files, undefined, '/test-project');

        expect(chunks.length).toBe(1);
        const xml = chunks[0].content;
        expect(xml).toContain('<project chunk="1">');
        expect(xml).toContain('<root path="/test-project">');
        expect(xml).not.toContain('<prompt>');
    });
});
