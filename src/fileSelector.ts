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

        // 注册命令
        context.subscriptions.push(
            vscode.commands.registerCommand('repoprompt.selectAll', () => this.handleSelectAll()),
            vscode.commands.registerCommand('repoprompt.cancelFileSelection', () => this.handleCancel())
        );
    }

    // 开始选择流程
    public startSelection(): void {
        Logger.debug('开始选择流程');
        this.isSelecting = true;
    }

    // 结束选择流程
    private endSelection(): void {
        Logger.debug('结束选择流程');
        this.isSelecting = false;
    }

    public handleCancel() {
        Logger.debug('处理取消选择');
        this.selectedItems.clear();
        this.endSelection();
        this.treeDataProvider.refresh();
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
    }

    private async toggleDirectorySelection(item: FileItem, selected: boolean) {
        const itemPath = item.uri.fsPath;
        Logger.debug(`切换目录选择状态: ${itemPath}, selected: ${selected}`);
        if (selected) {
            this.selectedItems.add(itemPath);
        } else {
            this.selectedItems.delete(itemPath);
        }

        // 确保子项已加载
        if (!item.children) {
            item.children = await this.treeDataProvider.getChildren(item);
        }

        // 递归处理子项
        if (item.children) {
            for (const child of item.children) {
                if (child.type === vscode.FileType.Directory) {
                    await this.toggleDirectorySelection(child, selected);
                } else {
                    if (selected) {
                        this.selectedItems.add(child.uri.fsPath);
                    } else {
                        this.selectedItems.delete(child.uri.fsPath);
                    }
                }
            }
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

    // 处理全选
    private async handleSelectAll() {
        Logger.debug('执行全选操作');
        if (!this.isSelecting) {
            this.startSelection();
        }

        const root = this.treeDataProvider.getRoot();
        if (root) {
            await this.selectAllRecursively(root);
            this.treeDataProvider.refresh();
        }
    }

    // 递归选择所有项目
    private async selectAllRecursively(item: FileItem) {
        // 选择当前项
        this.selectedItems.add(item.uri.fsPath);

        // 如果是文件夹，递归处理子项
        if (item.type === vscode.FileType.Directory) {
            // 确保子项已加载
            if (!item.children) {
                item.children = await this.treeDataProvider.getChildren(item);
            }
            for (const child of item.children) {
                await this.selectAllRecursively(child);
            }
        }
    }

    public handleConfirm() {
        Logger.debug('处理确认选择');
        if (this.resolveCallback) {
            const selectedUris = Array.from(this.selectedItems).map(path => vscode.Uri.file(path));
            Logger.debug('确认选择，已选择的文件数量:', selectedUris.length);
            Logger.debug('已选择的文件路径:', selectedUris.map(uri => uri.fsPath));
            this.resolveCallback(selectedUris);
            this.resolveCallback = null;
        }
        this.endSelection();
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
        const isRoot = !element.parent; // 判断是否为根节点

        const treeItem = new vscode.TreeItem(
            element.name,
            element.type === vscode.FileType.Directory
                ? isRoot 
                    ? vscode.TreeItemCollapsibleState.Expanded  // 根目录默认展开
                    : vscode.TreeItemCollapsibleState.Collapsed // 其他目录默认折叠
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