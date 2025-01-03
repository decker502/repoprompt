import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from './logger';

export interface FileItem {
    uri: vscode.Uri;
    type: vscode.FileType;
    name: string;
    isSelected: boolean;
    parent?: FileItem;
    children?: FileItem[];
}

export class FileSelector {
    private treeDataProvider: FileSelectorProvider;
    private treeView: vscode.TreeView<FileItem>;
    private selectedItems: Set<string> = new Set();
    private confirmButton: vscode.StatusBarItem;
    private cancelButton: vscode.StatusBarItem;
    private resolveCallback: ((value: vscode.Uri[]) => void) | null = null;
    private isSelecting: boolean = false;

    constructor(private context: vscode.ExtensionContext) {
        this.treeDataProvider = new FileSelectorProvider(this.selectedItems);
        this.treeView = vscode.window.createTreeView('repoPromptFileSelector', {
            treeDataProvider: this.treeDataProvider,
            canSelectMany: true,
            showCollapseAll: true
        });

        // 注册选择变化事件
        this.treeView.onDidChangeSelection(e => this.onSelectionChanged(e));

        // 创建状态栏按钮
        this.confirmButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.confirmButton.text = "$(check) 确认选择";
        this.confirmButton.tooltip = "确认当前的文件选择";
        this.confirmButton.command = 'repoprompt.confirmFileSelection';
        Logger.debug('创建确认按钮');

        this.cancelButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        this.cancelButton.text = "$(x) 取消选择";
        this.cancelButton.tooltip = "取消文件选择";
        this.cancelButton.command = 'repoprompt.cancelFileSelection';
        Logger.debug('创建取消按钮');

        // 将按钮添加到context.subscriptions
        context.subscriptions.push(
            this.confirmButton,
            this.cancelButton
        );
    }

    // 开始选择流程
    public startSelection(): void {
        Logger.debug('开始选择流程');
        this.isSelecting = true;
        this.showButtons();
    }

    // 结束选择流程
    private endSelection(): void {
        Logger.debug('结束选择流程');
        this.isSelecting = false;
        this.hideButtons();
    }

    public handleConfirm() {
        Logger.debug('处理确认选择');
        this.endSelection();
        const selectedUris = Array.from(this.selectedItems).map(path => vscode.Uri.file(path));
        Logger.debug('确认选择，已选择的文件数量:', selectedUris.length);
        Logger.debug('已选择的文件路径:', selectedUris.map(uri => uri.fsPath));
        vscode.commands.executeCommand('repoprompt.generateXml');
    }

    public handleCancel() {
        Logger.debug('处理取消选择');
        this.selectedItems.clear();
        this.endSelection();
        this.treeDataProvider.refresh();
    }

    private hideButtons() {
        Logger.debug('隐藏确认和取消按钮');
        try {
            this.confirmButton.hide();
            this.cancelButton.hide();
        } catch (error) {
            Logger.error('隐藏按钮时出错:', error);
        }
    }

    public showButtons(): void {
        if (!this.isSelecting) {
            return;
        }
        try {
            this.confirmButton.show();
            this.cancelButton.show();
            Logger.debug('显示确认和取消按钮');
        } catch (error) {
            Logger.error('显示按钮时出错:', error);
        }
    }

    // 切换选择状态
    public toggleSelection(item: FileItem): void {
        Logger.debug('切换选择状态:', item.uri.fsPath);
        if (!this.isSelecting) {
            this.startSelection();
        }
        
        if (item.type === vscode.FileType.Directory) {
            this.toggleDirectorySelection(item, !this.selectedItems.has(item.uri.fsPath));
        } else {
            this.toggleFileSelection(item);
        }
        Logger.debug('当前选择的文件数量:', this.selectedItems.size);
        this.treeDataProvider.refresh();
        this.showButtons();
    }

    // 获取已选择的文件
    public getSelectedItems(): Set<string> {
        return this.selectedItems;
    }

    // 显示文件选择器
    async show(): Promise<vscode.Uri[]> {
        Logger.debug('开始显示文件选择器');
        this.selectedItems.clear();
        await this.refresh();
        
        // 显示按钮
        try {
            this.confirmButton.show();
            this.cancelButton.show();
            Logger.debug('显示确认和取消按钮');
        } catch (error) {
            Logger.error('显示按钮时出错:', error);
        }
        
        // 获取根节点并展开
        const root = this.treeDataProvider.getRoot();
        if (root) {
            try {
                await this.treeView.reveal(root, { expand: 1, select: false });
            } catch (error) {
                Logger.error('展开树视图失败:', error);
            }
        }
        
        return new Promise((resolve) => {
            this.resolveCallback = resolve;
            // 确保按钮在Promise创建后仍然可见
            setImmediate(() => {
                try {
                    this.confirmButton.show();
                    this.cancelButton.show();
                    Logger.debug('再次确认按钮显示状态');
                } catch (error) {
                    Logger.error('再次显示按钮时出错:', error);
                }
            });
        });
    }

    // 刷新文件列表
    public async refresh(): Promise<void> {
        await this.treeDataProvider.refresh();
    }

