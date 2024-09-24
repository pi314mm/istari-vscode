// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { ChildProcess, spawn } from 'child_process';
import * as vscode from 'vscode';

class IstariTerminal {
	editor: vscode.TextEditor;
	terminal: ChildProcess;
	constructor(editor: vscode.TextEditor) {
		this.editor = editor;

		this.terminal = spawn("sml", ["@SMLload=/home/pi314mm/Desktop/istari/ui/bin/istarisrv-heapimg.amd64-linux"])
		//this.terminal = vscode.window.createTerminal("istari: " + editor.document.fileName);
		//this.terminal.sendText("sml @SMLload=/home/pi314mm/Desktop/istari/ui/bin/istarisrv-heapimg.amd64-linux", true);
		//this.terminal.sendText("\x06\n");
		//const wordAtCurorRange = new vscode.Range(new vscode.Position(0,0), editor.selection.active)
		//terminal.sendText(editor.document.getText(wordAtCurorRange));
		//terminal.sendText("\x05\n");
		this.terminal.stdin?.write("\x06\n");
		this.terminal.stdout?.on('data', (message) => {
				console.log(`${message}`);
			}
		)
	}
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	

	let disposable = vscode.commands.registerCommand('istari.helloWorld', () => {

		const editor = vscode.window.activeTextEditor ;
		if (editor){
			const istari = new IstariTerminal(editor);

			
			
			const wordAtCurorRange = new vscode.Range(new vscode.Position(0,0), editor.selection.active)
			istari.terminal.stdin?.write(editor.document.getText(wordAtCurorRange));
			istari.terminal.stdin?.write("\x05\n");
			

		} else {
			console.log('No text window is active');
		}
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
