import * as vscode from 'vscode';
import { Config } from '../config';
import { ProcessingOptions } from '../types';

describe('Config', () => {
    let mockConfig: vscode.WorkspaceConfiguration;

    beforeEach(() => {
        // Mock vscode.workspace.getConfiguration
        mockConfig = {
            get: jest.fn(),
            has: jest.fn(),
            inspect: jest.fn(),
            update: jest.fn()
        };
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);
    });

    describe('getProcessingOptions', () => {
        it('should return default values when no config is set', () => {
            // Mock empty config
            (mockConfig.get as jest.Mock).mockImplementation((key: string) => undefined);

            const options = Config.getProcessingOptions();
            expect(options).toEqual({
                maxFileSize: 1048576,
                maxTotalSize: 104857600,
                maxDepth: 10,
                ignorePatterns: [],
                rootTag: 'project',
                includeComments: true,
                chunkSize: 5242880,
                keepEmptyFolders: false,
                includeEmptyFolders: false
            });
        });

        it('should return custom values when config is set', () => {
            // Mock custom config
            (mockConfig.get as jest.Mock).mockImplementation((key: string) => {
                switch (key) {
                    case 'maxFileSize': return 2 * 1024 * 1024;
                    case 'maxTotalSize': return 200 * 1024 * 1024;
                    case 'maxDepth': return 5;
                    case 'ignorePatterns': return ['**/node_modules/**'];
                    case 'rootTag': return 'custom-project';
                    case 'includeComments': return false;
                    case 'chunkSize': return 10 * 1024 * 1024;
                    case 'keepEmptyFolders': return true;
                    case 'includeEmptyFolders': return false;
                    default: return undefined;
                }
            });

            const options = Config.getProcessingOptions();
            expect(options).toEqual({
                maxFileSize: 2 * 1024 * 1024,
                maxTotalSize: 200 * 1024 * 1024,
                maxDepth: 5,
                ignorePatterns: ['**/node_modules/**'],
                rootTag: 'custom-project',
                includeComments: false,
                chunkSize: 10 * 1024 * 1024,
                keepEmptyFolders: true,
                includeEmptyFolders: false
            });
        });

        it('should handle invalid config values', () => {
            // Mock invalid config
            (mockConfig.get as jest.Mock).mockImplementation((key: string) => {
                switch (key) {
                    case 'maxFileSize': return 'invalid';
                    case 'maxTotalSize': return 'invalid';
                    case 'maxDepth': return 'invalid';
                    case 'ignorePatterns': return 'invalid';
                    case 'rootTag': return 123;
                    case 'includeComments': return 'invalid';
                    case 'chunkSize': return 'invalid';
                    case 'keepEmptyFolders': return 'invalid';
                    case 'includeEmptyFolders': return 'invalid';
                    default: return undefined;
                }
            });

            const options = Config.getProcessingOptions();
            expect(options).toEqual({
                maxFileSize: 1048576,
                maxTotalSize: 104857600,
                maxDepth: 10,
                ignorePatterns: [],
                rootTag: 'project',
                includeComments: true,
                chunkSize: 5242880,
                keepEmptyFolders: false,
                includeEmptyFolders: false
            });
        });
    });

    describe('getDefaultOutputPath', () => {
        it('should return default path when no config is set', () => {
            (mockConfig.get as jest.Mock).mockReturnValue(undefined);
            const path = Config.getDefaultOutputPath();
            expect(path).toBe('${workspaceFolder}/project.xml');
        });

        it('should return custom path when config is set', () => {
            (mockConfig.get as jest.Mock).mockReturnValue('/custom/path/project.xml');
            const path = Config.getDefaultOutputPath();
            expect(path).toBe('/custom/path/project.xml');
        });
    });

    describe('shouldCopyToClipboard', () => {
        it('should return false when no config is set', () => {
            (mockConfig.get as jest.Mock).mockReturnValue(undefined);
            const result = Config.shouldCopyToClipboard();
            expect(result).toBe(false);
        });

        it('should return true when config is set to true', () => {
            (mockConfig.get as jest.Mock).mockReturnValue(true);
            const result = Config.shouldCopyToClipboard();
            expect(result).toBe(true);
        });

        it('should return false when config is set to false', () => {
            (mockConfig.get as jest.Mock).mockReturnValue(false);
            const result = Config.shouldCopyToClipboard();
            expect(result).toBe(false);
        });
    });

    describe('getPrompt', () => {
        it('should return undefined when no config is set', () => {
            (mockConfig.get as jest.Mock).mockReturnValue(undefined);
            const prompt = Config.getPrompt();
            expect(prompt).toBeUndefined();
        });

        it('should return prompt when config is set', () => {
            const testPrompt = 'Test prompt';
            (mockConfig.get as jest.Mock).mockReturnValue(testPrompt);
            const prompt = Config.getPrompt();
            expect(prompt).toBe(testPrompt);
        });
    });
});
