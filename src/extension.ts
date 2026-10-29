import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
    //Create a diagnosticsCollection for arduint
    diagnosticCollection = vscode.languages.createDiagnosticCollection('arduino-interpreter');
    context.subscriptions.push(diagnosticCollection);

    //Trigger lexer check on save
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            if(document.languageId === 'arduint'){
                runLexerAndRepotErrors(document, context);
            }
        })
    );

    const completionProvider =
        vscode.languages.registerCompletionItemProvider(
            'arduint',
            {
                provideCompletionItems() {
                    const suggestions: vscode.CompletionItem[] = [];

                    const keywords = [
                        'function',
                        'if',
                        'else',
                        'while',
                        'for',
                        'return',
						'loop'
                    ];

                    for (const keyword of keywords) {
                        const item = new vscode.CompletionItem(
                            keyword,
                            vscode.CompletionItemKind.Keyword
                        );

                        item.detail = 'Arduint keyword';
                        suggestions.push(item);
                    }

                    const functions = [
                        {
                            name: 'setPin',
                            args: 'pin, value',
                            detail: 'Set a digital output pin'
                        },
                        {
                            name: 'readPin',
                            args: 'pin',
                            detail: 'Read a digital input pin'
                        },
                        {
                            name: 'delay',
                            args: 'milliseconds',
                            detail: 'Pause execution'
                        },
                        {
                            name: 'micros',
                            args: '',
                            detail: 'Get elapsed microseconds'
                        }
                    ];

                    for (const fn of functions) {
                        const item = new vscode.CompletionItem(
                            fn.name,
                            vscode.CompletionItemKind.Function
                        );

                        item.detail = fn.detail;
                        item.insertText = new vscode.SnippetString(
                            `${fn.name}(${fn.args}$0)`
                        );

                        suggestions.push(item);
                    }

                    return suggestions;
                }
            }
        );

    context.subscriptions.push(completionProvider);
}

function runLexerAndRepotErrors(document: vscode.TextDocument, context: vscode.ExtensionContext){
    const lexerPath = context.asAbsolutePath(path.join('bin', 'lexer.exe'));
    const filePath = document.uri.fsPath;

    cp.execFile(lexerPath, [filePath], (error, stdout, stderr)=>{
        const diagnostics: vscode.Diagnostic[] = [];

        if(stderr){
            const errorRegEx = /\((\d+):(\d+)-(\d+):(\d+)\)\s*\[(Error|Warning)\]:\s*([\s\S]*?)(?=\(\d+:\d+-\d+:\d+\)|$)/g;
            let match;

            while ((match = errorRegEx.exec(stderr)) !== null) {
                // Convert 1-indexed lexer positions to 0-indexed VS Code positions
                const lineStart = Math.max(0, parseInt(match[1], 10) - 1);
                const colStart  = Math.max(0, parseInt(match[2], 10));
                const lineEnd   = Math.max(0, parseInt(match[3], 10) - 1);
                const colEnd    = Math.max(0, parseInt(match[4], 10));
                
                const severity  = match[5] === "Warning"
                    ? vscode.DiagnosticSeverity.Warning 
                    : vscode.DiagnosticSeverity.Error;
                    
                const message   = match[6].trim();

                const range = new vscode.Range(lineStart, colStart, lineEnd, colEnd);
                const diagnostic = new vscode.Diagnostic(range, message, severity);
                diagnostics.push(diagnostic);
            }
        }
        //Apply to file
        diagnosticCollection.set(document.uri, diagnostics);
    });
}

export function deactivate() {}