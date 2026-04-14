# JSON Path Finder

## 项目简介
JSON Path Finder 是一个纯前端静态工具，用来在浏览器中解析、格式化并可视化查看 JSON 数据。当前仓库同时提供普通 HTML 页面版和 Chrome 扩展版，适合调试接口返回、梳理嵌套结构、确认字段访问路径。

## 核心功能
- 解析并美化 JSON，展示层级结构
- 压缩 JSON，便于快速切换查看格式化前后内容
- 生成全部路径列表，支持按路径、值、类型搜索
- 展示可展开/折叠的树形视图
- 点击节点查看当前路径、JSONPath、值和类型
- 生成 JavaScript、Python、Java、Go、PHP、C#、Rust 的推荐写法代码示例
- 支持复制路径、复制代码、复制全部路径
- 支持主题切换
- 页面版支持拖拽 `.json` 文件到输入区解析
- 扩展版通过 Chrome side panel 提供同类 JSON 分析能力，并通过 `chrome.storage.local` 保存主题和最近输入

## 普通 HTML 页面版使用方式

### 通过本地 HTTP 服务打开
如果希望更稳定地使用复制、资源加载等功能，可以在项目目录启动一个静态文件服务后访问首页。

示例：
```bash
python3 -m http.server 8000
```

然后在浏览器访问：

```text
http://localhost:8000/
```

## GitHub Pages 部署说明
本项目的页面版是静态页面，可以直接部署到 GitHub Pages。

### 部署步骤
1. 将仓库推送到 GitHub
2. 进入仓库的 `Settings` -> `Pages`
3. 在 `Build and deployment` 中选择从分支部署
4. 选择 `main` 分支和根目录 `/`
5. 保存后等待 GitHub Pages 发布完成

发布后可通过类似下面的地址访问：

```text
https://<你的用户名>.github.io/Json_Path_Finder/
```

如果仓库名称发生变化，访问路径也会随之变化。

## Chrome 扩展版如何加载和使用
仓库当前已经包含独立的 Chrome 扩展目录：`/home/yuyan/dev/Json_Path_Finder/extension/`。

扩展根目录中包含以下文件：
- `manifest.json`
- `background.js`
- `sidepanel.html`
- `sidepanel.css`
- `sidepanel.js`

其中 `extension/manifest.json` 使用 Manifest V3，声明了：
- `permissions`: `sidePanel`、`storage`
- `side_panel.default_path`: `sidepanel.html`
- `action.default_title`: `打开 JSON Path Finder`

扩展的主要使用入口是 Chrome side panel。

### 加载方式
1. 打开 `chrome://extensions/`
2. 开启开发者模式
3. 点击“加载已解压的扩展程序”
4. 选择 `~/Json_Path_Finder/extension/` 目录
5. 安装后点击工具栏中的扩展按钮打开 side panel

### 主要功能
- 在 side panel 中输入、格式化、压缩、解析 JSON
- 查看路径列表并按路径、值、类型搜索，支持复制全部路径
- 查看树形视图并进行展开、折叠
- 查看路径详情，包括路径、JSONPath、值、类型
- 查看 JavaScript、Python、Java、Go、PHP、C#、Rust 推荐写法代码示例
- 切换主题
- 通过 `chrome.storage.local` 保存主题和最近输入

## 目录结构概览
当前项目主要结构如下：

```text
Json_Path_Finder/
├── index.html
├── assets/
│   ├── css/
│   │   └── styles.css
│   ├── icons/
│   │   └── ui-icons.svg
│   └── js/
│       ├── app.js
│       └── icons.js
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── sidepanel.html
│   ├── sidepanel.css
│   ├── sidepanel.js
│   └── icons/
└── cc-swarm/
```

说明：
- `index.html`：普通页面版入口
- `assets/`：页面版样式、脚本与图标资源
- `extension/`：Chrome 扩展目录
- `extension/manifest.json`：扩展清单文件
- `extension/background.js`：扩展后台脚本
- `extension/sidepanel.*`：扩展侧边栏页面、样式与交互逻辑
- `cc-swarm/`：当前会话任务记录目录，不属于页面或扩展运行必需资源

## 注意事项与已知限制
- 输入内容必须是合法 JSON，解析失败时页面或扩展会给出错误提示
- 多语言代码示例主要用于说明路径访问写法，不等于完整业务代码
- Go、C#、Rust、Java 等示例未逐一做编译级运行验证
- 不同浏览器在 `file://`、本地剪贴板权限、安全上下文等方面的限制可能不同
- Chrome 扩展目录、Manifest 结构、静态资源引用和 JavaScript 语法已做校验
- Chrome 扩展版尚未完成真实 Chrome 中“加载已解压的扩展程序”后的人工点击验证，因此当前 README 仅说明标准加载方式和现有目录结构，不宣称扩展已完成人工验证
