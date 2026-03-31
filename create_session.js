require('dotenv').config();
const knex = require('./db');

async function createTable() {
  try {
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      ) WITH (OIDS=FALSE);
    `);
    try {
      await knex.raw(`ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;`);
    } catch(e) {}
    try {
      await knex.raw(`CREATE INDEX "IDX_session_expire" ON "session" ("expire");`);
    } catch(e) {}
    console.log('Session table created');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
createTable();
