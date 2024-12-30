export interface ProjectFile {
    name: string;
    path: string;
    content?: string;
    summary?: string;
    size: number;
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
}

export interface ProcessingOptions {
    maxFileSize: number;
    rootTag: string;
    includeComments: boolean;
    ignorePatterns: string[];
} 