import { ProcessingResult, ProjectFolder, ProjectFile } from './types';
import { escapeXml } from './utils/xmlUtils';
import * as path from 'path';

export class XmlGenerator {
    private static readonly INDENT_SIZE = 2;

    private static standardizePath(filePath: string): string {
        // 直接返回原始路径，不做截断处理
        return filePath;
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
        const seenPaths = new Set<string>();
        const filePathMap = new Map<string, string>(); // 用于追踪文件的规范路径
        
        // 递归处理文件夹
        const processFolder = (folder: ProjectFolder, parentPath: string = ''): void => {
            const fullPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
            
            // 如果这个路径已经处理过，直接返回
            if (seenPaths.has(fullPath)) {
                return;
            }
            seenPaths.add(fullPath);
            
            // 更新当前文件夹的路径
            folder.path = fullPath;
            
            // 创建或更新文件夹
            if (!folderMap.has(fullPath)) {
                folderMap.set(fullPath, {
                    name: folder.name,
                    path: fullPath,
                    files: [],
                    folders: []
                });
            }
            
            const currentFolder = folderMap.get(fullPath)!;
            
            // 处理文件
            if (folder.files) {
                folder.files.forEach(file => {
                    const filePath = `${fullPath}/${file.name}`;
                    // 检查文件是否已经在其他位置出现过
                    if (!filePathMap.has(file.name) || filePathMap.get(file.name) === filePath) {
                        filePathMap.set(file.name, filePath);
                        if (!currentFolder.files!.some(f => f.path === filePath)) {
                            currentFolder.files!.push({
                                ...file,
                                path: filePath
                            });
                        }
                    }
                });
            }
            
            // 递归处理子文件夹
            if (folder.folders) {
                folder.folders.forEach(subFolder => {
                    processFolder(subFolder, fullPath);
                });
            }
        };
        
        // 处理所有根文件夹，先按路径长度排序，确保最短路径先处理
        const sortedStructure = [...structure].sort((a, b) => 
            (a.path || a.name).split('/').length - (b.path || b.name).split('/').length
        );
        sortedStructure.forEach(folder => {
            processFolder(folder);
        });
        
        // 递归检查文件夹是否为空
        const isEmptyFolder = (folder: ProjectFolder): boolean => {
            if (folder.files && folder.files.length > 0) {
                return false;
            }
            if (!folder.folders || folder.folders.length === 0) {
                return true;
            }
            // 如果所有子文件夹都是空的，则当前文件夹也是空的
            return folder.folders.every(isEmptyFolder);
        };
        
        // 递归移除空文件夹
        const removeEmptyFolders = (folder: ProjectFolder): ProjectFolder | null => {
            if (!folder.folders) {
                folder.folders = [];
            }
            
            // 递归处理子文件夹
            folder.folders = folder.folders
                .map(subFolder => removeEmptyFolders(subFolder))
                .filter((subFolder): subFolder is ProjectFolder => subFolder !== null);
            
            // 如果当前文件夹是空的，返回 null
            return isEmptyFolder(folder) ? null : folder;
        };
        
        // 重建文件夹树结构
        const result: ProjectFolder[] = [];
        const processedPaths = new Set<string>();
        
        // 按路径长度排序，确保父文件夹先处理
        const sortedPaths = Array.from(folderMap.keys()).sort((a, b) => 
            a.split('/').length - b.split('/').length
        );
        
        for (const path of sortedPaths) {
            const folder = folderMap.get(path)!;
            
            // 如果父路径已经处理过，跳过
            if (Array.from(processedPaths).some(p => path.startsWith(`${p}/`))) {
                continue;
            }
            
            processedPaths.add(path);
            
            // 找到所有直接子文件夹
            folder.folders = sortedPaths
                .filter(p => p.startsWith(`${path}/`) && p.split('/').length === path.split('/').length + 1)
                .map(p => folderMap.get(p)!)
                .sort((a, b) => a.name.localeCompare(b.name));
            
            // 只添加顶层文件夹到结果中
            if (!path.includes('/')) {
                const processedFolder = removeEmptyFolders(folder);
                if (processedFolder) {
                    result.push(processedFolder);
                }
            }
        }
        
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }

