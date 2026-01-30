"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRFlowInlineCompletionProvider = exports.PRFlowCodeActionProvider = exports.RealtimeDiagnosticsProvider = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Real-time diagnostics provider that analyzes code as you type
 * and provides inline hints before committing
 */
class RealtimeDiagnosticsProvider {
    diagnosticCollection;
    preflightService;
    debounceTimers = new Map();
    cachedResults = new Map();
    disposables = [];
    debounceDelay = 1500; // ms
    constructor(preflightService) {
        this.preflightService = preflightService;
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('prflow-realtime');
        // Watch for document changes
        this.disposables.push(vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.scheme === 'file') {
                this.scheduleAnalysis(e.document);
            }
        }));
        // Watch for document opens
        this.disposables.push(vscode.workspace.onDidOpenTextDocument((doc) => {
            if (doc.uri.scheme === 'file' && this.isSupportedLanguage(doc.languageId)) {
                this.scheduleAnalysis(doc);
            }
        }));
        // Watch for active editor changes
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && this.isSupportedLanguage(editor.document.languageId)) {
                const cached = this.cachedResults.get(editor.document.uri.toString());
                if (!cached) {
                    this.scheduleAnalysis(editor.document);
                }
            }
        }));
        // Watch for document closes
        this.disposables.push(vscode.workspace.onDidCloseTextDocument((doc) => {
            this.diagnosticCollection.delete(doc.uri);
            this.cachedResults.delete(doc.uri.toString());
            const timer = this.debounceTimers.get(doc.uri.toString());
            if (timer) {
                clearTimeout(timer);
                this.debounceTimers.delete(doc.uri.toString());
            }
        }));
        // Analyze all open documents on startup
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.uri.scheme === 'file' && this.isSupportedLanguage(doc.languageId)) {
                this.scheduleAnalysis(doc);
            }
        }
    }
    /**
     * Check if a language is supported for real-time analysis
     */
    isSupportedLanguage(languageId) {
        const supported = [
            'typescript',
            'typescriptreact',
            'javascript',
            'javascriptreact',
            'python',
            'go',
            'rust',
            'java',
            'csharp',
            'php',
            'ruby',
        ];
        return supported.includes(languageId);
    }
    /**
     * Schedule analysis with debouncing
     */
    scheduleAnalysis(document) {
        const uri = document.uri.toString();
        // Clear existing timer
        const existingTimer = this.debounceTimers.get(uri);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        // Set new timer
        const timer = setTimeout(() => {
            this.analyzeDocument(document);
            this.debounceTimers.delete(uri);
        }, this.debounceDelay);
        this.debounceTimers.set(uri, timer);
    }
    /**
     * Analyze a document and update diagnostics
     */
    async analyzeDocument(document) {
        if (document.isClosed)
            return;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder)
            return;
        const relativePath = vscode.workspace.asRelativePath(document.uri);
        try {
            const result = await this.preflightService.analyze(workspaceFolder.name, [{ path: relativePath, content: document.getText() }]);
            // Cache results
            this.cachedResults.set(document.uri.toString(), result.issues);
            // Convert to diagnostics
            const diagnostics = this.issuesToDiagnostics(result.issues, document);
            this.diagnosticCollection.set(document.uri, diagnostics);
        }
        catch (error) {
            // Silently fail for real-time analysis
            console.log(`PRFlow realtime analysis failed for ${relativePath}:`, error);
        }
    }
    /**
     * Convert PRFlow issues to VS Code diagnostics
     */
    issuesToDiagnostics(issues, document) {
        return issues.map((issue) => {
            const startLine = Math.max(0, issue.line - 1);
            const endLine = Math.max(0, (issue.endLine || issue.line) - 1);
            // Try to find exact position if column info is available
            const startChar = issue.column || 0;
            const endChar = issue.endColumn || document.lineAt(Math.min(endLine, document.lineCount - 1)).text.length;
            const range = new vscode.Range(startLine, startChar, endLine, endChar);
            const severity = this.mapSeverity(issue.severity);
            const diagnostic = new vscode.Diagnostic(range, issue.message, severity);
            diagnostic.source = 'PRFlow';
            if (issue.learnMoreUrl) {
                diagnostic.code = {
                    value: issue.type,
                    target: vscode.Uri.parse(issue.learnMoreUrl),
                };
            }
            else {
                diagnostic.code = issue.type;
            }
            // Add related information if available
            if (issue.relatedLocations) {
                diagnostic.relatedInformation = issue.relatedLocations.map((loc) => {
                    const relatedUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, loc.file);
                    return new vscode.DiagnosticRelatedInformation(new vscode.Location(relatedUri, new vscode.Position(loc.line - 1, 0)), loc.message);
                });
            }
            // Add tags for specific issue types
            if (issue.type === 'deprecated' || issue.type === 'style') {
                diagnostic.tags = [vscode.DiagnosticTag.Deprecated];
            }
            if (issue.type === 'unused') {
                diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
            }
            return diagnostic;
        });
    }
    /**
     * Map PRFlow severity to VS Code severity
     */
    mapSeverity(severity) {
        switch (severity.toLowerCase()) {
            case 'critical':
            case 'error':
                return vscode.DiagnosticSeverity.Error;
            case 'high':
            case 'warning':
                return vscode.DiagnosticSeverity.Warning;
            case 'medium':
            case 'info':
                return vscode.DiagnosticSeverity.Information;
            case 'low':
            case 'hint':
            case 'nitpick':
                return vscode.DiagnosticSeverity.Hint;
            default:
                return vscode.DiagnosticSeverity.Information;
        }
    }
    /**
     * Force refresh all open documents
     */
    refreshAll() {
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.uri.scheme === 'file' && this.isSupportedLanguage(doc.languageId)) {
                this.analyzeDocument(doc);
            }
        }
    }
    /**
     * Clear all diagnostics
     */
    clear() {
        this.diagnosticCollection.clear();
        this.cachedResults.clear();
    }
    /**
     * Get issues for a specific document
     */
    getIssues(uri) {
        return this.cachedResults.get(uri.toString()) || [];
    }
    dispose() {
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        this.cachedResults.clear();
        this.diagnosticCollection.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
exports.RealtimeDiagnosticsProvider = RealtimeDiagnosticsProvider;
/**
 * Code action provider for PRFlow quick fixes
 */
class PRFlowCodeActionProvider {
    static providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.Source,
    ];
    cachedIssues;
    constructor(cachedIssues) {
        this.cachedIssues = cachedIssues;
    }
    provideCodeActions(document, range, _context) {
        const actions = [];
        const issues = this.cachedIssues.get(document.uri.toString()) || [];
        // Find issues that overlap with the current range
        const relevantIssues = issues.filter((issue) => {
            const issueLine = issue.line - 1;
            return issueLine >= range.start.line && issueLine <= range.end.line;
        });
        for (const issue of relevantIssues) {
            // Quick fix if available
            if (issue.fix) {
                const fixAction = new vscode.CodeAction(`PRFlow: ${issue.message.substring(0, 50)}...`, vscode.CodeActionKind.QuickFix);
                fixAction.edit = new vscode.WorkspaceEdit();
                const fixRange = new vscode.Range(Math.max(0, issue.line - 1), issue.column || 0, Math.max(0, (issue.endLine || issue.line) - 1), issue.endColumn || document.lineAt(Math.max(0, (issue.endLine || issue.line) - 1)).text.length);
                fixAction.edit.replace(document.uri, fixRange, issue.fix);
                fixAction.isPreferred = issue.severity === 'critical' || issue.severity === 'error';
                actions.push(fixAction);
            }
            // Ignore action
            const ignoreAction = new vscode.CodeAction(`Ignore this ${issue.type} warning`, vscode.CodeActionKind.QuickFix);
            ignoreAction.command = {
                command: 'prflow.ignoreIssue',
                title: 'Ignore Issue',
                arguments: [issue],
            };
            actions.push(ignoreAction);
        }
        // Source action: Fix all PRFlow issues
        if (issues.some((i) => i.fix)) {
            const fixAllAction = new vscode.CodeAction('Fix all PRFlow issues', vscode.CodeActionKind.Source);
            fixAllAction.command = {
                command: 'prflow.fixAll',
                title: 'Fix All',
                arguments: [document.uri],
            };
            actions.push(fixAllAction);
        }
        return actions;
    }
}
exports.PRFlowCodeActionProvider = PRFlowCodeActionProvider;
/**
 * Inline completion provider for PRFlow suggestions
 */
class PRFlowInlineCompletionProvider {
    cachedIssues;
    constructor(cachedIssues) {
        this.cachedIssues = cachedIssues;
    }
    provideInlineCompletionItems(document, position) {
        const issues = this.cachedIssues.get(document.uri.toString()) || [];
        // Find issues at current position that have fixes
        const currentLineIssues = issues.filter((issue) => {
            return issue.line - 1 === position.line && issue.fix;
        });
        if (currentLineIssues.length === 0)
            return undefined;
        const items = currentLineIssues
            .filter((issue) => issue.fix)
            .map((issue) => {
            const range = new vscode.Range(Math.max(0, issue.line - 1), issue.column || 0, Math.max(0, (issue.endLine || issue.line) - 1), issue.endColumn || document.lineAt(Math.max(0, (issue.endLine || issue.line) - 1)).text.length);
            return new vscode.InlineCompletionItem(issue.fix, range, {
                command: 'prflow.trackFix',
                title: 'Track Fix',
                arguments: [issue],
            });
        });
        return new vscode.InlineCompletionList(items);
    }
}
exports.PRFlowInlineCompletionProvider = PRFlowInlineCompletionProvider;
//# sourceMappingURL=realtime-diagnostics.js.map