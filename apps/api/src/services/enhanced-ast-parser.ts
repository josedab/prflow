/**
 * Enhanced AST Parser using TypeScript Compiler API
 * Provides accurate parsing for TypeScript/JavaScript files
 */

import * as ts from 'typescript';
import { logger } from '../lib/logger.js';
import type { CodeNode, CodeEdge, ParseResult, CodeNodeType, EdgeType } from './code-parser.js';

/**
 * TypeScript Compiler API-based parser for accurate AST analysis
 */
export class TypeScriptCompilerParser {
  private nodeIdCounter = 0;

  /**
   * Parse a TypeScript/JavaScript file using the TS compiler
   */
  parse(filePath: string, content: string): ParseResult {
    const startTime = Date.now();
    const nodes: CodeNode[] = [];
    const edges: CodeEdge[] = [];
    const errors: string[] = [];

    try {
      // Create a source file
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        this.getScriptKind(filePath)
      );

      // Create file node
      const fileNode = this.createNode('file', filePath, filePath, 1, sourceFile.getLineAndCharacterOfPosition(content.length).line + 1);
      nodes.push(fileNode);

      // Walk the AST
      this.visitNode(sourceFile, filePath, nodes, edges, sourceFile);

      // Add edges from file to top-level nodes
      for (const node of nodes) {
        if (node.id !== fileNode.id && this.isTopLevelNode(node, nodes)) {
          edges.push(this.createEdge(fileNode.id, node.id, 'defines'));
        }
      }

      // Collect diagnostic errors
      const diagnostics = this.getDiagnostics(sourceFile, content);
      if (diagnostics.length > 0) {
        errors.push(...diagnostics);
      }

    } catch (error) {
      logger.error({ error, file: filePath }, 'Failed to parse file with TypeScript compiler');
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

  private visitNode(
    node: ts.Node,
    filePath: string,
    nodes: CodeNode[],
    edges: CodeEdge[],
    sourceFile: ts.SourceFile
  ): void {
    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    // Handle different node types
    if (ts.isClassDeclaration(node) && node.name) {
      const classNode = this.createNode(
        'class',
        node.name.text,
        filePath,
        startLine + 1,
        endLine + 1,
        this.getClassSignature(node),
        this.getModifiers(node)
      );
      classNode.docComment = this.getJSDocComment(node, sourceFile);
      nodes.push(classNode);

      // Check for extends/implements
      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          const edgeType: EdgeType = clause.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';
          for (const type of clause.types) {
            const targetName = type.expression.getText(sourceFile);
            edges.push({
              id: `edge-${classNode.id}-${targetName}-${edgeType}`,
              source: classNode.id,
              target: targetName,
              type: edgeType,
            });
          }
        }
      }

      // Process class members
      node.members.forEach((member) => {
        if (ts.isMethodDeclaration(member) && member.name) {
          const methodName = member.name.getText(sourceFile);
          const { line: mStartLine } = sourceFile.getLineAndCharacterOfPosition(member.getStart());
          const { line: mEndLine } = sourceFile.getLineAndCharacterOfPosition(member.getEnd());
          
          const methodNode = this.createNode(
            'method',
            methodName,
            filePath,
            mStartLine + 1,
            mEndLine + 1,
            this.getMethodSignature(member, sourceFile),
            this.getModifiers(member)
          );
          methodNode.docComment = this.getJSDocComment(member, sourceFile);
          methodNode.metadata = { className: node.name!.text };
          nodes.push(methodNode);

          edges.push(this.createEdge(classNode.id, methodNode.id, 'defines'));

          // Find function calls within the method
          this.findCallExpressions(member, methodNode.id, edges, sourceFile);
        }
      });
    }

    if (ts.isInterfaceDeclaration(node) && node.name) {
      const interfaceNode = this.createNode(
        'interface',
        node.name.text,
        filePath,
        startLine + 1,
        endLine + 1,
        this.getInterfaceSignature(node, sourceFile)
      );
      interfaceNode.docComment = this.getJSDocComment(node, sourceFile);
      nodes.push(interfaceNode);

      // Check for extends
      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          for (const type of clause.types) {
            const targetName = type.expression.getText(sourceFile);
            edges.push({
              id: `edge-${interfaceNode.id}-${targetName}-extends`,
              source: interfaceNode.id,
              target: targetName,
              type: 'extends',
            });
          }
        }
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      const funcNode = this.createNode(
        'function',
        node.name.text,
        filePath,
        startLine + 1,
        endLine + 1,
        this.getFunctionSignature(node, sourceFile),
        this.getModifiers(node)
      );
      funcNode.docComment = this.getJSDocComment(node, sourceFile);
      nodes.push(funcNode);

