import * as vscode from 'vscode';
import { IstariMCPServer } from './mcp-server';
import { startLSP } from './istari_lsp';
import { mcpServer, setMcpServer, getCurrentIstari, getOrCreateIstariUI, setCurrentIstariUri, getIstariByUri, restartMcpServer, startMcpServer, stopMcpServer } from './global';
import * as IstariHelper from './istari_ui_helper';



function registerDoc(doc: vscode.TextDocument, editor: vscode.TextEditor | undefined = undefined) {
	if (doc.languageId === "istari") {
		// This will either get existing UI or create new one
		const ui = getOrCreateIstariUI(doc.uri.toString());

		// Update editor if provided
		if (editor) {
			ui.setEditor(editor);
		}

		// Note: MCP server is no longer auto-started
		// Use the command palette to start it manually when needed
	}
}


export function activate(context: vscode.ExtensionContext) {

	// listen for file open on istari langauge files
	vscode.workspace.onDidOpenTextDocument((_doc) => {
		// registerDoc(doc);
	});

	vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor) {
			registerDoc(editor.document, editor);
			// Update current Istari URI when switching editors
			if (editor.document.languageId === "istari") {
				setCurrentIstariUri(editor.document.uri.toString());
			}
		}
	}
	);

	vscode.workspace.onDidSaveTextDocument((_doc) => {
		// registerDoc(doc);
	});

	vscode.workspace.onDidCloseTextDocument((_doc) => {
		// Do nothing - keep UI/terminal running in background for MCP access
	});

	vscode.window.visibleTextEditors.forEach((editor) => {
		registerDoc(editor.document);
	});

	// Set current Istari URI for active editor on activation
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor && activeEditor.document.languageId === "istari") {
		registerDoc(activeEditor.document, activeEditor);
		setCurrentIstariUri(activeEditor.document.uri.toString());
	}


	vscode.workspace.onDidChangeTextDocument(e => {
		if (e.document.languageId === "istari") {
			const uri = e.document.uri.toString();
			let istari = getIstariByUri(uri);
			if (istari) {
				istari.edit(e);
			} else {
				console.error("[C] Istari not found for the document.", e.document.fileName);
			}
		}
	});


	context.subscriptions.push(vscode.commands.registerCommand('istari.jumpToCursor', () => {
		let istari = getCurrentIstari();
		if (istari) {
			istari.editor.document.save();
			IstariHelper.jumpToCursor(istari);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.jumpToPreviouslyRequested', () => {
		let istari = getCurrentIstari();
		if (istari) {
			istari.editor.document.save();
			IstariHelper.jumpToPreviouslyRequested(istari);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.restartTerminal', () => {
		let istari = getCurrentIstari();
		if (istari) {
			IstariHelper.restartTerminal(istari);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.prevLine', () => {
		let istari = getCurrentIstari();
		if (istari) {
			IstariHelper.prevLine(istari);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.nextLine', () => {
		let istari = getCurrentIstari();
		if (istari) {
			IstariHelper.nextLine(istari);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.getType', () => {
		vscode.window.showInputBox({ title: "Get the type of a constant", prompt: "constant", ignoreFocusOut: true }).then((expr) => {
			if (expr) {
				let istari = getCurrentIstari();
				if (istari) {
					IstariHelper.getType(istari, expr);
				}
			}
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.getDefinition', () => {
		vscode.window.showInputBox({ title: "Get the definition of a constant", prompt: "constant", ignoreFocusOut: true }).then((expr) => {
			if (expr) {
				let istari = getCurrentIstari();
				if (istari) {
					IstariHelper.getDefinition(istari, expr);
				}
			}
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.search', () => {
		vscode.window.showInputBox({ title: "Find all constants that mention targets", prompt: "targets", ignoreFocusOut: true }).then((expr) => {
			if (expr) {
				let istari = getCurrentIstari();
				if (istari) {
					IstariHelper.searchConstants(istari, expr);
				}
			}
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.interrupt', () => {
		let istari = getCurrentIstari();
		if (istari) {
			IstariHelper.interrupt(istari);
		}
	}));


	// context.subscriptions.push(vscode.commands.registerCommand('istari.init', () => {
	// 	editor = vscode.window.activeTextEditor;
	// 	istari = editor ? new IstariTerminal(editor) : undefined;
	// }));

	context.subscriptions.push(vscode.commands.registerCommand('istari.jumpCursor', () => {
		let istari = getCurrentIstari();
		if (istari) {
			IstariHelper.jumpCursor(istari);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.interject', () => {
		vscode.window.showInputBox({ title: "Interject with IML code", prompt: "IML code", ignoreFocusOut: true }).then((code) => {
			if (code) {
				let istari = getCurrentIstari();
				if (istari) {
					IstariHelper.interject(istari, code);
				}
			}
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.showCurrentGoals', () => {
		let istari = getCurrentIstari();
		if (istari) {
			IstariHelper.showCurrentGoals(istari);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.showCurrentGoalsVerbosely', () => {
		let istari = getCurrentIstari();
		if (istari) {
			IstariHelper.showCurrentGoalsVerbosely(istari);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.details', () => {
		let istari = getCurrentIstari();
		if (istari) {
			IstariHelper.showDetails(istari);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.listConstants', () => {
		let istari = getCurrentIstari();
		if (istari) {
			IstariHelper.listConstants(istari);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.listConstantsModule', () => {
		vscode.window.showInputBox({ title: "Module to list constants from", prompt: "module", ignoreFocusOut: true }).then((code) => {
			if (code) {
				let istari = getCurrentIstari();
				if (istari) {
					IstariHelper.listConstantsModule(istari, code);
				}
			}
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.showImplicitArguments', () => {
		let istari = getCurrentIstari();
		if (istari) {
			IstariHelper.showImplicitArguments(istari);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.showSubstitutions', () => {
		let istari = getCurrentIstari();
		if (istari) {
			IstariHelper.showSubstitutions(istari);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.attemptTactic', () => {
		vscode.window.showInputBox({
			title: "Attempt a tactic at current line",
			prompt: "Tactic to try (will be inserted, tested, and kept if successful or rolled back if failed)",
			ignoreFocusOut: true
		}).then(async (tactic) => {
			if (tactic) {
				let istari = getCurrentIstari();
				if (istari) {
					try {
						istari.editor.document.save();
						const result = await IstariHelper.attemptTactic(istari, tactic);

						if (result.success) {
							vscode.window.showInformationMessage(
								`✅ Tactic succeeded! Line advanced from ${result.proofState?.currentLine - 1} to ${result.proofState?.currentLine}`
							);
						} else {
							vscode.window.showWarningMessage(
								`❌ Tactic failed: ${result.error}`
							);
						}
					} catch (error) {
						vscode.window.showErrorMessage(
							`Error attempting tactic: ${error instanceof Error ? error.message : error}`
						);
					}
				}
			}
		});
	}));

	// MCP Server
	context.subscriptions.push(vscode.commands.registerCommand('istari.startMcpServer', async () => {
		if (!mcpServer) {
			try {
				await startMcpServer();
				vscode.window.showInformationMessage('Istari MCP server started');
			} catch (error: any) {
				console.error(`Failed to start MCP server: ${error.message}`);
				vscode.window.showErrorMessage(`Failed to start MCP server: ${error.message}`);
			}
		} else {
			vscode.window.showInformationMessage('MCP server is already running');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.stopMcpServer', async () => {
		if (mcpServer) {
			try {
				await stopMcpServer();
				vscode.window.showInformationMessage('Istari MCP server stopped');
			} catch (error: any) {
				console.error(`Failed to stop MCP server: ${error.message}`);
				vscode.window.showErrorMessage(`Failed to stop MCP server: ${error.message}`);
			}
		} else {
			vscode.window.showInformationMessage('MCP server is not running');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.restartMcpServer', async () => {
		try {
			await restartMcpServer();
			vscode.window.showInformationMessage('Istari MCP server restarted');
		} catch (error: any) {
			console.error(`Failed to restart MCP server: ${error.message}`);
			vscode.window.showErrorMessage(`Failed to restart MCP server: ${error.message}`);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.installClaudeMcp', () => {
		const command = 'claude mcp add istari-vscode http://localhost:47821/mcp -s user -t http';

		vscode.window.showInformationMessage(
			`This will run: ${command}`,
			'Install', 'Cancel'
		).then((selection) => {
			if (selection === 'Install') {
				// Execute the Claude MCP install command
				const terminal = vscode.window.createTerminal('Claude MCP Install');
				terminal.show();
				terminal.sendText(command);

				vscode.window.showInformationMessage('Claude MCP installation command executed. Make sure to start the MCP server first if not already running.');
			}
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.installCodexMcp', () => {
		const command = 'codex mcp add istari-vscode -- npx mcp-remote http://localhost:47821/mcp --allow-http --transport http-only';

		vscode.window.showInformationMessage(
			`This will run: ${command}`,
			'Install', 'Cancel'
		).then((selection) => {
			if (selection === 'Install') {
				// Execute the Codex CLI MCP install command
				const terminal = vscode.window.createTerminal('Codex CLI MCP Install');
				terminal.show();
				terminal.sendText(command);

				vscode.window.showInformationMessage('Codex CLI MCP installation command executed. Make sure to start the MCP server first if not already running.');
			}
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('istari.showWebview', () => {
		let istari = getCurrentIstari();
		if (istari) {
			istari.webview.showWebview();
		} else {
			vscode.window.showInformationMessage('No active Istari document. Open an .ist file first.');
		}
	}));


	// LSP
	startLSP();

}

// this method is called when your extension is deactivated
export function deactivate() { }
