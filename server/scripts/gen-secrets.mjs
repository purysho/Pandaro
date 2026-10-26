// Print fresh secrets for a Pandaro API deployment (.env format). Never commit the output.
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const b64 = (n) => randomBytes(n).toString('base64');
const { privateKey } = generateKeyPairSync('ed25519');
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
console.log(`PEPPER=${b64(32)}`);
console.log(`JWT_PRIVATE_KEY=${Buffer.from(pem).toString('base64')}`);
console.log('JWT_KEY_ID=k1');
console.log(`KEKS=k1:${b64(32)}`);
console.log('ACTIVE_KEK=k1');
console.log(`BACKUP_KEY=${b64(32)}`);
console.log(`POSTGRES_PASSWORD=${randomBytes(18).toString('base64url')}`);
console.log(`REPLICATION_PASSWORD=${randomBytes(18).toString('base64url')}`);
