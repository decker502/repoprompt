# RepoPrompt

将项目结构及文件内容转换为适用于大语言模型的 XML 格式。

## 功能

- 支持在 VSCode 资源管理器中选择文件或文件夹
- 递归扫描项目结构
- 自动处理 .gitignore 规则
- 支持大文件分块输出
- 支持文件内容摘要生成
- 支持配置忽略规则
- 支持复制到剪贴板

## 使用方法

1. 在资源管理器中选择文件或文件夹
2. 右键选择 "生成项目结构 XML" 或使用快捷键 `Ctrl+Shift+X`
3. 输入可选的提示语
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

## 示例

```xml
<project>
  <prompt><![CDATA[
  请帮我分析这个项目的代码结构。
  ]]></prompt>
  <structure>
    <folder name="project">
      <folder name="src">
        <file name="file1.py" path="project/src/file1.py" />
        <file name="file2.txt" path="project/src/file2.txt" />
      </folder>
      <file name="README.md" path="project/README.md" />
    </folder>
  </structure>
  <files>
    <file path="project/src/file1.py">
      <summary><![CDATA[
      print("Hello, World!")
      ]]></summary>
      <content><![CDATA[
      print("Hello, World!")
      ]]></content>
    </file>
    <!-- 更多文件内容 -->
  </files>
</project>
```

## 贡献

欢迎提交 issue 和 pull request：
https://github.com/你的用户名/repoprompt

## 许可证

MIT
