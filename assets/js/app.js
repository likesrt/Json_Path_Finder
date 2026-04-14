const THEME_STORAGE_KEY = 'json-path-finder-theme';
const THEME_SEQUENCE = ['system', 'dark', 'light'];
const DETAILS_EMPTY_TEXT = '点击树中的任意键、值，或从左侧路径列表中选择一项。';
const CODE_EMPTY_HTML = '<span style="color:var(--text-muted);">选择路径后生成推荐写法</span>';
const CODE_RESULT_EMPTY_HTML = '<strong>结果示例</strong> 选择路径后显示';
const SAMPLE_JSON = {
    status: 'success',
    code: 200,
    data: {
        users: [
            {
                id: 1,
                name: '张三',
                'display-name': '前端负责人',
                'profile.info': {
                    城市: '上海',
                    'favorite color': 'green'
                },
                profile: {
                    age: 28,
                    department: '工程部',
                    skills: ['JavaScript', 'Python', 'Go']
                }
            },
            {
                id: 2,
                name: '李四',
                'display-name': '开发工程师',
                profile: {
                    age: 25,
                    department: '前端组',
                    skills: ['Vue', 'React']
                }
            }
        ],
        total: 2,
        page: 1,
        hasMore: false
    },
    meta: {
        timestamp: '2024-01-15T10:30:00Z',
        request_id: 'req_abc123',
        version: '2.1.0'
    }
};

let parsedData = null;
let allPaths = [];
let selectedPath = [];
let selectedValue;
let currentLang = 'javascript';
let selectedLineEl = null;
let parseTimer = null;
let currentTheme = 'system';
let systemThemeQuery = null;
let hasSelection = false;
let PATH_LIST_EMPTY_HTML = '';
let TREE_EMPTY_HTML = '';

/**
 * 构造统一空状态 HTML，确保首次进入和清空后的提示一致。
 * @param {string} iconName 图标名称。
 * @param {string} title 空状态标题。
 * @param {string} subtitle 空状态补充说明。
 * @returns {string} 可直接注入的 HTML 字符串。
 */
function createEmptyStateHTML(iconName, title, subtitle) {
    return `
        <div class="empty-state">
            <span class="icon" aria-hidden="true">${getIconSvg(iconName)}</span>
            <div class="empty-title">${title}</div>
            <div class="empty-subtitle">${subtitle}</div>
        </div>`;
}

/**
 * 将带 data-icon 的占位节点替换为内联 SVG，避免依赖外部图标库。
 * @returns {void} 该函数只更新当前页面中声明了图标名的节点。
 */
function renderIcons() {
    document.querySelectorAll('[data-icon]').forEach((node) => {
        node.innerHTML = getIconSvg(node.dataset.icon);
    });
}

/**
 * 显示轻量通知，并在渲染前刷新 header 偏移，避免 toast 遮住顶部操作区。
 * @param {string} message 通知文本。
 * @param {'success'|'error'} [type='success'] 通知类型，决定颜色和图标。
 * @returns {void} 该函数会写入 toast 容器，并在约 2.5 秒后触发移除动画。
 */
