
import { ChildProcess, spawn } from 'child_process';
import * as vscode from 'vscode';
import * as fs from 'fs';

function bufferToCaretString(buffer: Buffer) {
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


export enum IstariInputCommand {
    textInput = "t",
    interject = "i",
    rewind = "r",
}

export enum IstariCommand {
    textOutput = "t",
    lineNumber = "c",
    working = "w",
    partialReady = "p",
    ready = "r",
}

export class IstariTask {
    callback: (data: string) => boolean; // return true to complete this task by removing it from the queue
    data: string;
    cmd: IstariInputCommand;
    constructor(cmd: IstariInputCommand, data: string, callback: (data: string) => boolean) {
        this.cmd = cmd;
        this.data = data;
        this.callback = callback;
    }
}


export class IstariTerminal {
    proc: ChildProcess;
    buffer: string = "";
    tasks: IstariTask[] = [];
    taskInflight: IstariTask | undefined;
    defaultCallback: (cmd: IstariCommand, data: string) => void;
    tasksUpdated: () => void;
    istariInputStatus: boolean = false; // whether istari is ready to accept input
    pendingOutput: Buffer;

    constructor(
        workingDirectory: string,
        onDefaultCallback: (cmd: IstariCommand, data: string) => void,
        onTasksUpdated: () => void,
    ) {
        let sml = vscode.workspace.getConfiguration().get<string>('istari.smlLocation')!;
        let istari = vscode.workspace.getConfiguration().get<string>('istari.istariLocation')!;
        this.defaultCallback = onDefaultCallback;
        this.proc = spawn(sml, ["@SMLload=" + istari], { cwd: workingDirectory, shell: true });
        if (!fs.existsSync(istari)) {
            throw new Error("Istari not found at " + istari);
        }
        this.proc.on('exit', (code) => {
            if (code !== 0) {
                vscode.window.showWarningMessage(`SML Process exited with code ${code}`);
            }
        });
        this.proc.stdout?.on('data', (data) => {
            this.processOutput(data);
        });
        this.tasksUpdated = onTasksUpdated;
        this.pendingOutput = Buffer.from("");
    }

    interrupt() {
        if (this.proc.kill('SIGINT')) {
            // wait 0.01 seconds
            setTimeout(() => {
                this.writeStdIn("RecoverRepl.recover ();\n");
            }, 10);
        }
    }


    debugLog(text: string) {
        const now = new Date();
        const timeString = `${now.getMinutes()}:${now.getSeconds()}`;
        console.log(`[${timeString}]`, text);

    }

    writeStdIn(text: string) {
        this.debugLog(`>>>> ` + bufferToCaretString(Buffer.from(text)));
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
                        if (this.taskInflight.data.endsWith("\n")) {
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
        this.debugLog("<<<< " + bufferToCaretString(data));
        this.pendingOutput = Buffer.concat([this.pendingOutput, data] as any);
        this.processPendingOutput();
    }

    processPendingOutput() {
        let data = this.pendingOutput;
        let idx = 0;
        while (idx < data.length) {
            let curChar = data[idx];
            if (curChar === 0x01) {
                let command = "";
                let startIdx = idx;
                idx++; // Move past the 0x01 character
                while (idx < data.length && data[idx] !== 0x02) {
                    command += String.fromCharCode(data[idx]);
                    idx++;
                }
                // check if 0x02 is the last character
                if (idx < data.length) {
                    idx++; // Move past the 0x02 character
                } else {
                    // throw new Error("0x02 character not found in command, bug in the extension");
                    // 0x02 not found, abort processing current output and wait for next one
                    this.pendingOutput = data.slice(startIdx);
                    return;
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

        this.pendingOutput = Buffer.from("");
        // done processing the inputs
        this.processTasks();
    }


}
