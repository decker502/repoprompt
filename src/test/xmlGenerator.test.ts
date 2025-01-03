import { XmlGenerator } from '../xmlGenerator';
import { ProcessingResult, ProjectFolder, ProjectFile } from '../types';

describe('XmlGenerator', () => {
    describe('generateXml', () => {
        it('should generate correct XML for single file', () => {
            const result: ProcessingResult = {
                structure: [],
                files: [{
                    name: 'test.txt',
                    path: 'test.txt',
                    content: 'test content'
                }],
                rootPath: '',
                prompt: 'Test prompt',
                chunkInfo: {
                    current: 1,
                    total: 2
                }
            };

            const xml = XmlGenerator.generateXml(result);
            expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
            expect(xml).toContain('<project chunk="1/2">');
            expect(xml).toContain('<prompt><![CDATA[\n        Test prompt\n    ]]></prompt>');
            expect(xml).toContain('<files>');
            expect(xml).toContain('<file path="test.txt">');
            expect(xml).toContain('<project chunk="1/2">');
            expect((xml.match(/<file/g) || []).length).toBe(2);
        });

        it('should handle ignore rules priority', () => {
            const result: ProcessingResult = {
                structure: [],
                files: [{
                    name: 'ignored.txt',
                    path: 'ignored.txt',
                    content: 'Should be ignored',
                    ignored: true
                }],
                rootPath: ''
            };

            const xml = XmlGenerator.generateXml(result);
            // 确保测试数据正确设置 ignored 属性
            const ignoredFile = result.files.find((f: ProjectFile) => f.path === 'ignored.txt');
            expect(ignoredFile?.ignored).toBeTruthy();
            expect(xml).not.toContain('ignored.txt');
        });
    });
});
