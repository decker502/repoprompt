export const Uri = {
  file: (path: string) => ({
    fsPath: path,
    path: path,
    scheme: 'file',
    authority: '',
    query: '',
    fragment: '',
    with: function(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }) {
      return {
        ...this,
        ...change
      };
    },
    toJSON: function() {
      return {
        $mid: 1,
        fsPath: this.fsPath,
        path: this.path,
        scheme: this.scheme
      };
    }
  }),
  joinPath: (base: any, ...pathSegments: string[]) => ({
    fsPath: [base.fsPath, ...pathSegments].join('/'),
    path: [base.fsPath, ...pathSegments].join('/'),
    scheme: 'file',
    authority: '',
    query: '',
    fragment: '',
    with: function(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }) {
      return {
        ...this,
        ...change
      };
    },
    toJSON: function() {
      return {
        $mid: 1,
        fsPath: this.fsPath,
        path: this.path,
        scheme: this.scheme
      };
    }
  })
};

export const FileType = {
  File: 1,
  Directory: 2
};

export const workspace = {
  getConfiguration: jest.fn((section?: string) => ({
    get: jest.fn(<T>(key: string, defaultValue: T): T => {
      const config: Record<string, any> = {
        'repoprompt.fileSizeThreshold': 1048576,
        'repoprompt.ignorePatterns': [],
        'repoprompt.rootTag': 'project',
        'repoprompt.includeComments': true,
        'repoprompt.chunkSize': 5242880,
      };
      return config[`${section}.${key}`] ?? defaultValue;
    }),
    update: jest.fn()
  })),
  workspaceFolders: [],
  fs: {
    readFile: jest.fn(() => Promise.resolve(Buffer.from(''))),
    readDirectory: jest.fn(() => Promise.resolve([])),
    stat: jest.fn(() => Promise.resolve({ size: 0, type: 1 })),
  },
};

export const window = {
  showInputBox: jest.fn(),
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  setStatusBarMessage: jest.fn(() => ({
    dispose: jest.fn()
  }))
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

export default {
  Uri,
  FileType,
  workspace,
  window,
  commands,
  env
};
