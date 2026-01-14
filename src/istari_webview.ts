
import * as vscode from 'vscode';

export let webviewHTML = `
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
							const new_hr = document.createElement("hr");
							const new_div = document.createElement("div");
							const new_pre = document.createElement("pre");

							// Add reason indicator if present
							if (message.reason && message.reason !== 'output') {
								const reasonSpan = document.createElement("span");
								reasonSpan.textContent = '[' + message.reason + '] ';
								reasonSpan.style.fontWeight = 'bold';
								reasonSpan.style.color = message.reason.startsWith('mcp') ? '#ff6b35' : '#4a90e2';
								new_div.appendChild(reasonSpan);
							}

							m = message.text;
							// Optionally "Clean up" the message
							// m = m.replace(/\\n(\=+)/g, "");
							// m = m.replace(/\\n(\-+)/g, "");
							new_pre.textContent = m.trim();
							new_div.appendChild(new_pre);
							main_text.appendChild(new_hr);
							main_text.appendChild(new_div);
						}
						break;
					}
					case 'resetText': {
						const mainText = document.getElementById('main_text');
						if (mainText) {
							mainText.innerHTML = '';
						}
						break
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
					case 'changeCursor': {
						const cursor = document.getElementById('cursor');
						if (cursor) {
							cursor.innerHTML = message.text;
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
				Status: <span id="status"></span> 
				| Tasks: <span id="tasks"></span>
				| Cursor: <span id="cursor"></span>
			</div>
			<div id="main_text" style="margin-top: 2em"></div>
			</body>
			`;

export class IstariWebview {
    webview: vscode.WebviewPanel;

    constructor(title: string, onDispose: () => void) {
        this.webview = vscode.window.createWebviewPanel("istari",
            title,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            });
        this.webview.webview.html = webviewHTML;

        // Handle disposal
        this.webview.onDidDispose(() => {
            onDispose();
        });
    }

    postMessage(message: any) {
        this.webview.webview.postMessage(message);
    }

    reveal() {
        this.webview.reveal(vscode.ViewColumn.Beside, false);
    }
}