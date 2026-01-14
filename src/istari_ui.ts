import * as vscode from 'vscode';
import { dirname } from 'path';
import { IstariTerminal, IstariTask, IstariInputCommand, IstariCommand } from './istari_terminal';
import { IstariWebviewState } from './istari_webview_state';
import { IstariEditor, IstariStatus } from './istari_editor';

export class IstariUI {
    private uri: string; // Store URI instead of document
    terminal: IstariTerminal;
    webview: IstariWebviewState;
    istariEditor: IstariEditor;
    diagnostics: vscode.DiagnosticCollection;

    // State properties that persist across editor changes
    private _currentLine: number;
    private _requestedLine: number;
    private _status: IstariStatus;
    private _checkedLinesCache: string[]; // Cache of checked lines as array

    // Single document access function to avoid code duplication
    getDocument(): vscode.TextDocument {
        // Always fetch document fresh from workspace
        const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === this.uri);
        if (!document) {
            throw new Error(`Document not found for URI: ${this.uri}`);
        }
        return document;
    }

    get editor(): vscode.TextEditor {
        return this.istariEditor.editor;
    }

    get currentLine(): number {
        return this._currentLine;
    }

    get requestedLine(): number {
        return this._requestedLine;
    }

    set requestedLine(line: number) {
        this._requestedLine = line;
    }

    get status(): IstariStatus {
        return this._status;
    }

    constructor(uri: string) {
        this.uri = uri;

        // Verify the document exists
        const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri);
        if (!document) {
            throw new Error(`Document not found for URI: ${uri}`);
        }

        this.istariEditor = new IstariEditor();

        // Add the initial editor if one exists
        let editor = vscode.window.visibleTextEditors.find(x => x.document.uri.toString() === uri);
        if (editor) {
            this.istariEditor.addEditor(editor);
        }
        this.webview = new IstariWebviewState(uri);
        this.diagnostics = vscode.languages.createDiagnosticCollection("istari");

        // Initialize state
        this._currentLine = 1;
        this._requestedLine = 1;
        this._status = "ready";
        this._checkedLinesCache = [];

        this.terminal = new IstariTerminal(dirname(this.getDocument().fileName),
            this.defaultCallback.bind(this),
            this.tasksUpdated.bind(this));
    }

    restartIstariTerminal() {
        this.terminal.proc.kill();
        this.terminal = new IstariTerminal(dirname(this.getDocument().fileName),
            this.defaultCallback.bind(this),
            this.tasksUpdated.bind(this));
        this.webview.resetText();
        this._currentLine = 1;
        this._requestedLine = 1;
        this._status = "ready";
        this._checkedLinesCache = [];
        this.updateDecorations();
        this.diagnostics.clear();
    }

    tasksUpdated() {
        if (this.terminal.tasks.length > 0 || this.terminal.taskInflight) {
            this.webview.changeTasks((this.terminal.tasks.length + 1).toString() + " Remaining");
        } else {
            this.webview.changeTasks("Ready");
        }
    }

    updateDecorations() {
        this.istariEditor.updateDecorations(this._currentLine, this._requestedLine, this._status);
    }

    updateCurrentLine(line: number) {
        this._currentLine = line;
        // Update cache with the checked portion of the document
        if (line > 1) {
            this._checkedLinesCache = [];
            for (let i = 0; i < line - 1; i++) {
                this._checkedLinesCache.push(this.istariEditor.getLineAt(this.getDocument(), i).text);
            }
        } else {
            this._checkedLinesCache = [];
        }
        this.updateDecorations();
        this.webview.changeCursor(line.toString());
    }

    setEditor(editor: vscode.TextEditor) {
        this.istariEditor.setEditor(editor);
        this.updateDecorations();
        this.webview.changeCursor(this._currentLine.toString());
    }

    // called on send lines, also gets diagnostic information
    respondToSendLineResponse(text: string) {
        // format: ... error ...  <line>.<col>.
        let diagnostic = text.match(/error.*?(\d+)\.(\d+)\.\s$/);
        if (diagnostic) {
            let line = parseInt(diagnostic[1]);
            let col = parseInt(diagnostic[2]);
            // get the range for single word (seems istari uses 1 based line number and 0 based col number)
            let wordRange = this.getDocument().getWordRangeAtPosition(new vscode.Position(line - 1, col))
                || new vscode.Range(new vscode.Position(line - 1, col), new vscode.Position(line - 1, col + 10));
            let diagnosticInfo = new vscode.Diagnostic(wordRange, text, vscode.DiagnosticSeverity.Error);
            this.diagnostics.set(this.getDocument().uri, [diagnosticInfo]);
        } else {
            this.diagnostics.clear();
        }
    }

    defaultCallback(cmd: IstariCommand, data: string) {
        switch (cmd) {
            case IstariCommand.textOutput: {
                this.webview.appendText(data, 'output');
                break;
            }
            case IstariCommand.lineNumber: {
                this.updateCurrentLine(Number(data));
                break;
            }
            case IstariCommand.working: {
                this.webview.changeStatus("Working " + data);
                this._status = "working";
                this.updateDecorations();
                break;
            }
            case IstariCommand.partialReady: {
                this.webview.changeStatus("Partial Ready " + data);
                this._status = "partialReady";
                this.updateDecorations();
                break;
            }
            case IstariCommand.ready: {
                this.webview.changeStatus("Ready " + data);
                this._status = "ready";
                this.updateDecorations();
                break;
            }

            default: {
                console.error("Unknown command: " + cmd);
                break;
            }
        }
    }

    async interject(text: string): Promise<string> {
        // console.log("Interjecting: ", text);
        // this.write_stdin('\x02' + text + '\n');
        return new Promise((resolve) => {
            this.terminal.enqueueTask(new IstariTask(IstariInputCommand.interject, text, (data) => {
                this.webview.appendText(data, 'interject-' + text);
                resolve(data);
                return true;
            }));
        });
    }

    interjectWithCallback(text: string, callback: (data: string) => boolean) {
        this.terminal.enqueueTask(new IstariTask(IstariInputCommand.interject, text, callback));
    }

    getTypeForConstant(constant: string, callback: (type: string) => void) {
        this.interjectWithCallback("Report.showType (parseLongident /" + constant + "/);", (data) => {
            callback(data);
            return true;
        });
    }

    getTypeAndDefinitionForConstant(constant: string, callback: (typeAndDefinition: string) => void) {
        // this.getTypeForConstant(constant, (data) => {
        this.interjectWithCallback("Report.show' (parseLongident /" + constant + "/);", (typeAndDefinition) => {
            // callback(data, definition);
            callback(typeAndDefinition);
            return true;
        });
        // return true;
        // });
    }

    sendLines(text: string, source: 'user' | 'mcp' = 'user'): Promise<string> {
        return new Promise((resolve) => {
            this.terminal.enqueueTask(new IstariTask(IstariInputCommand.textInput, text, (data) => {
                this.webview.appendText(data, `${source}-jump-to-${this._requestedLine}`);
                this.respondToSendLineResponse(data);
                resolve(data);
                return true;
            }));
        });
    }

    rewindToLine(line: number, source: 'user' | 'mcp' = 'user'): Promise<string> {
        // When rewinding, update the cache to reflect the new state
        if (line > 1) {
            // Keep only the lines that will remain checked after rewind
            this._checkedLinesCache = this._checkedLinesCache.slice(0, line - 1);
        } else {
            this._checkedLinesCache = [];
        }
        return new Promise((resolve) => {
            this.terminal.enqueueTask(new IstariTask(IstariInputCommand.rewind, line.toString(), (data) => {
                this.webview.appendText(data, `${source}-rewind-to-${line}`);
                resolve(data);
                return true;
            }));
        });
    }

    async jumpToRequestedLine(source: 'user' | 'mcp' = 'user'): Promise<string> {
        // Check if the cached content matches the current document
        if (this._checkedLinesCache.length > 0) {
            // Find the last line where content still matches
            let validLine = 1;

            for (let i = 0; i < this._checkedLinesCache.length; i++) {
                // Check if this line still exists and matches
                if (i < this.istariEditor.getLineCount(this.getDocument())) {
                    let currentLineText = this.istariEditor.getLineAt(this.getDocument(), i).text;
                    if (currentLineText === this._checkedLinesCache[i]) {
                        validLine = i + 2; // i is 0-indexed, validLine is 1-indexed and points to the next unchecked line
                    } else {
                        break; // Found a mismatch
                    }
                } else {
                    break; // Document is shorter than cache
                }
            }

            // Rewind if we're ahead of the last valid line
            if (validLine < this._currentLine) {
                const result = await this.rewindToLine(validLine, source);
                this._requestedLine = Math.max(validLine, this._requestedLine);
                return result;
            }
        }

        if (this._requestedLine > this._currentLine) {
            let text = this.istariEditor.getTextRange(this.getDocument(), this._currentLine - 1, this._requestedLine - 1);
            return await this.sendLines(text, source);
        } else if (this._requestedLine < this._currentLine) {
            return await this.rewindToLine(this._requestedLine, source);
        } else if (this._requestedLine === this._currentLine && vscode.workspace.getConfiguration().get<boolean>('istari.continueJumpingForward')?.valueOf()) {
            // special: if we already jumped to the requested line, just jump the next line past ;
            // currentLine and requestedLine is 1 indexed, nextline is zero-indexed
            let nextline = this._currentLine;
            while (nextline < this.istariEditor.getLineCount(this.getDocument())) {
                let line = this.istariEditor.getLineAt(this.getDocument(), nextline).text;
                nextline++;
                if (line.includes(";")) {
                    break;
                }
            }
            if (nextline + 1 !== this._requestedLine) {
                this._requestedLine = nextline + 1;
                return await this.jumpToRequestedLine(source);
            }
        }

        // Default case: already at the requested line, no action needed
        return `Already at line ${this._requestedLine}`;
    }

    jumpToCursor() {
        let cursorLine = this.istariEditor.getCursorLine();
        this._requestedLine = cursorLine + 1;
        this.jumpToRequestedLine('user'); // Fire and forget for user actions
    }

    async nextLine(source: 'user' | 'mcp' = 'user'): Promise<string> {
        console.log("nextLine not implemented");
        if (this._currentLine < this.istariEditor.getLineCount(this.getDocument())) {
            this._requestedLine = this._currentLine + 1;
            let text = this.istariEditor.getTextRange(this.getDocument(), this._currentLine - 1, this._currentLine);
            return await this.sendLines(text, source);
        } else {
            console.log("error");
            return "Error: Already at the last line";
        }
    }

    async prevLine(source: 'user' | 'mcp' = 'user'): Promise<string> {
        console.log("prevLine not implemented");
        if (this._currentLine > 1) {
            return await this.rewindToLine(this._currentLine - 1, source);
        } else {
            console.log("error");
            return "Error: Already at the first line";
        }
    }


    edit(e: vscode.TextDocumentChangeEvent) {
        if (e.contentChanges.length > 0) {
            if (e.contentChanges[0].range.end.line < this._currentLine - 1) {
                // skip if just inserting a trailing newline (possibly followed by spaces) right before this line
                if (e.contentChanges[0].text.includes("\n")
                    && e.contentChanges[0].text.trim() === ""
                    && e.contentChanges[0].range.end.line === this._currentLine - 2
                    // ensures line after insertion is empty to prevent insertion in the middle
                    && e.document.lineAt(e.contentChanges[0].range.end.line + 1).text.trim() === ""
                ) {
                    return;
                }
                this.rewindToLine(e.contentChanges[0].range.start.line + 1, 'user');
            }
        }
    }
}