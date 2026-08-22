import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const seedDir = path.join(root, '.seed');
const chunks = fs.readdirSync(seedDir)
  .filter(name => name.startsWith('source.tgz.b64.'))
  .sort();

if (!chunks.length) throw new Error('No source archive chunks found');
const encoded = chunks.map(name => fs.readFileSync(path.join(seedDir, name), 'utf8').trim()).join('');
const archive = Buffer.from(encoded, 'base64');
const hash = crypto.createHash('sha256').update(archive).digest('hex');
const expected = '005a106622f033c9988c293db8403163ba0d2b7a8f374c804dbad4e811daad74';
if (hash !== expected) throw new Error(`Source archive checksum mismatch: ${hash}`);
const temp = path.join(os.tmpdir(), `social-publisher-source-${process.pid}.tgz`);
fs.writeFileSync(temp, archive);
execFileSync('tar', ['-xzf', temp, '-C', root], { stdio: 'inherit' });
fs.unlinkSync(temp);
for (const rel of ['public/app.js', 'src/index.js']) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`Restore failed: ${rel} missing`);
}
console.log(`Restored Social Publisher source from ${chunks.length} verified chunks.`);
