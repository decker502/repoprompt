**需求描述：**

请开发一个 VSCode 插件，功能是将用户选中的文件及其所在的项目结构智能整合成一个单一文件，并以适用于大语言模型（如 GPT 等）的 XML 格式输出。插件应具备以下特性：

1. **项目结构与文件整合：**
   - 支持在 VSCode 资源管理器中多选文件或文件夹。
   - 递归扫描选中的文件夹，获取其完整的项目结构（包括子文件夹和文件）。
   - 将项目结构和文件内容分别整合到 XML 文件中，项目结构作为独立结点，文件内容单独列出。
   - 支持通过 `.vscode/settings.json` 配置文件设置默认行为（如根标签名称、是否包含文件路径、是否递归扫描、文件大小阈值等）。
   - 如果项目包含.gitignore 文件，插件应自动忽略其中指定的文件和文件夹。
   - 如果配置文件中设置了忽略模式，插件应深刻理解配置规则，如果是需要匹配多级目录或递归目录，也应该能够正确处理。
   - 在多选时，要能处理多种情况，如：
     - 整合时，要保持文件夹和文件的原始层级结构。不要增加虚拟或额外的文件夹。
     - 选中多个文件：将这些文件整合到一个 XML 文件中。
     - 选中一个文件夹：将文件夹下的所有内容整合到一个 XML 文件中。
     - 选中多个文件夹：将这些文件夹下的所有内容整合到一个 XML 文件中。
     - 选中文件夹和文件：将文件夹下的所有内容和选中的文件整合到一个 XML 文件中。

2. **XML 格式内容生成：**
   - 使用 `<structure>` 标签表示项目结构，文件夹用 `<folder>` 标签表示，文件用 `<file>` 标签表示。
   - 每个文件夹和文件标签中包含 `name` 属性表示名称，文件标签中包含 `path` 属性表示完整路径。
   - 使用 `<files>` 标签列出所有文件内容，每个文件内容用 `<file>` 标签包裹，并使用 `<![CDATA[]]>` 确保内容兼容 XML 规范。
   - 在 XML 文件中添加根标签（如 `<project>`），包裹整个项目结构和文件内容。
   - **包含用户提供的初始提示语**：在 XML 文件的根标签内添加 `<prompt>` 标签，将用户提供的初始提示语包含其中。

3. **处理大型项目上下文超长问题：**
   - 支持分块输出：当文件内容或项目结构过大时，将输出拆分为多个 XML 文件，每个文件包含部分内容，并在元数据中标注分块信息（如 `chunk="1/3"`）。
   - 提供上下文摘要功能：为每个文件生成简短的摘要（如文件的前几行或关键内容），并将其包含在 `<summary>` 标签中，便于快速了解文件内容。
   - 支持忽略大文件：允许用户设置文件大小阈值（如 1MB），超过阈值的文件仅包含路径和摘要，不包含完整内容。

4. **内容格式化：**
   - 自动处理特殊字符（如 `<`, `>`, `&`）以符合 XML 规范。
   - 可选去除多余的空行、注释或特定标记。

5. **输出配置：**
   - 允许用户指定输出文件的路径和名称。
   - 支持将整合后的内容直接复制到剪贴板，方便快速粘贴。

6. **用户交互：**
   - 提供简单的右键菜单选项或命令面板操作，便于用户快速调用功能。
   - 支持快捷键绑定。

7. **扩展性：**
   - 提供配置文件（如 `settings.json`），允许用户自定义默认行为（如根标签名称、是否包含文件路径、是否递归扫描、文件大小阈值等）。

**示例场景：**
用户选中了一个包含以下结构的文件夹，并提供了初始提示语：“请帮我分析这个项目的代码结构。”：
```
project/
├── src/
│   ├── file1.py
│   └── file2.txt
└── README.md
```

插件生成一个 `project.xml` 文件，内容如下：
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
    <file path="project/src/file2.txt">
      <summary><![CDATA[
      This is a text file.
      ]]></summary>
      <content><![CDATA[
      This is a text file.
      ]]></content>
    </file>
    <file path="project/README.md">
      <summary><![CDATA[
      # Project README
      ]]></summary>
      <content><![CDATA[
      # Project README
      This is a sample project.
      ]]></content>
    </file>
  </files>
</project>
```

**分块输出示例：**
当项目过大时，插件生成多个文件，如 `project_part1.xml` 和 `project_part2.xml`，并在每个文件中标注分块信息：
```xml
<project chunk="1/2">
  <prompt><![CDATA[
  请帮我分析这个项目的代码结构。
  ]]></prompt>
  <!-- 部分内容 -->
</project>
```

**技术要求：**
- 使用 TypeScript 开发，遵循 VSCode 插件开发规范。
- 确保代码简洁、可维护，并提供必要的注释。

**交付物：**
- 完整的插件代码。
- 简要的安装和使用说明。

