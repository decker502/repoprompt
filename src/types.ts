import * as vscode from 'vscode';

export interface ProjectFile {
    name: string;
    path: string;
    size?: number;
    summary?: string;
    content?: string;
    ignored?: boolean;
    isSelected?: boolean;
    type?: vscode.FileType;
}

export interface ProjectFolder {
    name: string;
    path: string;
    files: ProjectFile[];
    folders: ProjectFolder[];
    truncated?: boolean;
    isSelected?: boolean;
    isExpanded?: boolean;
    type?: vscode.FileType;
}

export interface XmlChunk {
    content: string;
    chunkNumber: number;
    totalChunks: number;
    filesProcessed: number;
    totalFiles: number;
}

export interface ProcessingOptions {
    maxFileSize: number;
    maxTotalSize?: number;
    maxDepth?: number;
    ignorePatterns: string[];
    rootTag: string;
    includeComments: boolean;
    chunkSize: number;
    keepEmptyFolders?: boolean;
    includeEmptyFolders: boolean;
    prompt?: string;
}

export interface ProcessingResult {
    structure: ProjectFolder[];
    files: ProjectFile[];
    rootPath: string;
    prompt?: string;
    chunkInfo?: {
        current: number;
        total: number;
    };
}
