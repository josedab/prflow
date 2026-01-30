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
exports.ResultItem = exports.ResultsProvider = void 0;
const vscode = __importStar(require("vscode"));
class ResultsProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    results = null;
    setResults(results) {
        this.results = results;
        this._onDidChangeTreeData.fire();
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!this.results) {
            return Promise.resolve([]);
        }
        if (!element) {
            // Root level - show categories
            return Promise.resolve(this.getRootItems());
        }
        // Show issues in category
        if (element.contextValue === 'category') {
            return Promise.resolve(this.getIssuesForCategory(element.label));
        }
        return Promise.resolve([]);
    }
    getRootItems() {
        if (!this.results)
            return [];
        const items = [];
        // Summary item
        const summary = new ResultItem(`Summary: ${this.results.summary.totalIssues} issues in ${this.results.summary.totalFiles} files`, vscode.TreeItemCollapsibleState.None, 'summary');
        summary.iconPath = new vscode.ThemeIcon('info');
        items.push(summary);
        // Group issues by category
        const categories = new Map();
        for (const issue of this.results.issues) {
            const cat = issue.category || 'general';
            if (!categories.has(cat)) {
                categories.set(cat, []);
            }
            categories.get(cat).push(issue);
        }
        // Add category items
        for (const [category, issues] of categories) {
            const criticalCount = issues.filter(i => i.severity === 'critical' || i.severity === 'error').length;
            const label = `${this.formatCategoryName(category)} (${issues.length})`;
            const item = new ResultItem(label, vscode.TreeItemCollapsibleState.Expanded, 'category');
            item.iconPath = criticalCount > 0
                ? new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'))
                : new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'));
            items.push(item);
        }
        // Recommendations
        if (this.results.recommendations.length > 0) {
            const recItem = new ResultItem(`Recommendations (${this.results.recommendations.length})`, vscode.TreeItemCollapsibleState.Collapsed, 'recommendations');
            recItem.iconPath = new vscode.ThemeIcon('lightbulb');
            items.push(recItem);
        }
        return items;
    }
    getIssuesForCategory(categoryLabel) {
        if (!this.results)
            return [];
        // Extract category name from label (remove count)
        const categoryName = categoryLabel.replace(/\s*\(\d+\)$/, '').toLowerCase().replace(/\s+/g, '_');
        const issues = this.results.issues.filter(i => (i.category || 'general').toLowerCase().replace(/\s+/g, '_') === categoryName ||
            this.formatCategoryName(i.category || 'general') === categoryLabel.replace(/\s*\(\d+\)$/, ''));
        return issues.map(issue => {
            const item = new ResultItem(`${issue.file}:${issue.line} - ${issue.message}`, vscode.TreeItemCollapsibleState.None, 'issue');
            item.iconPath = this.getIconForSeverity(issue.severity);
            item.tooltip = this.buildTooltip(issue);
            item.description = issue.severity;
            // Command to navigate to the issue
            item.command = {
                command: 'vscode.open',
                title: 'Go to Issue',
                arguments: [
                    vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, issue.file),
                    {
                        selection: new vscode.Range(Math.max(0, issue.line - 1), issue.column || 0, Math.max(0, (issue.endLine || issue.line) - 1), issue.endColumn || 0),
                    },
                ],
            };
            // Store issue data for fix command
            item.issue = issue;
            return item;
        });
    }
    getIconForSeverity(severity) {
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
    buildTooltip(issue) {
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
    formatCategoryName(category) {
        return category
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}
exports.ResultsProvider = ResultsProvider;
class ResultItem extends vscode.TreeItem {
    label;
    collapsibleState;
    contextValue;
    issue;
    constructor(label, collapsibleState, contextValue) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.contextValue = contextValue;
        this.contextValue = contextValue;
    }
}
exports.ResultItem = ResultItem;
//# sourceMappingURL=results-provider.js.map