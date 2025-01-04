# RepoPrompt

将项目结构及文件内容转换为适用于大语言模型的 XML 格式。

## 安装

1. **通过 VSCode 插件市场安装**：
   - 打开 VSCode
   - 点击左侧扩展图标或按 `Ctrl+Shift+X`
   - 搜索 "RepoPrompt"
   - 点击安装

2. **通过 VSIX 文件安装**：
   - 下载最新的 .vsix 文件
   - 在 VSCode 中，选择 "从 VSIX 安装..."
   - 选择下载的 .vsix 文件

## 功能

- 支持在 VSCode 资源管理器中选择文件或文件夹
- 递归扫描项目结构，保持原始层级关系
- 自动处理 .gitignore 规则
- 支持大文件分块输出
- 支持文件内容摘要生成（自动提取文件前 5 行作为摘要）
- 支持配置忽略规则（支持 glob 模式）
- 支持复制到剪贴板
- 智能处理特殊情况：
  - 自动去除重复的文件夹结构
  - 自动移除空文件夹
  - 正确处理同名文件和文件夹
  - 安全处理 CDATA 内容和特殊字符
  - 保持一致的缩进格式（2 空格缩进）

## 使用方法

1. 在资源管理器中选择文件或文件夹
2. 右键选择 "生成项目结构 XML" 或使用快捷键 `Ctrl+Shift+X`
3. 输入可选的提示语（支持多行文本）
4. XML 文件将生成在配置的输出路径中

## 配置项

在 `.vscode/settings.json` 中可以配置以下选项：

```json
{
  "repoprompt.maxFileSize": 1048576, // 最大文件大小（字节），默认 1MB
  "repoprompt.rootTag": "project", // XML 根标签名称
  "repoprompt.includeComments": true, // 是否包含注释内容
  "repoprompt.ignorePatterns": [ // 要忽略的文件和文件夹模式
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    "*.log"
  ],
  "repoprompt.includeContent": true, // 是否包含文件内容
  "repoprompt.chunkSize": 1048576, // 分块大小（字节），默认 1MB
  "repoprompt.outputPath": "${workspaceFolder}/project.xml", // 输出文件路径
  "repoprompt.copyToClipboard": true // 是否自动复制到剪贴板
}
```

## 输出格式

生成的 XML 文件包含三个主要部分：

1. **提示语部分**：用户提供的初始提示语
```xml
<prompt><![CDATA[
请帮我分析这个项目的代码结构。
]]></prompt>
```

2. **项目结构部分**：展示文件和文件夹的层级关系
```xml
<structure>
  <folder name="project">
    <folder name="src">
      <file name="file1.py" path="project/src/file1.py" />
      <file name="file2.txt" path="project/src/file2.txt" />
    </folder>
    <file name="README.md" path="project/README.md" />
  </folder>
</structure>
```

3. **文件内容部分**：包含文件的摘要和完整内容
```xml
<files>
  <file name="file1.py" path="project/src/file1.py">
    <summary><![CDATA[
    print("Hello, World!")
    ]]></summary>
    <content><![CDATA[
    print("Hello, World!")
    ]]></content>
  </file>
</files>
```

## 特殊情况处理

1. **大文件处理**：
   - 超过配置的大小阈值的文件只包含摘要，不包含完整内容
   - 支持将大型项目拆分为多个 XML 文件，每个文件包含部分内容

2. **路径处理**：
   - 使用相对路径，避免暴露本地系统信息
   - 自动处理路径分隔符，确保跨平台兼容

3. **内容处理**：
   - 自动处理 CDATA 标记，避免 XML 解析错误
   - 正确处理特殊字符和空内容
   - 保持文件内容的原始格式

## 贡献

欢迎提交 issue 和 pull request：
https://github.com/decker502/repoprompt

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
