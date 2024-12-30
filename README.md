# RepoPrompt

RepoPrompt 是一个 VSCode 插件，用于将项目结构和文件内容智能整合成适用于大语言模型（如 GPT）的 XML 格式。

## 功能特点

1. **项目结构与文件整合**
   - 支持在 VSCode 资源管理器中选择单个或多个文件/文件夹
   - 递归扫描选中的文件夹，获取完整的项目结构
   - 将项目结构和文件内容整合到 XML 文件中

2. **智能内容处理**
   - 自动生成文件内容摘要
   - 支持大文件处理（超过配置大小的文件只保留摘要）
   - 自动分块处理超大项目（自动拆分为多个 XML 文件）

3. **灵活的配置选项**
   - 可配置忽略的文件和文件夹模式
   - 可自定义 XML 根标签
   - 可设置最大文件大小限制
   - 可控制是否包含注释

## 使用方法

1. 在 VS Code 资源管理器中右键点击文件或文件夹
2. 选择 "Repo Prompt For LLMs" 选项
3. 输入可选的提示语（将包含在生成的 XML 中）
4. XML 文件将生成在选中的文件/文件夹所在目录中

## 配置选项

此扩展提供以下设置：

* `repoprompt.maxFileSize`: 文件大小限制（字节），默认 1MB
* `repoprompt.rootTag`: XML 根标签名称，默认 "project"
* `repoprompt.includeComments`: 是否包含注释，默认 true
* `repoprompt.ignorePatterns`: 要忽略的文件模式，默认包含：
  ```json
  [
    "node_modules/**",
    ".git/**",
    "dist/**",
    ".vscode/**"
  ]
  ```

## 输出格式

生成的 XML 文件结构如下：

```xml
<project>
  <prompt><![CDATA[
  用户输入的提示语（如有）
  ]]></prompt>
  <structure>
    <folder name="root">
      <folder name="src">
        <file name="example.ts" path="src/example.ts" />
      </folder>
    </folder>
  </structure>
  <files>
    <file path="src/example.ts">
      <summary><![CDATA[
      文件内容摘要...
      ]]></summary>
      <content><![CDATA[
      完整的文件内容...
      ]]></content>
    </file>
  </files>
</project>
```

## 特性

- 使用相对路径，便于项目迁移
- 支持 CDATA 包装，确保内容兼容性
- 智能分块处理大型项目
- 可配置的文件忽略规则
- 自动生成文件摘要

## 要求

- VS Code 1.80.0 或更高版本

## 已知问题

暂无已知问题。如果您发现任何问题，请在 GitHub 仓库中提交 issue。

## 发布说明

### 0.1.0

- 初始版本发布
- 支持基本的项目结构和文件内容导出
- 支持文件忽略配置
- 支持大文件处理和自动分块

---

**享受使用！**
