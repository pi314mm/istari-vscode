import * as vscode from 'vscode';
import path = require('path');
import { IstariWebview } from './istari_webview';
import { getIstariDocumentByUri } from './global';

export class IstariWebviewState {
    private uri: string;
    private webview: IstariWebview | null = null;
    private messages: any[] = [];
    private currentStatus: string = '';
    private currentTasks: string = '';
    private currentCursor: string = '';

    private get document(): vscode.TextDocument | undefined {
        return vscode.workspace.textDocuments.find(doc => doc.uri.toString() === this.uri);
    }

    constructor(uri: string) {
        this.uri = uri;

        // Show notification when state is created
        const istariDoc = getIstariDocumentByUri(uri);
        const docIdStr = istariDoc?.id ? ` (ID: ${istariDoc.id})` : '';
        const document = this.document;
        const fileName = document ? path.basename(document.fileName) : 'Unknown';
        vscode.window.showInformationMessage(
            `Istari session started for ${fileName}${docIdStr}`,
            'Open Webview'
        ).then(selection => {
            if (selection === 'Open Webview') {
                this.showWebview();
            }
        });
    }

    public showWebview(): void {
        if (this.webview) {
            // Webview exists, just reveal it
            this.webview.reveal();
        } else {
            // Create new webview
            this.createWebview();
        }
    }

    private createWebview(): void {
        const istariDoc = getIstariDocumentByUri(this.uri);
        const docIdStr = istariDoc?.id ? ` (ID: ${istariDoc.id})` : '';
        const document = this.document;
        const fileName = document ? path.basename(document.fileName) : 'Unknown';
        this.webview = new IstariWebview(
            `${fileName}${docIdStr}`,
            () => {
                // Handle disposal - set webview to null
                this.webview = null;
            }
        );

        // Restore all state to the new webview
        this.restoreState();
    }

    private restoreState(): void {
        if (!this.webview) return;

        // Restore status, tasks, cursor
        if (this.currentStatus) {
            this.webview.postMessage({ command: 'changeStatus', text: this.currentStatus });
        }
        if (this.currentTasks) {
            this.webview.postMessage({ command: 'changeTasks', text: this.currentTasks });
        }
        if (this.currentCursor) {
            this.webview.postMessage({ command: 'changeCursor', text: this.currentCursor });
        }

        // Restore all messages
        this.messages.forEach((message) => {
            this.webview!.postMessage(message);
        });

        // Scroll to bottom
        this.webview.postMessage({ command: 'scrollToBottom' });
    }

    public resetText(): void {
        this.messages = [];
        if (this.webview) {
            this.webview.postMessage({ command: 'resetText' });
        }
    }

    public appendText(text: string, reason?: string): void {
        const message = { command: 'appendText', text: text, reason: reason || 'output' };
        this.messages.push(message);
        if (this.messages.length > 100) {
            this.messages.shift();
        }

        if (this.webview) {
            this.webview.postMessage(message);
            this.webview.postMessage({ command: 'scrollToBottom' });
        }
    }

    public changeStatus(text: string): void {
        this.currentStatus = text;
        if (this.webview) {
            this.webview.postMessage({ command: 'changeStatus', text: text });
        }
    }

    public changeTasks(text: string): void {
        this.currentTasks = text;
        if (this.webview) {
            this.webview.postMessage({ command: 'changeTasks', text: text });
        }
    }

    public changeCursor(text: string): void {
        this.currentCursor = text;
        if (this.webview) {
            this.webview.postMessage({ command: 'changeCursor', text: text });
        }
    }

    // For MCP server access
    public get messageHistory(): any[] {
        return [...this.messages];
    }
}