    private onSelectionChanged(event: vscode.TreeViewSelectionChangeEvent<FileItem>) {
        Logger.debug('选择变化事件触发');
        event.selection.forEach(item => {
            this.toggleSelection(item);
        });
        // 在选择变化后显示按钮
        try {
            this.confirmButton.show();
            this.cancelButton.show();
            Logger.debug('显示确认和取消按钮（在选择变化后）');
        } catch (error) {
            Logger.error('显示按钮时出错:', error);
        }
    }

    private toggleDirectorySelection(item: FileItem, selected: boolean) {
        const itemPath = item.uri.fsPath;
        Logger.debug(`切换目录选择状态: ${itemPath}, selected: ${selected}`);
        if (selected) {
            this.selectedItems.add(itemPath);
        } else {
            this.selectedItems.delete(itemPath);
        }

        // 递归处理子项
        if (item.children) {
            item.children.forEach(child => {
                if (child.type === vscode.FileType.Directory) {
                    this.toggleDirectorySelection(child, selected);
                } else {
                    if (selected) {
                        this.selectedItems.add(child.uri.fsPath);
                    } else {
                        this.selectedItems.delete(child.uri.fsPath);
                    }
                }
            });
        }
    }

    private toggleFileSelection(item: FileItem) {
        const itemPath = item.uri.fsPath;
        if (this.selectedItems.has(itemPath)) {
            this.selectedItems.delete(itemPath);
        } else {
            this.selectedItems.add(itemPath);
        }
    }
}

class FileSelectorProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined> = new vscode.EventEmitter<FileItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined> = this._onDidChangeTreeData.event;

    private rootItems: FileItem[] = [];

    constructor(private selectedItems: Set<string>) {
        this.initialize();
    }

    private async initialize() {
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const rootItem: FileItem = {
                    uri: folder.uri,
                    type: vscode.FileType.Directory,
                    name: folder.name,
                    isSelected: false
                };
                this.rootItems.push(rootItem);
                await this.loadChildren(rootItem);
            }
        }
    }

    getRoot(): FileItem | undefined {
        return this.rootItems[0];
    }

    async refresh(): Promise<void> {
        this.rootItems = [];
        await this.initialize();
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: FileItem): vscode.TreeItem {
        const isSelected = this.selectedItems.has(element.uri.fsPath);
        const treeItem = new vscode.TreeItem(
            element.name,
            element.type === vscode.FileType.Directory
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None
        );

        treeItem.contextValue = element.type === vscode.FileType.Directory ? 'directory' : 'file';
        treeItem.iconPath = this.getIcon(element);
        treeItem.description = isSelected ? '✓' : '';
        
        // 添加工具提示
        treeItem.tooltip = new vscode.MarkdownString();
        treeItem.tooltip.appendMarkdown(`**${element.name}**\n\n`);
        treeItem.tooltip.appendMarkdown(`路径: ${element.uri.fsPath}\n`);
        treeItem.tooltip.appendMarkdown(`类型: ${element.type === vscode.FileType.Directory ? '文件夹' : '文件'}\n`);
        treeItem.tooltip.appendMarkdown(`状态: ${isSelected ? '已选择' : '未选择'}`);

        // 添加命令
        treeItem.command = {
            command: 'repoprompt.toggleSelection',
            title: '切换选择状态',
            arguments: [element]
        };
        
        return treeItem;
    }

    async getChildren(element?: FileItem): Promise<FileItem[]> {
        if (!element) {
            return this.rootItems;
        }

        if (!element.children) {
            await this.loadChildren(element);
        }

        return element.children || [];
    }

    private async loadChildren(item: FileItem): Promise<void> {
        try {
            const children = await vscode.workspace.fs.readDirectory(item.uri);
            item.children = await Promise.all(
                children
                    .filter(([name]) => !this.shouldIgnore(name))
                    .map(async ([name, type]) => {
                        const childUri = vscode.Uri.joinPath(item.uri, name);
                        const child: FileItem = {
                            uri: childUri,
                            type,
                            name,
                            isSelected: false,
                            parent: item
                        };
                        return child;
                    })
            );

            // 按类型和名称排序
            item.children.sort((a, b) => {
                if (a.type === b.type) {
                    return a.name.localeCompare(b.name);
                }
                return a.type === vscode.FileType.Directory ? -1 : 1;
            });
        } catch (error) {
            Logger.error(`加载目录内容失败: ${item.uri.fsPath}`, error);
            item.children = [];
        }
    }

    private shouldIgnore(name: string): boolean {
        // 忽略隐藏文件和一些特定目录
        return name.startsWith('.') || 
               name === 'node_modules' || 
               name === 'dist' || 
               name === 'out' ||
               name === 'build';
    }

    private getIcon(element: FileItem): vscode.ThemeIcon {
        if (element.type === vscode.FileType.Directory) {
            return new vscode.ThemeIcon('folder');
        }

        // 根据文件扩展名返回不同的图标
        const ext = path.extname(element.name).toLowerCase();
        switch (ext) {
            case '.ts':
            case '.js':
                return new vscode.ThemeIcon('symbol-method');
            case '.json':
                return new vscode.ThemeIcon('symbol-property');
            case '.md':
                return new vscode.ThemeIcon('markdown');
            case '.xml':
                return new vscode.ThemeIcon('code');
            default:
                return new vscode.ThemeIcon('file');
        }
    }

    async getParent(element: FileItem): Promise<FileItem | undefined> {
        return element.parent;
    }
} 