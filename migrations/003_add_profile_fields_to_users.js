// Migration: Add profile fields to users table (name, bio, link)

module.exports = {
    async up(db) {
        // Check and add each column if it doesn't exist
        const tableInfo = await db.all('PRAGMA table_info(users)');
        const columns = tableInfo.map(col => col.name);

        if (!columns.includes('name')) {
            await db.run('ALTER TABLE users ADD COLUMN name TEXT DEFAULT ""');
            console.log('  Added name column to users table');
        }

        if (!columns.includes('bio')) {
            await db.run('ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ""');
            console.log('  Added bio column to users table');
        }

        if (!columns.includes('link')) {
            await db.run('ALTER TABLE users ADD COLUMN link TEXT DEFAULT ""');
            console.log('  Added link column to users table');
        }
    },

    async down(db) {
        // SQLite doesn't support DROP COLUMN directly
        // We need to recreate the table without these columns

        await db.run('BEGIN TRANSACTION');

        try {
            await db.run(`
                CREATE TABLE users_backup (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await db.run(`
                INSERT INTO users_backup (id, email, username, password, created_at)
                SELECT id, email, username, password, created_at FROM users
            `);

            await db.run('DROP TABLE users');
            await db.run('ALTER TABLE users_backup RENAME TO users');

            await db.run('COMMIT');
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    }
};