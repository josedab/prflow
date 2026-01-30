import { describe, it, expect, beforeEach } from 'vitest';
import { TypeScriptCompilerParser, parseFileWithCompiler } from '../services/enhanced-ast-parser.js';

describe('TypeScriptCompilerParser', () => {
  let parser: TypeScriptCompilerParser;

  beforeEach(() => {
    parser = new TypeScriptCompilerParser();
  });

  describe('parse', () => {
    it('should parse a simple TypeScript file', () => {
      const content = `
        export function hello(name: string): string {
          return \`Hello, \${name}!\`;
        }
      `;

      const result = parser.parse('test.ts', content);

      expect(result.file).toBe('test.ts');
      expect(result.language).toBe('typescript');
      expect(result.nodes.length).toBeGreaterThan(0);
      
      const funcNode = result.nodes.find(n => n.type === 'function' && n.name === 'hello');
      expect(funcNode).toBeDefined();
      expect(funcNode?.signature).toContain('hello');
      expect(funcNode?.modifiers).toContain('export');
    });

    it('should parse a class with methods', () => {
      const content = `
        export class Calculator {
          private value: number = 0;

          add(n: number): Calculator {
            this.value += n;
            return this;
          }

          subtract(n: number): Calculator {
            this.value -= n;
            return this;
          }

          getResult(): number {
            return this.value;
          }
        }
      `;

      const result = parser.parse('calculator.ts', content);

      const classNode = result.nodes.find(n => n.type === 'class' && n.name === 'Calculator');
      expect(classNode).toBeDefined();
      expect(classNode?.modifiers).toContain('export');

      const methodNodes = result.nodes.filter(n => n.type === 'method');
      expect(methodNodes.length).toBe(3);

      const addMethod = methodNodes.find(n => n.name === 'add');
      expect(addMethod).toBeDefined();
      expect(addMethod?.signature).toContain('add');
    });

    it('should parse interfaces', () => {
      const content = `
        export interface User {
          id: string;
          name: string;
          email: string;
        }

        export interface Admin extends User {
          permissions: string[];
        }
      `;

      const result = parser.parse('types.ts', content);

      const interfaces = result.nodes.filter(n => n.type === 'interface');
      expect(interfaces.length).toBe(2);

      const userInterface = interfaces.find(n => n.name === 'User');
      expect(userInterface).toBeDefined();

      const adminInterface = interfaces.find(n => n.name === 'Admin');
      expect(adminInterface).toBeDefined();

      // Check for extends edge
      const extendsEdge = result.edges.find(
        e => e.type === 'extends' && e.target === 'User'
      );
      expect(extendsEdge).toBeDefined();
    });

    it('should parse type aliases', () => {
      const content = `
        type ID = string | number;
        type Status = 'pending' | 'active' | 'completed';
      `;

      const result = parser.parse('types.ts', content);

      const typeAliases = result.nodes.filter(n => n.type === 'type_alias');
      expect(typeAliases.length).toBe(2);
      expect(typeAliases.map(t => t.name)).toContain('ID');
      expect(typeAliases.map(t => t.name)).toContain('Status');
    });

    it('should parse enums', () => {
      const content = `
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue'
        }
      `;

      const result = parser.parse('colors.ts', content);

      const enumNode = result.nodes.find(n => n.type === 'enum');
      expect(enumNode).toBeDefined();
      expect(enumNode?.name).toBe('Color');
    });

    it('should parse imports and create edges', () => {
      const content = `
        import { Logger } from './logger';
        import * as fs from 'fs';
        import path from 'path';
      `;

      const result = parser.parse('imports.ts', content);

      const imports = result.nodes.filter(n => n.type === 'import');
      expect(imports.length).toBe(3);

      const importEdges = result.edges.filter(e => e.type === 'imports');
      expect(importEdges.length).toBe(3);
    });

    it('should detect function calls', () => {
      const content = `
        function processData(data: string[]): void {
          const validated = validateInput(data);
          const transformed = transformData(validated);
          saveResults(transformed);
        }
      `;

      const result = parser.parse('processor.ts', content);

      const funcNode = result.nodes.find(n => n.type === 'function' && n.name === 'processData');
      expect(funcNode).toBeDefined();

      const callEdges = result.edges.filter(
        e => e.type === 'calls' && e.source === funcNode?.id
      );
      expect(callEdges.length).toBe(3);
      expect(callEdges.map(e => e.target)).toContain('validateInput');
      expect(callEdges.map(e => e.target)).toContain('transformData');
      expect(callEdges.map(e => e.target)).toContain('saveResults');
    });

    it('should extract JSDoc comments', () => {
      const content = `
        /**
         * Calculates the sum of two numbers.
         * @param a First number
         * @param b Second number
         * @returns The sum
         */
        export function add(a: number, b: number): number {
          return a + b;
        }
      `;

      const result = parser.parse('math.ts', content);

      const funcNode = result.nodes.find(n => n.type === 'function' && n.name === 'add');
      expect(funcNode).toBeDefined();
      expect(funcNode?.docComment).toContain('Calculates the sum');
    });

    it('should handle JSX/TSX files', () => {
      const content = `
        import React from 'react';

        interface Props {
          name: string;
        }

        export function Greeting({ name }: Props) {
          return <div>Hello, {name}!</div>;
        }
      `;

      const result = parser.parse('greeting.tsx', content);

      expect(result.language).toBe('tsx');
      expect(result.errors).toBeUndefined();

      const funcNode = result.nodes.find(n => n.type === 'function' && n.name === 'Greeting');
      expect(funcNode).toBeDefined();
    });

    it('should handle syntax errors gracefully', () => {
      const content = `
        function broken( {
          // Missing closing brace and parenthesis
      `;

      const result = parser.parse('broken.ts', content);

      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });
});

describe('parseFileWithCompiler', () => {
  it('should use compiler parser for TypeScript files', async () => {
    const content = 'export const value = 42;';
    const result = await parseFileWithCompiler('test.ts', content);

    expect(result.language).toBe('typescript');
    expect(result.nodes.length).toBeGreaterThan(0);
  });

  it('should return basic result for unsupported languages', async () => {
    const content = 'def hello(): pass';
    const result = await parseFileWithCompiler('test.py', content);

    expect(result.language).toBe('py');
    expect(result.errors).toContain('Parser not available for this language');
  });
});
