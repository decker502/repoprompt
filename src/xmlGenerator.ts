import { ProcessingResult, ProjectFolder, ProjectFile } from './types';
import { escapeXml } from './utils/xmlUtils';
import * as path from 'path';

export class XmlGenerator {
    private static readonly INDENT_SIZE = 4;

    private static standardizePath(filePath: string): string {
        // 移除绝对路径前缀，只保留相对路径部分
        const parts = filePath.split('/');
        const startIndex = parts.findIndex(part => 
            part === 'test' || 
            part === 'src' || 
            part === 'web' || 
            part === 'lib' ||
            part === 'bin' ||
            part === 'docs' ||
            part === 'debug'
        );
        return startIndex !== -1 ? parts.slice(startIndex).join('/') : filePath;
    }

    private static getFolderKey(folder: ProjectFolder): string {
        // 使用文件夹名称和其包含的文件来生成唯一键
        const fileKeys = folder.files
            .map(file => `${file.name}:${this.standardizePath(file.path)}`)
            .sort()
            .join('|');
        return `${folder.name}:${fileKeys}`;
    }

    private static deduplicateStructure(structure: ProjectFolder[]): ProjectFolder[] {
        const folderMap = new Map<string, ProjectFolder>();
        
        structure.forEach(folder => {
            const folderKey = this.getFolderKey(folder);
            if (!folderMap.has(folderKey)) {
                // 为文件夹中的文件选择最短的标准化路径
                const standardizedFiles = folder.files.map(file => {
                    const standardPath = this.standardizePath(file.path);
                    return {
                        ...file,
                        path: standardPath
                    };
                });

                const standardizedFolder: ProjectFolder = {
                    ...folder,
                    files: standardizedFiles,
                    folders: [] // 清空子文件夹，因为我们是扁平化处理
                };
                folderMap.set(folderKey, standardizedFolder);
            }
        });

        return Array.from(folderMap.values());
    }

    public static generateXml(result: ProcessingResult): string {
        const { structure, files, prompt, chunkInfo } = result;
        const indent = ' '.repeat(this.INDENT_SIZE);

        // 处理files为undefined的情况
        if (!files) {
            return '';
        }

        // 如果只有prompt，或者有文件但所有文件都被忽略，生成简化XML
        const hasOnlyPrompt = prompt && 
            (files.length === 0 || files.every(file => file.ignored)) &&
            (!structure || structure.length === 0);
            
        if (hasOnlyPrompt && prompt) {
            return `<prompt><![CDATA[\n${indent}${indent}${escapeXml(prompt)}\n${indent}]]></prompt>`;
        }

        // 严格过滤掉被忽略的文件
        const filteredFiles = files.filter((file: ProjectFile) => !file.ignored);
        
        if (filteredFiles.length === 0 && (!structure || structure.length === 0)) {
            return '';
        }
        
        // 如果没有文件且没有结构，只返回prompt
        if (filteredFiles.length === 0 && (!structure || structure.length === 0) && prompt) {
            return `<prompt><![CDATA[\n${indent}${indent}${escapeXml(prompt)}\n${indent}]]></prompt>`;
        }

        // 生成完整XML
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<project${this.getChunkAttribute(chunkInfo)}>\n`;

        // 添加提示语
        if (prompt) {
            xml += `${indent}<prompt><![CDATA[\n`;
            xml += `${indent}${indent}${escapeXml(prompt)}\n`;
            xml += `${indent}]]></prompt>\n`;
        }

        // 生成项目结构（去重后）
        if (structure && structure.length > 0) {
            xml += `${indent}<structure>\n`;
            const deduplicatedStructure = this.deduplicateStructure(structure);
            deduplicatedStructure.forEach(folder => {
                xml += this.generateFolderXml(folder, indent.repeat(2));
            });
            xml += `${indent}</structure>\n`;
        }

        // 生成文件内容（使用标准化路径）
        if (filteredFiles.length > 0) {
            xml += `${indent}<files>\n`;
            // 使用Map来去重文件
            const uniqueFiles = new Map<string, ProjectFile>();
            filteredFiles.forEach(file => {
                const standardPath = this.standardizePath(file.path);
                const fileKey = `${file.name}:${standardPath}`;
                if (!uniqueFiles.has(fileKey)) {
                    uniqueFiles.set(fileKey, { ...file, path: standardPath });
                }
            });
            Array.from(uniqueFiles.values()).forEach(file => {
                xml += this.generateFileXml(file, indent.repeat(2));
            });
            xml += `${indent}</files>\n`;
        }

        xml += `</project>`;
        return xml;
    }

    private static generateFolderXml(folder: ProjectFolder, indent: string): string {
        let xml = `${indent}<folder name="${escapeXml(folder.name)}">\n`;
        folder.folders.forEach((subFolder: ProjectFolder) => {
            xml += this.generateFolderXml(subFolder, indent + ' ');
        });
        folder.files.forEach((file: ProjectFile) => {
            xml += `${indent} <file name="${escapeXml(file.name)}" path="${escapeXml(file.path)}" />\n`;
        });
        xml += `${indent}</folder>\n`;
        return xml;
    }

    private static generateFileXml(file: ProjectFile, indent: string): string {
        let xml = `${indent}<file path="${escapeXml(file.path)}">\n`;
        if (file.summary) {
            xml += `${indent} <summary><![CDATA[\n${escapeXml(file.summary)}\n${indent} ]]></summary>\n`;
        }
        if (file.content) {
            xml += `${indent} <content><![CDATA[\n`;
            xml += `${indent} ${indent}${escapeXml(file.content)}\n`;
            xml += `${indent} ]]></content>\n`;
        }
        xml += `${indent}</file>\n`;
        return xml;
    }

    private static getChunkAttribute(chunkInfo?: { current: number; total: number }): string {
        if (!chunkInfo) return '';
        return ` chunk="${chunkInfo.current}/${chunkInfo.total}"`;
    }
}
