import { ChildProcess, spawn } from 'child_process';
import { get } from 'http';
import * as vscode from 'vscode';
import { dirname } from 'path';
import path = require('path');
import { assert, time } from 'console';

const decorations = vscode.window.createTextEditorDecorationType({
	backgroundColor: "green",
	isWholeLine: true,
});
    // Inline SVG as a string
    const blueDotSvg = `
       <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
  <!-- Blue background circle with rounded corners -->
  <rect x="0" y="0" width="20" height="20" rx="5" ry="5" fill="#007acc"/>
  <!-- White text in the center -->
    <text x="10" y="14" font-size="14" text-anchor="middle" fill="white">&gt;</text>
</svg>

    `;

    // Convert the SVG string to a base64 data URL
    const blueDotSvgBase64 = `data:image/svg+xml;base64,${Buffer.from(blueDotSvg).toString('base64')}`;
const decorationType2 = vscode.window.createTextEditorDecorationType({
	gutterIconPath: vscode.Uri.parse(blueDotSvgBase64),
	gutterIconSize: '80%',
	overviewRulerLane: vscode.OverviewRulerLane.Right,
});

const decorationType = vscode.window.createTextEditorDecorationType({
	// gutterIconPath: blueDotSvgBase64,
	// gutterIconSize: '20px',
	// gutterIconSize: ', // Ensure the icon fits properly

	isWholeLine: true,
	backgroundColor: 'rgba(0, 122, 204, 0.1)', // VS Code blue

	// before : {
		
	// 	contentText: '>', // Invisible character to apply styles
	// 	margin: '0 2px 0 0', // Space before the line number
	// 	// width: '100px', 
	// 	height: '100%',
	// 	backgroundColor: 'rgba(0, 122, 204, 1)', // VS Code blue
	// 	color: 'white',
	// 	fontWeight: 'bold',
		
	// 	// borderRadius: '4px' // Rounded square
	// },
	// rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
	// backgroundColor: 'rgba(0, 122, 204, 1)',
	// overviewRulerLane: vscode.OverviewRulerLane.Right,
});

function bufferToCaretString(buffer:Buffer) {
    return Array.from(buffer)
        .map(byte => {
            if (byte >= 0x00 && byte <= 0x1F) {
                return `^${String.fromCharCode(byte + 64)}`; // ^A to ^_
            } else if (byte === 0x7F) {
                return `^?`; // DEL (0x7F) maps to ^?
            }
            return String.fromCharCode(byte);
        })
        .join('');
}

let webviewHTML = `
			<script>
			window.addEventListener('message', event => {
				const message = event.data;
				switch (message.command) {
					case 'scrollToBottom':
						window.scrollTo(0, document.body.scrollHeight);
						break;
					case 'appendText': {
						const mainText = document.getElementById('main_text');
						if (mainText) {
console.log(message.text);
mainText.innerHTML += "<hr>" + message.text.replace(/\\n(\s*)/g, function(_, spaces) {
console.log('spaces', spaces, 'end');
    return "<br>" + spaces.replace(/ /g, "&nbsp;");
});						}
						break;
					}
					case 'changeStatus': {
						const status = document.getElementById('status');
						if (status) {
							status.innerHTML = message.text;
						}
						break;
					}
					case 'changeTasks': {
						const tasks = document.getElementById('tasks');
						if (tasks) {
							tasks.innerHTML = message.text;
						}
						break;
					}
				}
			});
			</script>
			<body style="font-family: monospace; margin-bottom: 20px;">
			<div style="position: fixed; top: 0; left: 0; width: 100%; padding-left: 2px; opacity: 1; 
			background-color: rgb(255, 255, 255);
			 z-index: 10;">
				Status: <span id="status"></span> | Tasks: <span id="tasks"></span>
			</div>
			<div id="main_text" style="margin-top: 2em"></div>
			</body>
			`;

