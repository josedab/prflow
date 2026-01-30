import * as vscode from 'vscode';
import { PreflightResult, PreflightIssue } from './preflight-service';

export class ResultsProvider implements vscode.TreeDataProvider<ResultItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ResultItem | undefined | null | void> = new vscode.EventEmitter<ResultItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ResultItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private results: PreflightResult | null = null;

  setResults(results: PreflightResult): void {
    this.results = results;
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ResultItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ResultItem): Thenable<ResultItem[]> {
    if (!this.results) {
      return Promise.resolve([]);
    }

    if (!element) {
      // Root level - show categories
      return Promise.resolve(this.getRootItems());
    }

    // Show issues in category
    if (element.contextValue === 'category') {
      return Promise.resolve(this.getIssuesForCategory(element.label as string));
    }

    return Promise.resolve([]);
  }

  private getRootItems(): ResultItem[] {
    if (!this.results) return [];

    const items: ResultItem[] = [];

    // Summary item
    const summary = new ResultItem(
      `Summary: ${this.results.summary.totalIssues} issues in ${this.results.summary.totalFiles} files`,
      vscode.TreeItemCollapsibleState.None,
      'summary'
    );
    summary.iconPath = new vscode.ThemeIcon('info');
    items.push(summary);

    // Group issues by category
    const categories = new Map<string, PreflightIssue[]>();
    for (const issue of this.results.issues) {
      const cat = issue.category || 'general';
      if (!categories.has(cat)) {
        categories.set(cat, []);
      }
      categories.get(cat)!.push(issue);
    }

    // Add category items
    for (const [category, issues] of categories) {
      const criticalCount = issues.filter(i => i.severity === 'critical' || i.severity === 'error').length;
      const label = `${this.formatCategoryName(category)} (${issues.length})`;
      
      const item = new ResultItem(
        label,
        vscode.TreeItemCollapsibleState.Expanded,
        'category'
      );
      
      item.iconPath = criticalCount > 0 
        ? new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'))
        : new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'));
      
      items.push(item);
    }

    // Recommendations
    if (this.results.recommendations.length > 0) {
      const recItem = new ResultItem(
        `Recommendations (${this.results.recommendations.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'recommendations'
      );
      recItem.iconPath = new vscode.ThemeIcon('lightbulb');
      items.push(recItem);
    }

    return items;
  }

  private getIssuesForCategory(categoryLabel: string): ResultItem[] {
    if (!this.results) return [];

    // Extract category name from label (remove count)
    const categoryName = categoryLabel.replace(/\s*\(\d+\)$/, '').toLowerCase().replace(/\s+/g, '_');
    
    const issues = this.results.issues.filter(i => 
      (i.category || 'general').toLowerCase().replace(/\s+/g, '_') === categoryName ||
      this.formatCategoryName(i.category || 'general') === categoryLabel.replace(/\s*\(\d+\)$/, '')
    );

    return issues.map(issue => {
      const item = new ResultItem(
        `${issue.file}:${issue.line} - ${issue.message}`,
        vscode.TreeItemCollapsibleState.None,
        'issue'
      );

      item.iconPath = this.getIconForSeverity(issue.severity);
      item.tooltip = this.buildTooltip(issue);
      item.description = issue.severity;
      
      // Command to navigate to the issue
      item.command = {
        command: 'vscode.open',
        title: 'Go to Issue',
        arguments: [
          vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, issue.file),
          {
            selection: new vscode.Range(
              Math.max(0, issue.line - 1),
              issue.column || 0,
              Math.max(0, (issue.endLine || issue.line) - 1),
              issue.endColumn || 0
            ),
          },
        ],
      };

      // Store issue data for fix command
      item.issue = issue;

      return item;
    });
  }

  private getIconForSeverity(severity: string): vscode.ThemeIcon {
    switch (severity) {
      case 'critical':
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      case 'error':
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      case 'warning':
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'));
      default:
        return new vscode.ThemeIcon('info');
    }
  }

  private buildTooltip(issue: PreflightIssue): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${issue.type}** (${issue.severity})\n\n`);
    md.appendMarkdown(`${issue.message}\n\n`);
    md.appendMarkdown(`📁 ${issue.file}:${issue.line}`);
    
    if (issue.suggestion) {
      md.appendMarkdown(`\n\n💡 **Suggestion:** ${issue.suggestion}`);
    }
    
    if (issue.fix) {
      md.appendMarkdown(`\n\n🔧 Fix available - click to apply`);
    }
    
    return md;
  }

  private formatCategoryName(category: string): string {
    return category
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

export class ResultItem extends vscode.TreeItem {
  issue?: PreflightIssue;

  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
  }
}