    private static cleanCdata(content: string): string {
        if (!content) {
            return '';
        }
        
        // 移除已有的 CDATA 标记
        content = content.replace(/<!\[CDATA\[|\]\]>/g, '');
        
        // 处理内容中的 ]]> 序列
        content = content.replace(/\]\]>/g, ']]&gt;');
        
        return content;
    }

    private static generateFolderXml(folder: ProjectFolder, indent: string = ''): string {
        let xml = '';
        const indentStr = indent;

        // 添加文件夹标签
        xml += `${indentStr}<folder name="${escapeXml(folder.name)}">\n`;

        // 添加文件
        if (folder.files && folder.files.length > 0) {
            folder.files.forEach(file => {
                xml += `${indentStr}  <file name="${escapeXml(file.name)}" path="${escapeXml(file.path)}" />\n`;
            });
        }

        // 递归处理子文件夹
        if (folder.folders && folder.folders.length > 0) {
            folder.folders.forEach(subFolder => {
                xml += this.generateFolderXml(subFolder, indentStr + '  ');
            });
        }

        xml += `${indentStr}</folder>\n`;
        return xml;
    }

    private static generateFilesXml(files: ProjectFile[], indent: string = ''): string {
        let xml = '';
        const indentStr = indent;

        xml += `${indentStr}<files>\n`;
        files.forEach(file => {
            xml += `${indentStr}  <file name="${escapeXml(file.name)}" path="${escapeXml(file.path)}">\n`;
            if (file.summary) {
                const cleanedSummary = this.cleanCdata(file.summary);
                xml += `${indentStr}    <summary><![CDATA[${cleanedSummary}]]></summary>\n`;
            }
            // 始终添加 content 标签，即使内容为空
            const cleanedContent = this.cleanCdata(file.content || '');
            xml += `${indentStr}    <content><![CDATA[${cleanedContent}]]></content>\n`;
            xml += `${indentStr}  </file>\n`;
        });
        xml += `${indentStr}</files>\n`;

        return xml;
    }

    public static generateXml(result: ProcessingResult): string {
        let xml = '';
        const indent = ' '.repeat(this.INDENT_SIZE);

        // 先去重并处理文件夹结构
        if (result.structure && result.structure.length > 0) {
            // 收集并更新所有文件路径
            const pathMap = new Map<string, string>();
            result.structure.forEach(folder => {
                this.collectFilePaths(folder, '', pathMap);
            });
            
            // 更新 result.files 中的文件路径
            if (result.files) {
                result.files.forEach(file => {
                    const fileName = file.name;
                    // 在结构中查找文件的完整路径
                    const findFilePath = (folders: ProjectFolder[]): string | undefined => {
                        for (const folder of folders) {
                            if (folder.files?.some(f => f.name === fileName)) {
                                return `${folder.path}/${fileName}`;
                            }
                            if (folder.folders) {
                                const path = findFilePath(folder.folders);
                                if (path) return path;
                            }
                        }
                        return undefined;
                    };
                    
                    const newPath = findFilePath(result.structure);
                    if (newPath) {
                        file.path = newPath;
                    }
                });
            }

            // 去重处理
            result.structure = this.deduplicateStructure(result.structure);
        }

        // 添加项目标签
        if (result.chunkInfo) {
            xml += `<project chunk="${result.chunkInfo.current}/${result.chunkInfo.total}">\n`;
        } else {
            xml += '<project>\n';
        }

        // 添加提示信息
        if (result.prompt) {
            const cleanPrompt = this.cleanCdata(result.prompt);
            xml += `${indent}<prompt><![CDATA[\n`;
            cleanPrompt.split('\n').forEach(line => {
                xml += `${indent}${indent}${line}\n`;
            });
            xml += `${indent}]]></prompt>\n`;
        }

        // 添加文件夹结构
        if (result.structure && result.structure.length > 0) {
            xml += `${indent}<structure>\n`;
            result.structure.forEach(folder => {
                xml += this.generateFolderXml(folder, indent + indent);
            });
            xml += `${indent}</structure>\n`;
        }

        // 添加文件列表
        if (result.files && result.files.length > 0) {
            xml += this.generateFilesXml(result.files, indent);
        }

        xml += '</project>\n';
        return xml;
    }

    private static collectFilePaths(folder: ProjectFolder, parentPath: string, pathMap: Map<string, string>): void {
        const currentPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
        
        // 更新当前文件夹的路径
        folder.path = currentPath;
        
        // 收集当前文件夹中的文件路径
        if (folder.files) {
            folder.files.forEach(file => {
                const fullPath = `${currentPath}/${file.name}`;
                // 只在路径不存在时更新
                if (!pathMap.has(file.path)) {
                    pathMap.set(file.path, fullPath);
                    file.path = fullPath;
                }
            });
        }
        
        // 递归处理子文件夹，避免重复处理相同路径的文件夹
        if (folder.folders) {
            const processedPaths = new Set<string>();
            folder.folders = folder.folders.filter(subFolder => {
                const subPath = `${currentPath}/${subFolder.name}`;
                if (processedPaths.has(subPath)) {
                    return false;
                }
                processedPaths.add(subPath);
                // 更新子文件夹的路径
                subFolder.path = subPath;
                this.collectFilePaths(subFolder, currentPath, pathMap);
                return true;
            });
        }
    }

    private static generateFileXml(file: ProjectFile, indent: string): string {
        let xml = `${indent}<file name="${file.name}" path="${file.path}">\n`;
        
        // 添加摘要
        if (file.summary) {
            const cleanSummary = this.cleanCdata(file.summary);
            xml += `${indent}${indent}<summary><![CDATA[${cleanSummary}]]></summary>\n`;
        }

        // 添加内容
        const cleanContent = this.cleanCdata(file.content || '');
        xml += `${indent}${indent}<content><![CDATA[${cleanContent}]]></content>\n`;
        
        xml += `${indent}</file>\n`;
        return xml;
    }

    private static getChunkAttribute(chunkInfo?: { current: number; total: number }): string {
        if (!chunkInfo) return '';
        return ` chunk="${chunkInfo.current}/${chunkInfo.total}"`;
    }
}
