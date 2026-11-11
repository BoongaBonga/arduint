import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
    //Create a diagnosticsCollection for arduint
    diagnosticCollection = vscode.languages.createDiagnosticCollection('Arduint');
    context.subscriptions.push(diagnosticCollection);

    //Trigger lexer check on save
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            if (document.languageId === 'arduint' && document.uri.scheme === 'file') {
                runLexerAndReportErrors(document, context);
            }
        })
    );

    // Make a 'print lexer output' command
    const outputChannel = vscode.window.createOutputChannel('Arduint');
    context.subscriptions.push(outputChannel);

    let disposable = vscode.commands.registerCommand('arduint.runLexer', async () => {
        const editor = vscode.window.activeTextEditor;
        if(!editor){
            vscode.window.showErrorMessage('No active file open to run through the lexer.');
            return;
        }

        const document = editor.document;
        if (document.languageId !== 'arduint' || document.uri.scheme !== 'file') {
            vscode.window.showErrorMessage('Open a saved Arduint (.ardi) file to run through the lexer.');
            return;
        }

        if (!(await document.save())) {
            return;
        }

        const lexerPath = context.asAbsolutePath(path.join('bin', 'arduint.exe'));
        const filePath = document.uri.fsPath;

        outputChannel.clear();
        outputChannel.show(true);
        outputChannel.appendLine(`Running lexer on: ${path.basename(filePath)}...\n`);

        const child = cp.spawn(lexerPath, [filePath, "-ds", "-dp"]);

        child.stdout.on('data', (data)=>{
            outputChannel.append(data.toString());
        });

        child.stderr.on('data', (data) => {
            outputChannel.append(`[ERROR] ${data.toString()}`);
        });

        child.on('error', (error) => {
            outputChannel.appendLine(`Failed to start lexer: ${error.message}`);
        });

        child.on('close', (code) => {
            outputChannel.appendLine(`\nLexer process exited with code ${code}`);
        });
    });

    context.subscriptions.push(disposable);

    // Provide completions
    const completionProvider =
        vscode.languages.registerCompletionItemProvider(
            'arduint',
            {
                provideCompletionItems() {
                    const suggestions: vscode.CompletionItem[] = [];

                    const keywords = [
                        'function', 'if', 'else', 'while',
                        'for', 'return', 'loop', 'xor',
                        'false', 'true', 'micros', 'µs', 
                        'ms', 's', 'm', 'h', 'as', 'to',
                        'and', 'not', 'or', 'equals', 'then',
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
                            args: ' ${1:pin} to ${2:value}',
                            detail: 'Set any output pin'
                        },
                        {
                            name: 'readPin',
                            args: ' ${1:pin}',
                            detail: 'Read any input pin'
                        },
                        {
                            name: 'delay',
                            args: ' ${1:ms}',
                            detail: 'Pause execution'
                        },
                        {
                            name: 'delayMicros',
                            args: ' ${1:µs}',
                            detail: 'Pause execution'
                        },
                        {
                            name: 'getTime',
                            args: '()',
                            detail: 'Get elapsed time in ms'
                        },
                        {
                            name: 'print',
                            args: ' ',
                            detail: 'Print to console'
                        },
                        {
                            name: 'define',
                            args: ' ${1:name} as ${2:value}',
                            detail: 'Assign a name to a value'
                        }
                    ];

                    for (const fn of functions) {
                        const item = new vscode.CompletionItem(
                            fn.name,
                            vscode.CompletionItemKind.Function
                        );

                        item.detail = fn.detail;
                        item.insertText = new vscode.SnippetString(
                            `${fn.name}${fn.args}$0`
                        );

                        suggestions.push(item);
                    }

                    return suggestions;
                }
            }
        );

    context.subscriptions.push(completionProvider);
}

function runLexerAndReportErrors(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    const lexerPath = context.asAbsolutePath(path.join('bin', 'arduint.exe'));
    const filePath = document.uri.fsPath;

    cp.execFile(lexerPath, [filePath, "-ds", "-dp"], (error, stdout, stderr) => {
        const diagnostics: vscode.Diagnostic[] = [];

        if(stderr){
            const errorRegEx = /\((\d+)-(-?\d+):(\d+)-(-?\d+)\)\s*\[(Error|Warning)\]:\s*([\s\S]*?)(?=\r?\n\(\d+-(?:-?\d+):\d+-(?:-?\d+)\)\s*\[(?:Error|Warning)\]:|$)/g;
            let match;

            while ((match = errorRegEx.exec(stderr)) !== null) {
                let lineStart = Math.max(0, parseInt(match[1], 10) - 1);
                let colStart  = Math.max(0, parseInt(match[2], 10));
                let lineEnd   = Math.max(0, parseInt(match[3], 10) - 1);
                let colEnd    = Math.max(0, parseInt(match[4], 10) + 1);

                if(parseInt(match[4], 10) < 0){
                    lineStart = lineEnd = Math.max(0, Math.min(lineEnd - 1, document.lineCount - 1));
                    colStart = Math.max(0, document.lineAt(lineStart).text.length - 1);
                    colEnd = document.lineAt(lineStart).text.length;
                }
                
                const severity  = match[5] === "Warning"
                    ? vscode.DiagnosticSeverity.Warning 
                    : vscode.DiagnosticSeverity.Error;
                    
                const message   = match[6].trim();

                const range = document.validateRange(
                    new vscode.Range(lineStart, colStart, lineEnd, colEnd)
                );
                const diagnostic = new vscode.Diagnostic(range, message, severity);
                diagnostics.push(diagnostic);
            }
        }

        if (error && diagnostics.length === 0) {
            diagnosticCollection.delete(document.uri);
            vscode.window.showErrorMessage(
                `Failed to run Arduint lexer: ${stderr || error.message}`
            );
            return;
        }

        //Apply to file
        diagnosticCollection.set(document.uri, diagnostics);
    });
}

export function deactivate() {}