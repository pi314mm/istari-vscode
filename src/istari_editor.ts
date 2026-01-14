import * as vscode from 'vscode';
import path = require('path');

const decorationBlueArrowGutter = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file(path.join(__dirname, '..', 'media', 'blue-dot.svg')),
    gutterIconSize: '80%',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

const decorationBlueHourglassGutter = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file(path.join(__dirname, '..', 'media', 'blue-hourglass.svg')),
    gutterIconSize: '80%',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

const decorationBlueBackground = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(0, 122, 204, 0.1)', // VS Code blue
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

const decorationGreenGutter = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file(path.join(__dirname, '..', 'media', 'green-bar.svg')),
    gutterIconSize: 'contain',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

const decorationGreenBackground = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(0, 215, 86, 0.1)', // green
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

const decorationYellowGutter = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file(path.join(__dirname, '..', 'media', 'yellow-bar.svg')),
    gutterIconSize: 'contain',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

const decorationRedGutter = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file(path.join(__dirname, '..', 'media', 'red-bar.svg')),
    gutterIconSize: 'contain',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

const decorationBlueGutter = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file(path.join(__dirname, '..', 'media', 'blue-bar.svg')),
    gutterIconSize: 'contain',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

export type IstariStatus = "ready" | "working" | "partialReady";

/**
 * IstariEditor manages visual decorations for multiple editors of the same document.
 * It maintains a list of editors and fetches the document fresh from the URI when needed.
 * Disposed editors are lazily removed when decorations are updated or editors are accessed.
 */
export class IstariEditor {
    private editors: Set<vscode.TextEditor>;
    private uri: string | undefined;

    constructor() {
        this.editors = new Set();
    }


    get editor(): vscode.TextEditor {
        this.removeDisposedEditors();

        const firstEditor = this.editors.values().next().value;
        if (!firstEditor) {
            throw new Error('No editors available');
        }
        return firstEditor;
    }

    addEditor(editor: vscode.TextEditor): void {
        const editorUri = editor.document.uri.toString();

        // Set URI from first editor
        if (!this.uri) {
            this.uri = editorUri;
        } else if (editorUri !== this.uri) {
            throw new Error(`Editor document URI ${editorUri} does not match expected URI ${this.uri}`);
        }

        // Add editor to set
        this.editors.add(editor);
    }

    private removeEditor(editor: vscode.TextEditor): void {
        // Remove editor from set
        this.editors.delete(editor);
    }

    private isEditorDisposed(editor: vscode.TextEditor): boolean {
        try {
            // Try to access editor properties - if disposed, this will throw
            editor.document.uri;
            editor.viewColumn;
            return false;
        } catch {
            // Editor is disposed
            return true;
        }
    }

    private removeDisposedEditors(): void {
        const editorsToRemove: vscode.TextEditor[] = [];

        for (const editor of this.editors) {
            if (this.isEditorDisposed(editor)) {
                editorsToRemove.push(editor);
            }
        }

        for (const editor of editorsToRemove) {
            this.removeEditor(editor);
        }
    }

    setEditor(editor: vscode.TextEditor): void {
        // Add the editor if it's not already tracked
        if (!this.editors.has(editor)) {
            this.addEditor(editor);
        }
    }

    hasEditors(): boolean {
        this.removeDisposedEditors();
        return this.editors.size > 0;
    }

    getEditorCount(): number {
        this.removeDisposedEditors();
        return this.editors.size;
    }

    updateDecorations(currentLine: number, requestedLine: number, status: IstariStatus): void {
        this.removeDisposedEditors();

        // Apply decorations to all remaining active editors
        for (const editor of this.editors) {
            this.updateDecorationsForEditor(editor, currentLine, requestedLine, status);
        }
    }

