// "830 KB", "2,4 MB": base 1024, coma decimal (es-AR). Un solo decimal y solo en MB o más.
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1).replace('.', ',')} MB`;
  return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;
}
