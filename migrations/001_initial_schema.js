// Migration: Initial database schema
// This captures the existing schema for new installations

module.exports = {
    async up(db) {
        // Users table
        await db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Posts table
        await db.run(`
            CREATE TABLE IF NOT EXISTS posts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Likes table
        await db.run(`
            CREATE TABLE IF NOT EXISTS likes (
                post_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (post_id, user_id),
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Comments table
        await db.run(`
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                post_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Follows table
        await db.run(`
            CREATE TABLE IF NOT EXISTS follows (
                follower_id TEXT NOT NULL,
                following_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (follower_id, following_id),
                FOREIGN KEY (follower_id) REFERENCES users(id),
                FOREIGN KEY (following_id) REFERENCES users(id)
            )
        `);

        // Create indexes for better performance
        await db.run('CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)');
        await db.run('CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)');
    },

    async down(db) {
        // Reverse migration - drop all tables
        // WARNING: This will delete all data!
        await db.run('DROP TABLE IF EXISTS follows');
        await db.run('DROP TABLE IF EXISTS comments');
        await db.run('DROP TABLE IF EXISTS likes');
        await db.run('DROP TABLE IF EXISTS posts');
        await db.run('DROP TABLE IF EXISTS users');
    }
};