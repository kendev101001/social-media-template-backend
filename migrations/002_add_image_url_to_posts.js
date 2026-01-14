// Migration: Add image_url column to posts table

module.exports = {
    async up(db) {
        // Check if column already exists (safety check)
        const tableInfo = await db.all('PRAGMA table_info(posts)');
        const columns = tableInfo.map(col => col.name);

        if (!columns.includes('image_url')) {
            await db.run('ALTER TABLE posts ADD COLUMN image_url TEXT');
            console.log('  Added image_url column to posts table');
        } else {
            console.log('  image_url column already exists, skipping');
        }
    },

    async down(db) {
        // SQLite doesn't support DROP COLUMN directly
        // We need to recreate the table without the column

        await db.run('BEGIN TRANSACTION');

        try {
            // Create temporary table without image_url
            await db.run(`
                CREATE TABLE posts_backup (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `);

            // Copy data
            await db.run(`
                INSERT INTO posts_backup (id, user_id, content, created_at, updated_at)
                SELECT id, user_id, content, created_at, updated_at FROM posts
            `);

            // Drop original and rename
            await db.run('DROP TABLE posts');
            await db.run('ALTER TABLE posts_backup RENAME TO posts');

            // Recreate indexes
            await db.run('CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id)');
            await db.run('CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at)');

            await db.run('COMMIT');
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    }
};