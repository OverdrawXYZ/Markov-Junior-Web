/** Trigger a browser download of `data`. */
export function download(filename: string, data: Blob): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A filesystem-friendly version of a name: "Drunkard's walk" → "drunkards-walk". */
export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'program'
  );
}

export const baseName = (filename: string) => filename.replace(/\.[^.]*$/, '');
