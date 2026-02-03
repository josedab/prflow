/**
 * @fileoverview Test Generator Agent for PRFlow.
 *
 * The Test Generator Agent automatically creates unit tests for code changes.
 * It analyzes the PR diff to identify new and modified functions, then generates
 * appropriate tests based on the detected testing framework.
 *
 * Supported frameworks:
 * - Jest (JavaScript/TypeScript)
 * - Vitest (JavaScript/TypeScript)
 * - Mocha/Chai (JavaScript/TypeScript)
 * - Pytest (Python)
 * - Go test (Go)
 *
 * Generation approaches:
 * 1. LLM-based generation for comprehensive, context-aware tests
 * 2. Template-based generation as fallback
 *
 * Generated tests include:
 * - Happy path tests
 * - Edge case tests
 * - Error handling tests
 * - Boundary condition tests
 *
 * @module agents/test-generator
 */

import type { TestAgentInput, AgentContext, TestGenerationResult, GeneratedTest, TestFramework, SemanticChange } from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { getFileExtension, getLanguageFromExtension } from '@prflow/core';
import { logger } from '../lib/logger.js';

/**
 * Test Generator Agent - Automated test creation for PR changes.
 *
 * Analyzes pull request changes to automatically generate unit tests for
 * new and modified code. The agent detects the testing framework in use
 * and generates appropriate test code.
 *
 * @example
 * ```typescript
 * const testGen = new TestGeneratorAgent();
 * const result = await testGen.execute({
 *   diff: { files: [...], totalAdditions: 100 },
 *   analysis: { semanticChanges: [{ type: 'new_function', name: 'foo', ... }] },
 *   testPatterns: [{ framework: 'vitest' }]
 * }, context);
 *
 * if (result.success) {
 *   result.data.tests.forEach(test => {
 *     console.log(`Generated ${test.testFile} for ${test.targetFile}`);
 *     console.log(test.testCode);
 *   });
 * }
 * ```
 */
export class TestGeneratorAgent extends BaseAgent<TestAgentInput, TestGenerationResult> {
  readonly name = 'test';
  readonly description = 'Generates unit tests for new and modified code';
  
  private useLLM = process.env.ENABLE_LLM_TESTS !== 'false';

