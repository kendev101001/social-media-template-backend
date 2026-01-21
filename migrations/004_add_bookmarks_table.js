// Migration: Add bookmarks table

module.exports = {
    async up(db) {
        // Create bookmarks table
        await db.run(`
            CREATE TABLE IF NOT EXISTS bookmarks (
                user_id TEXT NOT NULL,
                post_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, post_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
            )
        `);
        console.log('  Created bookmarks table');

        // Create index for faster queries
        await db.run(`
            CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id 
            ON bookmarks(user_id)
        `);
        console.log('  Created index on bookmarks.user_id');
    },

    async down(db) {
        await db.run('DROP INDEX IF EXISTS idx_bookmarks_user_id');
        await db.run('DROP TABLE IF EXISTS bookmarks');
        console.log('  Dropped bookmarks table and index');
    }
};