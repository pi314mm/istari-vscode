import { ChildProcess, spawn } from 'child_process';
import { get } from 'http';
import * as vscode from 'vscode';

const decorations = vscode.window.createTextEditorDecorationType({
	backgroundColor:"green",
	isWholeLine:true,
})

class IstariTerminal {
	editor: vscode.TextEditor;
	terminal: ChildProcess;
	currentLine: number;
	process(text:string) {
		let commands = text.split('\x01');
		let spliter = (x:string) => {
			let y = x.split('\x02');
			y[0] = y[0]+'\x02';
			return y
		};
		commands = commands.flatMap(x => (x.indexOf('\x02') > -1) ? spliter(x) : x);
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
						let range = this.currentLine > 1 ? [new vscode.Range(new vscode.Position(0,0), this.editor.document.lineAt(this.currentLine-2).range.end)] : [];
						this.editor.setDecorations(decorations,range)
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
				output.append(command+"\n");
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
		let cursorLine = this.editor.selection.active.line;
		if(cursorLine>this.currentLine-1){
			let wordAtCurorRange = new vscode.Range(new vscode.Position(this.currentLine-1,0), new vscode.Position(cursorLine,0));
			this.sendLines(this.editor.document.getText(wordAtCurorRange));
		}else if(cursorLine < this.currentLine-1){
			this.terminal.stdin?.write(`\x01${cursorLine+1}\n`);
		}
	}

	nextLine(){
		if(this.currentLine < this.editor.document.lineCount){
			let wordAtCurorRange = new vscode.Range(new vscode.Position(this.currentLine-1,0), new vscode.Position(this.currentLine,0));
			this.sendLines(this.editor.document.getText(wordAtCurorRange));
		}else{
			console.log("error")
		}
	}

	prevLine(){
		if(this.currentLine > 1){
			this.terminal.stdin?.write(`\x01${this.currentLine-1}\n`);
		}else{
			console.log("error")
		}
	}

	constructor(editor: vscode.TextEditor) {
		this.editor = editor;
		let sml = vscode.workspace.getConfiguration().get<string>('istari.smlLocation')!;
		let istari = vscode.workspace.getConfiguration().get<string>('istari.istariLocation')!;
		this.terminal = spawn(sml, ["@SMLload="+istari])
		this.terminal.stdout?.on('data', (data) => {this.process(data.toString())});
		this.currentLine = 1;
	}
}
let editor = vscode.window.activeTextEditor ;
let istari = editor ? new IstariTerminal(editor) : undefined;
let output = vscode.window.createOutputChannel("istari")

export function activate(context: vscode.ExtensionContext) {

	let jumpToCursor = vscode.commands.registerCommand('istari.jumpToCursor', () => {
		istari?.jumpToCursor()
	});
	context.subscriptions.push(jumpToCursor);

	let prevLine = vscode.commands.registerCommand('istari.prevLine', () => {
		istari?.prevLine()
	});
	context.subscriptions.push(prevLine);

	let nextLine = vscode.commands.registerCommand('istari.nextLine', () => {
		istari?.nextLine()
	});
	context.subscriptions.push(nextLine);

	let init = vscode.commands.registerCommand('istari.init', () => {
		editor = vscode.window.activeTextEditor ;
		istari = editor ? new IstariTerminal(editor) : undefined;
	});
	context.subscriptions.push(init);
}

// this method is called when your extension is deactivated
export function deactivate() {}