class IstariWebview {
	webview: vscode.WebviewPanel;
	messages: any[] = [];
	constructor(document: vscode.TextDocument) {
		this.webview = vscode.window.createWebviewPanel("istari", 
			path.basename(document.fileName), 
			{
			viewColumn: vscode.ViewColumn.Beside,
			preserveFocus: true}, { enableScripts: true });
		// I haven't figured out this yet, but webview is strangely reloading when not visible
		// so I recoreded events and replay them when the webview is visible
		this.webview.onDidChangeViewState((e) => {
			if (e.webviewPanel.visible) {
				this.webview.webview.html = webviewHTML;
				this.messages.forEach((message) => {
					this.webview.webview.postMessage(message);
				});

			}
		});
	}

	postMessage(message: any) {
		this.messages.push(message);
		this.webview.webview.postMessage(message);
	}



	appendText(text: string) {
		this.postMessage({ command: 'appendText', text: text });
		this.postMessage({ command: 'scrollToBottom' });
	}

	changeStatus(text: string) {
		this.postMessage({ command: 'changeStatus', text: text });
	}

	changeTasks(text: string) {
		this.postMessage({ command: 'changeTasks', text: text });
	}

}

enum IstariInputCommand {
	textInput = "t",
	interject = "i",
	rewind = "r",
}

enum IstariCommand {
	textOutput = "t",
	lineNumber = "c",
	working = "w",
	partialReady = "p",
	ready = "r",
}

class IstariTask {
	callback: (data: string) => boolean; // return true to complete this task by removing it from the queue
	data: string;
	cmd: IstariInputCommand;
	constructor(cmd: IstariInputCommand, data: string, callback: (data: string) => boolean) {
		this.cmd = cmd;
		this.data = data;
		this.callback = callback;
	}
}


class IstariTerminal {
	proc: ChildProcess;
	buffer : string = "";
	tasks : IstariTask[] = [];
	taskInflight : IstariTask | undefined;
	defaultCallback : (cmd: IstariCommand, data: string) => void;
	tasksUpdated : () => void;
	istariInputStatus : boolean = false; // whether istari is ready to accept input

	constructor(
		document : vscode.TextDocument,
		onDefaultCallback: (cmd: IstariCommand, data: string) => void,
		onTasksUpdated: () => void,
	) {
		let sml = vscode.workspace.getConfiguration().get<string>('istari.smlLocation')!;
		let istari = vscode.workspace.getConfiguration().get<string>('istari.istariLocation')!;
		let cwd = dirname(document.fileName);
		this.defaultCallback = onDefaultCallback;
		this.proc = spawn(sml, ["@SMLload=" + istari], { cwd: cwd, shell: true });
		this.proc.on('error', (err) => {
			throw new Error(`Failed to start process: ${err.message}`);
		});
		this.proc.stdout?.on('data', (data) => { 
			this.processOutput(data);
		});
		this.tasksUpdated = onTasksUpdated;
	}


	debugLog(text: string) {
		const now = new Date();
		const timeString = `${now.getMinutes()}:${now.getSeconds()}`;
		console.log(`[${timeString}]`, text);

	}

	writeStdIn(text: string) {
		this.debugLog(`>>>> `+ bufferToCaretString(Buffer.from(text)));
		this.proc.stdin?.write(text);
	}

	endSendText() {
		this.writeStdIn("\x05\n");
	}

	acknowledgeFlush() {
		this.writeStdIn("\x06\n");
	}

	enqueueTask(task: IstariTask) {
		this.tasks.push(task);
		this.processTasks();
	}

	processTasks() {
		if (this.istariInputStatus 
			&& this.taskInflight === undefined
			&& this.tasks.length > 0
		) {
			this.taskInflight = this.tasks.shift();
			if (this.taskInflight) {
				switch (this.taskInflight.cmd) {
					case IstariInputCommand.textInput: {
						this.writeStdIn(this.taskInflight.data);
						this.endSendText();
						this.istariInputStatus = false;
						break;
					}
					case IstariInputCommand.interject: {
						if(this.taskInflight.data.endsWith("\n")){
							throw new Error("Interject command should not end with a newline character");
						}
						this.writeStdIn("\x02" + this.taskInflight.data + "\n");
						this.istariInputStatus = false;
						break;
					}
					case IstariInputCommand.rewind: {
						this.writeStdIn("\x01" + this.taskInflight.data + "\n");
						this.istariInputStatus = false;
						break;
					}
					default: {
						throw new Error("Unknown command type: " + this.taskInflight.cmd);
					}
				}
			}
		}
		this.tasksUpdated();
	}

