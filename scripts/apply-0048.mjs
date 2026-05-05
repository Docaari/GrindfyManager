import pg from 'pg';
import 'dotenv/config';

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS warmup_setup_items jsonb DEFAULT NULL');
  console.log('OK migration 0048 applied');
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
