import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  detectLanguageFromPath,
  detectLanguagesFromPaths,
  getLanguageDisplayName,
  isSupportedLanguage,
  type SupportedLanguage,
} from './language.js';

describe('Language Detection', () => {
  describe('detectLanguageFromPath', () => {
    it('detects JavaScript from .js', () => {
      assert.strictEqual(detectLanguageFromPath('main.js'), 'javascript');
    });

    it('detects JavaScript from .jsx', () => {
      assert.strictEqual(detectLanguageFromPath('component.jsx'), 'javascript');
    });

    it('detects TypeScript from .ts', () => {
      assert.strictEqual(detectLanguageFromPath('server.ts'), 'typescript');
    });

    it('detects TypeScript from .tsx', () => {
      assert.strictEqual(detectLanguageFromPath('component.tsx'), 'typescript');
    });

    it('detects C++ from .cpp', () => {
      assert.strictEqual(detectLanguageFromPath('main.cpp'), 'cpp');
    });

    it('detects C++ from .cc', () => {
      assert.strictEqual(detectLanguageFromPath('main.cc'), 'cpp');
    });

    it('detects C++ from .cxx', () => {
      assert.strictEqual(detectLanguageFromPath('main.cxx'), 'cpp');
    });

    it('detects C++ from .hpp', () => {
      assert.strictEqual(detectLanguageFromPath('header.hpp'), 'cpp');
    });

    it('detects C++ from .h', () => {
      assert.strictEqual(detectLanguageFromPath('header.h'), 'cpp');
    });

    it('detects Python from .py', () => {
      assert.strictEqual(detectLanguageFromPath('main.py'), 'python');
    });

    it('detects Java from .java', () => {
      assert.strictEqual(detectLanguageFromPath('Main.java'), 'java');
    });

    it('detects Make from Makefile', () => {
      assert.strictEqual(detectLanguageFromPath('Makefile'), 'make');
    });

    it('detects CMake from CMakeLists.txt', () => {
      assert.strictEqual(detectLanguageFromPath('CMakeLists.txt'), 'cmake');
    });

    it('detects Dockerfile from Dockerfile', () => {
      assert.strictEqual(detectLanguageFromPath('Dockerfile'), 'dockerfile');
    });

    it('returns null for unknown extension', () => {
      assert.strictEqual(detectLanguageFromPath('unknown.xyz'), null);
    });

    it('returns null for files without extension', () => {
      assert.strictEqual(detectLanguageFromPath('README'), null);
    });

    it('handles paths with directories', () => {
      assert.strictEqual(detectLanguageFromPath('src/main.cpp'), 'cpp');
      assert.strictEqual(detectLanguageFromPath('src/utils/main.py'), 'python');
      assert.strictEqual(detectLanguageFromPath('build/Makefile'), 'make');
    });

    it('is case insensitive', () => {
      assert.strictEqual(detectLanguageFromPath('MAKEFILE'), 'make');
      assert.strictEqual(detectLanguageFromPath('Main.CPP'), 'cpp');
    });
  });

  describe('detectLanguagesFromPaths', () => {
    it('returns Map of path to language for known extensions', () => {
      const paths = ['main.cpp', 'server.ts', 'main.py'];
      const result = detectLanguagesFromPaths(paths);

      assert.strictEqual(result.size, 3);
      assert.strictEqual(result.get('main.cpp'), 'cpp');
      assert.strictEqual(result.get('server.ts'), 'typescript');
      assert.strictEqual(result.get('main.py'), 'python');
    });

    it('ignores unknown extensions', () => {
      const paths = ['main.cpp', 'unknown.xyz', 'server.ts'];
      const result = detectLanguagesFromPaths(paths);

      assert.strictEqual(result.size, 2);
      assert.strictEqual(result.get('main.cpp'), 'cpp');
      assert.strictEqual(result.get('server.ts'), 'typescript');
      assert.strictEqual(result.has('unknown.xyz'), false);
    });

    it('handles mixed known and unknown', () => {
      const paths = ['Makefile', 'README.md', 'src/main.go', 'CMakeLists.txt'];
      const result = detectLanguagesFromPaths(paths);

      assert.strictEqual(result.size, 2);
      assert.strictEqual(result.get('Makefile'), 'make');
      assert.strictEqual(result.get('CMakeLists.txt'), 'cmake');
    });

    it('returns empty map for all unknown', () => {
      const paths = ['unknown.xyz', 'README'];
      const result = detectLanguagesFromPaths(paths);
      assert.strictEqual(result.size, 0);
    });
  });

  describe('getLanguageDisplayName', () => {
    it('returns correct display names', () => {
      assert.strictEqual(getLanguageDisplayName('javascript'), 'JavaScript');
      assert.strictEqual(getLanguageDisplayName('typescript'), 'TypeScript');
      assert.strictEqual(getLanguageDisplayName('cpp'), 'C++');
      assert.strictEqual(getLanguageDisplayName('python'), 'Python');
      assert.strictEqual(getLanguageDisplayName('java'), 'Java');
      assert.strictEqual(getLanguageDisplayName('make'), 'Make');
      assert.strictEqual(getLanguageDisplayName('cmake'), 'CMake');
      assert.strictEqual(getLanguageDisplayName('dockerfile'), 'Dockerfile');
    });
  });

  describe('isSupportedLanguage', () => {
    it('returns true for all supported languages', () => {
      const languages: SupportedLanguage[] = [
        'javascript',
        'typescript',
        'cpp',
        'python',
        'java',
        'make',
        'cmake',
        'dockerfile',
      ];
      for (const lang of languages) {
        assert.strictEqual(isSupportedLanguage(lang), true);
      }
    });

    it('returns false for unsupported strings', () => {
      assert.strictEqual(isSupportedLanguage('rust'), false);
      assert.strictEqual(isSupportedLanguage('go'), false);
      assert.strictEqual(isSupportedLanguage('unknown'), false);
    });
  });
});