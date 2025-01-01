export interface ProjectFile {
    name: string;
    path: string;
    size: number;
    summary?: string;
    content?: string;
}

export interface ProjectFolder {
    name: string;
    path: string;
    folders: ProjectFolder[];
    files: ProjectFile[];
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
    ignorePatterns: string[];
    rootTag: string;
    includeComments: boolean;
    chunkSize: number;  // 文件处理的分块大小
}