	giveOutput() {
		if (this.taskInflight) {
			let shouldRemove = this.taskInflight.callback(this.buffer);
			if (shouldRemove) {
				this.taskInflight = undefined;
			}
			this.buffer = "";
		} else {
			this.defaultCallback(IstariCommand.textOutput, this.buffer);
			this.buffer = "";
		}
	}


	processOutput(data: Buffer) {
		this.debugLog("<<<< "+ bufferToCaretString(data));
		let idx = 0;
		while(idx < data.length) {
			let curChar = data[idx];
			if (curChar === 0x01) {
				let command = "";
				idx++; // Move past the 0x01 character
				while (idx < data.length && data[idx] !== 0x02) {
					command += String.fromCharCode(data[idx]);
					idx++;
				}
				// check if 0x02 is the last character
				if (idx < data.length) {
					idx++; // Move past the 0x02 character
				} else {
					throw new Error("0x02 character not found in command, bug in the extension");
				}
				switch (command[0]) {
					case 'f': {
						// this indicates a flush, find a event handler
						// this.giveOutput();
						// this.istariInputStatus = true;
						this.acknowledgeFlush();
						break;
					}
					case 'c': {
						this.defaultCallback(IstariCommand.lineNumber, command.substring(1));
						break;
					}
					case 'w': {
						this.defaultCallback(IstariCommand.working, command.substring(1));
						break;
					}
					case 'p': {
						// I don't understand the difference between partial ready and ready
						// so I'm treating them the same
						this.giveOutput();
						this.defaultCallback(IstariCommand.partialReady, command.substring(1));
						this.istariInputStatus = true;
						break;
					}
					case 'r': {
						// ready also indicates a flush, and ready to accept next thing
						this.giveOutput();
						this.defaultCallback(IstariCommand.ready, command.substring(1));
						this.istariInputStatus = true;
						break;
					}
					default: {
						console.log("Unknown command: " + command);
						break;
					}
				}
			} else {
				this.buffer += String.fromCharCode(curChar);
				idx++;
			}
		}


		// done processing the inputs
		this.processTasks();
	}
	

}

class IstariUI {
	document: vscode.TextDocument;
	terminal: IstariTerminal;
	currentLine: number;
	webview : IstariWebview;
	
	editor : vscode.TextEditor;

	constructor(document: vscode.TextDocument) {
		this.document = document;
		let editor = vscode.window.visibleTextEditors.find(x => x.document === this.document);
		if (!editor) {
			console.error("[c] Istari not found for the current active text file. Try save or reopen this file.", this.document.fileName, istariUIs);
			vscode.window.showInformationMessage("[C] Istari not found for the current active text file. Try save or reopen this file.");
			throw new Error("[e] Istari not found for the current active text file. Try save or reopen this file.");
		}
		this.editor = editor;
		this.webview = new IstariWebview(document);
		this.currentLine = 1;
		this.terminal = new IstariTerminal(document, 
			this.defaultCallback.bind(this), 
			this.tasksUpdated.bind(this));
	}

	tasksUpdated() {
		if (this.terminal.tasks.length > 0) {
			this.webview.changeTasks(this.terminal.tasks.length.toString() + " Remaining"); 
		} else {
			this.webview.changeTasks("Ready");
		}
	}

	updateCurrentLine(line: number) {
		this.currentLine = line;
		let range = this.currentLine > 1 ? [
			new vscode.Range(new vscode.Position(this.currentLine - 1, 0), new vscode.Position(this.currentLine - 1, 0))
		] : [];
		this.editor.setDecorations(decorationType, range);
		this.editor.setDecorations(decorationType2, range);
	}

