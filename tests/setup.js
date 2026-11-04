import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { newDb } from "pg-mem";
import { setPool } from "../server/db.js";
import { createApp } from "../server/app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function setupTestEnvironment() {
  const memDb = newDb();
  memDb.public.registerFunction({name:'trim',args:['text'],returns:'text',implementation:s=>s.trim()});
  memDb.public.registerFunction({name:'replace', args:['text','text','text'], returns:'text', implementation:(s,a,b)=>s.split(a).join(b)});
  const schemaPath = path.resolve(__dirname, "..", "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf-8");

  memDb.public.none(schemaSql);

  const pgAdapter = memDb.adapters.createPg();
  const pool = new pgAdapter.Pool();

  setPool(pool);

  const app = createApp();

  return {
    memDb,
    pool,
    app,
  };
}

export default setupTestEnvironment;
