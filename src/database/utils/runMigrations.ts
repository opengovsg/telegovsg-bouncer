import * as path from 'path';
import { promises as fs } from 'fs';
import { Migrator, FileMigrationProvider } from 'kysely';
import { config } from 'dotenv';
import { generateDb } from './generateDb';

config();

const migrateToLatest = async () => {
  const database = await generateDb();

  const migrator = new Migrator({
    db: database,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, '../migrations'),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((migrationResult) => {
    if (migrationResult.status === 'Success') {
      console.log(
        `Migration "${migrationResult.migrationName}" was executed successfully`,
      );
    } else if (migrationResult.status === 'Error') {
      console.error(
        `Failed to execute migration "${migrationResult.migrationName}"`,
      );
    }
  });

  if (error) {
    console.error('Failed to migrate');
    console.error(error);
    process.exit(1);
  }

  await database.destroy();
};

migrateToLatest();
