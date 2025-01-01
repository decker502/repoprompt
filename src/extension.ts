import * as vscode from 'vscode';
import * as path from 'path';
import { FileProcessor } from './fileProcessor';
import { XmlGenerator } from './xmlGenerator';
import { ProcessingOptions, XmlChunk } from './types';
import { Config } from './config';

export async function activate(context: vscode.ExtensionContext) {
    const generateXmlCommand = vscode.commands.registerCommand('repoprompt.generateXml', async (uri: vscode.Uri) => {
        try {
            // 获取选中的文件或文件夹
            const uris = await getSelectedUris(uri);
            if (!uris.length) {
                throw new Error('请在资源管理器中选择文件或文件夹');
            }

            // 获取用户输入的提示语
            const prompt = await vscode.window.showInputBox({
                prompt: '请输入提示语（可选）',
                placeHolder: '请帮我分析这个项目的代码结构...'
            });

            // 处理文件
            const options = Config.getProcessingOptions();
            const processor = new FileProcessor(options);
            const result = await processor.processSelection(uris, prompt);

            // 生成XML
            const generator = new XmlGenerator(options);
            const xmlChunks = generator.generateXml(result.structure, result.files, prompt, result.rootPath);

            // 保存文件
            for (let i = 0; i < xmlChunks.length; i++) {
                const chunk = xmlChunks[i];
                const outputPath = getOutputPath(i, xmlChunks.length);
                await saveXmlFile(outputPath, chunk.content);

                // 显示进度
                vscode.window.showInformationMessage(
                    `已处理 ${chunk.filesProcessed}/${chunk.totalFiles} 个文件 (${chunk.chunkNumber}/${chunk.totalChunks})`
                );
            }

            // 复制到剪贴板
            if (Config.shouldCopyToClipboard() && xmlChunks.length === 1) {
                await vscode.env.clipboard.writeText(xmlChunks[0].content);
                vscode.window.showInformationMessage('XML内容已复制到剪贴板');
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`生成XML时出错: ${errorMessage}`);
        }
    });

    context.subscriptions.push(generateXmlCommand);
}

async function getSelectedUris(contextUri?: vscode.Uri): Promise<vscode.Uri[]> {
    // 1. 首先检查右键菜单上下文
    if (contextUri) {
        return [contextUri];
    }

    // 2. 显示目录选择对话框
    const selectedUris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: true,
        openLabel: '选择目录'
    });

    // 3. 返回用户选择的目录
    return selectedUris || [];
}

function getOutputPath(chunkIndex: number, totalChunks: number): string {
    const basePath = Config.getDefaultOutputPath();
    if (totalChunks === 1) {
        return basePath;
    }
    const ext = '.xml';
    const base = basePath.slice(0, -ext.length);
    return `${base}_${chunkIndex + 1}${ext}`;
}

async function saveXmlFile(filePath: string, content: string): Promise<void> {
    try {
        // 替换工作区变量
        if (vscode.workspace.workspaceFolders && filePath.includes('${workspaceFolder}')) {
            filePath = filePath.replace('${workspaceFolder}', vscode.workspace.workspaceFolders[0].uri.fsPath);
        }

        // 确保目标目录存在
        const uri = vscode.Uri.file(filePath);
        const directory = path.dirname(uri.fsPath);
        
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(directory));
        } catch (error) {
            console.log('Directory already exists or cannot be created:', error);
        }

        // 写入文件
        await vscode.workspace.fs.writeFile(
            uri,
            Buffer.from(content, 'utf8')
        );
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`无法保存文件 ${filePath}: ${errorMessage}`);
    }
}

export function deactivate() {}
