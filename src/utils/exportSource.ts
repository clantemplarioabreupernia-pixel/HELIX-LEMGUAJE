const SOURCE_MODULES = import.meta.glob(
  [
    '/src/**/*.{ts,tsx,css}',
    '/server.ts',
    '/index.html',
    '/package.json',
    '/tsconfig.json',
    '/vite.config.ts',
    '/metadata.json',
  ],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

export function getAllSourceFiles(): { path: string; content: string }[] {
  return Object.entries(SOURCE_MODULES)
    .map(([path, content]) => ({ path, content }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function downloadAllSourceCodeTxt(): void {
  const files = getAllSourceFiles();
  const bundle = files
    .map(
      ({ path, content }) =>
        `${'='.repeat(76)}\nARCHIVO: ${path}\n${'='.repeat(76)}\n${content.trimEnd()}\n`,
    )
    .join('\n\n');

  const blob = new Blob([bundle], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'helix-os-codigo-fuente-completo.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