function showToast(message, type = 'success') {
    updateHeaderOffset();
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const iconName = type === 'error' ? 'error' : 'success';
    const iconColor = type === 'error' ? 'var(--danger)' : 'var(--accent)';
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    toast.innerHTML = `<span class="icon" style="color:${iconColor}">${getIconSvg(iconName)}</span><span class="toast-text">${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => removeToast(toast), 2500);
}

/**
 * 播放通知退出动画并移除节点，避免 DOM 长时间累积。
 * @param {HTMLElement} toast 待移除的通知节点。
 * @returns {void} 动画结束后会移除对应元素。
 */
function removeToast(toast) {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
}

/**
 * 更新头部状态文案与状态点颜色。
 * @param {'idle'|'ok'|'err'} state 状态标识，用于切换状态点样式。
 * @param {string} text 需要展示给用户的状态文本。
 * @returns {void} 该函数只更新界面状态。
 */
function setStatus(state, text) {
    const indicator = document.getElementById('statusIndicator');
    indicator.querySelector('.status-dot').className = `status-dot ${state}`;
    document.getElementById('statusText').textContent = text;
}

/**
 * 初始化主题配置，并监听系统主题变化。
 * @returns {void} 该函数会同步循环按钮文案、图标和页面主题属性。
 */
function initTheme() {
    currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'system';
    systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(currentTheme);
    updateHeaderOffset();
    updateThemeToggleButton();
    window.addEventListener('resize', updateHeaderOffset);
    systemThemeQuery.addEventListener('change', handleSystemThemeChange);
}

/**
 * 按预设顺序循环切换主题，并持久化到本地存储。
 * @returns {void} 切换顺序固定为 system、dark、light。
 */
function cycleTheme() {
    const nextTheme = getNextTheme(currentTheme);
    handleThemeChange(nextTheme);
}

/**
 * 响应用户主题切换，并持久化到本地存储。
 * @param {'system'|'dark'|'light'} theme 用户选中的主题值。
 * @returns {void} 该函数会更新全局主题状态和循环按钮状态。
 */
function handleThemeChange(theme) {
    currentTheme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
    updateThemeToggleButton();
    showToast(`已切换为${getThemeLabel(theme)}主题`);
}

/**
 * 返回下一个主题模式，供单按钮循环切换使用。
 * @param {'system'|'dark'|'light'} theme 当前主题模式。
 * @returns {'system'|'dark'|'light'} 下一个主题模式。
 */
function getNextTheme(theme) {
    const index = THEME_SEQUENCE.indexOf(theme);
    const nextIndex = index === -1 ? 0 : (index + 1) % THEME_SEQUENCE.length;
    return THEME_SEQUENCE[nextIndex];
}

/**
 * 返回主题值对应的中文标签，避免多处重复判断。
 * @param {'system'|'dark'|'light'} theme 主题模式。
 * @returns {string} 中文展示名称。
 */
function getThemeLabel(theme) {
    return { system: '跟随系统', dark: '深色', light: '浅色' }[theme] || '跟随系统';
}

/**
 * 返回主题模式对应的图标名称，确保循环按钮状态可见。
 * @param {'system'|'dark'|'light'} theme 主题模式。
 * @returns {string} 已注册的图标名称。
 */
function getThemeIconName(theme) {
    return { system: 'theme-system', dark: 'theme-dark', light: 'theme-light' }[theme] || 'theme-system';
}

/**
 * 更新主题循环按钮的文案、提示和图标。
 * @returns {void} 该函数会同步 data-theme、title 与 aria-label。
 */
function updateThemeToggleButton() {
    const button = document.getElementById('themeToggleButton');
    const text = document.getElementById('themeToggleText');
    const icon = document.getElementById('themeToggleIcon');
    const nextTheme = getNextTheme(currentTheme);
    const tip = `当前主题：${getThemeLabel(currentTheme)}，点击切换到${getThemeLabel(nextTheme)}`;
    button.dataset.theme = currentTheme;
    button.title = tip;
    button.setAttribute('aria-label', tip);
    text.textContent = getThemeLabel(currentTheme);
    icon.dataset.icon = getThemeIconName(currentTheme);
    icon.innerHTML = getIconSvg(icon.dataset.icon);
}

/**
 * 更新 header 高度对应的 CSS 变量，供桌面端 toast 避开操作区。
 * @returns {void} 该函数只同步根元素上的 --header-offset 变量。
 */
function updateHeaderOffset() {
    const header = document.querySelector('.app-header');
    const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 88;
    document.documentElement.style.setProperty('--header-offset', `${headerHeight}px`);
}

/**
 * 在系统主题变化时更新页面，仅在“跟随系统”模式下生效。
 * @returns {void} 该函数会同步页面主题与循环按钮图标状态。
 */
function handleSystemThemeChange() {
    if (currentTheme !== 'system') {
        return;
    }
    applyTheme('system');
    updateThemeToggleButton();
}

/**
 * 应用主题到根元素，并维护浏览器 color-scheme 提示。
 * @param {'system'|'dark'|'light'} theme 需要应用的主题模式。
 * @returns {void} 该函数只操作根元素属性。
 */
function applyTheme(theme) {
    const root = document.documentElement;
    const resolved = theme === 'system' ? (systemThemeQuery.matches ? 'dark' : 'light') : theme;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
}

/**
 * 初始化页面空状态，保证首次打开界面内容完整。
 * @returns {void} 该函数会设置树、路径和详情区域初始内容。
 */
function initUI() {
    PATH_LIST_EMPTY_HTML = createEmptyStateHTML('tree', '还没有路径列表', '输入合法 JSON 后会自动同步路径列表，也可以使用示例数据快速体验。');
    TREE_EMPTY_HTML = createEmptyStateHTML('tree', '等待 JSON 数据', '粘贴 JSON、拖拽 .json 文件，或点击“示例”。解析成功后会显示树形结构与可点击路径。');
    document.getElementById('treeView').innerHTML = TREE_EMPTY_HTML;
    document.getElementById('pathList').innerHTML = PATH_LIST_EMPTY_HTML;
    resetSelectionDetails();
}

/**
 * 解析输入框中的 JSON，并同步树形视图、路径列表和详情区。
 * @returns {void} 解析失败时会展示错误，不抛出异常到外层。
 */
function parseAndRender() {
    const input = document.getElementById('jsonInput').value.trim();
    if (!input) {
        setStatus('err', '输入为空');
        showToast('请输入 JSON 数据', 'error');
        return;
    }
    try {
        parsedData = JSON.parse(input);
        setStatus('ok', '解析成功');
        renderTree(parsedData);
        extractAllPaths(false);
        clearSelectionState();
        resetSelectionDetails();
        showToast('解析成功，路径列表已同步');
    } catch (error) {
        handleParseError(error);
    }
}

/**
 * 渲染解析错误视图，避免错误信息直接暴露为未转义内容。
 * @param {Error} error JSON.parse 抛出的异常对象。
 * @returns {void} 该函数会重置部分结果区域并展示错误提示。
 */
function handleParseError(error) {
    setStatus('err', '解析失败');
    document.getElementById('treeView').innerHTML = createEmptyStateHTML('error', 'JSON 解析失败', `错误信息：${escapeHtml(error.message)}`);
    document.getElementById('pathList').innerHTML = PATH_LIST_EMPTY_HTML;
    document.getElementById('pathCount').textContent = '0';
    clearSelectionState();
    resetSelectionDetails();
    showToast(`JSON 格式错误: ${error.message}`, 'error');
}

/**
 * 清理当前选中路径相关的全局状态。
 * @returns {void} 该函数不会修改树结构内容，仅重置选择状态。
 */
function clearSelectionState() {
    if (selectedLineEl) {
        selectedLineEl.classList.remove('selected');
    }
    selectedPath = [];
    selectedValue = undefined;
    selectedLineEl = null;
    hasSelection = false;
}

/**
 * 重置当前路径、JSONPath、值、类型和代码区域到空状态。
 * @returns {void} 该函数用于首次加载、清空和解析失败后的界面恢复。
 */
function resetSelectionDetails() {
    document.getElementById('currentPath').textContent = DETAILS_EMPTY_TEXT;
    document.getElementById('currentJsonPath').textContent = '未选择路径';
    document.getElementById('currentValue').textContent = '—';
    document.getElementById('currentType').textContent = '—';
    document.getElementById('codeRecommended').innerHTML = CODE_EMPTY_HTML;
    document.getElementById('codeRecommendedResult').innerHTML = CODE_RESULT_EMPTY_HTML;
    updatePathListHighlight();
}

/**
 * 递归渲染 JSON 根节点。
 * @param {*} data 已解析的 JSON 数据。
 * @returns {void} 该函数会完全替换树形视图容器内容。
 */
function renderTree(data) {
    const container = document.getElementById('treeView');
    const root = createElement('div');
    container.innerHTML = '';
    renderNode(data, root, [], null, true, false);
    container.appendChild(root);
}

/**
 * 根据数据类型分发渲染逻辑，并将逗号附着在当前行末尾。
 * @param {*} data 当前节点值。
 * @param {HTMLElement} parentEl 目标父容器。
 * @param {Array<string|number>} pathParts 当前节点父路径。
 * @param {string|number|null} key 当前节点键名或索引。
 * @param {boolean} isRoot 是否为根节点。
 * @param {boolean} hasTrailingComma 当前节点结束后是否需要显示逗号。
 * @returns {void} 该函数只负责选择合适的节点构造函数。
 */
function renderNode(data, parentEl, pathParts, key, isRoot, hasTrailingComma) {
    if (data === null) {
        parentEl.appendChild(createValueLine(key, 'null', pathParts, isRoot, hasTrailingComma));
        return;
    }
    if (typeof data === 'object') {
        const node = Array.isArray(data)
            ? createArrayNode(data, pathParts, key, isRoot, hasTrailingComma)
            : createObjectNode(data, pathParts, key, isRoot, hasTrailingComma);
        parentEl.appendChild(node);
        return;
    }
    parentEl.appendChild(createValueLine(key, data, pathParts, isRoot, hasTrailingComma));
}

/**
 * 计算当前节点完整路径，避免根节点和普通节点逻辑散落在多个函数中。
 * @param {Array<string|number>} parentPath 父路径数组。
 * @param {string|number|null} key 当前键名或索引。
 * @param {boolean} isRoot 当前节点是否为根节点。
 * @returns {Array<string|number>} 当前节点完整路径数组。
 */
function buildNodePath(parentPath, key, isRoot) {
    if (isRoot || key === null || key === undefined) {
        return [...parentPath];
    }
    return [...parentPath, key];
}

/**
 * 创建对象节点 DOM，并把逗号跟在闭合括号所在行末尾。
 * @param {Record<string, *>} obj 当前对象值。
 * @param {Array<string|number>} parentPath 父路径数组。
 * @param {string|number|null} key 当前键名。
 * @param {boolean} isRoot 当前节点是否为根节点。
 * @param {boolean} hasTrailingComma 当前节点结束后是否需要显示逗号。
 * @returns {HTMLElement} 构造完成的对象节点。
 */
function createObjectNode(obj, parentPath, key, isRoot, hasTrailingComma) {
    const pathParts = buildNodePath(parentPath, key, isRoot);
    const nodeEl = document.createElement('div');
    const lineEl = createContainerLine(pathParts, obj, isRoot, key, '{', `${Object.keys(obj).length} keys`);
    const childrenEl = document.createElement('div');
    nodeEl.className = 'tree-node';
    childrenEl.className = 'tree-children';
    Object.keys(obj).forEach((childKey, index, keys) => {
        const childHasComma = index < keys.length - 1;
        renderNode(obj[childKey], childrenEl, pathParts, childKey, false, childHasComma);
    });
    nodeEl.append(lineEl, childrenEl, createClosingBracketLine('}', hasTrailingComma));
    return nodeEl;
}

/**
 * 创建数组节点 DOM，并把逗号跟在闭合括号所在行末尾。
 * @param {Array<*>} arr 当前数组值。
 * @param {Array<string|number>} parentPath 父路径数组。
 * @param {string|number|null} key 当前键名。
 * @param {boolean} isRoot 当前节点是否为根节点。
 * @param {boolean} hasTrailingComma 当前节点结束后是否需要显示逗号。
 * @returns {HTMLElement} 构造完成的数组节点。
 */
function createArrayNode(arr, parentPath, key, isRoot, hasTrailingComma) {
    const pathParts = buildNodePath(parentPath, key, isRoot);
    const nodeEl = document.createElement('div');
    const lineEl = createContainerLine(pathParts, arr, isRoot, key, '[', `${arr.length} items`);
    const childrenEl = document.createElement('div');
    nodeEl.className = 'tree-node';
    childrenEl.className = 'tree-children';
    arr.forEach((item, index) => {
        const childHasComma = index < arr.length - 1;
        renderNode(item, childrenEl, pathParts, index, false, childHasComma);
    });
    nodeEl.append(lineEl, childrenEl, createClosingBracketLine(']', hasTrailingComma));
    return nodeEl;
}

/**
 * 创建对象或数组的头部行。
 * @param {Array<string|number>} pathParts 当前节点路径。
 * @param {*} value 当前节点值。
 * @param {boolean} isRoot 是否为根节点。
 * @param {string|number|null} key 当前键名或索引。
 * @param {'{'|'['} bracket 起始括号。
 * @param {string} countText 数量说明文本。
 * @returns {HTMLDivElement} 可点击的树行元素。
 */
function createContainerLine(pathParts, value, isRoot, key, bracket, countText) {
    const lineEl = document.createElement('div');
    lineEl.className = 'tree-line';
    lineEl.dataset.path = formatPath(pathParts);
    lineEl.onclick = () => selectPath(pathParts, value, lineEl);
    lineEl.innerHTML = `${createKeyPrefix(key, isRoot, true)}<span class="tree-bracket">${bracket}</span><span class="tree-count">${countText}</span>`;
    return lineEl;
}

/**
 * 创建值节点 DOM 行，并在需要时把逗号附着在当前行末尾。
 * @param {string|number|null} key 当前键名或索引。
 * @param {*} value 当前值。
 * @param {Array<string|number>} parentPath 父路径数组。
 * @param {boolean} isRoot 当前节点是否为根节点。
 * @param {boolean} hasTrailingComma 当前节点结束后是否需要显示逗号。
 * @returns {HTMLDivElement} 可点击的叶子节点行。
 */
function createValueLine(key, value, parentPath, isRoot, hasTrailingComma) {
    const pathParts = buildNodePath(parentPath, key, isRoot);
    const lineEl = document.createElement('div');
    lineEl.className = 'tree-line';
    lineEl.dataset.path = formatPath(pathParts);
    lineEl.onclick = () => selectPath(pathParts, value, lineEl);
    lineEl.innerHTML = `${createKeyPrefix(key, isRoot, false)}${renderPrimitiveValue(value)}${renderTrailingComma(hasTrailingComma)}`;
    return lineEl;
}

/**
 * 构造树节点中键名前缀，兼顾对象键、数组索引和折叠图标。
 * @param {string|number|null} key 当前键名或索引。
 * @param {boolean} isRoot 是否为根节点。
 * @param {boolean} expandable 当前节点是否可展开。
 * @returns {string} 树行前缀 HTML。
 */
function createKeyPrefix(key, isRoot, expandable) {
    if (isRoot || key === null || key === undefined) {
        return '';
    }
    const toggle = expandable ? createToggleHtml() : createHiddenToggleHtml();
    if (typeof key === 'number') {
        return `${toggle}<span class="tree-number">[${key}]</span><span class="tree-colon">:</span>`;
    }
    return `${toggle}<span class="tree-key">"${escapeHtml(String(key))}"</span><span class="tree-colon">:</span>`;
}

/**
 * 返回可交互折叠按钮 HTML，统一复用同一套 SVG 图标。
 * @returns {string} 展开状态下的折叠按钮 HTML。
 */
function createToggleHtml() {
    return `<span class="tree-toggle expanded" onclick="event.stopPropagation();toggleNode(this)" title="展开或折叠">${getIconSvg('chevron')}</span>`;
}

/**
 * 返回占位折叠按钮 HTML，用于保持值行与容器行的缩进一致。
 * @returns {string} 不可见的折叠按钮 HTML。
 */
function createHiddenToggleHtml() {
    return `<span class="tree-toggle" style="visibility:hidden;">${getIconSvg('chevron')}</span>`;
}

/**
 * 将基础类型渲染成带颜色的 HTML。
 * @param {*} value 当前基础值。
 * @returns {string} 带高亮类名的 HTML。
 */
function renderPrimitiveValue(value) {
    if (value === null || value === 'null') return '<span class="tree-null">null</span>';
    if (typeof value === 'string') {
        const displayStr = value.length > 80 ? `${value.slice(0, 77)}...` : value;
        return `<span class="tree-string">"${escapeHtml(displayStr)}"</span>`;
    }
    if (typeof value === 'number') return `<span class="tree-number">${value}</span>`;
    if (typeof value === 'boolean') return `<span class="tree-bool">${value}</span>`;
    return `<span>${escapeHtml(String(value))}</span>`;
}

/**
 * 根据是否需要追加逗号返回对应 HTML，避免逗号单独占一行。
 * @param {boolean} hasTrailingComma 当前节点结束后是否需要逗号。
 * @returns {string} 可直接拼接到当前行末尾的逗号 HTML。
 */
function renderTrailingComma(hasTrailingComma) {
    return hasTrailingComma ? '<span class="tree-comma">,</span>' : '';
}

/**
 * 创建收尾括号所在行，并在需要时将逗号追加到同一行。
 * @param {'}'|']'} bracket 闭合括号文本。
 * @param {boolean} hasTrailingComma 当前节点结束后是否需要显示逗号。
 * @returns {HTMLDivElement} 闭合括号行元素。
 */
function createClosingBracketLine(bracket, hasTrailingComma) {
    const closeEl = document.createElement('div');
    closeEl.className = 'tree-bracket-line';
    closeEl.innerHTML = `<span class="tree-bracket">${bracket}</span>${renderTrailingComma(hasTrailingComma)}`;
    return closeEl;
}

/**
 * 展开或折叠对象、数组节点。
 * @param {HTMLElement} toggleEl 当前点击的折叠按钮元素。
 * @returns {void} 该函数会切换兄弟 children 容器的 collapsed 状态。
 */
function toggleNode(toggleEl) {
    const nodeEl = toggleEl.closest('.tree-node');
    const childrenEl = nodeEl ? nodeEl.querySelector('.tree-children') : null;
    const expanded = toggleEl.classList.contains('expanded');
    toggleEl.classList.toggle('expanded', !expanded);
    if (childrenEl) {
        childrenEl.classList.toggle('collapsed', expanded);
    }
}

/**
 * 选中当前路径，并同步详情、代码和列表高亮。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @param {*} value 当前路径对应值。
 * @param {HTMLElement|null} lineEl 当前点击的树行元素。
 * @returns {void} 该函数会更新多个展示区域。
 */
function selectPath(pathParts, value, lineEl) {
    if (selectedLineEl) {
        selectedLineEl.classList.remove('selected');
    }
    selectedLineEl = lineEl;
    if (selectedLineEl) {
        selectedLineEl.classList.add('selected');
    }
    selectedPath = [...pathParts];
    selectedValue = value;
    hasSelection = true;
    updateSelectionPanels(pathParts, value);
}

/**
 * 同步路径详情、JSONPath、值类型和代码示例。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @param {*} value 当前路径对应值。
 * @returns {void} 该函数是选中行为后的唯一 UI 刷新入口。
 */
function updateSelectionPanels(pathParts, value) {
    updatePathDisplay(pathParts);
    updateJsonPathDisplay(pathParts);
    updateValueDisplay(value);
    updateCodeGeneration(pathParts);
    updatePathListHighlight();
}

/**
 * 更新当前路径展示，使用更安全的 bracket 语义展示特殊键名。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @returns {void} 空路径时展示根变量 data。
 */
function updatePathDisplay(pathParts) {
    document.getElementById('currentPath').innerHTML = formatDisplayPath(pathParts);
}

/**
 * 生成用于界面显示的路径 HTML。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @returns {string} 带高亮 span 的路径 HTML。
 */
function formatDisplayPath(pathParts) {
    if (pathParts.length === 0) {
        return '<span class="path-root">data</span>';
    }
    return pathParts.reduce((html, part) => {
        if (typeof part === 'number') return `${html}<span class="path-index">[${part}]</span>`;
        if (isIdentifierKey(part)) return `${html}<span class="path-dot">.</span><span class="path-segment">${escapeHtml(part)}</span>`;
        return `${html}<span class="path-index">["${escapeHtml(part)}"]</span>`;
    }, '<span class="path-root">data</span>');
}

/**
 * 更新当前路径对应的 JSONPath 表达式。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @returns {void} 该函数只更新 JSONPath 展示区域。
 */
function updateJsonPathDisplay(pathParts) {
    document.getElementById('currentJsonPath').textContent = formatJsonPath(pathParts);
}

/**
 * 将路径数组转换为 JSONPath 表达式，特殊键名统一使用 bracket 形式。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @returns {string} JSONPath 字符串。
 */
function formatJsonPath(pathParts) {
    return pathParts.reduce((path, part) => {
        if (typeof part === 'number') return `${path}[${part}]`;
        return isIdentifierKey(part) ? `${path}.${part}` : `${path}[${quoteString(part)}]`;
    }, '$');
}

/**
 * 更新值和类型展示区，兼顾对象、数组和基础类型。
 * @param {*} value 当前路径对应值。
 * @returns {void} 遇到未定义值时会回退到占位状态。
 */
function updateValueDisplay(value) {
    const summary = getValueSummary(value);
    document.getElementById('currentValue').innerHTML = summary.valueHtml;
    document.getElementById('currentType').innerHTML = summary.typeHtml;
}

/**
 * 根据值生成展示摘要，避免多个地方重复判断类型。
 * @param {*} value 当前路径对应值。
 * @returns {{valueHtml: string, typeHtml: string}} 值和类型的展示 HTML。
 */
function getValueSummary(value) {
    if (value === null) return { valueHtml: '<span class="tree-null">null</span>', typeHtml: '<span style="color:var(--json-null);">null</span>' };
    if (Array.isArray(value)) return { valueHtml: `Array [${value.length} items]`, typeHtml: '<span style="color:var(--json-bracket);">Array</span>' };
    if (typeof value === 'object') return { valueHtml: `Object {${Object.keys(value).length} keys}`, typeHtml: '<span style="color:var(--json-key);">Object</span>' };
    if (typeof value === 'string') return { valueHtml: `<span class="tree-string">"${escapeHtml(value)}"</span>`, typeHtml: '<span style="color:var(--json-string);">String</span>' };
    if (typeof value === 'number') return { valueHtml: `<span class="tree-number">${value}</span>`, typeHtml: '<span style="color:var(--json-number);">Number</span>' };
    if (typeof value === 'boolean') return { valueHtml: `<span class="tree-bool">${value}</span>`, typeHtml: '<span style="color:var(--json-bool);">Boolean</span>' };
    return { valueHtml: escapeHtml(String(value)), typeHtml: escapeHtml(typeof value) };
}

/**
 * 更新多语言代码生成区域，并补充推荐写法对应的结果示例说明。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @returns {void} 未选中路径时会显示占位内容与空结果说明。
 */
function updateCodeGeneration(pathParts) {
    const codeEl = document.getElementById('codeRecommended');
    const resultEl = document.getElementById('codeRecommendedResult');
    if (!hasSelection) {
        codeEl.innerHTML = CODE_EMPTY_HTML;
        resultEl.innerHTML = CODE_RESULT_EMPTY_HTML;
        return;
    }
    const sample = buildRecommendedSample(pathParts, currentLang, selectedValue);
    codeEl.innerHTML = `${highlightCode(sample.code, currentLang)}${createCopyButton()}`;
    resultEl.innerHTML = sample.result;
}

/**
 * 创建推荐代码块内部复制按钮 HTML。
 * @returns {string} 可直接插入代码块的按钮 HTML。
 */
function createCopyButton() {
    return `<button class="copy-btn" onclick="copyCode()" title="复制代码" aria-label="复制推荐写法代码"><span class="icon">${getIconSvg('copy')}</span>复制</button>`;
}

/**
 * 按当前语言生成单个推荐写法及结果说明。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @param {'javascript'|'python'|'java'|'go'|'php'|'csharp'|'rust'} lang 当前语言。
 * @param {*} value 当前路径对应值。
 * @returns {{code:string,result:string}} 推荐示例数据。
 */
function buildRecommendedSample(pathParts, lang, value) {
    const builders = {
        javascript: buildJavaScriptSample,
        python: buildPythonSample,
        java: buildJavaSample,
        go: buildGoSample,
        php: buildPhpSample,
        csharp: buildCSharpSample,
        rust: buildRustSample
    };
    return (builders[lang] || buildJavaScriptSample)(pathParts, value);
}

/**
 * 按语言高亮代码，统一复用现有轻量高亮器。
 * @param {string} code 原始代码文本。
 * @param {'javascript'|'python'|'java'|'go'|'php'|'csharp'|'rust'} lang 当前语言。
 * @returns {string} 带 code 标签的高亮 HTML。
 */
function highlightCode(code, lang) {
    const highlighters = {
        javascript: highlightJS,
        python: highlightPython,
        java: highlightJava,
        go: highlightGo,
        php: highlightPHP,
        csharp: highlightCSharp,
        rust: highlightRust
    };
    return (highlighters[lang] || ((text) => `<code>${escapeHtml(text)}</code>`))(code);
}


/**
 * 将路径转换为不同语言访问表达式，特殊 key 自动切换到 bracket notation。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @param {'javascript'|'python'|'java'|'go'|'php'|'csharp'|'rust'} lang 目标语言。
 * @param {string} [rootVar='data'] 根变量名。
 * @returns {string} 对应语言的访问表达式。
 */
function pathToExpr(pathParts, lang, rootVar = 'data') {
    if (pathParts.length === 0) return rootVar;
    return pathParts.reduce((expr, part) => appendSegment(expr, part, lang), rootVar);
}

/**
 * 为指定语言追加单个路径片段。
 * @param {string} expr 当前表达式。
 * @param {string|number} part 当前路径片段。
 * @param {string} lang 目标语言。
 * @returns {string} 追加后的表达式。
 */
function appendSegment(expr, part, lang) {
    return typeof part === 'number' ? appendNumericSegment(expr, part, lang) : appendStringSegment(expr, part, lang);
}

/**
 * 为指定语言追加数组索引访问。
 * @param {string} expr 当前表达式。
 * @param {number} index 数组索引。
 * @param {string} lang 目标语言。
 * @returns {string} 追加后的表达式。
 */
function appendNumericSegment(expr, index, lang) {
    if (lang === 'java') return `${expr}.get(${index})`;
    return `${expr}[${index}]`;
}

/**
 * 为指定语言追加对象键访问，必要时自动使用 bracket notation。
 * @param {string} expr 当前表达式。
 * @param {string} key 对象键名。
 * @param {string} lang 目标语言。
 * @returns {string} 追加后的表达式。
 */
function appendStringSegment(expr, key, lang) {
    if (lang === 'javascript' || lang === 'csharp') return isIdentifierKey(key) ? `${expr}.${key}` : `${expr}[${quoteString(key)}]`;
    if (lang === 'python' || lang === 'php' || lang === 'rust') return `${expr}[${quoteString(key)}]`;
    if (lang === 'java') return `${expr}.get(${quoteString(key)})`;
    return `${expr}[${quoteString(key)}]`;
}

/**
 * 生成 JavaScript 安全访问示例。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @returns {string} JavaScript 代码字符串。
 */
function buildJavaScriptSafeCode(pathParts) {
    const tokens = pathParts.map((part) => {
        if (typeof part === 'number') return `?.[${part}]`;
        return isIdentifierKey(part) ? `?.${part}` : `?.[${quoteString(part)}]`;
    });
    return `const value = data${tokens.join('')};`;
}

/**
 * 生成 JavaScript 推荐写法，优先展示 optional chaining 与空值兜底。
 * @param {Array<string|number>} pathParts 当前路径对应值。
 * @param {*} value 当前路径对应值。
 * @returns {{code:string,result:string}} JavaScript 推荐示例。
 */
function buildJavaScriptSample(pathParts, value) {
    const code = `${buildJavaScriptSafeCode(pathParts)}\nconst result = value ?? null;`;
    return createRecommendedSample(code, value, 'javascript');
}

/**
 * 生成 Python 推荐写法，使用短小的 try/except 保持可读性。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @param {*} value 当前路径对应值。
 * @returns {{code:string,result:string}} Python 推荐示例。
 */
function buildPythonSample(pathParts, value) {
    return createRecommendedSample(buildPythonSafeCode(pathParts), value, 'python');
}


/**
 * 生成更短、更常见的 Python 安全访问示例。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @returns {string} Python 代码字符串；路径异常时回落到 None。
 */
function buildPythonSafeCode(pathParts) {
    const expr = pathToExpr(pathParts, 'python');
    return `try:\n    value = ${expr}\nexcept (KeyError, IndexError, TypeError):\n    value = None`;
}

/**
 * 生成 Java 安全访问示例，按节点类型拼接 optJSONObject/optJSONArray/opt。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @returns {string} Java 代码字符串。
 */
function buildJavaSafeCode(pathParts) {
    return buildJavaChainCode(parsedData, pathParts, true);
}

/**
 * 按路径节点类型生成 org.json 链式访问代码。
 * @param {*} source 根数据。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @param {boolean} useSafe 是否生成 opt 风格代码。
 * @returns {string} org.json 风格访问表达式。
 */
function buildJavaChainCode(source, pathParts, useSafe) {
    let expr = 'json';
    let current = source;
    pathParts.forEach((part, index) => {
        const next = current?.[part];
        const isLast = index === pathParts.length - 1;
        expr += buildJavaChainStep(part, next, isLast, useSafe);
        current = next;
    });
    return expr;
}

/**
 * 为 Java 链式访问生成单个步骤，优先输出更贴近真实项目的类型方法。
 * @param {string|number} part 当前路径片段。
 * @param {*} nextValue 该片段对应的下一层值。
 * @param {boolean} isLast 当前片段是否为最后一步。
 * @param {boolean} useSafe 是否生成 opt 风格方法。
 * @returns {string} 单步 Java 访问代码。
 */
function buildJavaChainStep(part, nextValue, isLast, useSafe) {
    const suffix = typeof part === 'number' ? part : quoteString(part);
    if (!isLast) return `.${pickJavaContainerMethod(nextValue, useSafe)}(${suffix})`;
    return `.${pickJavaValueMethod(nextValue, useSafe)}(${suffix})`;
}

/**
 * 根据下一层容器类型选择 Java 容器访问方法。
 * @param {*} nextValue 下一层值。
 * @param {boolean} useSafe 是否生成 opt 风格方法。
 * @returns {string} org.json 容器访问方法名。
 */
function pickJavaContainerMethod(nextValue, useSafe) {
    if (Array.isArray(nextValue)) return useSafe ? 'optJSONArray' : 'getJSONArray';
    return useSafe ? 'optJSONObject' : 'getJSONObject';
}

/**
 * 根据最终值类型选择 Java 值访问方法。
 * @param {*} value 最终值。
 * @param {boolean} useSafe 是否生成 opt 风格方法。
 * @returns {string} org.json 值访问方法名。
 */
function pickJavaValueMethod(value, useSafe) {
    if (typeof value === 'string') return useSafe ? 'optString' : 'getString';
    if (typeof value === 'number') return Number.isInteger(value) ? (useSafe ? 'optInt' : 'getInt') : (useSafe ? 'optDouble' : 'getDouble');
    if (typeof value === 'boolean') return useSafe ? 'optBoolean' : 'getBoolean';
    if (value === null) return useSafe ? 'opt' : 'get';
    if (Array.isArray(value)) return useSafe ? 'optJSONArray' : 'getJSONArray';
    if (typeof value === 'object') return useSafe ? 'optJSONObject' : 'getJSONObject';
    return useSafe ? 'opt' : 'get';
}

/**
 * 生成 Java 推荐写法，保持 org.json 的 opt 链式访问。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @param {*} value 当前路径对应值。
 * @returns {{code:string,result:string}} Java 推荐示例。
 */
function buildJavaSample(pathParts, value) {
    const code = `Object value = ${buildJavaSafeCode(pathParts)};`;
    return createRecommendedSample(code, value, 'java');
}


/**
 * 生成 Go 推荐写法，显式判定 map 和 slice 访问是否成功。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @param {*} value 当前路径对应值。
 * @returns {{code:string,result:string}} Go 推荐示例。
 */
function buildGoSample(pathParts, value) {
    return createRecommendedSample(buildGoSafeCode(pathParts), value, 'go');
}


/**
 * 为 Go 安全访问构造单步代码片段。
 * @param {string|number} part 当前路径片段。
 * @returns {Array<string>} 对应片段的 Go 代码行数组。
 */
function buildGoSafeStep(part) {
    if (typeof part === 'number') {
        return ['items, ok := value.([]any)', `if !ok || len(items) <= ${part} {`, '    value = nil', '} else {', `    value = items[${part}]`, '}'];
    }
    return ['obj, ok := value.(map[string]any)', 'if !ok {', '    value = nil', '} else {', `    value = obj[${quoteString(part)}]`, '}'];
}

/**
 * 生成 Go 安全访问示例，显式区分 map 与 slice，避免示例误导。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @returns {string} Go 代码字符串。
 */
function buildGoSafeCode(pathParts) {
    const lines = ['value := any(data)'];
    pathParts.forEach((part) => lines.push(...buildGoSafeStep(part)));
    return lines.join('\n');
}

/**
 * 生成 PHP 推荐写法，使用 null 合并操作符减少分支噪声。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @param {*} value 当前路径对应值。
 * @returns {{code:string,result:string}} PHP 推荐示例。
 */
function buildPhpSample(pathParts, value) {
    const expr = pathToExpr(pathParts, 'php');
    return createRecommendedSample(`$value = ${expr} ?? null;`, value, 'php');
}

/**
 * 生成 C# 安全访问示例，基于 JObject/JArray 与 null 判断。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @returns {string} C# 代码字符串。
 */
function buildCSharpSafeCode(pathParts) {
    return `var token = data.SelectToken(${quoteString(formatJsonPath(pathParts))});\nvar value = token?.ToObject<object>();`;
}

/**
 * 生成 C# 推荐写法，使用 SelectToken 统一对象与数组路径访问。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @param {*} value 当前路径对应值。
 * @returns {{code:string,result:string}} C# 推荐示例。
 */
function buildCSharpSample(pathParts, value) {
    return createRecommendedSample(buildCSharpSafeCode(pathParts), value, 'csharp');
}


/**
 * 生成 Rust 安全访问示例，基于 serde_json::Value::get。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @returns {string} Rust 代码字符串。
 */
function buildRustSafeCode(pathParts) {
    const chain = pathParts.map((part) => `.and_then(|v| v.get(${typeof part === 'number' ? part : quoteString(part)}))`).join('');
    return `let value = Some(&data)${chain};`;
}

/**
 * 生成 Rust 推荐写法，使用 get 链和 as_ref 保持返回值明确。
 * @param {Array<string|number>} pathParts 当前路径数组。
 * @param {*} value 当前路径对应值。
 * @returns {{code:string,result:string}} Rust 推荐示例。
 */
function buildRustSample(pathParts, value) {
    return createRecommendedSample(buildRustSafeCode(pathParts), value, 'rust');
}

/**
 * 组装单个推荐代码示例与结果说明，避免各语言重复拼装 HTML。
 * @param {string} code 推荐代码。
 * @param {*} value 当前路径对应值。
 * @param {'javascript'|'python'|'java'|'go'|'php'|'csharp'|'rust'} lang 当前语言。
 * @returns {{code:string,result:string}} 推荐示例对象。
 */
function createRecommendedSample(code, value, lang) {
    return { code, result: buildResultHtml(value, lang) };
}

/**
 * 生成代码示例下方的结果说明，让用户直接看到命中结果与缺失返回值。
 * @param {*} value 当前路径对应值。
 * @param {'javascript'|'python'|'java'|'go'|'php'|'csharp'|'rust'} lang 当前语言。
 * @returns {string} 可直接注入的结果说明 HTML。
 */
function buildResultHtml(value, lang) {
    const preview = escapeHtml(formatResultValue(value, lang));
    const fallback = getMissingPathResult(lang);
    return `<strong>结果示例</strong> <code>${preview}</code><span class="code-result-note">路径不存在时返回 <code>${fallback}</code></span>`;
}

/**
 * 为不同语言返回推荐写法在缺失路径时的典型结果值。
 * @param {'javascript'|'python'|'java'|'go'|'php'|'csharp'|'rust'} lang 当前语言。
 * @returns {string} 对应语言常见的空值文本。
 */
function getMissingPathResult(lang) {
    return {
        javascript: 'null', python: 'None', java: 'null', go: 'nil',
        php: 'null', csharp: 'null', rust: 'None'
    }[lang] || 'null';
}

/**
 * 将当前值转成结果预览文本，避免对象直接渲染成 [object Object]。
 * @param {*} value 当前路径对应值。
 * @param {string} lang 当前语言，仅用于注释语义保持一致。
 * @returns {string} 简短且稳定的结果预览文本。
 */
function formatResultValue(value, lang) {
    void lang;
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
    return JSON.stringify(value);
}

/**
 * 切换代码语言并刷新当前选中路径的代码示例。
 * @param {HTMLButtonElement} tabEl 当前语言标签按钮。
 * @returns {void} 如果未选中路径，则保持空状态代码展示。
 */
function switchLang(tabEl) {
    document.querySelectorAll('.lang-tab').forEach((tab) => {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
    });
    tabEl.classList.add('active');
    tabEl.setAttribute('aria-selected', 'true');
    currentLang = tabEl.dataset.lang;
    if (parsedData !== null) updateCodeGeneration(selectedPath);
}

/**
 * 切换底部信息标签页。
 * @param {HTMLButtonElement} tabEl 当前点击的标签按钮。
 * @param {'pathInfo'|'codeGen'} tabId 目标标签页 ID。
 * @returns {void} 该函数仅切换显示与 aria 选中状态。
 */
function switchBottomTab(tabEl, tabId) {
    tabEl.parentElement.querySelectorAll('.side-tab').forEach((tab) => {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
    });
    tabEl.classList.add('active');
    tabEl.setAttribute('aria-selected', 'true');
    document.getElementById('tab-pathInfo').classList.toggle('hidden', tabId !== 'pathInfo');
    document.getElementById('tab-codeGen').classList.toggle('hidden', tabId !== 'codeGen');
}

/**
 * 将路径数组转为界面内部路径字符串，便于 DOM data-path 匹配。
 * @param {Array<string|number>} pathParts 路径数组。
 * @returns {string} 以 data 为根的路径字符串。
 */
function formatPath(pathParts) {
    return pathParts.reduce((path, part) => {
        if (typeof part === 'number') return `${path}[${part}]`;
        return isIdentifierKey(part) ? `${path}.${part}` : `${path}[${quoteString(part)}]`;
    }, 'data');
}

/**
 * 判断键名是否适合使用点号访问。
 * @param {string} key 需要判断的对象键名。
 * @returns {boolean} 仅当键名符合 JS 标识符规则时返回 true。
 */
function isIdentifierKey(key) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

/**
 * 对字符串进行 JSON 风格转义，供 bracket notation 和 JSONPath 使用。
 * @param {string} value 需要包裹和转义的字符串。
 * @returns {string} 带双引号的安全字符串。
 */
function quoteString(value) {
    return JSON.stringify(String(value));
}

/**
 * 转义 HTML 特殊字符，避免用户输入被当作标签插入页面。
 * @param {string} str 原始字符串。
 * @returns {string} 转义后的 HTML 文本。
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * 创建 DOM 元素并批量赋值，便于保持渲染代码简洁。
 * @param {string} tag 元素标签名。
 * @param {Record<string, *>} [props] 需要挂到元素上的属性对象。
 * @returns {HTMLElement} 创建好的 DOM 元素。
 */
function createElement(tag, props) {
    const el = document.createElement(tag);
    if (props) Object.assign(el, props);
    if (props && props.style) el.setAttribute('style', props.style);
    return el;
}

/**
 * 格式化输入框中的 JSON，失败时给出错误提示。
 * @returns {void} 成功会直接覆盖输入框内容。
 */
function formatInput() {
    transformInputJson((data) => JSON.stringify(data, null, 2), '已格式化', 'JSON 格式错误，无法格式化');
}

/**
 * 将输入框中的 JSON 压缩为单行。
 * @returns {void} 成功会直接覆盖输入框内容。
 */
function compressInput() {
    transformInputJson((data) => JSON.stringify(data), '已压缩', 'JSON 格式错误，无法压缩');
}

/**
 * 统一处理输入框 JSON 转换逻辑，减少格式化和压缩的重复实现。
 * @param {(data: *) => string} transformer JSON 转换函数。
 * @param {string} successMessage 成功提示文案。
 * @param {string} errorMessage 失败提示文案。
 * @returns {void} 解析失败时不会修改输入框内容。
 */
function transformInputJson(transformer, successMessage, errorMessage) {
    const input = document.getElementById('jsonInput');
    try {
        input.value = transformer(JSON.parse(input.value));
        showToast(successMessage);
    } catch {
        showToast(errorMessage, 'error');
    }
}

/**
 * 清空输入框、树、路径、详情和选择状态。
 * @returns {void} 该函数会恢复页面到首次加载状态。
 */
function clearInput() {
    document.getElementById('jsonInput').value = '';
    parsedData = null;
    allPaths = [];
    document.getElementById('pathCount').textContent = '0';
    document.getElementById('pathSearch').value = '';
    initUI();
    clearSelectionState();
    setStatus('idle', '等待输入');
    showToast('已清空');
}

/**
 * 复制输入框内容到剪贴板。
 * @returns {void} 空字符串也允许复制，失败时会提示用户。
 */
function copyInput() {
    copyText(document.getElementById('jsonInput').value, '已复制输入内容');
}

/**
 * 加载示例 JSON，并立即解析渲染。
 * @returns {void} 该函数会覆盖输入框已有内容。
 */
function loadSample() {
    document.getElementById('jsonInput').value = JSON.stringify(SAMPLE_JSON, null, 2);
    parseAndRender();
}

/**
 * 复制当前代码块内容。
 * @param {'direct'|'safe'} type 代码块类型。
 * @returns {void} 若未生成 code 标签，则复制整个文本内容。
 */
function copyCode() {
    const codeEl = document.querySelector('#codeRecommended code');
    const text = codeEl ? codeEl.textContent : document.getElementById('codeRecommended').textContent;
    copyText(text, '代码已复制');
}

/**
 * 复制当前路径字符串。
 * @returns {void} 未解析 JSON 时提示用户先完成解析。
 */
function copyCurrentPath() {
    if (parsedData === null) {
        showToast('请先解析 JSON 并选择路径', 'error');
        return;
    }
    copyText(formatPath(selectedPath), '当前路径已复制');
}

/**
 * 复制当前 JSONPath 表达式。
 * @returns {void} 未解析 JSON 时提示用户先完成解析。
 */
function copyCurrentJsonPath() {
    if (parsedData === null) {
        showToast('请先解析 JSON', 'error');
        return;
    }
    copyText(formatJsonPath(selectedPath), 'JSONPath 已复制');
}

/**
 * 展开树中所有折叠节点。
 * @returns {void} 不依赖当前是否存在 JSON 树内容。
 */
function expandAll() {
    document.querySelectorAll('.tree-children.collapsed').forEach((el) => el.classList.remove('collapsed'));
    document.querySelectorAll('.tree-toggle').forEach((el) => el.classList.add('expanded'));
    showToast('已展开全部');
}

/**
 * 折叠树中所有可折叠节点。
 * @returns {void} 根节点若无 children 不会受影响。
 */
function collapseAll() {
    document.querySelectorAll('.tree-children:not(.collapsed)').forEach((el) => el.classList.add('collapsed'));
    document.querySelectorAll('.tree-toggle.expanded').forEach((el) => el.classList.remove('expanded'));
    showToast('已折叠全部');
}

/**
 * 收集并渲染全部路径；支持静默模式避免解析时重复提示。
 * @param {boolean} [showFeedback=true] 是否显示成功提示。
 * @returns {void} 若未解析 JSON，会提示用户先解析。
 */
function extractAllPaths(showFeedback = true) {
    if (parsedData === null) {
        document.getElementById('pathList').innerHTML = PATH_LIST_EMPTY_HTML;
        document.getElementById('pathCount').textContent = '0';
        if (showFeedback) showToast('请先解析 JSON', 'error');
        return;
    }
    allPaths = [];
    collectPaths(parsedData, []);
    renderPathList(allPaths);
    document.getElementById('pathCount').textContent = String(allPaths.length);
    if (showFeedback) showToast(`已同步 ${allPaths.length} 条路径`);
}

/**
 * 递归收集所有节点路径，包含对象、数组和基础值节点。
 * @param {*} data 当前节点值。
 * @param {Array<string|number>} currentPath 当前路径数组。
 * @returns {void} 结果会写入全局 allPaths。
 */
function collectPaths(data, currentPath) {
    allPaths.push({ path: [...currentPath], type: getValueType(data), value: getPathValuePreview(data) });
    if (data === null || typeof data !== 'object') return;
    if (Array.isArray(data)) {
        data.forEach((item, index) => collectPaths(item, [...currentPath, index]));
        return;
    }
    Object.keys(data).forEach((key) => collectPaths(data[key], [...currentPath, key]));
}

/**
 * 获取值的类型标签，用于路径列表展示。
 * @param {*} value 当前值。
 * @returns {'null'|'array'|'object'|'string'|'number'|'boolean'} 简化类型标签。
 */
function getValueType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return typeof value;
}

/**
 * 生成路径列表中的值预览内容，避免把大对象完整塞进列表。
 * @param {*} value 当前值。
 * @returns {string} 可用于搜索与列表提示的预览文本。
 */
function getPathValuePreview(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `Array[${value.length}]`;
    if (typeof value === 'object') return `Object{${Object.keys(value).length}}`;
    return String(value);
}

/**
 * 渲染路径列表，并支持当前选中项高亮。
 * @param {Array<{path:Array<string|number>, type:string, value:string}>} paths 要展示的路径集合。
 * @returns {void} 路径为空时会显示搜索空状态。
 */
function renderPathList(paths) {
    const container = document.getElementById('pathList');
    container.innerHTML = '';
    if (paths.length === 0) {
        container.innerHTML = createEmptyStateHTML('search', '没有匹配路径', '可以尝试换一个搜索关键词，或者重新解析 JSON。');
        return;
    }
    const fragment = document.createDocumentFragment();
    paths.forEach((item) => fragment.appendChild(createPathItem(item)));
    container.appendChild(fragment);
    updatePathListHighlight();
}

/**
 * 创建单个路径列表项。
 * @param {{path:Array<string|number>, type:string, value:string}} item 路径列表项数据。
 * @returns {HTMLButtonElement} 带点击行为的按钮元素。
 */
function createPathItem(item) {
    const el = document.createElement('button');
    const pathStr = formatPath(item.path);
    el.type = 'button';
    el.className = 'path-item';
    el.dataset.path = pathStr;
    el.title = pathStr;
    el.onclick = () => selectPathFromList(item.path);
    el.innerHTML = `<span class="path-type type-${item.type}">${item.type}</span><span class="path-item-text">${escapeHtml(pathStr)}</span>`;
    return el;
}

/**
 * 从路径列表中选中某一项，并同步树高亮和详情展示。
 * @param {Array<string|number>} pathParts 目标路径数组。
 * @returns {void} 路径不存在时会回退为 undefined 展示。
 */
function selectPathFromList(pathParts) {
    const value = getValueByPath(parsedData, pathParts);
    const line = Array.from(document.querySelectorAll('#treeView .tree-line')).find((item) => item.dataset.path === formatPath(pathParts)) || null;
    selectPath(pathParts, value, line);
    switchBottomTab(document.querySelector('[data-tab="pathInfo"]'), 'pathInfo');
    if (!line) return;
    expandParents(line);
    requestAnimationFrame(() => balanceViewportForSelection(line));
}

/**
 * 协调树节点和详情区的视口位置，优先保证目标行落在 tree-container 底部可视区域附近。
 * @param {HTMLElement} line 目标树行元素。
 * @returns {void} 该函数会先做 tree-container 内滚动，再做整页轻量微调。
 */
function balanceViewportForSelection(line) {
    const tree = document.getElementById('treeView');
    const details = document.getElementById('detailsPanel');
    const viewport = getViewportBounds();
    revealLineInsideTree(tree, line);
    requestAnimationFrame(() => gentlyAlignPageForPanels(details, line, viewport));
}

/**
 * 返回当前视口的可用上下边界，预留顶部 header 和底部阅读缓冲。
 * @returns {{top:number,bottom:number,height:number}} 视口边界信息。
 */
function getViewportBounds() {
    const headerOffset = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-offset'), 10) || 88;
    const top = headerOffset + 12;
    const bottom = window.innerHeight - 20;
    return { top, bottom, height: bottom - top };
}

/**
 * 返回目标树行在 tree-container 内部的上下边界，避免误用内部 tree-node 作为参考系。
 * @param {HTMLElement} tree 树容器元素。
 * @param {HTMLElement} line 目标树行元素。
 * @returns {{top:number,bottom:number,height:number}} 目标行相对 tree-container 内容区的位置。
 */
function getLinePositionInTree(tree, line) {
    const treeRect = tree.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
    const top = lineRect.top - treeRect.top + tree.scrollTop;
    return { top, bottom: top + lineRect.height, height: lineRect.height };
}

/**
 * 计算 tree-container 内部的目标滚动值，让树行底边靠近容器底部并保留阅读留白。
 * @param {HTMLElement} tree 树容器元素。
 * @param {{top:number,bottom:number,height:number}} linePosition 目标树行在容器内容区的位置。
 * @returns {number|null} 需要滚动到的 scrollTop；若当前位置已合适则返回 null。
 */
function getTreeRevealTarget(tree, linePosition) {
    const bottomGap = 36;
    const stableBand = 12;
    const viewTop = tree.scrollTop;
    const viewBottom = viewTop + tree.clientHeight;
    const desiredBottom = viewBottom - bottomGap;
    if (Math.abs(linePosition.bottom - desiredBottom) <= stableBand) return null;
    if (linePosition.bottom <= desiredBottom && linePosition.bottom >= desiredBottom - 48) return null;

    // 以 tree-container 底边为基准反推 scrollTop，确保目标行不是只在内部节点容器里“勉强可见”。
    const nextTop = linePosition.bottom - tree.clientHeight + bottomGap;
    const maxTop = Math.max(0, tree.scrollHeight - tree.clientHeight);
    return Math.max(0, Math.min(maxTop, nextTop));
}

/**
 * 在树容器内部平滑显示目标节点，让目标行底边靠近 tree-container 底部留白区。
 * @param {HTMLElement} tree 树容器元素。
 * @param {HTMLElement} line 目标树行元素。
 * @returns {void} 该函数只调整 tree-container 的 scrollTop。
 */
function revealLineInsideTree(tree, line) {
    const targetTop = getTreeRevealTarget(tree, getLinePositionInTree(tree, line));
    if (targetTop === null) return;
    tree.scrollTo({ top: targetTop, behavior: 'smooth' });
}

/**
 * 轻量调整整页滚动，尽量同时保留树节点高亮与详情面板主体可见。
 * @param {HTMLElement} details 详情面板元素。
 * @param {HTMLElement} line 目标树行元素。
 * @param {{top:number,bottom:number,height:number}} viewport 当前视口边界。
 * @returns {void} 仅在可见性不足时执行受限滚动。
 */
function gentlyAlignPageForPanels(details, line, viewport) {
    const lineRect = line.getBoundingClientRect();
    const detailsRect = details.getBoundingClientRect();
    const delta = getPageAdjustDelta(lineRect, detailsRect, viewport);
    if (Math.abs(delta) < 6) return;
    window.scrollBy({ top: delta, behavior: 'smooth' });
}

/**
 * 计算页面需要微调的滚动量，避免树节点或详情区任何一侧完全离开视口。
 * @param {DOMRect} lineRect 目标树行位置。
 * @param {DOMRect} detailsRect 详情面板位置。
 * @param {{top:number,bottom:number,height:number}} viewport 当前视口边界。
 * @returns {number} 建议的整页滚动偏移量。
 */
function getPageAdjustDelta(lineRect, detailsRect, viewport) {
    const lineDelta = getLineVisibilityDelta(lineRect, viewport);
    const detailsDelta = getDetailsVisibilityDelta(detailsRect, viewport);
    const desired = lineDelta || detailsDelta;
    return Math.max(-140, Math.min(140, desired));
}

/**
 * 计算让目标树行保持清晰可见所需的滚动量。
 * @param {DOMRect} lineRect 目标树行位置。
 * @param {{top:number,bottom:number}} viewport 当前视口边界。
 * @returns {number} 页面滚动偏移量；无需调整时返回 0。
 */
function getLineVisibilityDelta(lineRect, viewport) {
    if (lineRect.top < viewport.top + 18) return lineRect.top - viewport.top - 18;
    if (lineRect.bottom > viewport.bottom - 120) return lineRect.bottom - viewport.bottom + 120;
    return 0;
}

/**
 * 计算让详情面板顶部和主要内容留在视口内所需的滚动量。
 * @param {DOMRect} detailsRect 详情面板位置。
 * @param {{top:number,bottom:number,height:number}} viewport 当前视口边界。
 * @returns {number} 页面滚动偏移量；无需调整时返回 0。
 */
function getDetailsVisibilityDelta(detailsRect, viewport) {
    const visibleHeight = Math.min(detailsRect.bottom, viewport.bottom) - Math.max(detailsRect.top, viewport.top);
    const minimumVisible = Math.min(260, Math.max(160, viewport.height * 0.28));
    const topDelta = detailsRect.top > viewport.bottom - 80 ? detailsRect.top - viewport.bottom + 80 : 0;

    // 仅把面板顶部拉进视口还不够；若主要内容仍然太少，就按最低可读高度继续补滚一段。
    const contentDelta = visibleHeight < minimumVisible ? detailsRect.bottom - viewport.bottom + 24 : 0;
    return Math.max(topDelta, contentDelta);
}


/**
 * 按路径逐段取值，用于列表选择和代码示例联动。
 * @param {*} source 根数据。
 * @param {Array<string|number>} pathParts 路径数组。
 * @returns {*} 路径存在则返回对应值，否则返回 undefined。
 */
function getValueByPath(source, pathParts) {
    return pathParts.reduce((value, part) => {
        if (value === null || value === undefined) return undefined;
        return value[part];
    }, source);
}

/**
 * 展开目标树行的父级节点，避免从列表跳转时目标仍处于折叠状态。
 * @param {HTMLElement} line 目标树行元素。
 * @returns {void} 该函数会逐层恢复 expanded 状态。
 */
function expandParents(line) {
    let node = line.closest('.tree-node');
    while (node) {
        const children = node.querySelector(':scope > .tree-children');
        const toggle = node.querySelector(':scope > .tree-line .tree-toggle');
        if (children) children.classList.remove('collapsed');
        if (toggle) toggle.classList.add('expanded');
        node = node.parentElement ? node.parentElement.closest('.tree-node') : null;
    }
}

/**
 * 根据搜索关键字过滤路径列表。
 * @returns {void} 搜索为空时恢复全量列表。
 */
function filterPaths() {
    const keyword = document.getElementById('pathSearch').value.trim().toLowerCase();
    if (!keyword) {
        renderPathList(allPaths);
        return;
    }
    renderPathList(allPaths.filter((item) => buildSearchText(item).includes(keyword)));
}

/**
 * 拼接路径列表搜索文本，统一包含路径、值和类型。
 * @param {{path:Array<string|number>, type:string, value:string}} item 路径项数据。
 * @returns {string} 小写的可搜索文本。
 */
function buildSearchText(item) {
    return `${formatPath(item.path)} ${item.value} ${item.type}`.toLowerCase();
}

/**
 * 复制全部路径及类型说明。
 * @returns {void} 无路径时提示用户先解析 JSON。
 */
function copyAllPaths() {
    if (allPaths.length === 0) {
        showToast('当前没有可复制的路径', 'error');
        return;
    }
    const text = allPaths.map((item) => `${formatPath(item.path)}  (${item.type})`).join('\n');
    copyText(text, `已复制 ${allPaths.length} 条路径`);
}

/**
 * 判断当前环境是否可以优先使用 Clipboard API。
 * @returns {boolean} 仅在安全上下文且存在可调用的 writeText 时返回 true。
 */
function canUseClipboardApi() {
    return window.isSecureContext && !!navigator.clipboard && typeof navigator.clipboard.writeText === 'function';
}

/**
 * 记录当前焦点元素与选区，便于 fallback 复制后恢复用户上下文。
 * @returns {{activeElement:Element|null,ranges:Range[],inputSelection:{start:number,end:number,direction:string|null}|null}} 保存的焦点元素、文档选区和输入框选区快照。
 */
function captureSelectionState() {
    const selection = window.getSelection();
    const activeElement = document.activeElement;
    const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
    const inputSelection = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
        ? { start: activeElement.selectionStart ?? 0, end: activeElement.selectionEnd ?? 0, direction: activeElement.selectionDirection }
        : null;
    return { activeElement, ranges, inputSelection };
}

/**
 * 恢复 fallback 复制前的焦点和选区，尽量减少对用户操作状态的干扰。
 * @param {{activeElement:Element|null,ranges:Range[],inputSelection:{start:number,end:number,direction:string|null}|null}} state 之前保存的焦点与选区快照。
 * @returns {void} 不存在可恢复内容时会直接跳过。
 */
function restoreSelectionState(state) {
    const selection = window.getSelection();
    if (selection) {
        selection.removeAllRanges();
        state.ranges.forEach((range) => selection.addRange(range));
    }
    if (!(state.activeElement instanceof HTMLElement)) return;
    state.activeElement.focus({ preventScroll: true });
    if (!state.inputSelection) return;
    if (state.activeElement instanceof HTMLInputElement || state.activeElement instanceof HTMLTextAreaElement) {
        state.activeElement.setSelectionRange(state.inputSelection.start, state.inputSelection.end, state.inputSelection.direction || 'none');
    }
}

/**
 * 创建用于传统复制方案的隐藏 textarea，不影响页面布局但允许移动端正常选中。
 * @param {string} text 待复制文本。
 * @returns {HTMLTextAreaElement} 已写入文本并完成样式设置的 textarea 元素。
 */
function createClipboardTextarea(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    return textarea;
}

/**
 * 使用隐藏 textarea 和 execCommand 执行兼容复制，并尽量恢复原有焦点与选区。
 * @param {string} text 待复制文本。
 * @returns {boolean} execCommand 返回 true 视为复制成功，否则返回 false。
 */
function copyTextWithExecCommand(text) {
    const state = captureSelectionState();
    const textarea = createClipboardTextarea(text);
    let copied = false;
    try {
        textarea.focus({ preventScroll: true });
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        copied = document.execCommand('copy');
    } catch {
        copied = false;
    }
    textarea.remove();
    restoreSelectionState(state);
    return copied;
}

/**
 * 优先使用 Clipboard API 复制文本；不可用或失败时回退到 execCommand 方案。
 * @param {string} text 待复制文本。
 * @returns {Promise<void>} 任一方案成功即 resolve，全部失败时 reject。
 */
async function writeClipboardText(text) {
    if (canUseClipboardApi()) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
            // 安全上下文下也可能被权限策略、浏览器限制或用户手势要求拦截，因此继续尝试传统复制方案。
        }
    }
    if (copyTextWithExecCommand(text)) return;
    throw new Error('Clipboard unavailable');
}

/**
 * 把文本复制到剪贴板，并统一处理成功与失败提示。
 * @param {string} text 待复制文本。
 * @param {string} successMessage 复制成功后的提示。
 * @returns {Promise<void>} 成功时提示成功，双重方案都失败时提示失败。
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
 * 更新路径列表中的选中高亮。
 * @returns {void} 未选中任何路径时会清除所有 active 状态。
 */
function updatePathListHighlight() {
    const current = formatPath(selectedPath);
    document.querySelectorAll('#pathList .path-item').forEach((item) => {
        item.classList.toggle('active', hasSelection && item.dataset.path === current);
    });
}

/**
 * 聚焦路径列表，方便移动端在解析后快速查看结果。
 * @returns {void} 仅执行滚动与 focus，不改变数据状态。
 */
function focusPathList() {
    const el = document.getElementById('pathList');
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.focus();
}

/**
 * 聚焦详情区，方便移动端查看当前路径与代码示例。
 * @returns {void} 仅执行滚动行为。
 */
function focusDetails() {
    document.getElementById('detailsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * 为代码字符串执行简单语法高亮。
 * @param {string} code 原始代码文本。
 * @param {'js'|'py'|'java'|'go'|'php'|'cs'|'rs'} lang 语言类型。
 * @returns {string} 带高亮 span 的 HTML 字符串。
 */
function escapeAndHighlight(code, lang) {
    let highlighted = escapeHtml(code);
    getLanguageKeywords(lang).forEach((keyword) => {
        highlighted = highlighted.replace(new RegExp(`\\b(${keyword})\\b`, 'g'), '<span class="code-kw">$1</span>');
    });
    highlighted = highlighted.replace(/(&quot;[^&]*?&quot;)/g, '<span class="code-str">$1</span>');
    highlighted = highlighted.replace(/\b(\d+)\b/g, '<span class="code-num">$1</span>');
    return highlighted.replace(/(\/\/.*|#.*)$/gm, '<span class="code-cm">$1</span>');
}

/**
 * 获取各语言关键字列表，用于轻量高亮。
 * @param {'js'|'py'|'java'|'go'|'php'|'cs'|'rs'} lang 语言标识。
 * @returns {Array<string>} 对应语言的关键字数组。
 */
function getLanguageKeywords(lang) {
    return {
        js: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'true', 'false', 'null', 'undefined'],
        py: ['def', 'return', 'if', 'else', 'elif', 'True', 'False', 'None', 'for', 'in', 'break', 'try', 'except'],
        java: ['Object', 'return', 'if', 'else', 'null', 'true', 'false'],
        go: ['var', 'nil', 'true', 'false', 'if', 'else', 'any'],
        php: ['if', 'else', 'null', 'isset'],
        cs: ['var', 'null', 'if', 'else'],
        rs: ['let', 'if', 'else', 'Some', 'None']
    }[lang] || [];
}

/**
 * 包装 JavaScript 代码高亮输出。
 * @param {string} code 原始代码文本。
 * @returns {string} 包含 code 标签的 HTML 字符串。
 */
function highlightJS(code) { return `<code>${escapeAndHighlight(code, 'js')}</code>`; }

/**
 * 包装 Python 代码高亮输出。
 * @param {string} code 原始代码文本。
 * @returns {string} 包含 code 标签的 HTML 字符串。
 */
function highlightPython(code) { return `<code>${escapeAndHighlight(code, 'py')}</code>`; }

/**
 * 包装 Java 代码高亮输出。
 * @param {string} code 原始代码文本。
 * @returns {string} 包含 code 标签的 HTML 字符串。
 */
function highlightJava(code) { return `<code>${escapeAndHighlight(code, 'java')}</code>`; }

/**
 * 包装 Go 代码高亮输出。
 * @param {string} code 原始代码文本。
 * @returns {string} 包含 code 标签的 HTML 字符串。
 */
function highlightGo(code) { return `<code>${escapeAndHighlight(code, 'go')}</code>`; }

/**
 * 包装 PHP 代码高亮输出。
 * @param {string} code 原始代码文本。
 * @returns {string} 包含 code 标签的 HTML 字符串。
 */
function highlightPHP(code) { return `<code>${escapeAndHighlight(code, 'php')}</code>`; }

/**
 * 包装 C# 代码高亮输出。
 * @param {string} code 原始代码文本。
 * @returns {string} 包含 code 标签的 HTML 字符串。
 */
function highlightCSharp(code) { return `<code>${escapeAndHighlight(code, 'cs')}</code>`; }

/**
 * 包装 Rust 代码高亮输出。
 * @param {string} code 原始代码文本。
 * @returns {string} 包含 code 标签的 HTML 字符串。
 */
function highlightRust(code) { return `<code>${escapeAndHighlight(code, 'rs')}</code>`; }

/**
 * 初始化输入框相关事件，包括快捷键、实时校验、粘贴自动解析和拖拽上传。
 * @returns {void} 该函数仅绑定事件，不直接修改已有数据。
 */
function bindInputEvents() {
    const input = document.getElementById('jsonInput');
    document.addEventListener('keydown', handleShortcutKeydown);
    input.addEventListener('keydown', handleInputTabIndent);
    input.addEventListener('input', handleInputDebouncedValidation);
    input.addEventListener('paste', handleInputPaste);
    input.addEventListener('dragover', handleInputDragOver);
    input.addEventListener('dragleave', handleInputDragLeave);
    input.addEventListener('drop', handleInputDrop);
}

/**
 * 处理全局快捷键，包括解析、格式化和加载示例。
 * @param {KeyboardEvent} event 键盘事件对象。
 * @returns {void} 匹配成功时会阻止默认浏览器行为。
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
    if (event.ctrlKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        loadSample();
    }
}

/**
 * 支持 textarea 中的 Tab 缩进，避免焦点直接跳出输入框。
 * @param {KeyboardEvent} event 键盘事件对象。
 * @returns {void} 按下 Tab 时会在光标位置插入两个空格。
 */
function handleInputTabIndent(event) {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = `${input.value.slice(0, start)}  ${input.value.slice(end)}`;
    input.selectionStart = input.selectionEnd = start + 2;
}

/**
 * 对输入内容做防抖校验，仅更新状态，不直接触发重渲染。
 * @param {Event} event 输入事件对象。
 * @returns {void} 空输入时回到 idle 状态。
 */
function handleInputDebouncedValidation(event) {
    clearTimeout(parseTimer);
    const value = event.currentTarget.value.trim();
    if (!value) {
        setStatus('idle', '等待输入');
        return;
    }
    parseTimer = setTimeout(() => validateJsonText(value), 400);
}

/**
 * 校验 JSON 文本是否合法，并更新头部状态文案。
 * @param {string} text 待校验 JSON 文本。
 * @returns {void} 仅更新状态，不更新树和路径列表。
 */
function validateJsonText(text) {
    try {
        JSON.parse(text);
        setStatus('ok', 'JSON 有效');
    } catch {
        setStatus('err', '格式错误');
    }
}

/**
 * 处理粘贴后的自动解析，让移动端和桌面端粘贴都能立即看到结果。
 * @returns {void} 通过短延迟等待浏览器完成文本写入输入框。
 */
function handleInputPaste() {
    setTimeout(() => {
        const value = document.getElementById('jsonInput').value.trim();
        if (!value) return;
        try {
            JSON.parse(value);
            parseAndRender();
        } catch {
            setStatus('err', '格式错误');
        }
    }, 80);
}

/**
 * 处理拖拽悬停效果，提示用户可直接拖入 JSON 文件。
 * @param {DragEvent} event 拖拽事件对象。
 * @returns {void} 该函数仅设置临时样式。
 */
function handleInputDragOver(event) {
    event.preventDefault();
    document.getElementById('jsonInput').style.background = 'var(--accent-dim)';
}

/**
 * 处理拖拽离开，恢复输入框样式。
 * @returns {void} 该函数仅重置临时样式。
 */
function handleInputDragLeave() {
    document.getElementById('jsonInput').style.background = '';
}

/**
 * 处理文件拖入并读取文本内容。
 * @param {DragEvent} event 拖拽事件对象。
 * @returns {void} 仅处理首个文件，读取成功后自动解析。
 */
function handleInputDrop(event) {
    event.preventDefault();
    document.getElementById('jsonInput').style.background = '';
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ({ target }) => {
        document.getElementById('jsonInput').value = String(target.result || '');
        parseAndRender();
        showToast(`已加载文件: ${file.name}`);
    };
    reader.readAsText(file);
}

/**
 * 启动应用，先加载本地图标资源，再绑定事件并初始化界面。
 * @returns {Promise<void>} 图标资源加载失败时会展示错误提示并继续初始化。
 */
async function initApp() {
    try {
        await loadIconSprite();
    } catch (error) {
        console.error(error);
        showToast('本地图标资源加载失败，已使用占位图标', 'error');
    }
    renderIcons();
    initTheme();
    initUI();
    bindInputEvents();
    setStatus('idle', '等待输入');
}

initApp();