    private updateDecorationsForEditor(editor: vscode.TextEditor, currentLine: number, requestedLine: number, status: IstariStatus): void {
        // blue dot on current line
        let range = currentLine > 1 ? [
            new vscode.Range(new vscode.Position(currentLine - 1, 0), new vscode.Position(currentLine - 1, 0))
        ] : [];
        let colorCurrentLine = vscode.workspace.getConfiguration().get<boolean>('istari.colorCurrentLine');
        if (colorCurrentLine && colorCurrentLine.valueOf()) {
            editor.setDecorations(decorationBlueBackground, range);
        }
        let colorGutter = vscode.workspace.getConfiguration().get<boolean>('istari.colorGutter');
        if (colorGutter && colorGutter.valueOf()) {
            if (status === "working") {
                editor.setDecorations(decorationBlueHourglassGutter, range);
                editor.setDecorations(decorationBlueArrowGutter, []);
            } else {
                editor.setDecorations(decorationBlueHourglassGutter, []);
                editor.setDecorations(decorationBlueArrowGutter, range);
            }
        }
        // all previous line green
        let greenRange = currentLine > 1 ? [
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(currentLine - 2, 0))
        ] : [];
        if (colorGutter && colorGutter.valueOf()) {
            editor.setDecorations(decorationGreenGutter, greenRange);
        }
        let colorCompleted = vscode.workspace.getConfiguration().get<boolean>('istari.colorCompleted');
        if (colorCompleted && colorCompleted.valueOf()) {
            editor.setDecorations(decorationGreenBackground, greenRange);
        }
        if (colorGutter && colorGutter.valueOf()) {
            // current line - requested line, based on status
            // ready -> red (this indicates a failure if this range is non empty)
            // partial ready -> blue
            // working -> yellow
            let reqLine = requestedLine > 0 ? requestedLine : currentLine;
            let range2 = reqLine > currentLine ? [
                new vscode.Range(new vscode.Position(currentLine, 0), new vscode.Position(reqLine - 2, 0))
            ] : [];
            switch (status) {
                case "ready": {
                    editor.setDecorations(decorationRedGutter, range2);
                    editor.setDecorations(decorationBlueGutter, []);
                    editor.setDecorations(decorationYellowGutter, []);
                    break;
                }
                case "partialReady": {
                    editor.setDecorations(decorationRedGutter, []);
                    // force adding range on partial ready status
                    if (range2.length === 0) {
                        range2 = [new vscode.Range(new vscode.Position(currentLine, 0), new vscode.Position(currentLine, 0))];
                    }
                    editor.setDecorations(decorationBlueGutter, range2);
                    editor.setDecorations(decorationYellowGutter, []);
                    break;
                }
                case "working": {
                    editor.setDecorations(decorationRedGutter, []);
                    editor.setDecorations(decorationBlueGutter, []);
                    editor.setDecorations(decorationYellowGutter, range2);
                    break;
                }
            }
        }
    }

    clearDecorations(): void {
        this.removeDisposedEditors();

        // Clear decorations from all remaining active editors
        for (const editor of this.editors) {
            this.clearDecorationsForEditor(editor);
        }
    }

    private clearDecorationsForEditor(editor: vscode.TextEditor): void {
        editor.setDecorations(decorationBlueArrowGutter, []);
        editor.setDecorations(decorationBlueHourglassGutter, []);
        editor.setDecorations(decorationBlueBackground, []);
        editor.setDecorations(decorationGreenGutter, []);
        editor.setDecorations(decorationGreenBackground, []);
        editor.setDecorations(decorationYellowGutter, []);
        editor.setDecorations(decorationRedGutter, []);
        editor.setDecorations(decorationBlueGutter, []);
    }

    getCursorLine(): number {
        this.removeDisposedEditors();
        return this.editor.selection.active.line;
    }

    getTextRange(document: vscode.TextDocument, startLine: number, endLine: number): string {
        let range = new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine, 0));
        return document.getText(range);
    }

    getLineAt(document: vscode.TextDocument, line: number): vscode.TextLine {
        return document.lineAt(line);
    }

    getLineCount(document: vscode.TextDocument): number {
        return document.lineCount;
    }
}