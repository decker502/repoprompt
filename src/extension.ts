// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { FileProcessor } from './fileProcessor';
import { XmlGenerator } from './xmlGenerator';
import { ProcessingOptions } from './types';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand(
		'repoprompt.generateXml',
		async (uri: vscode.Uri, uris: vscode.Uri[]) => {
			try {
				// Get configuration
				const config = vscode.workspace.getConfiguration('repoprompt');
				const options: ProcessingOptions = {
					maxFileSize: config.get('maxFileSize') || 1048576,
						rootTag: config.get('rootTag') || 'project',
						includeComments: config.get('includeComments') || true,
						ignorePatterns: config.get('ignorePatterns') || [
							'node_modules/**',
							'.git/**',
							'dist/**',
							'.vscode/**'
						]
				};

				// Handle single or multiple selection
				const selectedUris = uris || (uri ? [uri] : []);
				if (selectedUris.length === 0) {
					throw new Error('No files or folders selected');
				}

				// Get prompt from user
				const prompt = await vscode.window.showInputBox({
					prompt: 'Enter your prompt (optional)',
					placeHolder: 'Please analyze this project structure...'
				});

				// Process files
				const fileProcessor = new FileProcessor(options);
				const { structure, files } = await fileProcessor.processSelection(selectedUris);

				// Generate XML
				const xmlGenerator = new XmlGenerator(options);
				const xmlChunks = xmlGenerator.generateXml(structure, files, prompt || undefined);

				// Save XML files
				const baseDir = path.dirname(selectedUris[0].fsPath);
				for (const chunk of xmlChunks) {
					const fileName = xmlChunks.length > 1 
						? `project_part${chunk.chunkNumber}.xml`
						: 'project.xml';
					const filePath = path.join(baseDir, fileName);
					console.log(`Generating XML file at: ${filePath}`);
					const uri = vscode.Uri.file(filePath);
					
					await vscode.workspace.fs.writeFile(
						uri,
						Buffer.from(chunk.content, 'utf8')
					);
				}

				// Show success message
				const message = xmlChunks.length > 1
					? `Generated ${xmlChunks.length} XML files`
					: 'Generated XML file';
				vscode.window.showInformationMessage(message);

			} catch (error) {
				const errorMessage = error instanceof Error 
					? error.message 
					: 'An unknown error occurred';
				vscode.window.showErrorMessage(`Error: ${errorMessage}`);
			}
		}
	);

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
