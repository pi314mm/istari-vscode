import { ChildProcess, spawn } from 'child_process';
import { get } from 'http';
import * as vscode from 'vscode';
import { dirname } from 'path';

const decorations = vscode.window.createTextEditorDecorationType({
	backgroundColor: "green",
	isWholeLine: true,
})

class IstariTerminal {
	editor: vscode.TextEditor;
	terminal: ChildProcess;
	currentLine: number;
	output: vscode.OutputChannel;

	process(text: string) {
		let commands = text.split('\x01');
		let spliter = (x: string) => {
			let y = x.split('\x02');
			y[0] = y[0] + '\x02';
			return y
		};
		commands = commands.flatMap(x => (x.indexOf('\x02') > -1) ? spliter(x) : x);
		commands = commands.map(x => x.trimEnd()).filter(x => x.length > 0);

		commands.forEach((command) => {
			if (command.endsWith('\x02')) {
				command = command.split('\x02')[0];
				console.log('command:' + command)
				switch (command[0]) {
					case 'f': {
						this.terminal.stdin?.write("\x06\n");
						break;
					}
					case 'c': {
						this.currentLine = Number(command.substring(1));
						let range = this.currentLine > 1 ? [new vscode.Range(new vscode.Position(0, 0), this.editor.document.lineAt(this.currentLine - 2).range.end)] : [];
						this.editor.setDecorations(decorations, range)
						break;
					}
					case 'w': {
						break;
					}
					case 'r': {
						break;
					}
					default: {
						break;
					}
				}
			} else {
				this.output.append(command + "\n");
			}
		});
	}

	interject(text: string) {
		this.terminal.stdin?.write('\x02' + text + '\n');
	}

	sendLines(text: string) {
		this.terminal.stdin?.write(text);
		this.terminal.stdin?.write("\x05\n");
	}

	jumpToCursor() {
		let cursorLine = this.editor.selection.active.line;
		if (cursorLine > this.currentLine - 1) {
			let wordAtCurorRange = new vscode.Range(new vscode.Position(this.currentLine - 1, 0), new vscode.Position(cursorLine, 0));
			this.sendLines(this.editor.document.getText(wordAtCurorRange));
		} else if (cursorLine < this.currentLine - 1) {
			this.terminal.stdin?.write(`\x01${cursorLine + 1}\n`);
		}
	}

	nextLine() {
		if (this.currentLine < this.editor.document.lineCount) {
			let wordAtCurorRange = new vscode.Range(new vscode.Position(this.currentLine - 1, 0), new vscode.Position(this.currentLine, 0));
			this.sendLines(this.editor.document.getText(wordAtCurorRange));
		} else {
			console.log("error")
		}
	}

	prevLine() {
		if (this.currentLine > 1) {
			this.terminal.stdin?.write(`\x01${this.currentLine - 1}\n`);
		} else {
			console.log("error")
		}
	}

	constructor(editor: vscode.TextEditor) {
		this.editor = editor;
		let sml = vscode.workspace.getConfiguration().get<string>('istari.smlLocation')!;
		let istari = vscode.workspace.getConfiguration().get<string>('istari.istariLocation')!;
		let cwd = dirname(editor.document.fileName)
		this.terminal = spawn(sml, ["@SMLload=" + istari], { cwd: cwd, shell: true })
		this.terminal.stdout?.on('data', (data) => { this.process(data.toString()) });
		this.currentLine = 1;
		this.output = vscode.window.createOutputChannel("istari: " + editor.document.fileName);
	}

	restart(){
		this.output.dispose()
		this.terminal.kill()

		let sml = vscode.workspace.getConfiguration().get<string>('istari.smlLocation')!;
		let istari = vscode.workspace.getConfiguration().get<string>('istari.istariLocation')!;
		let cwd = dirname(this.editor.document.fileName)
		this.terminal = spawn(sml, ["@SMLload=" + istari], { cwd: cwd, shell: true })
		this.terminal.stdout?.on('data', (data) => { this.process(data.toString()) });
		this.currentLine = 1;
		this.output = vscode.window.createOutputChannel("istari: " + this.editor.document.fileName);
	}

	edit(e: vscode.TextDocumentChangeEvent) {
		if (e.document == this.editor.document) {
			if (e.contentChanges.length > 0) {
				if (e.contentChanges[0].range.start.line < this.currentLine - 1) {
					this.terminal.stdin?.write(`\x01${e.contentChanges[0].range.start.line + 1}\n`);
				}
			}
		}
	}
}

let terminals = new Map();

function findCurrent(): IstariTerminal | undefined {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		return undefined;
	}
	if (terminals.has(editor.document.fileName)) {
		console.log("found the editor: "+editor.document.fileName)
		return terminals.get(editor.document.fileName);
	}
	let terminal = new IstariTerminal(editor);
	terminals.set(editor.document.fileName, terminal);
	console.log(terminals)
	return terminal;
}

export function activate(context: vscode.ExtensionContext) {
	let jumpToCursor = vscode.commands.registerCommand('istari.jumpToCursor', () => {
		findCurrent()?.jumpToCursor()
	});
	context.subscriptions.push(jumpToCursor);

	let prevLine = vscode.commands.registerCommand('istari.prevLine', () => {
		findCurrent()?.prevLine()
	});
	context.subscriptions.push(prevLine);

	let nextLine = vscode.commands.registerCommand('istari.nextLine', () => {
		findCurrent()?.nextLine()
	});
	context.subscriptions.push(nextLine);

	let getType = vscode.commands.registerCommand('istari.getType', () => {
		vscode.window.showInputBox({ title: "Get the type of an expression", prompt: "expression", ignoreFocusOut: true }).then((expr) => {
			if (expr) {
				findCurrent()?.interject("Report.showType (parseLongident /" + expr + "/);")
			}
		});
	});
	context.subscriptions.push(getType);

	let search = vscode.commands.registerCommand('istari.search', () => {
		vscode.window.showInputBox({ title: "Get the type of an expression", prompt: "expression", ignoreFocusOut: true }).then((expr) => {
			if (expr) {
				findCurrent()?.interject("Report.search (parseConstants /" + expr + "/) [];")
			}
		});
	});
	context.subscriptions.push(search);


	let init = vscode.commands.registerCommand('istari.init', () => {
		findCurrent()?.restart()
	});
	context.subscriptions.push(init);

	vscode.workspace.onDidChangeTextDocument(e => {
		for (var [_, terminal] of terminals){
			terminal.edit(e)
		}
	})
}

// this method is called when your extension is deactivated
export function deactivate() { }
