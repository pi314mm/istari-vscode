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

	interject(text:string) {
		this.terminal.stdin?.write('\x02'+text+'\n');
	}

	sendLines(text:string) {
		this.terminal.stdin?.write(text);
		this.terminal.stdin?.write("\x05\n");
	}

	jumpToCursor(){
		let cursorLine = this.editor.selection.active.line
		console.log(`${this.currentLine},${cursorLine}`)
		if(cursorLine>this.currentLine+1){
			let wordAtCurorRange = new vscode.Range(new vscode.Position(this.currentLine,0), new vscode.Position(cursorLine,0))
			this.sendLines(this.editor.document.getText(wordAtCurorRange));
		}else if(cursorLine <= this.currentLine){
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

	let jumpToCursor = vscode.commands.registerCommand('istari.jumpToCursor', () => {
		istari?.jumpToCursor()
	});
	context.subscriptions.push(jumpToCursor);

	let init = vscode.commands.registerCommand('istari.init', () => {
	});
	context.subscriptions.push(init);
}

// this method is called when your extension is deactivated
export function deactivate() {}
