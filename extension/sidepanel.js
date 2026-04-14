const STORAGE_KEYS = {
    theme: 'extension-theme',
    json: 'extension-json-input'
};
const THEME_ORDER = ['system', 'dark', 'light'];
const LANGUAGES = ['javascript', 'python', 'java', 'go', 'php', 'csharp', 'rust'];
const SAMPLE_JSON = {
    status: 'success',
    data: {
        users: [
            { id: 1, name: '张三', profile: { city: '上海', skills: ['JavaScript', 'Go'] } },
            { id: 2, name: '李四', profile: { city: '杭州', skills: ['Python', 'Rust'] } }
        ],
        meta: { total: 2, requestId: 'req_demo_001' }
    }
};
let parsedData = null;
let allPaths = [];
let selectedPath = [];
let selectedValue;
let selectedTreeLine = null;
let currentLang = 'javascript';
let currentTheme = 'system';

/**
 * 返回常用 DOM 节点引用，避免在多个函数中重复查询。
 * @returns {Record<string, HTMLElement>} 侧边栏页面主要元素集合。
 */
function getElements() {
    return {
        jsonInput: document.getElementById('jsonInput'),
        pathList: document.getElementById('pathList'),
        treeView: document.getElementById('treeView'),
        pathSearch: document.getElementById('pathSearch'),
        pathCount: document.getElementById('pathCount'),
        currentPath: document.getElementById('currentPath'),
        currentJsonPath: document.getElementById('currentJsonPath'),
        currentType: document.getElementById('currentType'),
        currentValue: document.getElementById('currentValue'),
        codeRecommended: document.getElementById('codeRecommended'),
        codeResult: document.getElementById('codeResult'),
        statusText: document.getElementById('statusText'),
        toastContainer: document.getElementById('toastContainer'),
        themeToggleButton: document.getElementById('themeToggleButton')
    };
}

/**
 * 启动扩展侧边栏应用，并恢复主题与上次输入内容。
 * @returns {Promise<void>} 初始化完成后 resolve。
 */
async function initApp() {
    bindEvents();
    await restorePreferences();
    renderEmptyState();
    updateLanguageTabs();
    updateThemeButton();
}

/**
 * 绑定全部交互事件，让 HTML 保持声明式结构。
 * @returns {void} 该函数只注册监听器。
 */
function bindEvents() {
    bindPrimaryButtons();
    bindSearchAndLanguage();
    bindKeyboardAndInput();
}

/**
 * 绑定主操作按钮，集中管理解析和复制入口。
 * @returns {void} 该函数不会立即触发业务逻辑。
 */
function bindPrimaryButtons() {
    const el = getElements();
    document.getElementById('parseButton').addEventListener('click', parseAndRender);
    document.getElementById('formatButton').addEventListener('click', formatInput);
    document.getElementById('compressButton').addEventListener('click', compressInput);
    document.getElementById('copyInputButton').addEventListener('click', () => copyText(el.jsonInput.value, '已复制输入内容'));
    document.getElementById('loadSampleButton').addEventListener('click', loadSample);
    document.getElementById('clearButton').addEventListener('click', clearInput);
    document.getElementById('refreshPathsButton').addEventListener('click', () => extractAllPaths(true));
    document.getElementById('copyPathsButton').addEventListener('click', copyAllPaths);
    document.getElementById('expandButton').addEventListener('click', expandAll);
    document.getElementById('collapseButton').addEventListener('click', collapseAll);
    document.getElementById('copyPathButton').addEventListener('click', copyCurrentPath);
    document.getElementById('copyJsonPathButton').addEventListener('click', copyCurrentJsonPath);
    document.getElementById('copyCodeButton').addEventListener('click', copyCode);
    el.themeToggleButton.addEventListener('click', cycleTheme);
}

/**
 * 绑定搜索框与语言切换标签，保持筛选与代码示例联动。
 * @returns {void} 该函数只注册监听器。
 */
function bindSearchAndLanguage() {
    document.getElementById('pathSearch').addEventListener('input', filterPaths);
    document.querySelectorAll('.lang-tab').forEach((button) => {
        button.addEventListener('click', () => switchLanguage(button.dataset.lang));
    });
}

/**
 * 绑定快捷键、自动保存和粘贴后自动解析。
 * @returns {void} 该函数只注册输入相关事件。
 */
function bindKeyboardAndInput() {
    const input = document.getElementById('jsonInput');
    document.addEventListener('keydown', handleShortcutKeydown);
    input.addEventListener('input', handleInputChange);
    input.addEventListener('paste', () => setTimeout(parseIfValid, 60));
    input.addEventListener('keydown', handleTabIndent);
}

/**
 * 恢复主题和输入内容，保证扩展重开后状态连续。
 * @returns {Promise<void>} 所有持久化数据读取完成后 resolve。
 */
async function restorePreferences() {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.theme, STORAGE_KEYS.json]);
    currentTheme = stored[STORAGE_KEYS.theme] || 'system';
    applyTheme(currentTheme);
    document.getElementById('jsonInput').value = stored[STORAGE_KEYS.json] || '';
    if (document.getElementById('jsonInput').value.trim()) {
        parseIfValid();
    }
}

/**
 * 渲染页面初始空状态，避免首次打开时区域为空白。
 * @returns {void} 该函数会重置树、路径和详情区。
 */
function renderEmptyState() {
    getElements().treeView.innerHTML = createEmptyState('等待 JSON 数据');
    getElements().pathList.innerHTML = createEmptyState('解析后会在这里显示全部路径');
    resetSelectionDetails();
    setStatus('等待输入');
}

/**
 * 构造简单空状态 HTML，统一扩展内多个区域的占位文案。
 * @param {string} text 空状态文本。
 * @returns {string} 可直接注入容器的 HTML 字符串。
 */
