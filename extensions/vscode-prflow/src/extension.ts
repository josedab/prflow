import * as vscode from 'vscode';
import { PreflightService, PreflightResult, PreflightIssue } from './preflight-service';
import { ResultsProvider } from './results-provider';

let preflightService: PreflightService;
let resultsProvider: ResultsProvider;
let diagnosticCollection: vscode.DiagnosticCollection;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('PRFlow');
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine('PRFlow Pre-Flight extension activated');

  // Initialize services
  const config = vscode.workspace.getConfiguration('prflow');
  preflightService = new PreflightService(config.get('apiUrl') || 'http://localhost:3001');
  
  // Create diagnostic collection for inline hints
  diagnosticCollection = vscode.languages.createDiagnosticCollection('prflow');
  context.subscriptions.push(diagnosticCollection);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'prflow.showResults';
  statusBarItem.text = '$(shield) PRFlow';
  statusBarItem.tooltip = 'PRFlow Pre-Flight Check';
  context.subscriptions.push(statusBarItem);
  statusBarItem.show();

  // Create results tree view
  resultsProvider = new ResultsProvider();
  const resultsView = vscode.window.createTreeView('prflowResults', {
    treeDataProvider: resultsProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(resultsView);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('prflow.runPreflight', () => runPreflight()),
    vscode.commands.registerCommand('prflow.runPreflightOnFile', (uri?: vscode.Uri) => runPreflightOnFile(uri)),
    vscode.commands.registerCommand('prflow.showResults', () => showResults()),
    vscode.commands.registerCommand('prflow.configure', () => openConfiguration()),
    vscode.commands.registerCommand('prflow.applyFix', (issue: PreflightIssue) => applyFix(issue))
  );

  // Auto-check on save if enabled
  if (config.get('autoCheck')) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.uri.scheme === 'file') {
          runPreflightOnFile(doc.uri);
        }
      })
    );
  }

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('prflow.apiUrl')) {
        const newConfig = vscode.workspace.getConfiguration('prflow');
        preflightService = new PreflightService(newConfig.get('apiUrl') || 'http://localhost:3001');
      }
    })
  );
}

async function runPreflight(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  // Get staged files from git
  const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
  const git = gitExtension?.getAPI(1);
  const repo = git?.repositories[0];

  if (!repo) {
    vscode.window.showWarningMessage('Git repository not found. Checking current file instead.');
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await runPreflightOnFile(editor.document.uri);
    }
    return;
  }

  // Show progress
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'PRFlow Pre-Flight Check',
    cancellable: true,
  }, async (progress, token) => {
    progress.report({ message: 'Gathering changed files...' });

    try {
      // Get staged and unstaged changes
      const stagedChanges = repo.state.indexChanges || [];
      const workingTreeChanges = repo.state.workingTreeChanges || [];
      const allChanges = [...stagedChanges, ...workingTreeChanges];

      if (allChanges.length === 0) {
        vscode.window.showInformationMessage('No changes to analyze');
        return;
      }

      // Gather file contents
      const files: Array<{ path: string; content: string }> = [];
      for (const change of allChanges) {
        if (token.isCancellationRequested) return;
        
        try {
          const doc = await vscode.workspace.openTextDocument(change.uri);
          const relativePath = vscode.workspace.asRelativePath(change.uri);
          files.push({
            path: relativePath,
            content: doc.getText(),
          });
        } catch (err) {
          // File might be deleted
          outputChannel.appendLine(`Could not read ${change.uri.fsPath}`);
        }
      }

      if (files.length === 0) {
        vscode.window.showInformationMessage('No readable files to analyze');
        return;
      }

      progress.report({ message: `Analyzing ${files.length} files...` });

      // Call pre-flight API
      const result = await preflightService.analyze(
        workspaceFolder.name,
        files,
        token
      );

      // Update UI
      updateResults(result);
      
      // Show summary
      const issueCount = result.issues.length;
      const criticalCount = result.issues.filter(i => i.severity === 'critical' || i.severity === 'error').length;
      
      if (criticalCount > 0) {
        vscode.window.showWarningMessage(
          `PRFlow found ${criticalCount} critical issue(s) in ${issueCount} total`,
          'Show Results'
        ).then(action => {
          if (action === 'Show Results') {
            showResults();
          }
        });
      } else if (issueCount > 0) {
        vscode.window.showInformationMessage(
          `PRFlow found ${issueCount} issue(s)`,
          'Show Results'
        ).then(action => {
          if (action === 'Show Results') {
            showResults();
          }
        });
      } else {
        vscode.window.showInformationMessage('PRFlow: All checks passed! ✓');
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`PRFlow check failed: ${message}`);
    }
  });
}

