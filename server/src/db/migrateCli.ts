import { loadConfig } from '../config.js';
import { migrate } from './migrate.js';
import { Database } from './pool.js';

const config = loadConfig();
const db = new Database(config.databaseUrls, 2, (m) => console.log(m));
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
} finally {
  await db.close();
}