function createEmptyState(text) {
    return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

/**
 * 处理输入变化，更新保存内容并做轻量校验提示。
 * @returns {Promise<void>} 本地保存完成后 resolve。
 */
async function handleInputChange() {
    const value = document.getElementById('jsonInput').value;
    await chrome.storage.local.set({ [STORAGE_KEYS.json]: value });
    setStatus(value.trim() ? '已输入，待解析' : '等待输入');
}

/**
 * 处理全局快捷键，方便在侧边栏中快速操作。
 * @param {KeyboardEvent} event 键盘事件对象。
 * @returns {void} 命中快捷键时会阻止默认行为。
 */
function handleShortcutKeydown(event) {
    if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        parseAndRender();
    }
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        formatInput();
    }
}

/**
 * 在输入框中支持 Tab 缩进，避免焦点直接跳走。
 * @param {KeyboardEvent} event 键盘事件对象。
 * @returns {void} 按下 Tab 时会插入两个空格。
 */
function handleTabIndent(event) {
    if (event.key !== 'Tab') {
        return;
    }
    event.preventDefault();
    insertTextAtSelection(event.currentTarget, '  ');
}

/**
 * 在当前光标或选区位置插入文本，保持编辑体验稳定。
 * @param {HTMLTextAreaElement} input 输入框元素。
 * @param {string} text 需要插入的文本。
 * @returns {void} 插入后会恢复新的光标位置。
 */
function insertTextAtSelection(input, text) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
    input.selectionStart = input.selectionEnd = start + text.length;
}

/**
 * 仅在输入是合法 JSON 时自动解析，避免粘贴后还要再点一次按钮。
 * @returns {void} 非法 JSON 时只更新状态，不报错。
 */
function parseIfValid() {
    const text = document.getElementById('jsonInput').value.trim();
    if (!text) {
        return;
    }
    try {
        JSON.parse(text);
        parseAndRender();
    } catch {
        setStatus('JSON 格式错误');
    }
}

/**
 * 解析输入 JSON，并同步树形视图、路径列表和详情区域。
 * @returns {void} 输入为空、解析失败或渲染失败时会展示对应提示。
 */
function parseAndRender() {
    const text = document.getElementById('jsonInput').value.trim();
    if (!text) {
        showToast('请输入 JSON 数据', 'error');
        setStatus('输入为空');
        return;
    }
    try {
        parsedData = parseJsonInput(text);
    } catch (error) {
        handleParseError(error);
        return;
    }
    try {
        syncParsedView(parsedData);
    } catch (error) {
        handleRenderError(error);
    }
}

/**
 * 仅负责把输入文本解析成 JSON，避免把 UI 异常误判为格式错误。
 * @param {string} text 输入框中的 JSON 文本。
 * @returns {unknown} 解析后的 JSON 数据。
 */
function parseJsonInput(text) {
    return JSON.parse(text);
}

/**
 * 把已解析数据同步到树、路径和详情区域。
 * @param {unknown} data 已通过 JSON.parse 的数据。
 * @returns {void} 视图刷新成功后会更新状态与提示。
 */
function syncParsedView(data) {
    extractAllPaths(false);
    renderTree(data);
    clearTreeSelection();
    resetSelectionDetails();
    setStatus('解析成功');
    showToast('JSON 已解析并同步视图');
}

/**
 * 处理 JSON 解析异常，并把错误信息展示到树区域。
 * @param {Error} error JSON.parse 抛出的异常对象。
 * @returns {void} 该函数会重置路径和详情显示。
 */
function handleParseError(error) {
    parsedData = null;
    allPaths = [];
    getElements().treeView.innerHTML = createEmptyState(`解析失败：${error.message}`);
    getElements().pathList.innerHTML = createEmptyState('请修正 JSON 后重新解析');
    getElements().pathCount.textContent = '0 条路径';
    resetSelectionDetails();
    setStatus('JSON 格式错误');
    showToast(`JSON 格式错误：${error.message}`, 'error');
}

/**
 * 处理树渲染或界面同步异常，并保留原始错误信息。
 * @param {Error} error 渲染树、绑定事件或更新界面时抛出的异常对象。
 * @returns {void} 该函数会清空当前结果并提示界面更新失败。
 */
function handleRenderError(error) {
    parsedData = null;
    allPaths = [];
    getElements().treeView.innerHTML = createEmptyState(`渲染失败：${error.message}`);
    getElements().pathList.innerHTML = createEmptyState('界面更新失败，请检查数据或稍后重试');
    getElements().pathCount.textContent = '0 条路径';
    resetSelectionDetails();
    setStatus('界面更新失败');
    showToast(`渲染失败：${error.message}`, 'error');
}

/**
 * 把输入内容格式化为多行缩进 JSON。
 * @returns {void} 成功后会直接更新输入框和存储内容。
 */
function formatInput() {
    transformInputJson((data) => JSON.stringify(data, null, 2), '已格式化');
}

/**
 * 把输入内容压缩成单行 JSON，方便复制或粘贴到接口工具。
 * @returns {void} 成功后会直接更新输入框和存储内容。
 */
function compressInput() {
    transformInputJson((data) => JSON.stringify(data), '已压缩');
}

/**
 * 统一执行输入 JSON 转换，减少格式化和压缩的重复逻辑。
 * @param {(value: unknown) => string} transformer JSON 转换函数。
 * @param {string} successMessage 成功提示文案。
 * @returns {void} 转换失败时只提示错误，不修改原值。
 */