	setEditor(editor: vscode.TextEditor) {
		this.editor = editor;
		this.updateCurrentLine(this.currentLine);
	}

	defaultCallback(cmd: IstariCommand, data: string) {
		switch (cmd) {
			case IstariCommand.textOutput: {
				this.webview.appendText(data);
				break;
			}
			case IstariCommand.lineNumber: {
				this.updateCurrentLine(Number(data));
				break;
			}
			case IstariCommand.working: {
				this.webview.changeStatus("Working " + data);
				break;
			}
			case IstariCommand.partialReady: {
				this.webview.changeStatus("Partial Ready " + data);
				break;
			}
			case IstariCommand.ready: {
				this.webview.changeStatus("Ready " + data);
				break;
			}

			default: {
				console.error("Unknown command: " + cmd);
				break;
			}
		}
	}
	
	revealWebview() {
		this.webview.webview.reveal(vscode.ViewColumn.Beside, true);
	}
	
	interject(text: string) {
		// console.log("Interjecting: ", text);
		// this.write_stdin('\x02' + text + '\n');
		this.terminal.enqueueTask(new IstariTask(IstariInputCommand.interject, text, (data) => {
			this.webview.appendText(data);
			return true;
		}));
	}

	interjectWithCallback(text: string, callback: (data: string) => boolean) {
		this.terminal.enqueueTask(new IstariTask(IstariInputCommand.interject, text, callback));
	}

	sendLines(text: string) {
		this.terminal.enqueueTask(new IstariTask(IstariInputCommand.textInput, text, (data) => {
			this.webview.appendText(data);
			return true;
		}));
	}

	rewindToLine(line: number) {
		this.terminal.enqueueTask(new IstariTask(IstariInputCommand.rewind, line.toString(), (data) => {
			this.webview.appendText(data);
			return true;
		}));
	}

	jumpToCursor() {
		let cursorLine = this.editor.selection.active.line;
		if (cursorLine > this.currentLine - 1) {
			let wordAtCurorRange = new vscode.Range(new vscode.Position(this.currentLine - 1, 0), new vscode.Position(cursorLine, 0));
			this.sendLines(this.editor.document.getText(wordAtCurorRange));
		} else if (cursorLine < this.currentLine - 1) {
			this.rewindToLine(cursorLine + 1);
		}
	}

	nextLine() {
		console.log("nextLine not implemented");
		if (this.currentLine < this.editor.document.lineCount) {
			let wordAtCurorRange = new vscode.Range(new vscode.Position(this.currentLine - 1, 0), new vscode.Position(this.currentLine, 0));
			this.sendLines(this.editor.document.getText(wordAtCurorRange));
		} else {
			console.log("error");
		}
	}

	prevLine() {
		console.log("prevLine not implemented");
		if (this.currentLine > 1) {
			this.rewindToLine(this.currentLine - 1);
		} else {
			console.log("error");
		}
	}


	edit(e: vscode.TextDocumentChangeEvent) {
		if (e.document === this.editor.document) {
			if (e.contentChanges.length > 0) {
				if (e.contentChanges[0].range.start.line < this.currentLine - 1) {
					this.rewindToLine(e.contentChanges[0].range.start.line + 1);
				}
			}
		}
	}
}
// let editor = vscode.window.activeTextEditor;
// let istari = editor ? new IstariTerminal(editor) : undefined;
// let output = vscode.window.createOutputChannel("istari")

let istariUIs : Map<vscode.TextDocument, IstariUI> = new Map();

function getIstari() : IstariUI | undefined {
	let editor = vscode.window.activeTextEditor;
	if (editor && editor.document.languageId === "istari") {
		let istari = istariUIs.get(editor.document);
		if (!istari) {
			console.error("[f] Istari not found for the current active text file. Try save or reopen this file.", editor.document.fileName, istariUIs);
			vscode.window.showInformationMessage("[B] Istari not found for the current active text file. Try save or reopen this file.");
		}
		return istari;
	}
	return undefined;
}

