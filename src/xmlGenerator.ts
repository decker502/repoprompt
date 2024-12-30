import { ProjectFolder, ProjectFile, XmlChunk, ProcessingOptions } from './types';

export class XmlGenerator {
    private options: ProcessingOptions;
    private readonly CHUNK_SIZE = 1024 * 1024; // 1MB

    constructor(options: ProcessingOptions) {
        this.options = options;
    }

    generateXml(
        structure: ProjectFolder,
        files: ProjectFile[],
        prompt?: string
    ): XmlChunk[] {
        const chunks: XmlChunk[] = [];
        let currentChunk = '';
        let chunkNumber = 1;

        // 移除 XML 声明标签，直接从根标签开始
        currentChunk += `<${this.options.rootTag}>\n`;

        // Add prompt if provided
        if (prompt) {
            currentChunk += `  <prompt><![CDATA[\n  ${this.escapeXml(prompt)}\n  ]]></prompt>\n`;
        }

        // Add structure
        currentChunk += `  <structure>\n`;
        currentChunk += this.generateStructureXml(structure, 4);
        currentChunk += `  </structure>\n`;

        // Start files section
        currentChunk += `  <files>\n`;

        // Process each file
        for (const file of files) {
            const fileXml = this.generateFileXml(file, 4);
            
            // Check if adding this file would exceed chunk size
            if (currentChunk.length + fileXml.length > this.CHUNK_SIZE && currentChunk.length > 0) {
                // Close current chunk
                currentChunk += `  </files>\n</${this.options.rootTag}>`;
                chunks.push({
                    content: currentChunk,
                    chunkNumber: chunkNumber++,
                    totalChunks: 0 // Will be updated later
                });

                // Start new chunk without XML declaration
                currentChunk = `<${this.options.rootTag} chunk="${chunkNumber}">\n`;
                currentChunk += `  <files>\n`;
            }

            currentChunk += fileXml;
        }

        // Close final chunk
        currentChunk += `  </files>\n</${this.options.rootTag}>`;
        chunks.push({
            content: currentChunk,
            chunkNumber: chunkNumber,
            totalChunks: chunkNumber
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
            xml += `${spaces}  ${file.content}\n`;
            xml += `${spaces}  ]]></content>\n`;
        }

        xml += `${spaces}</file>\n`;
        return xml;
    }

    private escapeXml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
} 