function transformInputJson(transformer, successMessage) {
    try {
        const input = document.getElementById('jsonInput');
        input.value = transformer(JSON.parse(input.value));
        handleInputChange();
        showToast(successMessage);
    } catch {
        showToast('JSON 格式错误，无法处理', 'error');
    }
}

/**
 * 加载示例 JSON，并立即进入解析流程供用户体验侧边栏。
 * @returns {void} 该函数会覆盖当前输入内容。
 */
function loadSample() {
    document.getElementById('jsonInput').value = JSON.stringify(SAMPLE_JSON, null, 2);
    handleInputChange();
    parseAndRender();
}

/**
 * 清空输入、解析结果和当前选中状态，恢复初始界面。
 * @returns {Promise<void>} 存储更新完成后 resolve。
 */
async function clearInput() {
    document.getElementById('jsonInput').value = '';
    parsedData = null;
    allPaths = [];
    clearTreeSelection();
    await chrome.storage.local.set({ [STORAGE_KEYS.json]: '' });
    renderEmptyState();
    getElements().pathCount.textContent = '0 条路径';
    getElements().pathSearch.value = '';
    showToast('已清空');
}

/**
 * 渲染 JSON 树，采用适合侧边栏的单列缩进布局。
 * @param {unknown} data 已解析 JSON 数据。
 * @returns {void} 该函数会完全替换树容器内容。
 */
function renderTree(data) {
    const treeView = getElements().treeView;
    treeView.innerHTML = '';
    const fragment = document.createDocumentFragment();
    fragment.appendChild(createNodeElement(data, [], null, true, false));
    treeView.appendChild(fragment);
}

/**
 * 创建任意 JSON 节点元素，并按类型分发到对象、数组或基础值渲染。
 * @param {unknown} value 当前节点值。
 * @param {Array<string|number>} parentPath 父级路径数组。
 * @param {string|number|null} key 当前键名或索引。
 * @param {boolean} isRoot 当前节点是否根节点。
 * @param {boolean} hasComma 当前节点末尾是否需要逗号。
 * @returns {HTMLElement} 构建完成的节点元素。
 */
function createNodeElement(value, parentPath, key, isRoot, hasComma) {
    if (value && typeof value === 'object') {
        return Array.isArray(value)
            ? createArrayNode(value, parentPath, key, isRoot, hasComma)
            : createObjectNode(value, parentPath, key, isRoot, hasComma);
    }
    return createValueLine(value, parentPath, key, isRoot, hasComma);
}

/**
 * 创建对象节点，并为其子键递归生成树行。
 * @param {Record<string, unknown>} value 当前对象值。
 * @param {Array<string|number>} parentPath 父级路径数组。
 * @param {string|number|null} key 当前键名或索引。
 * @param {boolean} isRoot 当前节点是否根节点。
 * @param {boolean} hasComma 当前节点末尾是否需要逗号。
 * @returns {HTMLElement} 对象节点元素。
 */
function createObjectNode(value, parentPath, key, isRoot, hasComma) {
    const path = buildNodePath(parentPath, key, isRoot);
    const node = document.createElement('div');
    const children = document.createElement('div');
    node.className = 'tree-node';
    children.className = 'tree-children';
    node.appendChild(createContainerLine(path, value, key, isRoot, '{', `${Object.keys(value).length} keys`));
    Object.keys(value).forEach((childKey, index, keys) => children.appendChild(createNodeElement(value[childKey], path, childKey, false, index < keys.length - 1)));
    node.appendChild(children);
    node.appendChild(createBracketLine('}', hasComma));
    return node;
}

/**
 * 创建数组节点，并为其成员递归生成树行。
 * @param {Array<unknown>} value 当前数组值。
 * @param {Array<string|number>} parentPath 父级路径数组。
 * @param {string|number|null} key 当前键名或索引。
 * @param {boolean} isRoot 当前节点是否根节点。
 * @param {boolean} hasComma 当前节点末尾是否需要逗号。
 * @returns {HTMLElement} 数组节点元素。
 */
function createArrayNode(value, parentPath, key, isRoot, hasComma) {
    const path = buildNodePath(parentPath, key, isRoot);
    const node = document.createElement('div');
    const children = document.createElement('div');
    node.className = 'tree-node';
    children.className = 'tree-children';
    node.appendChild(createContainerLine(path, value, key, isRoot, '[', `${value.length} items`));
    value.forEach((item, index) => children.appendChild(createNodeElement(item, path, index, false, index < value.length - 1)));
    node.appendChild(children);
    node.appendChild(createBracketLine(']', hasComma));
    return node;
}

/**
 * 创建对象或数组的头部树行，并绑定点击选择与折叠交互。
 * @param {Array<string|number>} path 当前节点完整路径。
 * @param {unknown} value 当前节点值。
 * @param {string|number|null} key 当前键名或索引。
 * @param {boolean} isRoot 当前节点是否根节点。
 * @param {'{'|'['} bracket 容器起始括号。
 * @param {string} metaText 节点数量提示文本。
 * @returns {HTMLDivElement} 可点击树行元素。
 */
function createContainerLine(path, value, key, isRoot, bracket, metaText) {
    const line = document.createElement('div');
    line.className = 'tree-line';
    line.dataset.path = formatPath(path);
    line.innerHTML = `${buildKeyPrefix(key, isRoot, true)}<span class="tree-bracket">${bracket}</span><span class="tree-meta">${escapeHtml(metaText)}</span>`;
    line.addEventListener('click', () => selectPath(path, value, line));
    bindTreeToggle(line);
    return line;
}

/**
 * 为容器树行绑定折叠按钮事件，缺少按钮时直接跳过。
 * @param {HTMLDivElement} line 当前容器树行。
 * @returns {void} 该函数只在存在 `.tree-toggle` 时注册事件。
 */
