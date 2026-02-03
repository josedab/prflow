# PRFlow Pre-Flight Check for VS Code

Pre-commit code analysis powered by PRFlow - catch issues before creating a PR.

## Features

- **Pre-Flight Analysis**: Run AI-powered code review on your changes before committing
- **Real-time Issue Detection**: Find security vulnerabilities, bugs, and code quality issues
- **Inline Hints**: See issues directly in your code with inline decorations
- **Tree View Results**: Browse all detected issues organized by category and severity
- **One-Click Navigation**: Jump directly to problematic code locations
- **Auto-Fix Support**: Apply suggested fixes with a single click
- **File & Workspace Scope**: Analyze individual files or your entire workspace

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "PRFlow Pre-Flight"
4. Click Install

### From VSIX

```bash
# Build the extension
cd extensions/vscode-prflow
npm install
npm run compile
vsce package

# Install the generated .vsix file
code --install-extension prflow-preflight-0.1.0.vsix
```

## Usage

### Running Pre-Flight Check

**Command Palette:**
- `Ctrl+Shift+P` / `Cmd+Shift+P` → "PRFlow: Run Pre-Flight Check"

**Keyboard Shortcut:**
- `Ctrl+Shift+P` (Windows/Linux)
- `Cmd+Shift+P` (macOS)

**Context Menu:**
- Right-click a file in the editor or explorer
- Select "PRFlow: Check Current File"

### Viewing Results

Results appear in the PRFlow panel in the Activity Bar:

```
PRFlow Results
├── Summary: 5 issues in 3 files
├── Security (2)
│   ├── src/auth.ts:42 - Potential SQL injection
│   └── src/api.ts:15 - Hardcoded API key
├── Bug (1)
│   └── src/utils.ts:88 - Empty catch block
├── Performance (1)
│   └── src/data.ts:23 - N+1 query pattern
└── Recommendations (2)
```

Click any issue to navigate directly to the code location.

## Commands

| Command | Description |
|---------|-------------|
| `PRFlow: Run Pre-Flight Check` | Analyze all changed files in the workspace |
| `PRFlow: Check Current File` | Analyze only the currently open file |
| `PRFlow: Show Results` | Open the results panel |
| `PRFlow: Configure` | Open extension settings |

## Configuration

Configure PRFlow in VS Code settings (`settings.json`):

```json
{
  "prflow.apiUrl": "http://localhost:3001",
  "prflow.autoCheck": false,
  "prflow.showInlineHints": true,
  "prflow.minSeverity": "info"
}
```

### Settings Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `prflow.apiUrl` | string | `http://localhost:3001` | PRFlow API server URL |
| `prflow.autoCheck` | boolean | `false` | Automatically run pre-flight check on file save |
| `prflow.showInlineHints` | boolean | `true` | Show inline decorations for detected issues |
| `prflow.minSeverity` | enum | `info` | Minimum severity to display (`info`, `warning`, `error`, `critical`) |

## Severity Levels

Issues are categorized by severity:

| Icon | Severity | Description |
|------|----------|-------------|
| 🔴 | Critical | Security vulnerabilities, data loss risks |
| 🟠 | High | Bugs, error handling issues |
| 🟡 | Medium | Performance issues, code smells |
| 🔵 | Low | Style issues, minor improvements |
| ✨ | Info | Suggestions, best practices |

## Issue Categories

PRFlow detects issues across multiple categories:

- **Security**: SQL injection, XSS, hardcoded secrets, authentication issues
- **Bug**: Null pointer errors, race conditions, logic errors
- **Performance**: N+1 queries, memory leaks, inefficient algorithms
- **Error Handling**: Empty catch blocks, missing error handling
- **Testing**: Untested code paths, missing assertions
- **Documentation**: Missing docs, outdated comments
- **Style**: Code formatting, naming conventions
- **Maintainability**: Complex code, duplication, tight coupling

## Results Panel

The results panel provides a tree view of all detected issues:

### Summary Item
Shows the total number of issues and affected files.

### Category Groups
Issues are grouped by category with expansion controls:
- Click to expand/collapse
- Icon color indicates highest severity in group
- Badge shows issue count

### Issue Items
Each issue shows:
- File path and line number
- Issue message
- Severity badge
- Click to navigate
- Hover for detailed tooltip with suggestions

### Recommendations
General suggestions for improving code quality that aren't tied to specific lines.

## Tooltips

Hover over any issue to see detailed information:

```markdown
**Empty Catch Block** (high)

Empty catch blocks swallow errors silently. At minimum, log the error.

📁 src/utils.ts:88

💡 **Suggestion:** Add error logging or rethrow

🔧 Fix available - click to apply
```

## Keyboard Shortcuts

| Shortcut | Command |
|----------|---------|
| `Ctrl+Shift+P` / `Cmd+Shift+P` | Run Pre-Flight Check |

Customize shortcuts in VS Code's Keyboard Shortcuts settings.

## Requirements

- VS Code 1.85.0 or later
- PRFlow API server running (default: `http://localhost:3001`)
- Node.js 18+ (for development)

## Development

### Setup

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch
```

### Running in Development

1. Open this folder in VS Code
2. Press `F5` to launch Extension Development Host
3. The extension will be active in the new window

### Testing

```bash
npm run pretest
npm test
```

### Linting

```bash
npm run lint
```

### Building for Production

```bash
npm run vscode:prepublish
vsce package
```

## Architecture

```
extensions/vscode-prflow/
├── src/
│   ├── extension.ts        # Extension entry point & activation
│   ├── preflight-service.ts # API client for PRFlow analysis
│   ├── results-provider.ts  # Tree view data provider
│   ├── decorations.ts       # Inline hint decorations
│   └── commands.ts          # Command handlers
├── out/                     # Compiled JavaScript
├── package.json            # Extension manifest
└── tsconfig.json           # TypeScript configuration
```

## Troubleshooting

### Extension not activating
- Ensure VS Code version is 1.85.0 or later
- Check the Output panel (`View → Output → PRFlow`)

### API connection failed
- Verify PRFlow API is running at the configured URL
- Check network connectivity
- Ensure `prflow.apiUrl` setting is correct

### No issues detected
- Confirm files have unsaved changes or are different from the base branch
- Check `prflow.minSeverity` setting isn't filtering issues

### Inline hints not showing
- Verify `prflow.showInlineHints` is enabled
- Reload window after changing settings

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see the repository root for details.

## Related

- [PRFlow Documentation](../../README.md)
- [PRFlow API Reference](../../docs/API.md)
- [GitHub Action](../../apps/action/README.md)
