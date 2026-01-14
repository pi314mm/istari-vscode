import * as vscode from 'vscode';
import { IstariUI } from './istari_ui';

/**
 * Centralized helper functions for Istari UI operations.
 * Used by both extension.ts commands and MCP server to avoid duplication.
 */

export async function gotoLine(istari: IstariUI, line: number): Promise<string> {
    istari.requestedLine = line;
    return await istari.jumpToRequestedLine('mcp');
}

export async function nextLine(istari: IstariUI): Promise<string> {
    return await istari.nextLine('mcp');
}

export async function prevLine(istari: IstariUI): Promise<string> {
    return await istari.prevLine('mcp');
}

export async function jumpToCursor(istari: IstariUI): Promise<string> {
    let cursorLine = istari.istariEditor.getCursorLine();
    istari.requestedLine = cursorLine + 1;
    return await istari.jumpToRequestedLine('user');
}

export async function jumpToPreviouslyRequested(istari: IstariUI): Promise<string> {
    return await istari.jumpToRequestedLine('user');
}

export async function interject(istari: IstariUI, code: string): Promise<string> {
    return await istari.interject(code);
}

export async function getType(istari: IstariUI, constant: string): Promise<string> {
    return await istari.interject(`Report.showType (parseLongident /${constant}/);`);
}

export async function getDefinition(istari: IstariUI, constant: string): Promise<string> {
    return await istari.interject(`Report.show (parseLongident /${constant}/);`);
}

export async function searchConstants(istari: IstariUI, target: string): Promise<string> {
    return await istari.interject(`Report.search (parseConstants /${target}/) [];`);
}

export async function showCurrentGoals(istari: IstariUI): Promise<string> {
    return await istari.interject("Prover.show ();");
}

export async function showCurrentGoalsVerbosely(istari: IstariUI): Promise<string> {
    return await istari.interject("Prover.showFull ();");
}

export async function getCurrentGoals(istari: IstariUI, verbose: boolean): Promise<string> {
    if (verbose) {
        return await istari.interject("Goals.printCurrent printLongGoal;");
    } else {
        return await istari.interject("Goals.printCurrent printGoal;");
    }
}

export async function showDetails(istari: IstariUI): Promise<string> {
    return await istari.interject("Prover.detail ();");
}

export async function listConstants(istari: IstariUI): Promise<string> {
    return await istari.interject("Report.showAll ();");
}

export async function listConstantsModule(istari: IstariUI, module: string): Promise<string> {
    return await istari.interject(`Report.showModule (parseLongident /${module}/);`);
}

export async function showImplicitArguments(istari: IstariUI): Promise<string> {
    return await istari.interject('Show.showImplicits := not (!Show.showImplicits); if !Show.showImplicits then print "Display of implicit arguments enabled.\\n" else print "Display of implicit arguments disabled.\\n";');
}

export async function showSubstitutions(istari: IstariUI): Promise<string> {
    return await istari.interject('Show.showSubstitutions := not (!Show.showSubstitutions); if !Show.showSubstitutions then print "Display of evar substitutions enabled.\\n" else print "Display of evar substitutions disabled.\\n";');
}

export function restartTerminal(istari: IstariUI): string {
    istari.restartIstariTerminal();
    return "Istari terminal restarted";
}

export function interrupt(istari: IstariUI): string {
    istari.terminal.interrupt();
    return "Istari execution interrupted";
}

export function jumpCursor(istari: IstariUI): string {
    let pos = new vscode.Position(istari.currentLine - 1, 0);
    const editor = istari.istariEditor.editor;
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos));
    return `Cursor jumped to line ${istari.currentLine}`;
}


export function getDiagnostics(istari: IstariUI): any {
    const diagnostics = vscode.languages.getDiagnostics(istari.getDocument().uri);
    return {
        diagnostics: diagnostics.map(d => ({
            severity: vscode.DiagnosticSeverity[d.severity],
            message: d.message,
            range: {
                start: { line: d.range.start.line + 1, character: d.range.start.character },
                end: { line: d.range.end.line + 1, character: d.range.end.character },
            },
        }))
    };
}

export function getCurrentOutput(istari: IstariUI): any {
    const messages = istari.webview?.messageHistory || [];
    const latestMessage = messages[messages.length - 1] || {};

    return {
        status: istari.status,
        currentLine: istari.currentLine,
        requestedLine: istari.requestedLine,
        output: latestMessage.text || 'No output available',
        taskQueueLength: istari.terminal.tasks.length,
    };
}

export async function attemptTactic(istari: IstariUI, tactic: string): Promise<{
    success: boolean;
    fileChanged: boolean;
    proofState?: any;
    error?: string;
}> {
    try {
        // Validate that the input is a proper tactic
        const trimmedTactic = tactic.trim();
        const isValidTactic = trimmedTactic.endsWith('.') ||
                             trimmedTactic.endsWith(';') ||
                             trimmedTactic === '{' ||
                             trimmedTactic === '}';

        if (!isValidTactic) {
            return {
                success: false,
                fileChanged: false,
                error: 'Invalid tactic format: must end with "." or ";" or be "{" or "}"'
            };
        }
        const document = istari.getDocument();
        const initialCurrentLine = istari.currentLine;

        // Get the current line content to know where to insert
        const currentLineIndex = istari.currentLine - 1; // Convert to 0-based

        // Insert the tactic at the beginning of the current line, followed by newline
        const edit = new vscode.WorkspaceEdit();
        const insertPosition = new vscode.Position(currentLineIndex, 0);
        edit.insert(document.uri, insertPosition, tactic + '\n');

        // Apply the edit
        const editSuccess = await vscode.workspace.applyEdit(edit);
        if (!editSuccess) {
            return {
                success: false,
                fileChanged: false,
                error: 'Failed to insert tactic into document'
            };
        }

        // Save the document after insertion
        await document.save();

        // Now try to advance to the next line to verify the proof
        try {
            const result = await nextLine(istari);

            // Check if the line actually moved (success condition)
            if (istari.currentLine > initialCurrentLine) {
                // Success: tactic worked, line moved, keep the change
                return {
                    success: true,
                    fileChanged: true,
                    proofState: result
                };
            } else {
                // Line didn't move, so tactic failed - rollback
                await rollbackTacticInsertion(document, currentLineIndex);

                return {
                    success: false,
                    fileChanged: false,
                    error: result || 'Tactic failed: line did not advance'
                };
            }
        } catch (tacticError) {
            // Error during tactic execution - rollback
            await rollbackTacticInsertion(document, currentLineIndex);

            return {
                success: false,
                fileChanged: false,
                error: `Tactic execution failed: ${tacticError instanceof Error ? tacticError.message : tacticError}`
            };
        }

    } catch (error) {
        return {
            success: false,
            fileChanged: false,
            error: `Attempt tactic failed: ${error instanceof Error ? error.message : error}`
        };
    }
}

async function rollbackTacticInsertion(document: vscode.TextDocument, lineIndex: number): Promise<void> {
    try {
        // Remove the inserted line
        const edit = new vscode.WorkspaceEdit();
        const lineToRemove = new vscode.Range(
            new vscode.Position(lineIndex, 0),
            new vscode.Position(lineIndex + 1, 0)
        );
        edit.delete(document.uri, lineToRemove);
        await vscode.workspace.applyEdit(edit);

        // Save the document after rollback
        await document.save();
    } catch (rollbackError) {
        console.error('Failed to rollback tactic insertion:', rollbackError);
    }
}