function bindTreeToggle(line) {
    const toggle = line.querySelector('.tree-toggle');
    if (!toggle) {
        return;
    }
    toggle.addEventListener('click', (event) => toggleNode(event, line));
}

/**
 * 创建基础值树行，让叶子节点也能被选中和联动。
 * @param {unknown} value 当前节点值。
 * @param {Array<string|number>} parentPath 父级路径数组。
 * @param {string|number|null} key 当前键名或索引。
 * @param {boolean} isRoot 当前节点是否根节点。
 * @param {boolean} hasComma 当前节点末尾是否需要逗号。
 * @returns {HTMLDivElement} 叶子节点树行。
 */
function createValueLine(value, parentPath, key, isRoot, hasComma) {
    const path = buildNodePath(parentPath, key, isRoot);
    const line = document.createElement('div');
    line.className = 'tree-line';
    line.dataset.path = formatPath(path);
    line.innerHTML = `${buildKeyPrefix(key, isRoot, false)}${renderPrimitiveValue(value)}${renderComma(hasComma)}`;
    line.addEventListener('click', () => selectPath(path, value, line));
    return line;
}

/**
 * 创建闭合括号树行，让视觉结构更接近真实 JSON 排版。
 * @param {'}'|']'} bracket 闭合括号字符。
 * @param {boolean} hasComma 当前节点末尾是否需要逗号。
 * @returns {HTMLDivElement} 闭合括号树行。
 */
function createBracketLine(bracket, hasComma) {
    const line = document.createElement('div');
    line.className = 'tree-bracket-line';
    line.innerHTML = `<span class="tree-bracket">${bracket}</span>${renderComma(hasComma)}`;
    return line;
}

/**
 * 拼出树行键名前缀，兼顾对象键、数组索引和折叠按钮占位。
 * @param {string|number|null} key 当前键名或索引。
 * @param {boolean} isRoot 当前节点是否根节点。
 * @param {boolean} expandable 当前节点是否可折叠。
 * @returns {string} 树行前缀 HTML。
 */
function buildKeyPrefix(key, isRoot, expandable) {
    if (isRoot || key === null || key === undefined) {
        return '';
    }
    const toggle = expandable ? '<span class="tree-toggle expanded">▸</span>' : '<span class="tree-toggle"> </span>';
    return typeof key === 'number'
        ? `${toggle}<span class="tree-number">[${key}]</span><span class="tree-colon">:</span>`
        : `${toggle}<span class="tree-key">&quot;${escapeHtml(String(key))}&quot;</span><span class="tree-colon">:</span>`;
}

/**
 * 把值渲染为带颜色的 JSON 片段，便于侧边栏快速扫读。
 * @param {unknown} value 当前值。
 * @returns {string} 带样式类名的 HTML 文本。
 */
function renderPrimitiveValue(value) {
    if (value === null) return '<span class="tree-null">null</span>';
    if (typeof value === 'string') return `<span class="tree-string">&quot;${escapeHtml(value)}&quot;</span>`;
    if (typeof value === 'number') return `<span class="tree-number">${value}</span>`;
    if (typeof value === 'boolean') return `<span class="tree-boolean">${value}</span>`;
    return `<span>${escapeHtml(String(value))}</span>`;
}

/**
 * 在需要时为当前树行补上逗号，保持 JSON 视觉结构完整。
 * @param {boolean} hasComma 当前节点末尾是否需要逗号。
 * @returns {string} 逗号 HTML 或空字符串。
 */
function renderComma(hasComma) {
    return hasComma ? '<span class="tree-comma">,</span>' : '';
}

/**
 * 切换容器节点折叠状态，并阻止点击冒泡触发路径选中两次。
 * @param {MouseEvent} event 点击事件对象。
 * @param {HTMLElement} line 当前容器树行。
 * @returns {void} 缺少子容器或折叠按钮时会直接返回，避免异常中断渲染。
 */
function toggleNode(event, line) {
    event.stopPropagation();
    const node = line.parentElement;
    const children = node?.querySelector(':scope > .tree-children');
    const toggle = line.querySelector('.tree-toggle');
    if (!children || !toggle) {
        return;
    }
    children.classList.toggle('collapsed');
    toggle.classList.toggle('expanded');
}

/**
 * 计算节点完整路径，避免根节点和子节点拼接逻辑分散。
 * @param {Array<string|number>} parentPath 父级路径数组。
 * @param {string|number|null} key 当前键名或索引。
 * @param {boolean} isRoot 当前节点是否根节点。
 * @returns {Array<string|number>} 当前节点完整路径数组。
 */
function buildNodePath(parentPath, key, isRoot) {
    return isRoot || key === null || key === undefined ? [...parentPath] : [...parentPath, key];
}

/**
 * 提取全部路径并刷新路径列表，可在解析后或手动刷新时使用。
 * @param {boolean} showToastMessage 是否展示成功提示。
 * @returns {void} 未解析 JSON 时会给出错误提示。
 */
function extractAllPaths(showToastMessage) {
    if (parsedData === null) {
        showToast('请先解析 JSON', 'error');
        return;
    }
    allPaths = [];
    collectPaths(parsedData, []);
    renderPathList(allPaths);
    getElements().pathCount.textContent = `${allPaths.length} 条路径`;
    if (showToastMessage) {
        showToast(`已同步 ${allPaths.length} 条路径`);
    }
}

/**
 * 递归收集所有节点路径，让对象、数组和基础值都能进入列表。
 * @param {unknown} value 当前节点值。
 * @param {Array<string|number>} path 当前节点路径。
 * @returns {void} 结果写入全局 allPaths。
 */