  async execute(input: TestAgentInput, context: AgentContext) {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.generateTests(input, context);
    });

    if (!result) {
      return this.createErrorResult('Test generation failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async generateTests(input: TestAgentInput, _context: AgentContext): Promise<TestGenerationResult> {
    const { diff, analysis, testPatterns } = input;
    const tests: GeneratedTest[] = [];

    // Detect test framework
    const framework = this.detectTestFramework(diff.files, testPatterns);

    // Find files that need tests
    const filesNeedingTests = this.findFilesNeedingTests(diff.files, analysis.semanticChanges);

    for (const file of filesNeedingTests) {
      const ext = getFileExtension(file.filename);
      const language = getLanguageFromExtension(ext);

      if (!this.isTestableFile(file.filename)) continue;

      let testCode: string;
      
      // Try LLM-based test generation first
      if (this.useLLM) {
        try {
          testCode = await this.generateTestWithLLM(
            file.filename,
            file.patch || '',
            language,
            framework,
            analysis.semanticChanges.filter((c) => c.file === file.filename)
          );
        } catch (error) {
          logger.warn({ error, file: file.filename }, 'LLM test generation failed, using template-based');
          testCode = await this.generateTestForFile(
            file.filename,
            file.patch || '',
            language,
            framework,
            analysis.semanticChanges.filter((c) => c.file === file.filename)
          );
        }
      } else {
        testCode = await this.generateTestForFile(
          file.filename,
          file.patch || '',
          language,
          framework,
          analysis.semanticChanges.filter((c) => c.file === file.filename)
        );
      }

      if (testCode) {
        const testFile = this.getTestFileName(file.filename, framework);
        tests.push({
          testFile,
          targetFile: file.filename,
          framework,
          testCode,
          coverageTargets: this.extractCoverageTargets(file.patch || ''),
          testNames: this.extractTestNames(testCode),
        });
      }
    }

    return {
      tests,
      coverageImprovement: tests.length > 0 ? this.estimateCoverageImprovement(tests, diff) : null,
      frameworkDetected: framework,
    };
  }

  private async generateTestWithLLM(
    filename: string,
    patch: string,
    language: string,
    framework: TestFramework,
    _changes: SemanticChange[]
  ): Promise<string> {
    const functions = this.extractFunctionsFromPatch(patch, language);
    
    if (functions.length === 0) return '';

    const frameworkInfo = this.getFrameworkInfo(framework);
    const systemPrompt = buildSystemPrompt('test generator', `
Language: ${language}
Test Framework: ${framework}
File: ${filename}
`);

    const userPrompt = `Generate comprehensive unit tests for the following code changes.

## File: ${filename}

## Code Changes (diff):
\`\`\`${language}
${patch}
\`\`\`

## Functions to test:
${functions.map((f) => `- ${f.name}(${f.params.join(', ')})${f.async ? ' (async)' : ''}`).join('\n')}

## Requirements:
1. Use ${framework} testing framework
2. Follow ${frameworkInfo.style} testing style
3. Include:
   - Happy path tests
   - Edge case tests
   - Error handling tests (if applicable)
   - Boundary condition tests
4. Use descriptive test names
5. Include proper imports
6. Add inline comments explaining test logic where helpful

Generate complete, runnable test code. Respond with ONLY the test code, no explanations.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await callLLM(messages, {
      temperature: 0.4,
      maxTokens: 3000,
    });

    // Extract code from response (handle markdown code blocks)
    let testCode = response.content.trim();
    const codeMatch = testCode.match(/```(?:typescript|javascript|python|go)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      testCode = codeMatch[1].trim();
    }

    return testCode;
  }

  private getFrameworkInfo(framework: TestFramework): { style: string; imports: string } {
    const info: Record<string, { style: string; imports: string }> = {
      jest: { style: 'describe/it', imports: "import { describe, it, expect } from '@jest/globals';" },
      vitest: { style: 'describe/it', imports: "import { describe, it, expect } from 'vitest';" },
      mocha: { style: 'describe/it', imports: "import { describe, it } from 'mocha';\nimport { expect } from 'chai';" },
      pytest: { style: 'function-based', imports: 'import pytest' },
      go_test: { style: 't.Run', imports: 'import "testing"' },
      unknown: { style: 'describe/it', imports: '' },
    };
    return info[framework] || info.unknown;
  }

  private detectTestFramework(
    files: { filename: string }[],
    patterns?: { framework: string }[]
  ): TestFramework {
    // Check provided patterns first
    if (patterns && patterns.length > 0) {
      return patterns[0].framework as TestFramework;
    }

    // Detect from package.json or existing test files
    const hasJest = files.some((f) => 
      f.filename.includes('jest.config') || 
      f.filename.includes('.test.') ||
      f.filename.includes('__tests__')
    );
    const hasVitest = files.some((f) => 
      f.filename.includes('vitest.config') ||
      f.filename.includes('.spec.')
    );
    const hasMocha = files.some((f) => 
      f.filename.includes('mocha') ||
      f.filename.includes('.mocha.')
    );
    const hasPytest = files.some((f) => 
      f.filename.includes('pytest') ||
      f.filename.includes('test_') ||
      f.filename.endsWith('_test.py')
    );
    const hasGoTest = files.some((f) => f.filename.endsWith('_test.go'));

    if (hasVitest) return 'vitest';
    if (hasJest) return 'jest';
    if (hasMocha) return 'mocha';
    if (hasPytest) return 'pytest';
    if (hasGoTest) return 'go_test';

    // Default to jest for JS/TS projects
    const hasJSTS = files.some((f) => /\.(js|jsx|ts|tsx)$/.test(f.filename));
    if (hasJSTS) return 'jest';

    return 'unknown';
  }

  private findFilesNeedingTests(
    files: { filename: string; patch?: string; status: string }[],
    semanticChanges: SemanticChange[]
  ): { filename: string; patch?: string }[] {
    return files.filter((file) => {
      // Skip test files
      if (this.isTestFile(file.filename)) return false;

      // Skip non-code files
      if (!this.isTestableFile(file.filename)) return false;

      // Skip deleted files
      if (file.status === 'removed') return false;

      // Check if there are semantic changes (functions/methods) in this file
      const hasNewFunctions = semanticChanges.some(
        (c) => c.file === file.filename && 
        (c.type === 'new_function' || c.type === 'modified_function')
      );

      return hasNewFunctions || file.status === 'added';
    });
  }

  private isTestFile(filename: string): boolean {
    return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filename) ||
           /test_.*\.py$/.test(filename) ||
           /.*_test\.(py|go)$/.test(filename) ||
           filename.includes('__tests__');
  }

  private isTestableFile(filename: string): boolean {
    const testableExtensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'go'];
    const ext = getFileExtension(filename);
    return testableExtensions.includes(ext);
  }

  private getTestFileName(sourceFile: string, framework: TestFramework): string {
    const ext = getFileExtension(sourceFile);
    const baseName = sourceFile.replace(`.${ext}`, '');

    switch (framework) {
      case 'jest':
      case 'vitest':
        return `${baseName}.test.${ext}`;
      case 'mocha':
        return `${baseName}.spec.${ext}`;
      case 'pytest':
        return sourceFile.replace(/(\w+)\.py$/, 'test_$1.py');
      case 'go_test':
        return sourceFile.replace('.go', '_test.go');
      default:
        return `${baseName}.test.${ext}`;
    }
  }

  private async generateTestForFile(
    filename: string,
    patch: string,
    language: string,
    framework: TestFramework,
    _changes: SemanticChange[]
  ): Promise<string> {
    // Extract function names and signatures from the patch
    const functions = this.extractFunctionsFromPatch(patch, language);

    if (functions.length === 0) return '';

    // Generate test code based on framework
    switch (framework) {
      case 'jest':
      case 'vitest':
        return this.generateJestTests(filename, functions, framework);
      case 'pytest':
        return this.generatePytestTests(filename, functions);
      case 'go_test':
        return this.generateGoTests(filename, functions);
      default:
        return this.generateJestTests(filename, functions, 'jest');
    }
  }

  private extractFunctionsFromPatch(patch: string, language: string): Array<{ name: string; params: string[]; async: boolean }> {
    const functions: Array<{ name: string; params: string[]; async: boolean }> = [];
    const lines = patch.split('\n').filter((l) => l.startsWith('+'));

    // JavaScript/TypeScript patterns
    const jsPatterns = [
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?:=>|{)/,
      /(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::|{)/,
    ];

    // Python patterns
    const pyPatterns = [
      /def\s+(\w+)\s*\(([^)]*)\)/,
      /async\s+def\s+(\w+)\s*\(([^)]*)\)/,
    ];

    // Go patterns
    const goPatterns = [
      /func\s+(\w+)\s*\(([^)]*)\)/,
      /func\s+\([^)]+\)\s+(\w+)\s*\(([^)]*)\)/,
    ];

    const patterns = language === 'python' ? pyPatterns : 
                     language === 'go' ? goPatterns : jsPatterns;

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const name = match[1];
          const paramsStr = match[2];
          const params = paramsStr ? paramsStr.split(',').map((p) => p.trim().split(/[:\s]/)[0]).filter(Boolean) : [];
          const isAsync = line.includes('async');
          
          if (!functions.some((f) => f.name === name)) {
            functions.push({ name, params, async: isAsync });
          }
        }
      }
    }

    return functions;
  }

  private generateJestTests(
    filename: string,
    functions: Array<{ name: string; params: string[]; async: boolean }>,
    _framework: 'jest' | 'vitest'
  ): string {
    const moduleName = filename.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || 'module';

    let code = `import { ${functions.map((f) => f.name).join(', ')} } from './${moduleName}';\n\n`;
    code += `describe('${moduleName}', () => {\n`;

    for (const func of functions) {
      const testPrefix = func.async ? 'async ' : '';
      const awaitPrefix = func.async ? 'await ' : '';

      code += `  describe('${func.name}', () => {\n`;
      
      // Happy path test
      code += `    it('should handle valid input', ${testPrefix}() => {\n`;
      code += `      // Arrange\n`;
      code += `      ${func.params.length > 0 ? `const ${func.params.join(' = /* TODO */; const ')} = /* TODO */;` : '// No parameters'}\n`;
      code += `\n`;
      code += `      // Act\n`;
      code += `      const result = ${awaitPrefix}${func.name}(${func.params.join(', ')});\n`;
      code += `\n`;
      code += `      // Assert\n`;
      code += `      expect(result).toBeDefined();\n`;
      code += `      // TODO: Add specific assertions\n`;
      code += `    });\n\n`;

      // Edge case test
      code += `    it('should handle edge cases', ${testPrefix}() => {\n`;
      code += `      // TODO: Test edge cases\n`;
      code += `      expect(true).toBe(true);\n`;
      code += `    });\n\n`;

      // Error case test
      if (func.async) {
        code += `    it('should handle errors', async () => {\n`;
        code += `      // TODO: Test error handling\n`;
        code += `      await expect(${func.name}(/* invalid input */)).rejects.toThrow();\n`;
        code += `    });\n`;
      } else {
        code += `    it('should handle invalid input', () => {\n`;
        code += `      // TODO: Test invalid input handling\n`;
        code += `      expect(() => ${func.name}(/* invalid input */)).toThrow();\n`;
        code += `    });\n`;
      }

      code += `  });\n\n`;
    }

    code += `});\n`;

    return code;
  }

  private generatePytestTests(
    filename: string,
    functions: Array<{ name: string; params: string[]; async: boolean }>
  ): string {
    const moduleName = filename.split('/').pop()?.replace('.py', '') || 'module';

    let code = `import pytest\n`;
    code += `from ${moduleName} import ${functions.map((f) => f.name).join(', ')}\n\n`;

    for (const func of functions) {
      const decorator = func.async ? '@pytest.mark.asyncio\nasync ' : '';
      const awaitPrefix = func.async ? 'await ' : '';

      code += `class Test${this.capitalize(func.name)}:\n`;
      code += `    ${decorator}def test_valid_input(self):\n`;
      code += `        # Arrange\n`;
      code += `        ${func.params.length > 0 ? func.params.map((p) => `${p} = None  # TODO`).join('\n        ') : '# No parameters'}\n`;
      code += `\n`;
      code += `        # Act\n`;
      code += `        result = ${awaitPrefix}${func.name}(${func.params.join(', ')})\n`;
      code += `\n`;
      code += `        # Assert\n`;
      code += `        assert result is not None\n\n`;

      code += `    ${decorator}def test_edge_cases(self):\n`;
      code += `        # TODO: Test edge cases\n`;
      code += `        pass\n\n`;

      code += `    ${decorator}def test_error_handling(self):\n`;
      code += `        with pytest.raises(Exception):\n`;
      code += `            ${awaitPrefix}${func.name}(/* invalid input */)\n\n`;
    }

    return code;
  }

  private generateGoTests(
    filename: string,
    functions: Array<{ name: string; params: string[]; async: boolean }>
  ): string {
    const packageName = filename.split('/').slice(-2, -1)[0] || 'main';

    let code = `package ${packageName}\n\n`;
    code += `import (\n`;
    code += `    "testing"\n`;
    code += `)\n\n`;

    for (const func of functions) {
      const testName = `Test${this.capitalize(func.name)}`;

      code += `func ${testName}(t *testing.T) {\n`;
      code += `    t.Run("valid input", func(t *testing.T) {\n`;
      code += `        // Arrange\n`;
      code += `        // TODO: Set up test data\n`;
      code += `\n`;
      code += `        // Act\n`;
      code += `        result := ${func.name}(/* TODO */)\n`;
      code += `\n`;
      code += `        // Assert\n`;
      code += `        if result == nil {\n`;
      code += `            t.Error("Expected non-nil result")\n`;
      code += `        }\n`;
      code += `    })\n\n`;

      code += `    t.Run("edge cases", func(t *testing.T) {\n`;
      code += `        // TODO: Test edge cases\n`;
      code += `    })\n`;
      code += `}\n\n`;
    }

    return code;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private extractCoverageTargets(patch: string): string[] {
    const targets: string[] = [];
    const functionPattern = /(?:function|const|def|func)\s+(\w+)/g;
    let match;

    while ((match = functionPattern.exec(patch)) !== null) {
      targets.push(match[1]);
    }

    return [...new Set(targets)];
  }

  private extractTestNames(testCode: string): string[] {
    const names: string[] = [];
    const patterns = [
      /it\s*\(\s*['"]([^'"]+)['"]/g,        // Jest/Vitest
      /def\s+test_(\w+)/g,                   // Pytest
      /func\s+(Test\w+)/g,                   // Go
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(testCode)) !== null) {
        names.push(match[1]);
      }
    }

    return names;
  }

  private estimateCoverageImprovement(tests: GeneratedTest[], diff: { totalAdditions: number }): number {
    // Simple estimation based on tests generated vs lines added
    const totalTargets = tests.reduce((sum, t) => sum + t.coverageTargets.length, 0);
    const estimatedCoverage = Math.min(totalTargets * 15, diff.totalAdditions);
    return Math.round((estimatedCoverage / diff.totalAdditions) * 100);
  }
}