async function runPreflightOnFile(uri?: vscode.Uri): Promise<void> {
  const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
  
  if (!targetUri) {
    vscode.window.showErrorMessage('No file selected');
    return;
  }

  const doc = await vscode.workspace.openTextDocument(targetUri);
  const relativePath = vscode.workspace.asRelativePath(targetUri);
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `PRFlow: Checking ${relativePath}`,
    cancellable: true,
  }, async (progress, token) => {
    try {
      const result = await preflightService.analyze(
        workspaceFolder.name,
        [{ path: relativePath, content: doc.getText() }],
        token
      );

      updateResults(result);
      
      if (result.issues.length === 0) {
        vscode.window.showInformationMessage(`PRFlow: ${relativePath} looks good! ✓`);
      } else {
        vscode.window.showWarningMessage(
          `PRFlow found ${result.issues.length} issue(s) in ${relativePath}`,
          'Show Results'
        ).then(action => {
          if (action === 'Show Results') {
            showResults();
          }
        });
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`PRFlow check failed: ${message}`);
    }
  });
}

function updateResults(result: PreflightResult): void {
  // Update tree view
  resultsProvider.setResults(result);

  // Update status bar
  const criticalCount = result.issues.filter(i => i.severity === 'critical' || i.severity === 'error').length;
  const warningCount = result.issues.filter(i => i.severity === 'warning').length;
  
  if (criticalCount > 0) {
    statusBarItem.text = `$(error) PRFlow: ${criticalCount} errors`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else if (warningCount > 0) {
    statusBarItem.text = `$(warning) PRFlow: ${warningCount} warnings`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else if (result.issues.length > 0) {
    statusBarItem.text = `$(info) PRFlow: ${result.issues.length} hints`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = '$(shield) PRFlow ✓';
    statusBarItem.backgroundColor = undefined;
  }

  // Update diagnostics
  diagnosticCollection.clear();
  const diagnosticsMap = new Map<string, vscode.Diagnostic[]>();

  for (const issue of result.issues) {
    const filePath = issue.file;
    const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, filePath);
    
    const severity = mapSeverity(issue.severity);
    const range = new vscode.Range(
      Math.max(0, issue.line - 1),
      issue.column || 0,
      Math.max(0, issue.endLine || issue.line) - 1,
      issue.endColumn || 1000
    );

    const diagnostic = new vscode.Diagnostic(
      range,
      `${issue.message}${issue.suggestion ? `\n\nSuggestion: ${issue.suggestion}` : ''}`,
      severity
    );
    diagnostic.source = 'PRFlow';
    diagnostic.code = issue.type;

    const existing = diagnosticsMap.get(uri.toString()) || [];
    existing.push(diagnostic);
    diagnosticsMap.set(uri.toString(), existing);
  }

  for (const [uriStr, diagnostics] of diagnosticsMap) {
    diagnosticCollection.set(vscode.Uri.parse(uriStr), diagnostics);
  }
}

function mapSeverity(severity: string): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'critical':
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'info':
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

function showResults(): void {
  vscode.commands.executeCommand('workbench.view.extension.prflow');
}

function openConfiguration(): void {
  vscode.commands.executeCommand('workbench.action.openSettings', 'prflow');
}

async function applyFix(issue: PreflightIssue): Promise<void> {
  if (!issue.fix) {
    vscode.window.showInformationMessage('No automatic fix available for this issue');
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, issue.file);
  const doc = await vscode.workspace.openTextDocument(fileUri);
  const editor = await vscode.window.showTextDocument(doc);

  const range = new vscode.Range(
    Math.max(0, issue.line - 1),
    issue.column || 0,
    Math.max(0, issue.endLine || issue.line) - 1,
    issue.endColumn || doc.lineAt(Math.max(0, (issue.endLine || issue.line) - 1)).text.length
  );

  await editor.edit((editBuilder) => {
    editBuilder.replace(range, issue.fix!);
  });

  vscode.window.showInformationMessage('Fix applied');
}

export function deactivate() {
  diagnosticCollection?.dispose();
  statusBarItem?.dispose();
}