function collectPaths(value, path) {
    allPaths.push({ path: [...path], type: getValueType(value), preview: getValuePreview(value) });
    if (!value || typeof value !== 'object') {
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => collectPaths(item, [...path, index]));
        return;
    }
    Object.keys(value).forEach((key) => collectPaths(value[key], [...path, key]));
}

/**
 * 渲染路径列表，并保留当前选中路径的高亮状态。
 * @param {Array<{path:Array<string|number>,type:string,preview:string}>} items 需要渲染的路径项。
 * @returns {void} 无结果时显示空状态。
 */
function renderPathList(items) {
    const pathList = getElements().pathList;
    pathList.innerHTML = '';
    if (!items.length) {
        pathList.innerHTML = createEmptyState('没有匹配路径');
        return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.appendChild(createPathItem(item)));
    pathList.appendChild(fragment);
    updatePathListHighlight();
}

/**
 * 创建单个路径列表按钮，并绑定到树和详情联动逻辑。
 * @param {{path:Array<string|number>,type:string,preview:string}} item 路径项数据。
 * @returns {HTMLButtonElement} 可点击路径按钮。
 */
function createPathItem(item) {
    const button = document.createElement('button');
    const pathText = formatPath(item.path);
    button.type = 'button';
    button.className = 'path-item';
    button.dataset.path = pathText;
    button.innerHTML = `<span class="path-type type-${item.type}">${item.type}</span><span class="path-text">${escapeHtml(pathText)}</span>`;
    button.addEventListener('click', () => selectPathFromList(item.path));
    return button;
}

/**
 * 依据搜索关键词过滤路径列表，支持路径、值预览和类型混合搜索。
 * @returns {void} 搜索为空时恢复全量路径列表。
 */
function filterPaths() {
    const keyword = getElements().pathSearch.value.trim().toLowerCase();
    const items = keyword ? allPaths.filter((item) => buildSearchText(item).includes(keyword)) : allPaths;
    renderPathList(items);
}

/**
 * 生成路径项的搜索文本，避免搜索逻辑散落在过滤函数中。
 * @param {{path:Array<string|number>,type:string,preview:string}} item 路径项数据。
 * @returns {string} 小写搜索文本。
 */
function buildSearchText(item) {
    return `${formatPath(item.path)} ${item.preview} ${item.type}`.toLowerCase();
}

/**
 * 从路径列表选中节点，并同步树的展开状态与滚动位置。
 * @param {Array<string|number>} path 目标路径数组。
 * @returns {void} 找不到树行时仍会更新详情信息。
 */
