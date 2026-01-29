import { logger } from '../lib/logger.js';

/**
 * Represents a node in the codebase knowledge graph
 */
export interface CodeNode {
  id: string;
  type: CodeNodeType;
  name: string;
  file: string;
  startLine: number;
  endLine: number;
  signature?: string;
  docComment?: string;
  modifiers?: string[];
  metadata?: Record<string, unknown>;
}

export type CodeNodeType = 
  | 'file'
  | 'class'
  | 'interface'
  | 'function'
  | 'method'
  | 'variable'
  | 'constant'
  | 'type_alias'
  | 'enum'
  | 'import'
  | 'export';

/**
 * Represents an edge (relationship) in the graph
 */
export interface CodeEdge {
  id: string;
  source: string; // Node ID
  target: string; // Node ID
  type: EdgeType;
  metadata?: Record<string, unknown>;
}

export type EdgeType =
  | 'imports'
  | 'exports'
  | 'calls'
  | 'extends'
  | 'implements'
  | 'uses'
  | 'defines'
  | 'references'
  | 'depends_on';

/**
 * Result of parsing a single file
 */
export interface ParseResult {
  file: string;
  language: string;
  nodes: CodeNode[];
  edges: CodeEdge[];
  parseTimeMs: number;
  errors?: string[];
}

/**
 * TypeScript/JavaScript AST Parser
 * Uses regex-based pattern matching for simplicity (production would use actual AST parser)
 */
export class TypeScriptParser {
  private nodeIdCounter = 0;

  /**
   * Parse a TypeScript/JavaScript file content
   */
  parse(filePath: string, content: string): ParseResult {
    const startTime = Date.now();
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];
    const errors: string[] = [];

    try {
      // Create file node
      const fileNode = this.createNode('file', filePath, filePath, 1, content.split('\n').length);
      nodes.push(fileNode);

      // Parse imports
      const imports = this.parseImports(content, filePath);
      nodes.push(...imports.nodes);
      edges.push(...imports.edges.map((e) => ({ ...e, source: fileNode.id })));

      // Parse exports
      const exports = this.parseExports(content, filePath);
      nodes.push(...exports.nodes);
      edges.push(...exports.edges.map((e) => ({ ...e, source: fileNode.id })));

      // Parse classes
      const classes = this.parseClasses(content, filePath);
      nodes.push(...classes.nodes);
      edges.push(...classes.edges);

      // Parse functions
      const functions = this.parseFunctions(content, filePath);
      nodes.push(...functions.nodes);
      edges.push(...functions.edges);

      // Parse interfaces and types
      const types = this.parseTypes(content, filePath);
      nodes.push(...types.nodes);
      edges.push(...types.edges);

      // Parse top-level variables/constants
      const variables = this.parseVariables(content, filePath);
      nodes.push(...variables.nodes);

      // Build call graph edges
      const callEdges = this.buildCallGraph(content, nodes, filePath);
      edges.push(...callEdges);

    } catch (error) {
      logger.error({ error, file: filePath }, 'Failed to parse file');
      errors.push(error instanceof Error ? error.message : 'Unknown parse error');
    }

    return {
      file: filePath,
      language: this.detectLanguage(filePath),
      nodes,
      edges,
      parseTimeMs: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private createNode(
    type: CodeNodeType,
    name: string,
    file: string,
    startLine: number,
    endLine: number,
    signature?: string,
    modifiers?: string[]
  ): CodeNode {
    return {
      id: `node-${++this.nodeIdCounter}`,
      type,
      name,
      file,
      startLine,
      endLine,
      signature,
      modifiers,
    };
  }

  private createEdge(source: string, target: string, type: EdgeType): CodeEdge {
    return {
      id: `edge-${source}-${target}-${type}`,
      source,
      target,
      type,
    };
  }

  private parseImports(content: string, filePath: string): { nodes: CodeNode[]; edges: CodeEdge[] } {
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];
    const lines = content.split('\n');

    // Match various import patterns
    const importPatterns = [
      /^import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"]([^'"]+)['"]/,
      /^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
      /^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
      /^import\s+['"]([^'"]+)['"]/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      for (const pattern of importPatterns) {
        const match = line.match(pattern);
        if (match) {
          const importPath = match[match.length - 1] || match[1];
          const node = this.createNode('import', importPath, filePath, i + 1, i + 1);
          node.metadata = { path: importPath };
          nodes.push(node);
          
          edges.push(this.createEdge(node.id, `external:${importPath}`, 'imports'));
          break;
        }
      }
    }

