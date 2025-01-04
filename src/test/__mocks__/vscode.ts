export const Uri = {
  file: (path: string) => ({
    fsPath: path || '',
    path: (path || '').replace(/\\/g, '/'),
    scheme: 'file',
    authority: '',
    query: '',
    fragment: '',
    with: function(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }) {
      return {
        ...this,
        ...change,
        fsPath: change.path || this.fsPath || '',
        path: (change.path || this.path || '').replace(/\\/g, '/')
      };
    },
    toJSON: function() {
      return {
        $mid: 1,
        fsPath: this.fsPath || '',
        path: this.path || '',
        scheme: this.scheme
      };
    }
  }),
  parse: (path: string) => Uri.file(path || '')
};

export const FileType = {
  File: 1,
  Directory: 2,
  SymbolicLink: 64
};

export const workspace = {
  fs: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readDirectory: jest.fn(),
    stat: jest.fn()
  },
  getConfiguration: jest.fn().mockReturnValue({
    get: jest.fn()
  }),
  findFiles: jest.fn().mockImplementation((pattern: any) => {
    if (pattern.pattern.includes('node_modules') || 
        pattern.pattern.includes('.git') ||
        pattern.pattern.includes('dist') ||
        pattern.pattern.includes('build')) {
        return Promise.resolve([Uri.file('/test/node_modules')]);
    }
    return Promise.resolve([]);
  })
};

export const window = {
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn()
};

export const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn()
};

export const env = {
  clipboard: {
    writeText: jest.fn()
  }
};

export class RelativePattern {
    constructor(public base: string, public pattern: string) {}
}

export default {
  Uri,
  FileType,
  workspace,
  window,
  commands,
  env,
  RelativePattern
};
