// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { ChildProcess, spawn } from 'child_process';
import * as vscode from 'vscode';

class IstariTerminal {
	editor: vscode.TextEditor;
	terminal: ChildProcess;
	currentLine: number;
	process(text:string) {
		let commands = text.split('\x01');
		let last = commands.pop();
		if (last){
			if(last.indexOf('\x02') > -1){
				let x = last.split('\x02')
				commands.push(x[0]+'\x02')
				commands.push(x[1])
			}else{
				commands.push(last)
			}
		}
		commands = commands.map(x => x.trimEnd()).filter(x => x.length > 0);
		
		commands.forEach((command) => {
			if (command.endsWith('\x02')) {
				command = command.split('\x02')[0];
				console.log('command:' + command)
				switch(command[0]) {
					case 'f': {
						this.terminal.stdin?.write("\x06\n");
						break;
					}
					case 'c': {
						this.currentLine = Number(command.substring(1));
						break;
					}
					case 'w': {
						break;
					}
					case 'r': {
						break;
					}
					default:{
						break;
					}
				}
			}else{
				console.log(command);
			}
		});
	}

	sendLines(text:string) {
		this.terminal.stdin?.write(text);
		this.terminal.stdin?.write("\x05\n");
	}

	jumpToCursor(){
		let cursorLine = this.editor.selection.active.line
		if(cursorLine>this.currentLine){
			let wordAtCurorRange = new vscode.Range(new vscode.Position(this.currentLine,0), new vscode.Position(cursorLine,0))
			console.log("sent:"+this.editor.document.getText(wordAtCurorRange))
			this.sendLines(this.editor.document.getText(wordAtCurorRange));
		}else{
			this.terminal.stdin?.write(`\x01${cursorLine}\n`);
		}
	}

	constructor(editor: vscode.TextEditor) {
		this.editor = editor;

		this.terminal = spawn("sml", ["@SMLload=/home/pi314mm/Desktop/istari/ui/bin/istarisrv-heapimg.amd64-linux"])
		this.terminal.stdout?.on('data', (data) => {this.process(data.toString())});
		this.currentLine = 0;
	}
}
let editor = vscode.window.activeTextEditor ;
let istari = editor ? new IstariTerminal(editor) : undefined;

export function activate(context: vscode.ExtensionContext) {

	let disposable = vscode.commands.registerCommand('istari.jumpToCursor', () => {
		istari?.jumpToCursor()
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