function selectPathFromList(path) {
    const value = getValueByPath(parsedData, path);
    const line = document.querySelector(`.tree-line[data-path="${cssEscape(formatPath(path))}"]`);
    selectPath(path, value, line || null);
    if (line) {
        expandAncestorNodes(line);
        line.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/**
 * 统一处理路径选中行为，并联动树、路径详情和代码示例。
 * @param {Array<string|number>} path 当前选中路径数组。
 * @param {unknown} value 当前路径对应值。
 * @param {HTMLElement|null} line 当前树行元素。
 * @returns {void} 该函数会更新多个展示区域。
 */
function selectPath(path, value, line) {
    clearTreeSelection();
    selectedPath = [...path];
    selectedValue = value;
    selectedTreeLine = line;
    if (line) {
        line.classList.add('active');
    }
    updateSelectionPanels();
}

/**
 * 清理当前树节点高亮状态，避免多个节点同时处于选中样式。
 * @returns {void} 该函数只重置树选中状态。
 */
function clearTreeSelection() {
    if (selectedTreeLine) {
        selectedTreeLine.classList.remove('active');
    }
    selectedTreeLine = null;
}

/**
 * 更新路径详情、JSONPath、值信息和代码示例区。
 * @returns {void} 未选择路径时会显示默认占位内容。
 */
function updateSelectionPanels() {
    if (!selectedPath.length && parsedData !== null) {
        selectedValue = parsedData;
    }
    getElements().currentPath.textContent = formatPath(selectedPath);
    getElements().currentJsonPath.textContent = formatJsonPath(selectedPath);
    getElements().currentType.textContent = getValueType(selectedValue);
    getElements().currentValue.textContent = getValuePreview(selectedValue);
    renderCodeExample();
    updatePathListHighlight();
}

/**
 * 恢复详情区占位内容，供首次进入、清空和报错后复用。
 * @returns {void} 该函数会重置详情和代码区域。
 */
function resetSelectionDetails() {
    selectedPath = [];
    selectedValue = undefined;
    getElements().currentPath.textContent = '未选择路径';
    getElements().currentJsonPath.textContent = '未选择路径';
    getElements().currentType.textContent = '-';
    getElements().currentValue.textContent = '-';
    getElements().codeRecommended.textContent = '选择路径后生成代码示例';
    getElements().codeResult.textContent = '结果示例会显示在这里';
    updatePathListHighlight();
}

/**
 * 更新路径列表高亮，让列表和树在选中状态上保持一致。
 * @returns {void} 未选中路径时会移除所有高亮。
 */
function updatePathListHighlight() {
    const currentPath = formatPath(selectedPath);
    document.querySelectorAll('.path-item').forEach((item) => {
        item.classList.toggle('active', !!selectedPath && item.dataset.path === currentPath);
    });
}

/**
 * 展开目标树行的所有祖先节点，确保从路径列表跳转时能看到目标节点。
 * @param {HTMLElement} line 目标树行元素。
 * @returns {void} 该函数只修改祖先节点折叠状态。
 */
function expandAncestorNodes(line) {
    let node = line.parentElement;
    while (node) {
        const container = node.closest('.tree-node');
        if (!container) {
            return;
        }
        const children = container.querySelector(':scope > .tree-children');
        const toggle = container.querySelector(':scope > .tree-line .tree-toggle');
        children.classList.remove('collapsed');
        toggle.classList.add('expanded');
        node = container.parentElement;
    }
}

/**
 * 复制全部路径和类型，便于导出或外部检索。
 * @returns {void} 没有路径时会给出错误提示。
 */
function copyAllPaths() {
    if (!allPaths.length) {
        showToast('当前没有可复制的路径', 'error');
        return;
    }
    const text = allPaths.map((item) => `${formatPath(item.path)} (${item.type})`).join('\n');
    copyText(text, `已复制 ${allPaths.length} 条路径`);
}

/**
 * 复制当前路径文本，未选择时给出明确提示。
 * @returns {void} 该函数依赖当前选中路径状态。
 */
function copyCurrentPath() {
    if (parsedData === null) {
        showToast('请先解析 JSON', 'error');
        return;
    }
    copyText(formatPath(selectedPath), '当前路径已复制');
}

/**
 * 复制当前 JSONPath 表达式，方便给脚本或测试工具直接使用。
 * @returns {void} 未解析 JSON 时会给出错误提示。
 */
function copyCurrentJsonPath() {
    if (parsedData === null) {
        showToast('请先解析 JSON', 'error');
        return;
    }
    copyText(formatJsonPath(selectedPath), 'JSONPath 已复制');
}

/**
 * 复制当前推荐代码示例，避免用户手动选中文本。
 * @returns {void} 代码区域为空时仍会复制当前文本内容。
 */
function copyCode() {
    copyText(getElements().codeRecommended.textContent, '代码已复制');
}

/**
 * 展开全部树节点，方便快速浏览大对象结构。
 * @returns {void} 该函数只修改已渲染节点样式。
 */
function expandAll() {
    document.querySelectorAll('.tree-children').forEach((node) => node.classList.remove('collapsed'));
    document.querySelectorAll('.tree-toggle').forEach((node) => node.classList.add('expanded'));
}

/**
 * 折叠全部树节点，便于在侧边栏窄空间中回到概要视图。
 * @returns {void} 该函数只修改已渲染节点样式。
 */
function collapseAll() {
    document.querySelectorAll('.tree-children').forEach((node) => node.classList.add('collapsed'));
    document.querySelectorAll('.tree-toggle').forEach((node) => node.classList.remove('expanded'));
}

/**
 * 切换当前代码示例语言，并刷新推荐写法输出。
 * @param {string} lang 目标语言标识。
 * @returns {void} 非法语言会被直接忽略。
 */
function switchLanguage(lang) {
    if (!LANGUAGES.includes(lang)) {
        return;
    }
    currentLang = lang;
    updateLanguageTabs();
    renderCodeExample();
}

/**
 * 更新语言标签激活态，让当前代码语言一眼可见。
 * @returns {void} 该函数只更新按钮样式。
 */
function updateLanguageTabs() {
    document.querySelectorAll('.lang-tab').forEach((button) => {
        button.classList.toggle('active', button.dataset.lang === currentLang);
    });
}

/**
 * 渲染当前路径的推荐代码和预期结果说明。
 * @returns {void} 未选择路径时显示默认提示。
 */
function renderCodeExample() {
    if (parsedData === null) {
        return;
    }
    const sample = buildLanguageSample(currentLang, selectedPath, selectedValue);
    getElements().codeRecommended.textContent = sample.code;
    getElements().codeResult.textContent = sample.result;
}

/**
 * 按语言生成推荐代码和结果说明，统一由这里分发。
 * @param {string} lang 当前语言标识。
 * @param {Array<string|number>} path 当前路径数组。
 * @param {unknown} value 当前路径对应值。
 * @returns {{code:string,result:string}} 当前语言推荐示例。
 */
function buildLanguageSample(lang, path, value) {
    const builders = {
        javascript: buildJavaScriptSample,
        python: buildPythonSample,
        java: buildJavaSample,
        go: buildGoSample,
        php: buildPhpSample,
        csharp: buildCSharpSample,
        rust: buildRustSample
    };
    return (builders[lang] || buildJavaScriptSample)(path, value);
}

/**
 * 生成 JavaScript 推荐写法，优先使用 optional chaining。
 * @param {Array<string|number>} path 当前路径数组。
 * @param {unknown} value 当前路径对应值。
 * @returns {{code:string,result:string}} JavaScript 示例与结果说明。
 */
function buildJavaScriptSample(path, value) {
    const access = path.map((part) => typeof part === 'number' ? `?.[${part}]` : isIdentifierKey(part) ? `?.${part}` : `?.[${quoteString(part)}]`).join('');
    return createSample(`const value = data${access} ?? null;`, value, 'null');
}

/**
 * 生成 Python 推荐写法，展示简单的异常兜底模式。
 * @param {Array<string|number>} path 当前路径数组。
 * @param {unknown} value 当前路径对应值。
 * @returns {{code:string,result:string}} Python 示例与结果说明。
 */
function buildPythonSample(path, value) {
    const expr = pathToExpr(path, 'python');
    return createSample(`try:\n    value = ${expr}\nexcept (KeyError, IndexError, TypeError):\n    value = None`, value, 'None');
}

/**
 * 生成 Java 推荐写法，保持 org.json 风格链式访问。
 * @param {Array<string|number>} path 当前路径数组。
 * @param {unknown} value 当前路径对应值。
 * @returns {{code:string,result:string}} Java 示例与结果说明。
 */
function buildJavaSample(path, value) {
    return createSample(`Object value = ${buildJavaExpr(path, parsedData)};`, value, 'null');
}

/**
 * 生成 Go 推荐写法，显式区分 map 和 slice 访问。
 * @param {Array<string|number>} path 当前路径数组。
 * @param {unknown} value 当前路径对应值。
 * @returns {{code:string,result:string}} Go 示例与结果说明。
 */
function buildGoSample(path, value) {
    return createSample(buildGoCode(path), value, 'nil');
}

/**
 * 生成 PHP 推荐写法，使用 null 合并降低模板复杂度。
 * @param {Array<string|number>} path 当前路径数组。
 * @param {unknown} value 当前路径对应值。
 * @returns {{code:string,result:string}} PHP 示例与结果说明。
 */
function buildPhpSample(path, value) {
    return createSample(`$value = ${pathToExpr(path, 'php')} ?? null;`, value, 'null');
}

/**
 * 生成 C# 推荐写法，统一通过 JSONPath 字符串访问。
 * @param {Array<string|number>} path 当前路径数组。
 * @param {unknown} value 当前路径对应值。
 * @returns {{code:string,result:string}} C# 示例与结果说明。
 */
function buildCSharpSample(path, value) {
    const code = `var token = data.SelectToken(${quoteString(formatJsonPath(path))});\nvar value = token?.ToObject<object>();`;
    return createSample(code, value, 'null');
}

/**
 * 生成 Rust 推荐写法，使用 serde_json::Value::get 链式访问。
 * @param {Array<string|number>} path 当前路径数组。
 * @param {unknown} value 当前路径对应值。
 * @returns {{code:string,result:string}} Rust 示例与结果说明。
 */
function buildRustSample(path, value) {
    const chain = path.map((part) => `.and_then(|v| v.get(${typeof part === 'number' ? part : quoteString(part)}))`).join('');
    return createSample(`let value = Some(&data)${chain};`, value, 'None');
}

/**
 * 统一拼接代码示例与结果说明，避免各语言重复处理文本。
 * @param {string} code 推荐代码文本。
 * @param {unknown} value 当前路径对应值。
 * @param {string} missingValue 路径不存在时的典型返回值。
 * @returns {{code:string,result:string}} 示例对象。
 */
function createSample(code, value, missingValue) {
    return { code, result: `当前值：${getValuePreview(value)}；路径不存在时：${missingValue}` };
}

/**
 * 生成 Java 的 org.json 链式表达式，使推荐代码更贴近现有习惯。
 * @param {Array<string|number>} path 当前路径数组。
 * @param {unknown} source 根数据源。
 * @returns {string} Java 链式访问表达式。
 */
function buildJavaExpr(path, source) {
    let expr = 'json';
    let current = source;
    path.forEach((part, index) => {
        const next = current?.[part];
        expr += buildJavaStep(part, next, index === path.length - 1);
        current = next;
    });
    return expr;
}

/**
 * 为 Java 链式访问生成单步代码，按下一层值类型挑选方法。
 * @param {string|number} part 当前路径片段。
 * @param {unknown} next 下一层值。
 * @param {boolean} isLast 当前片段是否最后一步。
 * @returns {string} 单步链式访问代码。
 */
function buildJavaStep(part, next, isLast) {
    const suffix = typeof part === 'number' ? part : quoteString(part);
    if (!isLast) return `.${Array.isArray(next) ? 'optJSONArray' : 'optJSONObject'}(${suffix})`;
    if (typeof next === 'string') return `.optString(${suffix})`;
    if (typeof next === 'number') return `.opt(${suffix})`;
    if (typeof next === 'boolean') return `.optBoolean(${suffix})`;
    if (Array.isArray(next)) return `.optJSONArray(${suffix})`;
    return typeof next === 'object' && next !== null ? `.optJSONObject(${suffix})` : `.opt(${suffix})`;
}

/**
 * 生成 Go 安全访问代码，保持每一步类型判断明确可读。
 * @param {Array<string|number>} path 当前路径数组。
 * @returns {string} Go 代码字符串。
 */
function buildGoCode(path) {
    const lines = ['value := any(data)'];
    path.forEach((part) => lines.push(...buildGoStep(part)));
    return lines.join('\n');
}

/**
 * 为 Go 访问代码追加单个路径片段的安全判断逻辑。
 * @param {string|number} part 当前路径片段。
 * @returns {Array<string>} 对应片段的 Go 代码行数组。
 */
function buildGoStep(part) {
    if (typeof part === 'number') {
        return ['items, ok := value.([]any)', `if !ok || len(items) <= ${part} {`, '    value = nil', '} else {', `    value = items[${part}]`, '}'];
    }
    return ['obj, ok := value.(map[string]any)', 'if !ok {', '    value = nil', '} else {', `    value = obj[${quoteString(part)}]`, '}'];
}

/**
 * 将路径转换成目标语言表达式，统一点号与 bracket 写法。
 * @param {Array<string|number>} path 当前路径数组。
 * @param {'python'|'php'} lang 目标语言标识。
 * @returns {string} 访问表达式字符串。
 */
function pathToExpr(path, lang) {
    const root = lang === 'php' ? '$data' : 'data';
    return path.reduce((expr, part) => appendExprSegment(expr, part, lang), root);
}

/**
 * 为表达式追加单个路径片段，确保特殊键名走 bracket 语法。
 * @param {string} expr 当前表达式。
 * @param {string|number} part 当前路径片段。
 * @param {'python'|'php'} lang 目标语言标识。
 * @returns {string} 追加后的表达式。
 */
function appendExprSegment(expr, part, lang) {
    if (typeof part === 'number') {
        return `${expr}[${part}]`;
    }
    return lang === 'php' ? `${expr}[${quoteString(part)}]` : `${expr}[${quoteString(part)}]`;
}

/**
 * 获取值的类型标签，供路径列表和详情区域共用。
 * @param {unknown} value 当前值。
 * @returns {string} 简化后的类型标签。
 */
function getValueType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return typeof value;
}

/**
 * 生成值预览文本，避免对象直接显示为 [object Object]。
 * @param {unknown} value 当前值。
 * @returns {string} 用于列表、详情和结果说明的预览文本。
 */
function getValuePreview(value) {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (typeof value === 'object') return `Object(${Object.keys(value).length})`;
    return String(value);
}

/**
 * 按路径逐段读取值，供路径列表点击联动使用。
 * @param {unknown} source 根数据对象。
 * @param {Array<string|number>} path 路径数组。
 * @returns {unknown} 找到则返回值，否则返回 undefined。
 */
function getValueByPath(source, path) {
    return path.reduce((current, part) => current === undefined || current === null ? undefined : current[part], source);
}

/**
 * 格式化内部路径字符串，供列表、高亮和复制场景统一使用。
 * @param {Array<string|number>} path 路径数组。
 * @returns {string} 以 data 为根的路径字符串。
 */
function formatPath(path) {
    return path.reduce((text, part) => typeof part === 'number' ? `${text}[${part}]` : isIdentifierKey(part) ? `${text}.${part}` : `${text}[${quoteString(part)}]`, 'data');
}

/**
 * 生成 JSONPath 表达式，特殊键名自动改为 bracket 形式。
 * @param {Array<string|number>} path 路径数组。
 * @returns {string} JSONPath 字符串。
 */
function formatJsonPath(path) {
    return path.reduce((text, part) => typeof part === 'number' ? `${text}[${part}]` : isIdentifierKey(part) ? `${text}.${part}` : `${text}[${quoteString(part)}]`, '$');
}

/**
 * 判断键名能否安全使用点号写法，避免生成无效代码。
 * @param {string} key 对象键名。
 * @returns {boolean} 符合标识符规则时返回 true。
 */
function isIdentifierKey(key) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(key));
}

