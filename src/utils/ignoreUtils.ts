import minimatch from 'minimatch';

export class IgnorePatterns {
    private patterns: string[];
    private negatePatterns: string[];

    constructor(patterns: string[]) {
        this.patterns = [];
        this.negatePatterns = [];
        
        for (const pattern of patterns) {
            if (!pattern || pattern.trim() === '') {
                continue;
            }
            
            if (pattern.startsWith('!')) {
                this.negatePatterns.push(pattern.slice(1).trim());
            } else {
                this.patterns.push(pattern.trim());
            }
        }
    }

    shouldIgnore(path: string): boolean {
        // 先检查否定模式
        for (const pattern of this.negatePatterns) {
            if (this.matchPattern(path, pattern)) {
                return false;
            }
        }

        // 检查普通模式
        for (const pattern of this.patterns) {
            if (this.matchPattern(path, pattern)) {
                return true;
            }
        }

        return false;
    }

    private matchPattern(path: string, pattern: string): boolean {
        const normalizedPattern = this.normalizePattern(pattern);
        return minimatch(path, normalizedPattern, { dot: true, matchBase: true, nocomment: true }) ||
               minimatch(path, `**/${normalizedPattern}`, { dot: true, matchBase: true, nocomment: true }) ||
               minimatch(path, `**/${normalizedPattern}/**`, { dot: true, matchBase: true, nocomment: true });
    }

    private normalizePattern(pattern: string): string {
        let normalizedPattern = pattern;
        
        // 处理以/开头的模式
        if (normalizedPattern.startsWith('/')) {
            normalizedPattern = normalizedPattern.slice(1);
        }
        
        // 处理以/结尾的模式
        if (normalizedPattern.endsWith('/')) {
            normalizedPattern += '**';
        }
        
        return normalizedPattern;
    }
}
