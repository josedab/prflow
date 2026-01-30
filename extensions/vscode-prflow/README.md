# PRFlow Pre-Flight Check - VS Code Extension

Pre-commit code analysis powered by PRFlow. Catch issues before creating a PR.

## Features

- **Pre-Flight Analysis**: Run comprehensive code analysis on your staged changes before pushing
- **Inline Diagnostics**: See issues highlighted directly in your code
- **Quick Fixes**: One-click fixes for common issues
- **Results Panel**: Tree view showing all detected issues organized by category
- **Git Integration**: Automatically analyzes staged/changed files

## Requirements

- PRFlow API server running (default: `http://localhost:3001`)
- Git repository

## Installation

1. Install the extension from the VS Code marketplace (or install from VSIX)
2. Configure the PRFlow API URL in settings if not using default
3. Start using with `Cmd/Ctrl+Shift+P` → "PRFlow: Run Pre-Flight Check"

## Usage

### Run Pre-Flight Check

1. Stage your changes with git
2. Run command: `PRFlow: Run Pre-Flight Check`
3. View results in the PRFlow panel

### Check Current File

Right-click any file and select "PRFlow: Check Current File" to analyze a single file.

### Auto-Check on Save

Enable automatic checking on file save:

```json
{
  "prflow.autoCheck": true
}
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `prflow.apiUrl` | `http://localhost:3001` | PRFlow API server URL |
| `prflow.autoCheck` | `false` | Run analysis on file save |
| `prflow.showInlineHints` | `true` | Show inline diagnostic hints |
| `prflow.minSeverity` | `info` | Minimum severity to display |

## Commands

| Command | Description |
|---------|-------------|
| `PRFlow: Run Pre-Flight Check` | Analyze all changed files |
| `PRFlow: Check Current File` | Analyze the active file |
| `PRFlow: Show Results` | Open the results panel |
| `PRFlow: Configure` | Open settings |

## Issue Categories

- **Security**: Potential security vulnerabilities
- **Bugs**: Likely bugs or logic errors
- **Performance**: Performance issues and optimizations
- **Style**: Code style and best practices
- **Error Handling**: Missing or improper error handling
- **Type Safety**: Type-related issues

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Package
vsce package
```

## License

MIT