function getIstariForDocument(doc: vscode.TextDocument) : IstariUI  {
	let istari = istariUIs.get(doc);
	if (!istari) {
		console.error("[e] Istari not found for the current active text file. Try save or reopen this file.", doc.fileName, istariUIs);
		throw new Error("[e] Istari not found for the current active text file. Try save or reopen this file.");
	}
	return istari;
}

function registerDoc(doc: vscode.TextDocument, editor: vscode.TextEditor | undefined = undefined) {
	if (doc.languageId === "istari") {
		if (!istariUIs.has(doc)) {
			istariUIs.set(doc, new IstariUI(doc));
		} else {
			if (editor){
				let ui  = istariUIs.get(doc);
				if (ui) {
					ui.setEditor(editor);
				}
			}
			istariUIs.get(doc)?.revealWebview();
		}

	}
}

function startLSP() {
	// Signature help
	vscode.languages.registerSignatureHelpProvider('istari', {
		provideSignatureHelp(document, position, token, context) {
			// find the first word after last / on the current line before cursor
			// if no such word
			let line = document.lineAt(position.line).text.substring(0, position.character);
			// check if we have a / character
			let lastSlash = line.lastIndexOf('/');
			if (lastSlash === -1) {
				return undefined;
			}
			// find the first word after the last slash, word should include . and _
			let lastWordMatch = line.substring(lastSlash + 1).match(/[\w.]+/);
			if (!lastWordMatch) {
				return undefined;
			}
			let lastWord = lastWordMatch[0];
			if(!lastWord) {
				return undefined;
			}

			let istari = getIstariForDocument(document);
			return new Promise((resolve, reject) => {
				istari.interjectWithCallback("Report.showType (parseLongident /" + lastWord + "/);",
					(data) => {
						let signatureHelp = new vscode.SignatureHelp();
						let signature = new vscode.SignatureInformation(
							lastWord,
							new vscode.MarkdownString().appendCodeblock(data, "istari")
						);
						signatureHelp.signatures = [signature];
						signatureHelp.activeSignature = 0;
						signatureHelp.activeParameter = 0;
						resolve(signatureHelp);
						return true;
					}
				);
			});
		}
	}, ' ');
	// Completion
	vscode.languages.registerCompletionItemProvider('istari', {
		provideCompletionItems(document, position, token, context) {
			let istari = getIstariForDocument(document);
			return new Promise((resolve, reject) => {
				istari.interjectWithCallback("Report.showAll ();", 
					(data) => {
						let completions = data.split("\n").filter((line) => !line.includes(" ")).map((line) => {
							return new vscode.CompletionItem(line, vscode.CompletionItemKind.Variable);
						});
						resolve(completions);
						return true;
					}
				);
			});
		},
		resolveCompletionItem(item, token) {
			let istari = getIstari();
			let itemName = item.label;
			return new Promise((resolve, reject) => {
				istari?.interjectWithCallback("Report.showType (parseLongident /" + itemName + "/);",
					(data) => {
						item.documentation = new vscode.MarkdownString().appendCodeblock(data, "istari");
						resolve(item);
						return true;
					}
				);
			});
		}
	}, '/'); // only triggers on the / character
	// Hover
	vscode.languages.registerHoverProvider('istari', {
		provideHover(document, position, token) {
			let istari = getIstariForDocument(document);

			// get the word at the position
			let word = document.getText(document.getWordRangeAtPosition(position));
			if (!word) {
				return undefined;
			}
			return new Promise((resolve, reject) => {
				istari.interjectWithCallback("Report.showType (parseLongident /" + word + "/);", 
					(data) => {
						resolve({
							contents: [new vscode.MarkdownString().appendCodeblock(data, "istari")]
							// data.split("\n").map((line) => {
							// 	return { language: "istari", value: line };
							// })
						});
						return true; 
					}
				);
			});
		}
	});
}


