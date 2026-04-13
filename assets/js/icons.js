const ICON_SPRITE_PATH = 'assets/icons/ui-icons.svg';

/**
 * 从本地 SVG sprite 文件加载图标定义，避免依赖外部 CDN。
 * @returns {Promise<void>} 加载成功后会把 symbol 集合注入隐藏容器。
 */
async function loadIconSprite() {
    const response = await fetch(ICON_SPRITE_PATH);
    if (!response.ok) {
        throw new Error(`图标资源加载失败: ${response.status}`);
    }
    const spriteMarkup = await response.text();
    document.getElementById('icon-sprite-container').innerHTML = spriteMarkup;
}

/**
 * 返回基于本地 sprite 的图标 HTML，未知图标回退到占位方块。
 * 视口采用 24x24 以适配 Lucide 风格的 stroke-based 图标。
 * @param {string} name 图标名称。
 * @returns {string} 对应图标的 SVG HTML 字符串。
 */
function getIconSvg(name) {
    const iconId = `icon-${name}`;
    if (document.getElementById(iconId)) {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${iconId}"></use></svg>`;
    }
    /* 回退：stroke-based 空方块，与主图标风格一致 */
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"></rect></svg>';
}