      // Find function calls
      this.findCallExpressions(node, funcNode.id, edges, sourceFile);
    }

    if (ts.isTypeAliasDeclaration(node) && node.name) {
      const typeNode = this.createNode(
        'type_alias',
        node.name.text,
        filePath,
        startLine + 1,
        endLine + 1,
        `type ${node.name.text} = ...`
      );
      typeNode.docComment = this.getJSDocComment(node, sourceFile);
      nodes.push(typeNode);
    }

    if (ts.isEnumDeclaration(node) && node.name) {
      const enumNode = this.createNode(
        'enum',
        node.name.text,
        filePath,
        startLine + 1,
        endLine + 1,
        `enum ${node.name.text}`
      );
      enumNode.docComment = this.getJSDocComment(node, sourceFile);
      nodes.push(enumNode);
    }

    if (ts.isVariableStatement(node)) {
      const modifiers = this.getModifiers(node);
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;
          const varNode = this.createNode(
            isConst ? 'constant' : 'variable',
            decl.name.text,
            filePath,
            startLine + 1,
            endLine + 1,
            undefined,
            modifiers
          );
          varNode.docComment = this.getJSDocComment(node, sourceFile);
          nodes.push(varNode);
        }
      }
    }

    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
      const importNode = this.createNode(
        'import',
        moduleSpecifier,
        filePath,
        startLine + 1,
        endLine + 1,
        node.getText(sourceFile).split('\n')[0]
      );
      nodes.push(importNode);

      edges.push({
        id: `edge-${importNode.id}-${moduleSpecifier}-imports`,
        source: importNode.id,
        target: moduleSpecifier,
        type: 'imports',
        metadata: { moduleSpecifier },
      });
    }

    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      const exportNode = this.createNode(
        'export',
        'export',
        filePath,
        startLine + 1,
        endLine + 1,
        node.getText(sourceFile).split('\n')[0]
      );
      nodes.push(exportNode);
    }

    // Recurse into children (but not into class/function bodies which we handle above)
    if (!ts.isClassDeclaration(node) && !ts.isFunctionDeclaration(node)) {
      ts.forEachChild(node, (child) => this.visitNode(child, filePath, nodes, edges, sourceFile));
    }
  }

  private findCallExpressions(
    node: ts.Node,
    sourceNodeId: string,
    edges: CodeEdge[],
    sourceFile: ts.SourceFile
  ): void {
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const callee = n.expression.getText(sourceFile);
        // Skip common built-ins
        if (!['console.log', 'console.error', 'console.warn', 'JSON.stringify', 'JSON.parse'].includes(callee)) {
          edges.push({
            id: `edge-${sourceNodeId}-${callee}-calls-${n.getStart()}`,
            source: sourceNodeId,
            target: callee,
            type: 'calls',
          });
        }
      }
      ts.forEachChild(n, visit);
    };
    
    if (ts.isFunctionDeclaration(node) && node.body) {
      ts.forEachChild(node.body, visit);
    } else if (ts.isMethodDeclaration(node) && node.body) {
      ts.forEachChild(node.body, visit);
    }
  }

  private getClassSignature(node: ts.ClassDeclaration): string {
    const modifiers = this.getModifiers(node).join(' ');
    const name = node.name?.text || 'anonymous';
    let signature = modifiers ? `${modifiers} class ${name}` : `class ${name}`;
    
    if (node.typeParameters) {
      signature += '<...>';
    }
    
    return signature;
  }

  private getMethodSignature(node: ts.MethodDeclaration, sourceFile: ts.SourceFile): string {
    const name = node.name.getText(sourceFile);
    const params = node.parameters.map((p) => p.getText(sourceFile)).join(', ');
    const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : '';
    return `${name}(${params})${returnType}`;
  }

  private getFunctionSignature(node: ts.FunctionDeclaration, sourceFile: ts.SourceFile): string {
    const name = node.name?.text || 'anonymous';
    const params = node.parameters.map((p) => p.getText(sourceFile)).join(', ');
    const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : '';
    return `function ${name}(${params})${returnType}`;
  }

  private getInterfaceSignature(node: ts.InterfaceDeclaration, sourceFile: ts.SourceFile): string {
    const name = node.name.text;
    let signature = `interface ${name}`;
    
    if (node.typeParameters) {
      const typeParams = node.typeParameters.map((tp) => tp.getText(sourceFile)).join(', ');
      signature += `<${typeParams}>`;
    }
    
    return signature;
  }

  private getModifiers(node: ts.Node): string[] {
    const modifiers: string[] = [];
    
    if (ts.canHaveModifiers(node)) {
      const nodeModifiers = ts.getModifiers(node);
      if (nodeModifiers) {
        for (const mod of nodeModifiers) {
          switch (mod.kind) {
            case ts.SyntaxKind.ExportKeyword:
              modifiers.push('export');
              break;
            case ts.SyntaxKind.DefaultKeyword:
              modifiers.push('default');
              break;
            case ts.SyntaxKind.PublicKeyword:
              modifiers.push('public');
              break;
            case ts.SyntaxKind.PrivateKeyword:
              modifiers.push('private');
              break;
            case ts.SyntaxKind.ProtectedKeyword:
              modifiers.push('protected');
              break;
            case ts.SyntaxKind.StaticKeyword:
              modifiers.push('static');
              break;
            case ts.SyntaxKind.ReadonlyKeyword:
              modifiers.push('readonly');
              break;
            case ts.SyntaxKind.AsyncKeyword:
              modifiers.push('async');
              break;
            case ts.SyntaxKind.AbstractKeyword:
              modifiers.push('abstract');
              break;
          }
        }
      }
    }
    
    return modifiers;
  }

  private getJSDocComment(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
    const fullText = sourceFile.getFullText();
    const nodeStart = node.getFullStart();
    const leadingComments = ts.getLeadingCommentRanges(fullText, nodeStart);
    
    if (leadingComments) {
      for (const comment of leadingComments) {
        const commentText = fullText.slice(comment.pos, comment.end);
        if (commentText.startsWith('/**')) {
          // Clean up JSDoc comment
          return commentText
            .replace(/^\/\*\*\s*/, '')
            .replace(/\s*\*\/$/, '')
            .replace(/^\s*\*\s?/gm, '')
            .trim();
        }
      }
    }
    
    return undefined;
  }

  private getDiagnostics(sourceFile: ts.SourceFile, content: string): string[] {
    // Create a minimal program just to get syntax diagnostics
    const compilerHost: ts.CompilerHost = {
      getSourceFile: (fileName) => 
        fileName === sourceFile.fileName ? sourceFile : undefined,
      getDefaultLibFileName: () => 'lib.d.ts',
      writeFile: () => {},
      getCurrentDirectory: () => '/',
      getCanonicalFileName: (fileName) => fileName,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      fileExists: (fileName) => fileName === sourceFile.fileName,
      readFile: (fileName) => fileName === sourceFile.fileName ? content : undefined,
    };

    const program = ts.createProgram(
      [sourceFile.fileName],
      { noEmit: true, allowJs: true },
      compilerHost
    );

    const syntacticDiagnostics = program.getSyntacticDiagnostics(sourceFile);
    
    return syntacticDiagnostics.slice(0, 5).map((d) => {
      const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      if (d.file && d.start !== undefined) {
        const { line } = d.file.getLineAndCharacterOfPosition(d.start);
        return `Line ${line + 1}: ${message}`;
      }
      return message;
    });
  }

  private getScriptKind(filePath: string): ts.ScriptKind {
    if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
    if (filePath.endsWith('.ts')) return ts.ScriptKind.TS;
    if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
    if (filePath.endsWith('.js')) return ts.ScriptKind.JS;
    return ts.ScriptKind.Unknown;
  }

  private detectLanguage(filePath: string): string {
    if (filePath.endsWith('.tsx')) return 'tsx';
    if (filePath.endsWith('.ts')) return 'typescript';
    if (filePath.endsWith('.jsx')) return 'jsx';
    if (filePath.endsWith('.js')) return 'javascript';
    return 'unknown';
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

  private isTopLevelNode(node: CodeNode, allNodes: CodeNode[]): boolean {
    // A node is top-level if no other node contains it (except the file node)
    for (const other of allNodes) {
      if (other.type !== 'file' && other.id !== node.id) {
        if (
          other.file === node.file &&
          other.startLine <= node.startLine &&
          other.endLine >= node.endLine
        ) {
          return false;
        }
      }
    }
    return true;
  }
}

// Export singleton instance
export const tsCompilerParser = new TypeScriptCompilerParser();

/**
 * Enhanced parser that uses TypeScript Compiler API for accurate parsing
 * Falls back to regex-based parsing for unsupported languages
 */
export async function parseFileWithCompiler(
  filePath: string,
  content: string
): Promise<ParseResult> {
  // Use TypeScript compiler for TS/JS files
  if (filePath.match(/\.(ts|tsx|js|jsx)$/)) {
    return tsCompilerParser.parse(filePath, content);
  }

  // For other languages, return a basic result
  // In production, would integrate with tree-sitter or other parsers
  const lines = content.split('\n');
  return {
    file: filePath,
    language: filePath.split('.').pop() || 'unknown',
    nodes: [{
      id: 'node-file',
      type: 'file',
      name: filePath,
      file: filePath,
      startLine: 1,
      endLine: lines.length,
    }],
    edges: [],
    parseTimeMs: 0,
    errors: ['Parser not available for this language'],
  };
}
