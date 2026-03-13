# codex-skill-yuque-notes

`codex-skill-yuque-notes` 是一个面向 Codex 的公开 skill 仓库，用来把语雀笔记工作流接入到本地 Yuque MCP 服务。

这个仓库包含两部分：

- `skill/`：可安装到 `~/.codex/skills/yuque-notes` 的 skill 本体
- `config/` + `scripts/`：用于安装 skill、生成 MCP 配置片段的模板和脚本

## 能力范围

- 记录或覆盖笔记
- 向已有笔记追加内容
- 按标题或正文搜索笔记
- 读取知识库目录结构
- 按规则给出整理建议
- 校验本地 Yuque MCP 项目是否可用

## 仓库结构

```text
.
|-- config/
|   `-- install.example.json
|-- scripts/
|   |-- install_skill.ps1
|   |-- install_skill.py
|   `-- render_mcp_config.py
|-- skill/
|   |-- SKILL.md
|   |-- agents/openai.yaml
|   |-- references/
|   |   |-- mcp-setup.md
|   |   `-- operations.md
|   `-- scripts/
|       |-- check_local_project.py
|       `-- print_mcp_config.py
|-- .gitignore
`-- LICENSE
```

## 前置要求

- 已安装 Python 3.10 或更高版本
- 已有一个可运行的本地 Yuque MCP 项目
- 该本地项目至少包含：
  - `pyproject.toml`
  - `.env.example`
  - `yuque_mcp/server.py`

## 安装 skill

1. 复制配置模板。

```powershell
Copy-Item .\config\install.example.json .\config\install.local.json
```

2. 编辑 `config/install.local.json`。

至少确认这些字段：

- `skill.name`
- `codex.codex_home`
- `mcp.project_root`
- `mcp.env.DEFAULT_API_TOKEN`
- `mcp.env.DEFAULT_GROUP_LOGIN`
- `mcp.env.DEFAULT_BOOK_SLUG`

3. 安装 skill。

Python 方式：

```powershell
python .\scripts\install_skill.py --config .\config\install.local.json
```

PowerShell 方式：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_skill.ps1 -ConfigPath .\config\install.local.json
```

安装完成后，skill 会被复制到：

```text
%USERPROFILE%\.codex\skills\yuque-notes
```

如果你设置了 `CODEX_HOME` 或在配置里改了 `codex_home`，目标目录会随之变化。

## 生成 MCP 配置

执行：

```powershell
python .\scripts\render_mcp_config.py --config .\config\install.local.json
```

脚本会输出一个可直接粘贴到 Codex MCP 配置里的 `mcpServers` JSON 片段。

如果本地 Yuque MCP 项目目录里已经有 `.env`，脚本会优先读取其中的值；没有时会回退到 `install.local.json` 里的占位值。

## 校验本地 Yuque MCP 项目

执行：

```powershell
python .\skill\scripts\check_local_project.py --project-root <your-yuque-mcp-project>
```

如果返回里的 `is_ready` 为 `true`，说明本地项目已经满足 skill 的基本接入条件。

## 发布到 GitHub

```powershell
git init -b main
git add .
git commit -m "Initial public release"
git remote add origin <your-github-repo-url>
git push -u origin main
```

发布前请确认没有提交以下内容：

- `config/install.local.json`
- 含真实 Token 的 `.env`
- 你的本地语雀项目源码副本

## 许可证

本仓库使用 [MIT License](LICENSE)。