    return { nodes, edges };
  }

  private parseExports(content: string, filePath: string): { nodes: CodeNode[]; edges: CodeEdge[] } {
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];
    const lines = content.split('\n');

    const exportPatterns = [
      /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/,
      /^export\s+(?:default\s+)?class\s+(\w+)/,
      /^export\s+(?:default\s+)?(?:const|let|var)\s+(\w+)/,
      /^export\s+(?:type|interface)\s+(\w+)/,
      /^export\s+\{([^}]+)\}/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      for (const pattern of exportPatterns) {
        const match = line.match(pattern);
        if (match) {
          const exportName = match[1];
          
          // Handle named exports in braces
          if (exportName?.includes(',')) {
            const names = exportName.split(',').map((n) => n.trim());
            for (const name of names) {
              const node = this.createNode('export', name, filePath, i + 1, i + 1);
              nodes.push(node);
              edges.push(this.createEdge(node.id, `internal:${name}`, 'exports'));
            }
          } else if (exportName) {
            const node = this.createNode('export', exportName, filePath, i + 1, i + 1);
            nodes.push(node);
            edges.push(this.createEdge(node.id, `internal:${exportName}`, 'exports'));
          }
          break;
        }
      }
    }

    return { nodes, edges };
  }

  private parseClasses(content: string, filePath: string): { nodes: CodeNode[]; edges: CodeEdge[] } {
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];

    // Class pattern with optional extends/implements
    const classPattern = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/g;
    
    let match;
    while ((match = classPattern.exec(content)) !== null) {
      const className = match[1];
      const extendsClass = match[2];
      const implementsList = match[3];

      const lineNumber = this.getLineNumber(content, match.index);
      const endLine = this.findBlockEnd(content, match.index);

      const modifiers: string[] = [];
      if (match[0].includes('export')) modifiers.push('export');
      if (match[0].includes('abstract')) modifiers.push('abstract');

      const node = this.createNode('class', className, filePath, lineNumber, endLine, match[0], modifiers);
      nodes.push(node);

      if (extendsClass) {
        edges.push(this.createEdge(node.id, `class:${extendsClass}`, 'extends'));
      }

      if (implementsList) {
        const interfaces = implementsList.split(',').map((i) => i.trim());
        for (const iface of interfaces) {
          edges.push(this.createEdge(node.id, `interface:${iface}`, 'implements'));
        }
      }

      // Parse methods within the class
      const classContent = this.extractBlock(content, match.index);
      const methods = this.parseMethods(classContent, filePath, node.id, lineNumber);
      nodes.push(...methods.nodes);
      edges.push(...methods.edges);
    }

    return { nodes, edges };
  }

  private parseMethods(
    classContent: string,
    filePath: string,
    classNodeId: string,
    classStartLine: number
  ): { nodes: CodeNode[]; edges: CodeEdge[] } {
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];

    // Method pattern
    const methodPattern = /(?:(?:public|private|protected|static|async|readonly)\s+)*(\w+)\s*(?:<[^>]+>)?\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*{/g;

    let match;
    while ((match = methodPattern.exec(classContent)) !== null) {
      const methodName = match[1];
      
      // Skip constructor keyword false positives
      if (['if', 'for', 'while', 'switch', 'catch', 'function'].includes(methodName)) {
        continue;
      }

      const lineNumber = classStartLine + this.getLineNumber(classContent, match.index) - 1;
      const endLine = lineNumber + this.countLines(this.extractBlock(classContent, match.index)) - 1;

      const modifiers: string[] = [];
      if (match[0].includes('public')) modifiers.push('public');
      if (match[0].includes('private')) modifiers.push('private');
      if (match[0].includes('protected')) modifiers.push('protected');
      if (match[0].includes('static')) modifiers.push('static');
      if (match[0].includes('async')) modifiers.push('async');

      const node = this.createNode('method', methodName, filePath, lineNumber, endLine, match[0], modifiers);
      nodes.push(node);

      edges.push(this.createEdge(classNodeId, node.id, 'defines'));
    }

    return { nodes, edges };
  }

  private parseFunctions(content: string, filePath: string): { nodes: CodeNode[]; edges: CodeEdge[] } {
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];

    // Function patterns (excluding class methods)
    const patterns = [
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]+>)?\s*\([^)]*\)/g,
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/g,
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?function/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const funcName = match[1];
        const lineNumber = this.getLineNumber(content, match.index);
        const endLine = lineNumber + this.estimateFunctionLength(content, match.index);

        const modifiers: string[] = [];
        if (match[0].includes('export')) modifiers.push('export');
        if (match[0].includes('async')) modifiers.push('async');

        const node = this.createNode('function', funcName, filePath, lineNumber, endLine, match[0], modifiers);
        nodes.push(node);
      }
    }

    return { nodes, edges };
  }

  private parseTypes(content: string, filePath: string): { nodes: CodeNode[]; edges: CodeEdge[] } {
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];

    // Interface pattern
    const interfacePattern = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?/g;
    let match;
    while ((match = interfacePattern.exec(content)) !== null) {
      const interfaceName = match[1];
      const extendsList = match[2];
      const lineNumber = this.getLineNumber(content, match.index);
      const endLine = this.findBlockEnd(content, match.index);

      const node = this.createNode('interface', interfaceName, filePath, lineNumber, endLine, match[0]);
      nodes.push(node);

      if (extendsList) {
        const parents = extendsList.split(',').map((p) => p.trim());
        for (const parent of parents) {
          edges.push(this.createEdge(node.id, `interface:${parent}`, 'extends'));
        }
      }
    }

    // Type alias pattern
    const typePattern = /(?:export\s+)?type\s+(\w+)(?:<[^>]+>)?\s*=/g;
    while ((match = typePattern.exec(content)) !== null) {
      const typeName = match[1];
      const lineNumber = this.getLineNumber(content, match.index);

      const node = this.createNode('type_alias', typeName, filePath, lineNumber, lineNumber);
      nodes.push(node);
    }

    // Enum pattern
    const enumPattern = /(?:export\s+)?(?:const\s+)?enum\s+(\w+)/g;
    while ((match = enumPattern.exec(content)) !== null) {
      const enumName = match[1];
      const lineNumber = this.getLineNumber(content, match.index);
      const endLine = this.findBlockEnd(content, match.index);

      const node = this.createNode('enum', enumName, filePath, lineNumber, endLine);
      nodes.push(node);
    }

    return { nodes, edges };
  }

  private parseVariables(content: string, filePath: string): { nodes: CodeNode[] } {
    const nodes: CodeNode[] = [];

    // Top-level const/let/var (not inside functions/classes)
    const varPattern = /^(?:export\s+)?(?:const|let|var)\s+(\w+)(?:\s*:\s*[^=]+)?\s*=/gm;
    
    let match;
    while ((match = varPattern.exec(content)) !== null) {
      const varName = match[1];
      const lineNumber = this.getLineNumber(content, match.index);

      // Skip if inside a function or class
      const lineContent = content.substring(0, match.index);
      const openBraces = (lineContent.match(/{/g) || []).length;
      const closeBraces = (lineContent.match(/}/g) || []).length;
      
      if (openBraces - closeBraces <= 0) {
        const type: CodeNodeType = match[0].includes('const') ? 'constant' : 'variable';
        const node = this.createNode(type, varName, filePath, lineNumber, lineNumber);
        nodes.push(node);
      }
    }

    return { nodes };
  }

  private buildCallGraph(content: string, nodes: CodeNode[], _filePath: string): CodeEdge[] {
    const edges: CodeEdge[] = [];
    
    // Get all function/method nodes
    const callableNodes = nodes.filter((n) => 
      n.type === 'function' || n.type === 'method'
    );

    // For each callable, find what it calls
    for (const node of callableNodes) {
      const funcContent = this.extractBlockByLines(content, node.startLine, node.endLine);
      
      // Find function calls
      const callPattern = /(?<!\w)(\w+)\s*\(/g;
      let match;
      
      while ((match = callPattern.exec(funcContent)) !== null) {
        const calledName = match[1];
        
        // Skip keywords and common built-ins
        if (this.isKeywordOrBuiltin(calledName)) continue;

        // Find if we have a node for this
        const targetNode = callableNodes.find((n) => n.name === calledName);
        if (targetNode && targetNode.id !== node.id) {
          edges.push(this.createEdge(node.id, targetNode.id, 'calls'));
        }
      }
    }

    return edges;
  }

  private isKeywordOrBuiltin(name: string): boolean {
    const keywords = [
      'if', 'else', 'for', 'while', 'switch', 'case', 'return', 'throw',
      'try', 'catch', 'finally', 'new', 'typeof', 'instanceof', 'void',
      'delete', 'await', 'yield', 'super', 'this', 'console', 'Math',
      'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Promise',
      'Map', 'Set', 'require', 'import', 'export', 'function', 'class',
    ];
    return keywords.includes(name);
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  private countLines(content: string): number {
    return content.split('\n').length;
  }

  private findBlockEnd(content: string, startIndex: number): number {
    let braceCount = 0;
    let foundOpen = false;
    
    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === '{') {
        braceCount++;
        foundOpen = true;
      } else if (content[i] === '}') {
        braceCount--;
        if (foundOpen && braceCount === 0) {
          return this.getLineNumber(content, i);
        }
      }
    }
    
    return this.getLineNumber(content, content.length);
  }

  private extractBlock(content: string, startIndex: number): string {
    let braceCount = 0;
    let foundOpen = false;
    let blockStart = startIndex;
    
    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === '{') {
        if (!foundOpen) blockStart = i;
        braceCount++;
        foundOpen = true;
      } else if (content[i] === '}') {
        braceCount--;
        if (foundOpen && braceCount === 0) {
          return content.substring(blockStart, i + 1);
        }
      }
    }
    
    return content.substring(blockStart);
  }

  private extractBlockByLines(content: string, startLine: number, endLine: number): string {
    const lines = content.split('\n');
    return lines.slice(startLine - 1, endLine).join('\n');
  }

  private estimateFunctionLength(content: string, startIndex: number): number {
    const block = this.extractBlock(content, startIndex);
    return this.countLines(block);
  }

  private detectLanguage(filePath: string): string {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript';
    if (filePath.endsWith('.py')) return 'python';
    if (filePath.endsWith('.go')) return 'go';
    return 'unknown';
  }
}

