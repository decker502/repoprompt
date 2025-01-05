import * as vscode from 'vscode';
import * as path from 'path';
import { FileProcessor } from './fileProcessor';
import { XmlGenerator } from './xmlGenerator';
import { Config } from './config';
import { Logger } from './logger';
import { FileSelector, FileItem } from './fileSelector';

// 声明为模块级变量
let fileSelector: FileSelector;

export async function activate(context: vscode.ExtensionContext) {
    try {
        // 初始化日志工具
        Logger.initialize();
        Logger.clear(); // 清除之前的日志
        Logger.info('=== RepoPrompt 插件启动 ===');
        Logger.info(`VSCode 版本: ${vscode.version}`);
        Logger.info(`工作区路径: ${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '未打开工作区'}`);

        // 创建文件选择器实例
        fileSelector = new FileSelector(context);
        Logger.debug('文件选择器已创建');

        // 注册刷新命令
        const refreshCommand = vscode.commands.registerCommand('repoprompt.refreshSelection', () => {
            Logger.debug('执行刷新命令');
            if (fileSelector) {
                fileSelector.refresh();
            }
        });

        const generateXmlCommand = vscode.commands.registerCommand('repoprompt.generateXml', async (contextUri?: vscode.Uri) => {
            try {
                Logger.debug('开始执行 generateXml 命令');
                let uris: vscode.Uri[] = [];
                
                // 如果是从右键菜单触发
                if (contextUri) {
                    uris = [contextUri];
                    Logger.debug('使用右键菜单选择的文件:', uris);
                } else {
                    // 使用文件选择器
                    Logger.debug('检查已选择的文件');
                    if (!fileSelector) {
                        Logger.error('文件选择器未初始化');
                        return;
                    }
                    
                    // 获取已选择的文件
                    const selectedUris = Array.from(fileSelector.getSelectedItems()).map(path => vscode.Uri.file(path));
                    Logger.debug('已选择的文件数量:', selectedUris.length);
                    
                    if (selectedUris.length === 0) {
                        Logger.info('未选择任何文件');
                        vscode.window.showInformationMessage('请先在 RepoPrompt 视图中选择文件或目录');
                        fileSelector.startSelection();
                        return;
                    }
                    
                    uris = selectedUris;
                    Logger.debug('使用已选择的文件:', uris);
                }

                // 调用 handleConfirm 来处理选择确认
                fileSelector.handleConfirm();

                // 获取用户输入的提示语
                const prompt = await vscode.window.showInputBox({
                    prompt: '请输入提示语（可选）',
                    placeHolder: '请帮我分析这个项目的代码结构...'
                });
                Logger.debug('用户输入的提示语:', prompt);

                // 处理文件
                const options = Config.getProcessingOptions();
                Logger.debug('处理选项:', options);
                
                const processor = new FileProcessor(options);
                Logger.info(`开始处理 ${uris.length} 个文件/文件夹`);
                Logger.debug('已选择的文件:', uris);
                const result = await processor.processSelection(uris, prompt);
                Logger.debug('处理结果:', {
                    structureCount: result.structure.length,
                    filesCount: result.files.length,
                    prompt: result.prompt
                });

                // 生成XML
                const xmlContent = XmlGenerator.generateXml(result);
                const outputPath = getOutputPath(0, 1);
                Logger.debug('输出路径:', outputPath);
                
                await saveXmlFile(outputPath, xmlContent);
                Logger.info(`已保存 XML 文件到: ${outputPath}`);

                // 显示完成信息
                vscode.window.showInformationMessage(
                    `已处理 ${result.files.length} 个文件`
                );

                // 复制到剪贴板
                if (Config.shouldCopyToClipboard()) {
                    await vscode.env.clipboard.writeText(xmlContent);
                    Logger.info('已复制 XML 内容到剪贴板');
                    vscode.window.showInformationMessage('XML内容已复制到剪贴板');
                }

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                Logger.error('生成 XML 时出错:', error);
                vscode.window.showErrorMessage(`生成XML时出错: ${errorMessage}`);
            }
        });

        // 注册切换选择状态的命令
        const toggleSelectionCommand = vscode.commands.registerCommand('repoprompt.toggleSelection', (item: FileItem) => {
            Logger.debug('切换选择状态:', item.uri.fsPath);
            fileSelector.toggleSelection(item);
        });

        // 注册所有命令到context.subscriptions
        context.subscriptions.push(
            refreshCommand,
            generateXmlCommand,
            toggleSelectionCommand
        );

        Logger.info('命令注册完成');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error('插件激活失败:', error);
        vscode.window.showErrorMessage(`插件激活失败: ${errorMessage}`);
    }
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
            Logger.error('创建目录失败:', error);
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
