# RepoPrompt

将项目文件结构和内容导出为适用于大语言模型的 XML 格式。

## 功能特点

- 支持在 VSCode 资源管理器中多选文件或文件夹
- 递归扫描选中的文件夹，获取其完整的项目结构
- 将项目结构和文件内容分别整合到 XML 文件中
- 支持通过 `.vscode/settings.json` 配置文件设置默认行为
- 自动忽略 `.gitignore` 中指定的文件和文件夹
- 支持分块输出大型项目
- 提供文件内容摘要功能
- 支持将生成的 XML 内容直接复制到剪贴板
- 提供直观的文件选择界面
  - 支持全选和取消选择
  - 支持单个文件/文件夹的选择状态切换
  - 默认展开第一层目录树
- 提供生成进度展示
  - 显示进度条通知
  - 实时显示当前处理的文件名
  - 分阶段展示进度

## 使用方法

1. 在 VSCode 中打开项目
2. 点击左侧活动栏中的 RepoPrompt 图标
3. 在文件选择视图中选择需要导出的文件和文件夹
4. 点击生成 XML 按钮
5. 输入可选的提示语
6. 等待生成完成，XML 文件将自动保存并可选复制到剪贴板

## 配置选项

在 `.vscode/settings.json` 中可以配置以下选项：

```json
{
    "repoprompt.rootTagName": "project",
    "repoprompt.includeFilePath": true,
    "repoprompt.recursiveScan": true,
    "repoprompt.fileSizeThreshold": "1MB",
    "repoprompt.copyToClipboard": true,
    "repoprompt.ignorePatterns": [
        "node_modules/**",
        "dist/**",
        "*.log"
    ]
}
```

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)

## 许可证

MIT

## 开发指南

### 本地开发

1. 克隆仓库：
```bash
git clone https://github.com/decker502/repoprompt.git
cd repoprompt
```

2. 安装依赖：
```bash
npm install
```

3. 编译项目：
```bash
npm run compile
```

4. 在 VSCode 中调试：
   - 按 F5 启动调试
   - 在新窗口中测试插件功能

### 发布到插件市场

1. **准备工作**：
   - 安装 vsce：`npm install -g vsce`
   - 注册 [Azure DevOps](https://dev.azure.com/) 账号
   - 创建 Personal Access Token (PAT)
   - 创建发布者账号：`vsce create-publisher your-publisher-name`

2. **更新版本**：
   - 修改 `package.json` 中的版本号
   - 更新 CHANGELOG.md
   - 确保 `package.json` 包含所有必需字段：
     ```json
     {
         "name": "repoprompt",
         "displayName": "RepoPrompt",
         "description": "将项目结构转换为适用于大语言模型的 XML 格式",
         "version": "1.0.0",
         "publisher": "your-publisher-name",
         "repository": {
             "type": "git",
             "url": "https://github.com/decker502/repoprompt.git"
         },
         "bugs": {
             "url": "https://github.com/decker502/repoprompt/issues"
         }
     }
     ```

3. **打包插件**：
```bash
vsce package
```

如果遇到警告或错误：
- `repository field missing`：添加 repository 字段到 package.json
- `publisher field missing`：添加 publisher 字段并设置为你的发布者名称
- `icon missing`：添加 icon.png 文件（至少 128x128 像素）
- 使用 `vsce package --allow-missing-repository` 临时忽略 repository 警告

4. **发布插件**：
```bash
vsce publish
```

或者分步发布：
```bash
# 登录
vsce login your-publisher-name

# 发布
vsce publish [version]  # 例如：vsce publish 1.0.0
```

5. **更新插件**：
   - 修改代码后更新版本号
   - 重新打包和发布

### 发布注意事项

1. **必需文件**：
   - README.md：插件说明文档
   - CHANGELOG.md：版本更新记录
   - LICENSE：许可证文件
   - package.json：插件配置文件
   - icon.png：插件图标（至少 128x128 像素）

2. **package.json 配置**：
```json
{
    "name": "repoprompt",
    "displayName": "RepoPrompt",
    "description": "将项目结构转换为适用于大语言模型的 XML 格式",
    "version": "1.0.0",
    "publisher": "your-publisher-name",
    "engines": {
        "vscode": "^1.60.0"
    },
    "categories": [
        "Other"
    ],
    "repository": {
        "type": "git",
        "url": "https://github.com/decker502/repoprompt.git"
    },
    "bugs": {
        "url": "https://github.com/decker502/repoprompt/issues"
    }
}
```

3. **市场展示**：
   - 提供清晰的功能描述
   - 添加使用示例和截图
   - 列出主要特性
   - 包含详细的配置说明

4. **质量要求**：
   - 确保代码经过完整测试
   - 提供详细的错误处理
   - 遵循 VSCode 扩展开发指南
   - 响应用户反馈和问题
