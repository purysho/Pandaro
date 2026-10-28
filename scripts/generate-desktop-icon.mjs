import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pngToIco from 'png-to-ico';

const source = resolve('public/icons/icon-512.png');
const destination = resolve('assets/pandaro.ico');
await writeFile(destination, await pngToIco(await readFile(source)));
console.log(`Wrote ${destination}`);
