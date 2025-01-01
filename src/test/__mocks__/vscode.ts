export const Uri = {
  file: (path: string) => ({ fsPath: path }),
  joinPath: (base: any, ...pathSegments: string[]) => ({
    fsPath: [base.fsPath, ...pathSegments].join('/')
  })
};

export const FileType = {
  File: 1,
  Directory: 2
};

export const workspace = {
  fs: {
    stat: jest.fn(),
    readDirectory: jest.fn(),
    readFile: jest.fn().mockResolvedValue(Buffer.from('mock file content'))
  },
  getConfiguration: jest.fn()
};

export const window = {
  showInputBox: jest.fn(),
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn()
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
