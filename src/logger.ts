import * as vscode from 'vscode';

export class Logger {
    private static outputChannel: vscode.OutputChannel;
    private static debugMode: boolean = true;

    static initialize() {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('RepoPrompt');
            this.outputChannel.show(true); // true 表示保持焦点在编辑器
            this.info('日志系统初始化完成');
        }
    }

    static ensureInitialized() {
        if (!this.outputChannel) {
            this.initialize();
        }
    }

    static setDebugMode(enabled: boolean) {
        this.debugMode = enabled;
        this.ensureInitialized();
    }

    static debug(message: string, ...args: any[]) {
        this.ensureInitialized();
        if (!this.debugMode) return;
        
        const timestamp = new Date().toISOString();
        const fullMessage = `[DEBUG][${timestamp}] ${message}`;
        
        if (args.length > 0) {
            const argsStr = args.map(arg => {
                try {
                    return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
                } catch (e) {
                    return '[无法序列化的对象]';
                }
            }).join(' ');
            
            console.log(fullMessage, ...args);
            this.outputChannel.appendLine(`${fullMessage} ${argsStr}`);
        } else {
            console.log(fullMessage);
            this.outputChannel.appendLine(fullMessage);
        }
    }

    static error(message: string, error?: any) {
        this.ensureInitialized();
        const timestamp = new Date().toISOString();
        const fullMessage = `[ERROR][${timestamp}] ${message}`;
        
        if (error) {
            let errorStr;
            try {
                errorStr = error instanceof Error 
                    ? `${error.message}\n${error.stack}`
                    : JSON.stringify(error, null, 2);
            } catch (e) {
                errorStr = '[无法序列化的错误对象]';
            }
            
            console.error(fullMessage, error);
            this.outputChannel.appendLine(`${fullMessage}\n${errorStr}`);
        } else {
            console.error(fullMessage);
            this.outputChannel.appendLine(fullMessage);
        }
    }

    static info(message: string) {
        this.ensureInitialized();
        const timestamp = new Date().toISOString();
        const fullMessage = `[INFO][${timestamp}] ${message}`;
        
        console.log(fullMessage);
        this.outputChannel.appendLine(fullMessage);
    }

    static show() {
        this.ensureInitialized();
        this.outputChannel.show(true);
    }

    static clear() {
        this.ensureInitialized();
        this.outputChannel.clear();
    }
} 