export function activate(context: vscode.ExtensionContext) {

	// listen for file open on istari langauge files
	vscode.workspace.onDidOpenTextDocument((doc) => {
		registerDoc(doc);
	});

	vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor) {
			registerDoc(editor.document, editor);
		}
	}
	);

	vscode.workspace.onDidSaveTextDocument((doc) => {
		registerDoc(doc);
	});

	vscode.workspace.onDidCloseTextDocument((doc) => {
		istariUIs.delete(doc);
	});

	vscode.window.visibleTextEditors.forEach((editor) => {
		registerDoc(editor.document);
	});

	vscode.workspace.onDidChangeTextDocument(e => {
		if (e.document.languageId === "istari") {
			let istari = getIstari();
			if(istari) {
				istari.edit(e);
			} else {
				console.error("[C] Istari not found for the current active text file. Try save or reopen this file.", e.document.fileName, istariUIs);
			}
		}
	});
	

	context.subscriptions.push(vscode.commands.registerCommand('istari.jumpToCursor', () => {
		getIstari()?.jumpToCursor();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.prevLine', () => {
		getIstari()?.prevLine();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.nextLine', () => {
		getIstari()?.nextLine();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.getType', () => {
		vscode.window.showInputBox({ title: "Get the type of a constant", prompt: "constant", ignoreFocusOut: true }).then((expr) => {
			if (expr) {
				getIstari()?.interject("Report.showType (parseLongident /" + expr + "/);");
			}
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.getDefinition', () => {
		vscode.window.showInputBox({ title: "Get the definition of a constant", prompt: "constant", ignoreFocusOut: true }).then((expr) => {
			if (expr) {
				getIstari()?.interject("Report.show (parseLongident /" + expr + "/);");
			}
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.search', () => {
		vscode.window.showInputBox({ title: "Find all constants that mention targets", prompt: "targets", ignoreFocusOut: true }).then((expr) => {
			if (expr) {
				getIstari()?.interject("Report.search (parseConstants /" + expr + "/) [];");
			}
		});
	}));


	// context.subscriptions.push(vscode.commands.registerCommand('istari.init', () => {
	// 	editor = vscode.window.activeTextEditor;
	// 	istari = editor ? new IstariTerminal(editor) : undefined;
	// }));

	// context.subscriptions.push(vscode.commands.registerCommand('istari.jumpCursor', () => {
	// 	let istari = getIstari();
	// 	if (istari) {
	// 		let pos = new vscode.Position(istari.currentLine - 1, 0);
	// 		istari.get_editor().selection = new vscode.Selection(pos, pos);
	// 		istari.get_editor().revealRange(new vscode.Range(pos, pos));
	// 	}
	// }));

	context.subscriptions.push(vscode.commands.registerCommand('istari.interject', () => {
		vscode.window.showInputBox({ title: "Interject with IML code", prompt: "IML code", ignoreFocusOut: true }).then((code) => {
			if (code) {
				getIstari()?.interject(code);
			}
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.showCurrentGoals', () => {
		getIstari()?.interject("Prover.show ();");
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.showCurrentGoalsVerbosely', () => {
		getIstari()?.interject("Prover.showFull ();");
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.details', () => {
		getIstari()?.interject("Prover.detail ();");
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.listConstants', () => {
		getIstari()?.interject("Report.showAll ();");
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.listConstantsModule', () => {
		vscode.window.showInputBox({ title: "Module to list constants from", prompt: "module", ignoreFocusOut: true }).then((code) => {
			if (code) {
				getIstari()?.interject("Report.showModule (parseLongident /" + code + "/);");
			}
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.showImplicitArguments', () => {
		getIstari()?.interject("Show.showImplicits := not (!Show.showImplicits); if !Show.showImplicits then print \"Display of implicit arguments enabled.\\n\" else print \"Display of implicit arguments disabled.\\n\";");
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.showSubstitutions', () => {
		getIstari()?.interject("Show.showSubstitutions := not (!Show.showSubstitutions); if !Show.showSubstitutions then print \"Display of evar substitutions enabled.\\n\" else print \"Display of evar substitutions disabled.\\n\";");
	}));


	// LSP
	startLSP();

}

// this method is called when your extension is deactivated
export function deactivate() { }
