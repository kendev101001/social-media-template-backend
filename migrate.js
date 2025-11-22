const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'social_media.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

class Migrator {
    constructor() {
        this.db = new sqlite3.Database(DB_PATH);
    }

    // Run a query and return a promise
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    // Get all rows from a query
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Get a single row from a query
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    // Initialize migrations table
    async initMigrationsTable() {
        await this.run(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Migrations table ready');
    }

    // Get list of completed migrations
    async getCompletedMigrations() {
        const rows = await this.all('SELECT name FROM migrations ORDER BY id');
        return rows.map(row => row.name);
    }

    // Get all migration files
    getMigrationFiles() {
        if (!fs.existsSync(MIGRATIONS_DIR)) {
            fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
            return [];
        }

        return fs.readdirSync(MIGRATIONS_DIR)
            .filter(file => file.endsWith('.js'))
            .sort();
    }

    // Run all pending migrations
    async migrate() {
        await this.initMigrationsTable();

        const completed = await this.getCompletedMigrations();
        const files = this.getMigrationFiles();

        const pending = files.filter(file => !completed.includes(file));

        if (pending.length === 0) {
            console.log('✓ No pending migrations');
            return;
        }

        console.log(`Found ${pending.length} pending migration(s)`);

        for (const file of pending) {
            console.log(`\nRunning migration: ${file}`);

            const migration = require(path.join(MIGRATIONS_DIR, file));

            try {
                await migration.up(this);
                await this.run('INSERT INTO migrations (name) VALUES (?)', [file]);
                console.log(`✓ Completed: ${file}`);
            } catch (error) {
                console.error(`✗ Failed: ${file}`);
                console.error(error);
                throw error;
            }
        }

        console.log('\n✓ All migrations completed successfully');
    }

    // Rollback the last migration
    async rollback() {
        await this.initMigrationsTable();

        const completed = await this.getCompletedMigrations();

        if (completed.length === 0) {
            console.log('No migrations to rollback');
            return;
        }

        const lastMigration = completed[completed.length - 1];
        console.log(`Rolling back: ${lastMigration}`);

        const migration = require(path.join(MIGRATIONS_DIR, lastMigration));

        try {
            if (migration.down) {
                await migration.down(this);
            }
            await this.run('DELETE FROM migrations WHERE name = ?', [lastMigration]);
            console.log(`✓ Rolled back: ${lastMigration}`);
        } catch (error) {
            console.error(`✗ Rollback failed: ${lastMigration}`);
            console.error(error);
            throw error;
        }
    }

    // Show migration status
    async status() {
        await this.initMigrationsTable();

        const completed = await this.getCompletedMigrations();
        const files = this.getMigrationFiles();

        console.log('\nMigration Status:');
        console.log('─'.repeat(50));

        for (const file of files) {
            const status = completed.includes(file) ? '✓' : '○';
            console.log(`${status} ${file}`);
        }

        console.log('─'.repeat(50));
        console.log(`Total: ${files.length} | Completed: ${completed.length} | Pending: ${files.length - completed.length}`);
    }

    close() {
        this.db.close();
    }
}

// CLI handling
async function main() {
    const command = process.argv[2] || 'migrate';
    const migrator = new Migrator();

    try {
        switch (command) {
            case 'migrate':
            case 'up':
                await migrator.migrate();
                break;
            case 'rollback':
            case 'down':
                await migrator.rollback();
                break;
            case 'status':
                await migrator.status();
                break;
            default:
                console.log('Usage: node migrate.js [migrate|rollback|status]');
        }
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    } finally {
        migrator.close();
    }
}

main();

module.exports = Migrator;