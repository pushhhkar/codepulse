export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'cpp'
  | 'python'
  | 'java'
  | 'make'
  | 'cmake'
  | 'dockerfile';

export interface LanguageInfo {
  language: SupportedLanguage;
  extension: string;
}

const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  // JavaScript / TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',

  // C++
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.c++': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.h++': 'cpp',
  '.h': 'cpp',

  // Python
  '.py': 'python',
  '.pyw': 'python',
  '.pyx': 'python',

  // Java
  '.java': 'java',
};

const FILENAME_MAP: Record<string, SupportedLanguage> = {
  'makefile': 'make',
  'cmakelists.txt': 'cmake',
  'dockerfile': 'dockerfile',
};

export function detectLanguageFromPath(filePath: string): SupportedLanguage | null {
  const lowerPath = filePath.toLowerCase();

  const filename = lowerPath.split('/').pop() ?? '';
  if (FILENAME_MAP[filename]) {
    return FILENAME_MAP[filename];
  }

  const lastDot = lowerPath.lastIndexOf('.');
  if (lastDot === -1) return null;

  const ext = lowerPath.slice(lastDot);
  return EXTENSION_MAP[ext] ?? null;
}

export function detectLanguagesFromPaths(paths: string[]): Map<string, SupportedLanguage> {
  const result = new Map<string, SupportedLanguage>();
  for (const path of paths) {
    const lang = detectLanguageFromPath(path);
    if (lang) {
      result.set(path, lang);
    }
  }
  return result;
}

export function getLanguageDisplayName(lang: SupportedLanguage): string {
  const names: Record<SupportedLanguage, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    cpp: 'C++',
    python: 'Python',
    java: 'Java',
    make: 'Make',
    cmake: 'CMake',
    dockerfile: 'Dockerfile',
  };
  return names[lang];
}

export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return [
    'javascript',
    'typescript',
    'cpp',
    'python',
    'java',
    'make',
    'cmake',
    'dockerfile',
  ].includes(lang);
}