import { ProjectFolder, ProjectFile, XmlChunk, ProcessingOptions } from './types';

export class XmlGenerator {
    private options: ProcessingOptions;
    private readonly CHUNK_SIZE: number;

    constructor(options: ProcessingOptions) {
        this.options = options;
        this.CHUNK_SIZE = options.chunkSize;
    }

    generateXml(
        structure: ProjectFolder[],
        files: ProjectFile[],
        prompt?: string,
        rootPath?: string
    ): XmlChunk[] {
        const chunks: XmlChunk[] = [];
        let currentChunk = '';
        let chunkNumber = 1;
        const totalFiles = files.length;
        let filesProcessed = 0;

        // Add XML declaration
        currentChunk += `<?xml version="1.0" encoding="UTF-8"?>\n`;

        // Start root tag
        currentChunk += `<${this.options.rootTag}>\n`;

        // Add prompt if provided
        if (prompt) {
            currentChunk += `  <prompt><![CDATA[\n  ${this.escapeXml(prompt)}\n  ]]></prompt>\n`;
        }

        // Add structure
        currentChunk += `  <structure>\n`;
        if (rootPath) {
            currentChunk += `    <root path="${this.escapeXml(rootPath)}">\n`;
        }
        structure.forEach(folder => {
            currentChunk += this.generateStructureXml(folder, rootPath ? 6 : 4);
        });
        if (rootPath) {
            currentChunk += `    </root>\n`;
        }
        currentChunk += `  </structure>\n`;

        // Start files section
        currentChunk += `  <files>\n`;

        // Process each file
        for (const file of files) {
            const fileXml = this.generateFileXml(file, 4);
            filesProcessed++;
            
            // Check if adding this file would exceed chunk size
            if (currentChunk.length + fileXml.length > this.CHUNK_SIZE && currentChunk.length > 0) {
                // Close current chunk
                currentChunk += `  </files>\n</${this.options.rootTag}>`;
                chunks.push({
                    content: currentChunk,
                    chunkNumber: chunkNumber++,
                    totalChunks: 0, // Will be updated later
                    filesProcessed,
                    totalFiles
                });

                // Start new chunk
                currentChunk = `<?xml version="1.0" encoding="UTF-8"?>\n`;
                currentChunk += `<${this.options.rootTag}>\n`;
                currentChunk += `  <files>\n`;
            }

            currentChunk += fileXml;
        }

        // Close final chunk
        currentChunk += `  </files>\n</${this.options.rootTag}>`;
        chunks.push({
            content: currentChunk,
            chunkNumber: chunkNumber,
            totalChunks: chunkNumber,
            filesProcessed,
            totalFiles
        });

        // Update totalChunks in all chunks
        chunks.forEach(chunk => {
            chunk.totalChunks = chunks.length;
        });

        return chunks;
    }

    private generateStructureXml(folder: ProjectFolder, indent: number): string {
        const spaces = ' '.repeat(indent);
        let xml = `${spaces}<folder name="${this.escapeXml(folder.name)}">\n`;

        // Add subfolders
        folder.folders.forEach(subfolder => {
            xml += this.generateStructureXml(subfolder, indent + 2);
        });

        // Add files
        folder.files.forEach(file => {
            xml += `${spaces}  <file name="${this.escapeXml(file.name)}" path="${this.escapeXml(file.path)}" />\n`;
        });

        xml += `${spaces}</folder>\n`;
        return xml;
    }

    private generateFileXml(file: ProjectFile, indent: number): string {
        const spaces = ' '.repeat(indent);
        let xml = `${spaces}<file path="${this.escapeXml(file.path)}">\n`;

        // Add summary
        if (file.summary) {
            xml += `${spaces}  <summary><![CDATA[\n`;
            xml += `${spaces}  ${file.summary}\n`;
            xml += `${spaces}  ]]></summary>\n`;
        }

        // Add content if available
        if (file.content) {
            xml += `${spaces}  <content><![CDATA[\n`;
            xml += `${spaces}  ${this.escapeXml(file.content)}\n`;
            xml += `${spaces}  ]]></content>\n`;
        } else if (file.size > this.options.maxFileSize) {
            xml += `${spaces}  <content><![CDATA[\n`;
            xml += `${spaces}  File size (${file.size} bytes) exceeds maximum limit (${this.options.maxFileSize} bytes). Only summary is included.\n`;
            xml += `${spaces}  ]]></content>\n`;
        }

        xml += `${spaces}</file>\n`;
        return xml;
    }

    private escapeXml(text: string): string {
        return text
            .replace(/&/g, "&")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/"/g, "\"")
            .replace(/'/g, "\'");
    }
}
