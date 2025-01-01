import { ProjectFolder } from '@src/types';

export const mockFolderStructure: ProjectFolder = {
    name: 'test',
    path: 'test',
    folders: [
        {
            name: 'subfolder',
            path: 'test/subfolder',
            folders: [],
            files: [
                {
                    name: 'file2.txt',
                    path: 'test/subfolder/file2.txt',
                    size: 100,
                    content: 'test content',
                    summary: 'Test summary'
                }
            ]
        }
    ],
    files: [
        {
            name: 'file1.txt',
            path: 'test/file1.txt',
            size: 100,
            content: 'test content',
            summary: 'Test summary'
        }
    ]
};

export const mockFileContent = 'test content';

export const mockGitignoreContent = 'node_modules/\n*.log\n';

export const mockProjectFiles = Array.from({ length: 10 }, (_, i) => ({
    name: `file${i}.txt`,
    path: `test/file${i}.txt`,
    size: 200000,
    content: Array.from({length: 100}, () => Math.random().toString(36).substring(2)).join(''),
    summary: 'Test summary'
}));
