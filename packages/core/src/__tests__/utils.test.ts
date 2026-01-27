import { describe, it, expect } from 'vitest';
import { getFileExtension, getLanguageFromExtension } from '../utils/index.js';

describe('utils', () => {
  describe('getFileExtension', () => {
    it('should extract file extension', () => {
      expect(getFileExtension('file.ts')).toBe('ts');
      expect(getFileExtension('path/to/file.tsx')).toBe('tsx');
      expect(getFileExtension('file.test.ts')).toBe('ts');
      expect(getFileExtension('noextension')).toBe('');
    });
  });

  describe('getLanguageFromExtension', () => {
    it('should map extensions to languages', () => {
      expect(getLanguageFromExtension('ts')).toBe('typescript');
      expect(getLanguageFromExtension('tsx')).toBe('typescript');
      expect(getLanguageFromExtension('js')).toBe('javascript');
      expect(getLanguageFromExtension('py')).toBe('python');
      expect(getLanguageFromExtension('go')).toBe('go');
      expect(getLanguageFromExtension('unknown')).toBe('unknown');
    });
  });
});