/**
 * 以 JSON 风格对字符串做引号和转义处理。
 * @param {string} value 需要转义的字符串。
 * @returns {string} 带双引号的安全字符串。
 */
function quoteString(value) {
    return JSON.stringify(String(value));
}

/**
 * 转义 HTML 特殊字符，避免用户 JSON 内容插入标签。
 * @param {string} value 原始文本。
 * @returns {string} HTML 安全文本。
 */
function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}

/**
 * 转义 CSS 选择器中的特殊字符，确保 data-path 可被安全查询。
 * @param {string} value 原始选择器文本。
 * @returns {string} 适合放进 querySelector 的安全文本。
 */
function cssEscape(value) {
    return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

/**
 * 按顺序循环切换主题，并把用户选择持久化到扩展存储。
 * @returns {Promise<void>} 存储更新完成后 resolve。
 */
async function cycleTheme() {
    currentTheme = THEME_ORDER[(THEME_ORDER.indexOf(currentTheme) + 1) % THEME_ORDER.length];
    applyTheme(currentTheme);
    updateThemeButton();
    await chrome.storage.local.set({ [STORAGE_KEYS.theme]: currentTheme });
}

/**
 * 将当前主题应用到文档根节点，支持跟随系统与显式明暗模式。
 * @param {'system'|'dark'|'light'} theme 当前主题模式。
 * @returns {void} 该函数只更新根节点属性。
 */
function applyTheme(theme) {
    const resolved = theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : theme === 'system' ? 'light' : theme;
    document.documentElement.dataset.theme = resolved;
}

/**
 * 更新主题按钮文案，让当前主题和下一步切换意图更明确。
 * @returns {void} 该函数只更新按钮文本。
 */
function updateThemeButton() {
    const labels = { system: '跟随系统', dark: '深色', light: '浅色' };
    getElements().themeToggleButton.textContent = labels[currentTheme];
}

/**
 * 更新状态文本，给侧边栏顶部提供轻量反馈。
 * @param {string} text 需要展示的状态文本。
 * @returns {void} 该函数只更新头部状态区域。
 */
function setStatus(text) {
    getElements().statusText.textContent = text;
}

/**
 * 显示轻量提示信息，适合扩展侧边栏这种窄空间布局。
 * @param {string} message 提示文本。
 * @param {'success'|'error'} [type='success'] 提示类型。
 * @returns {void} 该函数会自动在短时间后移除提示。
 */
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast${type === 'error' ? ' error' : ''}`;
    toast.textContent = message;
    getElements().toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
}

/**
 * 统一复制文本，优先使用现代 Clipboard API，再回退到传统复制方案。
 * @param {string} text 需要复制的文本。
 * @param {string} successMessage 复制成功提示。
 * @returns {Promise<void>} 复制成功时 resolve，失败时 reject。
 */
async function copyText(text, successMessage) {
    try {
        await writeClipboardText(text);
        showToast(successMessage);
    } catch {
        showToast('复制失败，请手动复制', 'error');
    }
}

/**
 * 执行实际写入剪贴板逻辑，并为扩展上下文准备 fallback。
 * @param {string} text 需要复制的文本。
 * @returns {Promise<void>} 任一复制方案成功后 resolve。
 */
async function writeClipboardText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
            // 扩展 side panel 虽然通常具备安全上下文，但仍可能被浏览器权限或焦点限制拦截，因此继续走传统回退方案。
        }
    }
    if (copyTextWithFallback(text)) {
        return;
    }
    throw new Error('Clipboard unavailable');
}

/**
 * 使用隐藏 textarea 和 execCommand 做兼容复制，尽量避免布局抖动。
 * @param {string} text 需要复制的文本。
 * @returns {boolean} 复制成功返回 true，否则返回 false。
 */
function copyTextWithFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
}

initApp();
