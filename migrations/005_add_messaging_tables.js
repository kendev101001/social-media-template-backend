
// Migration: Add messaging tables (merged for future group support)
module.exports = {
    async up(db) {
        await db.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id              TEXT PRIMARY KEY,
        type            TEXT DEFAULT 'direct' CHECK(type IN ('direct', 'group')),
        name            TEXT,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_message_at DATETIME
      )
    `);
        console.log(' Created conversations table');

        await db.run(`
      CREATE TABLE IF NOT EXISTS conversation_participants (
        conversation_id TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        joined_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (conversation_id, user_id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE
      )
    `);
        console.log(' Created conversation_participants table');

        await db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id       TEXT NOT NULL,
        content         TEXT NOT NULL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id)       REFERENCES users(id)         ON DELETE CASCADE
      )
    `);
        console.log(' Created messages table');

        // Indexes
        await db.run(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
                  ON messages(conversation_id, created_at DESC)`);
        await db.run(`CREATE INDEX IF NOT EXISTS idx_conversation_participants_user 
                  ON conversation_participants(user_id)`);
        console.log(' Created indexes');
    },

    async down(db) {
        await db.run('DROP INDEX IF EXISTS idx_conversation_participants_user');
        await db.run('DROP INDEX IF EXISTS idx_messages_conversation_created');
        await db.run('DROP TABLE IF EXISTS messages');
        await db.run('DROP TABLE IF EXISTS conversation_participants');
        await db.run('DROP TABLE IF EXISTS conversations');
        console.log(' Dropped messaging tables and indexes');
    }
};