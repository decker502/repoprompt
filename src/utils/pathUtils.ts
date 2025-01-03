import * as path from 'path';

export function normalizePath(inputPath: string): string {
    if (!inputPath || inputPath.trim() === '') {
        return '';
    }
    
    // 处理相对路径
    if (inputPath.startsWith('./')) {
        inputPath = inputPath.slice(2);
    }
    
    // 规范化路径并统一使用正斜杠
    let normalized = path.normalize(inputPath).replace(/\\/g, '/');
    
    // 移除开头的斜杠
    normalized = normalized.replace(/^[\/]+/, '');
    
    // 移除末尾的斜杠（如果是目录路径）
    if (normalized.endsWith('/') && normalized.length > 1) {
        normalized = normalized.slice(0, -1);
    }
    
    return normalized;
}

export function getRelativePath(rootPath: string, targetPath: string): string {
    if (!rootPath || !targetPath) {
        return '';
    }
    
    const normalizedRoot = normalizePath(rootPath);
    const normalizedTarget = normalizePath(targetPath);
    
    // 如果路径相同，返回空字符串
    if (normalizedRoot === normalizedTarget) {
        return '';
    }
    
    // 计算相对于当前工作目录的路径
    const cwd = process.cwd();
    const relativeToCwd = path.relative(cwd, normalizedTarget);
    
    // 规范化相对路径
    const relativePath = normalizePath(relativeToCwd);
    
    return relativePath;
}

export function isSubPath(parentPath: string, childPath: string): boolean {
    if (!parentPath || !childPath) {
        return false;
    }
    
    const relative = path.relative(parentPath, childPath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
}