/**
 * Python AST Parser (simplified)
 */
export class PythonParser {
  private nodeIdCounter = 0;

  parse(filePath: string, content: string): ParseResult {
    const startTime = Date.now();
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];

    // File node
    const fileNode: CodeNode = {
      id: `node-${++this.nodeIdCounter}`,
      type: 'file',
      name: filePath,
      file: filePath,
      startLine: 1,
      endLine: content.split('\n').length,
    };
    nodes.push(fileNode);

    // Parse imports
    const importPattern = /^(?:from\s+(\S+)\s+)?import\s+(.+)$/gm;
    let match;
    while ((match = importPattern.exec(content)) !== null) {
      const module = match[1] || match[2];
      const lineNumber = content.substring(0, match.index).split('\n').length;
      
      nodes.push({
        id: `node-${++this.nodeIdCounter}`,
        type: 'import',
        name: module,
        file: filePath,
        startLine: lineNumber,
        endLine: lineNumber,
      });
    }

    // Parse classes
    const classPattern = /^class\s+(\w+)(?:\(([^)]+)\))?:/gm;
    while ((match = classPattern.exec(content)) !== null) {
      const className = match[1];
      const parents = match[2];
      const lineNumber = content.substring(0, match.index).split('\n').length;

      const node: CodeNode = {
        id: `node-${++this.nodeIdCounter}`,
        type: 'class',
        name: className,
        file: filePath,
        startLine: lineNumber,
        endLine: this.findPythonBlockEnd(content, match.index),
      };
      nodes.push(node);

      if (parents) {
        for (const parent of parents.split(',').map((p) => p.trim())) {
          edges.push({
            id: `edge-${node.id}-${parent}`,
            source: node.id,
            target: `class:${parent}`,
            type: 'extends',
          });
        }
      }
    }

    // Parse functions
    const funcPattern = /^(?:async\s+)?def\s+(\w+)\s*\([^)]*\)/gm;
    while ((match = funcPattern.exec(content)) !== null) {
      const funcName = match[1];
      const lineNumber = content.substring(0, match.index).split('\n').length;

      nodes.push({
        id: `node-${++this.nodeIdCounter}`,
        type: 'function',
        name: funcName,
        file: filePath,
        startLine: lineNumber,
        endLine: this.findPythonBlockEnd(content, match.index),
        modifiers: match[0].includes('async') ? ['async'] : undefined,
      });
    }

    return {
      file: filePath,
      language: 'python',
      nodes,
      edges,
      parseTimeMs: Date.now() - startTime,
    };
  }

  private findPythonBlockEnd(content: string, startIndex: number): number {
    const lines = content.split('\n');
    const startLine = content.substring(0, startIndex).split('\n').length - 1;
    const startIndent = this.getIndent(lines[startLine]);

    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue;
      
      const indent = this.getIndent(line);
      if (indent <= startIndent && line.trim() !== '') {
        return i;
      }
    }

    return lines.length;
  }

  private getIndent(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }
}

/**
 * Parser factory
 */
export function getParser(filePath: string): TypeScriptParser | PythonParser | null {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') ||
      filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
    return new TypeScriptParser();
  }
  if (filePath.endsWith('.py')) {
    return new PythonParser();
  }
  return null;
}
