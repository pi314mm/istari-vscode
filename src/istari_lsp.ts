import * as vscode from 'vscode';
import { getIstariByUri, getCurrentIstari } from './global';


type DocSymbolType = 'define' | 'lemma' | 'typedef' | 'defineInd' | "";
type DocSymbol = {
    word: string,
    kind: DocSymbolType,
    line: number,
    column: number,
};
function getDocumentSymbols(document: vscode.TextDocument): DocSymbol[] {
    let symbols: DocSymbol[] = [];
    for (let i = 0; i < document.lineCount; i++) {
        let line = document.lineAt(i).text;
        let symbolName = "";
        let symbolKind: DocSymbolType = "";
        let col = 0;
        if (line.startsWith("define /")) {
            symbolName = line.substring(8).split(/[\/\s]/)[0];
            symbolKind = "define";
            col = 8;
        } else if (line.startsWith("lemma \"")) {
            symbolName = line.substring(7).split(/["\s]/)[0];
            symbolKind = "lemma";
            col = 7;
        } else if (line.startsWith("typedef")) {
            try {
                // skip to of
                while (!line.includes("of")) {
                    i++;
                    line = document.lineAt(i).text;
                }
                if (line.trim().endsWith("of")) {
                    i++;
                    line = document.lineAt(i).text;
                }
                while (line.trim() === "") {
                    i++;
                    line = document.lineAt(i).text;
                }
                symbolName = line.trim().split(/\s/)[0];
                symbolKind = "typedef";
                col = line.indexOf(symbolName);
            } catch {
                symbolName = "";
            }
        } else if (line.startsWith("defineInd")) {
            try {
                i++;
                line = document.lineAt(i).text;
                let word = null;
                // loop find (word) : in this line
                while ((word = line.trim().match(/^\s*(\w+)\s*:/)) === null) {
                    i++;
                    line = document.lineAt(i).text;
                    if (line.includes(";")) {
                        break;
                    }
                }
                if (word) {
                    word = word[1];
                    symbolName = word;
                    symbolKind = "defineInd";
                    col = line.indexOf(word);
                }
            } catch {
                symbolName = "";
            }
        }
        if (symbolName && symbolKind) {
            symbols.push({ word: symbolName, kind: symbolKind, line: i, column: col });
        }
    }
    return symbols;
}

function getModuleSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    let result = [];
    for (let i = 0; i < document.lineCount; i++) {
        let line = document.lineAt(i).text;
        let moduleNameMatch = line.match(/^beginModule\s+\"(.*)\"/);
        if (moduleNameMatch) {
            let moduleName = moduleNameMatch[1];
            // find until endModule
            let start = i;
            while (i < document.lineCount) {
                let line = document.lineAt(i).text;
                if (line.includes("endModule")) {
                    break;
                }
                i++;
            }
            let end = i;
            result.push(new vscode.DocumentSymbol(moduleName, "", vscode.SymbolKind.Module,
                new vscode.Range(start, 0, end, 0), new vscode.Range(start, 0, start, 0)));
        }
    }
    return result;
}

function getCurrentSubject(document: vscode.TextDocument, position: vscode.Position): string | undefined {
    // find the first word after last / on the current line before cursor
    // if no such word, use the first word on this line
    let line = document.lineAt(position.line).text.substring(0, position.character);
    // check if we have a / character
    let lastSlash = line.lastIndexOf('/');
    if (lastSlash === -1) {
        // split by spaces and parenthesis, i.e. 
        // "Foo.bar (x, y)" => ["Foo.bar", "(", "x,", "y", ")"]
        let components = line.split(/(\s+|[()])/).filter(s => s.trim() !== "");
        let i = components.length - 1;
        let parenthesisCount = 0;
        while (i >= 0) {
            // if we reached the end, return the current word
            if (i === 0) {
                if (components[i].match(/[\w.]+/)) {
                    return components[i];
                } else {
                    return undefined;
                }
            }
            // if the current character is a word
            if (components[i].match(/[\w.]+/)) {
                // and previous character is not a word, nor a closing parenthesis
                // or if the previous component is a dot
                // and parenthesis count is 0
                // return the current word
                if ((!components[i - 1].match(/[\w.)]+/) || components[i - 1] === ".")
                    && parenthesisCount === 0) {
                    return components[i];
                }
            }
            // increase the parenthesis count if we see a )
            if (components[i] === ")") {
                parenthesisCount++;
            }
            // decrease the parenthesis count if we see a (
            if (components[i] === "(") {
                parenthesisCount--;
            }
            i--;
        }
        return undefined;
    } else {
        // find the first word after the last slash, word should include . and _
        let lastWordMatch = line.substring(lastSlash + 1).match(/[\w.]+/);
        if (!lastWordMatch) {
            return undefined;
        }
        let lastWord = lastWordMatch[0];
        if (!lastWord) {
            return undefined;
        }
        return lastWord;
    }
}

export function startLSP() {
    // Signature help
    vscode.languages.registerSignatureHelpProvider('istari', {
        provideSignatureHelp(document, position, token, context) {
            let lastWord = getCurrentSubject(document, position);
            if (lastWord) {
                let word: string = lastWord;
                let istari = getIstariByUri(document.uri.toString());
            if (!istari) return undefined;
                return new Promise((resolve, reject) => {
                    istari!.getTypeForConstant(word,
                        (data: string) => {
                            let signatureHelp = new vscode.SignatureHelp();
                            let signature = new vscode.SignatureInformation(
                                word,
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
            } else {
                return undefined;
            }
        }
    }, ' ');
    // Completion
    vscode.languages.registerCompletionItemProvider('istari', {
        provideCompletionItems(document, position, token, context) {
            // only consider the current line up to the current position
            let line = document.lineAt(position.line).text.substring(0, position.character);
            // do not privde completions if this line has / or // only
            if (line.trim() === "//" || line.trim() === "/") {
                return undefined;
            }
            // if line contains an non-zero even number of / we may just finished something.
            if (line.split("/").length > 2 && line.split("/").length % 2 !== 0) {
                return undefined;
            }
            let istari = getIstariByUri(document.uri.toString());
            if (!istari) return undefined;
            let allWords = [...new Set(document.getText().match(/[A-Za-z0-9._]+/g))];
            return new Promise((resolve, reject) => {
                istari!.interjectWithCallback("Report.showAll ();",
                    (data: string) => {
                        let istariWords = data.split("\n").filter((line) => !line.includes(" "));
                        let completions = istariWords.map((line: string) => {
                            return new vscode.CompletionItem(line, vscode.CompletionItemKind.Variable);
                        });
                        let wordCompletions = allWords?.filter((word: string) => !istariWords.includes(word)).map((word: string) => {
                            return new vscode.CompletionItem(word, vscode.CompletionItemKind.Constant);
                        }) ?? [];
                        resolve(completions.concat(wordCompletions));
                        return true;
                    }
                );
            });
        },
        resolveCompletionItem(item, token) {
            let istari = getCurrentIstari();
            let itemName = item.label;
            return new Promise((resolve, reject) => {
                istari?.getTypeAndDefinitionForConstant(itemName + "",
                    (typeAndDefinition: string) => {
                        item.documentation = new vscode.MarkdownString().appendCodeblock(typeAndDefinition, "istari");
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
            let istari = getIstariByUri(document.uri.toString());
            if (!istari) return undefined;

            // get the word at the position
            let word = document.getText(document.getWordRangeAtPosition(position, /[\w.]+/));
            if (!word) {
                return undefined;
            }
            return new Promise((resolve, reject) => {
                istari!.getTypeAndDefinitionForConstant(word,
                    (typeAndDefinition: string) => {
                        resolve({
                            contents: [new vscode.MarkdownString().appendCodeblock(
                                typeAndDefinition, "istari")]
                        });
                        return true;
                    }
                );
            });
        }
    });
    // Document Outline
    vscode.languages.registerDocumentSymbolProvider('istari', {
        async provideDocumentSymbols(document, token) {
            // find all lines that begins with define / or lemma ", 
            // and gete first word after / or " as the symbol name
            let istari = getIstariByUri(document.uri.toString());
            if (!istari) return undefined;
            let shouldShowTypeDetails = vscode.workspace.getConfiguration().get<boolean>('istari.showTypesInDocumentOutline')!;
            let docSymbols: DocSymbol[] = getDocumentSymbols(document);
            let moduleSymbols = getModuleSymbols(document);
            let retSymbols: vscode.DocumentSymbol[] = moduleSymbols;


            for (let symbol of docSymbols) {
                let { word, kind, line, column } = symbol;
                let symbolKind: vscode.SymbolKind = vscode.SymbolKind.Variable;
                if (kind === "define") {
                    symbolKind = vscode.SymbolKind.Function;
                } else if (kind === "lemma") {
                    symbolKind = vscode.SymbolKind.Property;
                } else if (kind === "typedef") {
                    symbolKind = vscode.SymbolKind.Enum;
                } else if (kind === "defineInd") {
                    symbolKind = vscode.SymbolKind.Function;
                }

                let symbolDesc: string = shouldShowTypeDetails ? await new Promise(
                    (resolve, reject) => {
                        istari!.getTypeForConstant(word, (type: string) => {
                            type = type.replace(/\s+/g, " ");
                            type = type.trim();
                            if (type.startsWith(word)) {
                                type = type.substring(word.length);
                            }
                            type = type.trim();
                            resolve(type);
                        });
                    }
                ) : "";



                let retSymbol = new vscode.DocumentSymbol(
                    //split by / or space 
                    word,
                    symbolDesc,
                    symbolKind,
                    new vscode.Range(new vscode.Position(line, column), new vscode.Position(line, document.lineAt(line).text.length)),
                    new vscode.Range(new vscode.Position(line, column), new vscode.Position(line, document.lineAt(line).text.length))
                );

                // check if retSymbol is in ModuleSymbols

                let candidates = moduleSymbols.filter((moduleSymbol) => {
                    if (moduleSymbol.range.start.line < line && moduleSymbol.range.end.line > line) {
                        return true;
                    }
                });

                if (candidates.length > 0) {
                    candidates[0].children.push(retSymbol);
                } else {
                    retSymbols.push(retSymbol);
                }
            }

            return retSymbols;
        }
    });
    // goto definition
    vscode.languages.registerDefinitionProvider('istari', {
        provideDefinition(document, position, token) {
            let istari = getIstariByUri(document.uri.toString());
            if (!istari) return undefined;
            // get the word at the position
            let word = document.getText(document.getWordRangeAtPosition(position));
            if (!word) {
                return undefined;
            }
            let allSymbols = getDocumentSymbols(document);
            let symbol = allSymbols.find((symbol) => symbol.word === word);
            if (symbol) {
                return new vscode.Location(document.uri, new vscode.Position(symbol.line, symbol.column));
            } else {
                return undefined;
            }
        }
    });
}

