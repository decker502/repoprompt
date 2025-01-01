import * as vscode from 'vscode';
import { FileProcessor } from '../fileProcessor';
import { XmlGenerator } from '../xmlGenerator';
import { ProcessingOptions } from '../types';

export const createFileProcessor = (options: ProcessingOptions = {
    maxFileSize: 1048576,
    ignorePatterns: [],
    rootTag: 'project',
    includeComments: true,
    chunkSize: 1048576
}) => new FileProcessor(options);

export const createXmlGenerator = (options: ProcessingOptions = {
    maxFileSize: 1048576,
    ignorePatterns: [],
    rootTag: 'project',
    includeComments: true,
    chunkSize: 1048576
}) => new XmlGenerator(options);

export const mockFs = {
    readDirectory: jest.spyOn(vscode.workspace.fs, 'readDirectory'),
    stat: jest.spyOn(vscode.workspace.fs, 'stat'),
    readFile: jest.spyOn(vscode.workspace.fs, 'readFile')
};

export const resetMocks = () => {
    mockFs.readDirectory.mockReset();
    mockFs.stat.mockReset();
    mockFs.readFile.mockReset();
};
