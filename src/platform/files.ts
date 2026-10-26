import { isNative } from './index';

/** Save a text file. Web: download link. Native: write to the cache directory and open the share sheet. */
export async function saveTextFile(name: string, text: string): Promise<'saved' | 'shared'> {
  if (isNative) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const result = await Filesystem.writeFile({
      path: name,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: 'Pandaro backup',
      files: [result.uri],
      dialogTitle: 'Save your Pandaro backup',
    });
    return 'shared';
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}
