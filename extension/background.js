const SIDE_PANEL_PATH = 'sidepanel.html';

/**
 * 配置扩展默认通过工具栏按钮打开 side panel。
 * @returns {Promise<void>} 设置成功后完成，不返回额外结果。
 */
async function configureSidePanelBehavior() {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

/**
 * 在安装或更新时初始化 side panel 行为，保证首次加载即可使用。
 * @returns {void} 该函数只注册异步配置，不直接更新标签页状态。
 */
function handleInstalled() {
    configureSidePanelBehavior().catch(logRuntimeError);
}

/**
 * 在浏览器启动时恢复 side panel 行为，避免 service worker 重启后丢失配置。
 * @returns {void} 该函数只触发配置流程。
 */
function handleStartup() {
    configureSidePanelBehavior().catch(logRuntimeError);
}

/**
 * 在用户点击扩展按钮时主动打开当前窗口的 side panel。
 * @param {chrome.tabs.Tab} tab 当前激活标签页。
 * @returns {void} 当标签页缺少窗口信息时会直接跳过。
 */
function handleActionClick(tab) {
    if (typeof tab.windowId !== 'number') {
        return;
    }
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(logRuntimeError);
}

/**
 * 为当前标签页绑定 side panel 页面路径，兼容浏览器对按标签页配置的要求。
 * @param {chrome.tabs.Tab} tab 当前激活或更新的标签页。
 * @returns {void} 缺少 tabId 时会直接跳过。
 */
function applyPanelOptions(tab) {
    if (typeof tab.id !== 'number') {
        return;
    }
    chrome.sidePanel.setOptions({ tabId: tab.id, path: SIDE_PANEL_PATH, enabled: true }).catch(logRuntimeError);
}

/**
 * 记录运行时错误，便于扩展加载排查。
 * @param {unknown} error 运行时异常对象。
 * @returns {void} 该函数仅输出控制台日志。
 */
function logRuntimeError(error) {
    console.error('Side panel runtime error:', error);
}

chrome.runtime.onInstalled.addListener(handleInstalled);
chrome.runtime.onStartup.addListener(handleStartup);
chrome.action.onClicked.addListener(handleActionClick);
chrome.tabs.onActivated.addListener(({ tabId }) => chrome.tabs.get(tabId, applyPanelOptions));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' || changeInfo.status === 'complete') {
        applyPanelOptions({ ...tab, id: tabId });
    }
});
configureSidePanelBehavior().catch(logRuntimeError);
