const sqlite3 = require('sqlite3').verbose();
const { profile } = require('console');
const path = require('path');

class Database {
    constructor() {
        // Creates or opens a SQLite database file named 'social_media.db' in the same directory
        // If the file doesn't exist, SQLite will create it automatically
        this.db = new sqlite3.Database(path.join(__dirname, 'social_media.db'));
    }

    // ==================== USER METHODS ====================

    /**
     * Retrieves a single user record by their email address
     * SQL: SELECT * FROM users WHERE email = ?
     * - SELECT * means "get all columns"
     * - FROM users specifies the table
     * - WHERE email = ? filters to only rows where email matches the parameter
     * - ? is a placeholder for parameterized queries (prevents SQL injection)
     */
    getUserByEmail(email) {
        return new Promise((resolve, reject) => {
            // db.get() returns only the FIRST matching row (or undefined if no match)
            this.db.get(
                'SELECT * FROM users WHERE email = ?',
                [email], // This array replaces the ? placeholders in order
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row); // row will be undefined if no user found
                }
            );
        });
    }

    /**
     * Similar to getUserByEmail but searches by username instead
     * Returns a single user object or undefined
     */
    getUserByUsername(username) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM users WHERE username = ?',
                [username],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    /**
     * Inserts a new user into the users table
     * SQL: INSERT INTO users (id, email, username, password) VALUES (?, ?, ?, ?)
     * - INSERT INTO users specifies the table
     * - (id, email, username, password) lists the columns we're inserting into
     * - VALUES (?, ?, ?, ?) provides the values for those columns
     * - Each ? gets replaced by values from the array in order
     */
    createUser(user) {
        return new Promise((resolve, reject) => {
            // db.run() executes a query that doesn't return data (INSERT, UPDATE, DELETE)
            this.db.run(
                'INSERT INTO users (id, email, username, password) VALUES (?, ?, ?, ?)',
                [user.id, user.email, user.username, user.password],
                function (err) {
                    if (err) reject(err);
                    else resolve(user); // Returns the user object that was passed in
                }
            );
        });
    }

    /**
     * Complex search query that finds users and includes their follower/following relationships
     * This demonstrates JOIN operations and aggregate functions
     */
    searchUsers(query, currentUserId) {
        return new Promise((resolve, reject) => {
            // db.all() returns ALL matching rows (unlike db.get which returns just one)
            this.db.all(
                `SELECT 
                    u.id,
                    u.username,
                    u.email,
                    -- GROUP_CONCAT combines multiple rows into a single comma-separated string
                    -- DISTINCT ensures no duplicate values
                    GROUP_CONCAT(DISTINCT f1.follower_id) as followers,
                    GROUP_CONCAT(DISTINCT f2.following_id) as following
                FROM users u
                -- LEFT JOIN includes all users even if they have no followers/following
                -- f1 gets followers: people who follow this user
                LEFT JOIN follows f1 ON u.id = f1.following_id
                -- f2 gets following: people this user follows
                LEFT JOIN follows f2 ON u.id = f2.follower_id
                -- LIKE with % wildcards allows partial matching (e.g., '%john%' matches 'johnson', 'john123', etc.)
                WHERE u.username LIKE ? AND u.id != ?
                -- GROUP BY is required when using aggregate functions like GROUP_CONCAT
                GROUP BY u.id
                -- Limits results to 20 users maximum
                LIMIT 20`,
                [`%${query}%`, currentUserId], // %query% allows matching anywhere in username
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        // Post-processing: convert comma-separated strings back to arrays
                        const users = rows.map(row => ({
                            ...row,
                            followers: row.followers ? row.followers.split(',') : [],
                            following: row.following ? row.following.split(',') : [],
                        }));
                        resolve(users);
                    }
                }
            );
        });
    }

    /**
     * Gets statistics for a user using subqueries
     * Each SELECT COUNT(*) is a separate subquery that counts rows
     */
    getUserStats(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT
                    -- Subquery 1: counts all posts by this user
                    (SELECT COUNT(*) FROM posts WHERE user_id = ?) as posts,
                    -- Subquery 2: counts people following this user
                    (SELECT COUNT(*) FROM follows WHERE following_id = ?) as followers,
                    -- Subquery 3: counts people this user follows
                    (SELECT COUNT(*) FROM follows WHERE follower_id = ?) as following`,
                [userId, userId, userId], // Same userId used for all three ? placeholders
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row); // Returns object like: {posts: 5, followers: 10, following: 8}
                }
            );
        });
    }

    /**
     * Gets user profile information (excluding sensitive data like password)
     * Explicitly lists columns instead of using * for security
     */
    getUserById(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT id, email, username, name, bio, link, created_at FROM users WHERE id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    /**
     * Updates user profile fields
     * SQL: UPDATE sets new values for specified columns
     */
    updateUserProfile(userId, profileData) {
        return new Promise((resolve, reject) => {
            const { name, username, bio, link } = profileData;

            // UPDATE users SET ... WHERE id = ? ensures we only update one user
            this.db.run(
                `UPDATE users 
                 SET name = ?, username = ?, bio = ?, link = ?
                 WHERE id = ?`,
                [name || '', username, bio || '', link || '', userId], // || '' provides default empty string
                (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    // After update, fetch and return the updated user data
                    this.db.get(
                        'SELECT id, email, username, name, bio, link, created_at FROM users WHERE id = ?',
                        [userId],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                }
            );
        });
    }

    // ==================== POST METHODS ====================

    /**
     * Gets a single post by ID
     * Simple SELECT with WHERE clause
     */
    getPost(postId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM posts WHERE id = ?',
                [postId],
                (err, row) => {
                    if (err) reject(err);
                    else if (!row) resolve(null); // Explicitly return null if post not found
                    else resolve({
                        // Remapping column names from snake_case to camelCase
                        id: row.id,
                        userId: row.user_id,
                        content: row.content,
                        imageUrl: row.image_url,
                        createdAt: row.created_at,
                        updatedAt: row.updated_at,
                    });
                }
            );
        });
    }

    /**
     * Gets posts for a user's feed (posts from people they follow + their own posts)
     * Complex query with multiple JOINs and subquery
     */
    getFeedPosts(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                    p.*,  -- All columns from posts table
                    u.username,  -- Username from users table
                    GROUP_CONCAT(DISTINCT l.user_id) as likes  -- List of user IDs who liked this post
                FROM posts p
                JOIN users u ON p.user_id = u.id  -- Join to get username
                LEFT JOIN likes l ON p.id = l.post_id  -- Left join to get likes (posts with no likes still included)
                WHERE p.user_id IN (
                    -- Subquery: gets all users that the current user follows
                    SELECT following_id FROM follows WHERE follower_id = ?
                ) OR p.user_id = ?  -- Also include the user's own posts
                GROUP BY p.id  -- Required for GROUP_CONCAT
                ORDER BY p.created_at DESC  -- Most recent posts first
                LIMIT 50 --Maximum 50 posts`,
                [userId, userId],
                async (err, rows) => {
                    if (err) reject(err);
                    else {
                        // For each post, also fetch its comments (separate query)
                        const posts = await Promise.all(rows.map(async row => {
                            const comments = await this.getPostComments(row.id);
                            return {
                                id: row.id,
                                userId: row.user_id,
                                username: row.username,
                                content: row.content,
                                imageUrl: row.image_url,
                                likes: row.likes ? row.likes.split(',') : [], // Convert string to array
                                comments: comments,
                                createdAt: row.created_at,
                                updatedAt: row.updated_at,
                            };
                        }));
                        resolve(posts);
                    }
                }
            );
        });
    }

    /**
     * Gets random posts from users the current user doesn't follow (for discovery)
     * Similar to getFeedPosts but with opposite filter logic
     */
    getExplorePosts(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                    p.*,
                    u.username,
                    GROUP_CONCAT(DISTINCT l.user_id) as likes
                FROM posts p
                JOIN users u ON p.user_id = u.id
                LEFT JOIN likes l ON p.id = l.post_id
                WHERE p.user_id != ?  -- Exclude user's own posts
                AND p.user_id NOT IN (  -- Exclude posts from people they already follow
                    SELECT following_id FROM follows WHERE follower_id = ?
                )
                GROUP BY p.id
                ORDER BY RANDOM()  -- SQLite function for random ordering
                LIMIT 50`,
                [userId, userId],
                async (err, rows) => {
                    if (err) reject(err);
                    else {
                        const posts = await Promise.all(rows.map(async row => {
                            const comments = await this.getPostComments(row.id);
                            return {
                                id: row.id,
                                userId: row.user_id,
                                username: row.username,
                                content: row.content,
                                imageUrl: row.image_url,
                                likes: row.likes ? row.likes.split(',') : [],
                                comments: comments,
                                createdAt: row.created_at,
                                updatedAt: row.updated_at,
                            };
                        }));
                        resolve(posts);
                    }
                }
            );
        });
    }

    /**
     * Gets all posts from a specific user
     * Similar to getFeedPosts but filtered to single user
     */
    getUserPosts(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                    p.*,
                    u.username,
                    GROUP_CONCAT(DISTINCT l.user_id) as likes
                FROM posts p
                JOIN users u ON p.user_id = u.id
                LEFT JOIN likes l ON p.id = l.post_id
                WHERE p.user_id = ?  -- Only posts from this specific user
                GROUP BY p.id
                ORDER BY p.created_at DESC --Most recent first`,
                [userId],
                async (err, rows) => {
                    if (err) reject(err);
                    else {
                        const posts = await Promise.all(rows.map(async row => {
                            const comments = await this.getPostComments(row.id);
                            return {
                                id: row.id,
                                userId: row.user_id,
                                username: row.username,
                                content: row.content,
                                imageUrl: row.image_url,
                                likes: row.likes ? row.likes.split(',') : [],
                                comments: comments,
                                createdAt: row.created_at,
                                updatedAt: row.updated_at,
                            };
                        }));
                        resolve(posts);
                    }
                }
            );
        });
    }

    /**
     * Creates a new post
     * Demonstrates INSERT with multiple columns and timestamp handling
     */
    createPost(post) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString(); // Current timestamp in ISO format
            this.db.run(
                'INSERT INTO posts (id, user_id, content, image_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                [post.id, post.userId, post.content, post.imageUrl || null, now, now],
                function (err) {
                    if (err) reject(err);
                    else resolve({
                        id: post.id,
                        userId: post.userId,
                        content: post.content,
                        imageUrl: post.imageUrl || null,
                        createdAt: now,
                        updatedAt: now,
                    });
                }
            );
        });
    }

    /**
     * Deletes a post
     * Simple DELETE with WHERE clause
     * Note: This doesn't handle cascade deletion of likes/comments (should be handled by foreign keys)
     */
    deletePost(postId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM posts WHERE id = ?',
                [postId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    // ==================== LIKE METHODS ====================

    /**
     * Checks if a user has liked a post
     * Returns boolean (true if liked, false if not)
     */
    isPostLiked(postId, userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM likes WHERE post_id = ? AND user_id = ?',
                [postId, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row); // !! converts truthy/falsy to boolean
                }
            );
        });
    }

    /**
     * Adds a like to a post
     * INSERT OR IGNORE prevents duplicate likes (assumes unique constraint on post_id + user_id)
     */
    likePost(postId, userId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR IGNORE INTO likes (post_id, user_id) VALUES (?, ?)',
                [postId, userId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    /**
     * Removes a like from a post
     * DELETE with compound WHERE clause (both conditions must match)
     */
    unlikePost(postId, userId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM likes WHERE post_id = ? AND user_id = ?',
                [postId, userId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    // ==================== COMMENT METHODS ====================

    /**
     * Gets all comments for a post with user information
     * JOIN to include username with each comment
     */
    getPostComments(postId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                    c.*,  -- All columns from comments table
                    u.username  -- Username of commenter
                FROM comments c
                JOIN users u ON c.user_id = u.id  -- Join to get username
                WHERE c.post_id = ?
                ORDER BY c.created_at ASC  --Oldest comments first(chronological order)`,
                [postId],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        const comments = rows.map(row => ({
                            id: row.id,
                            postId: row.post_id,
                            userId: row.user_id,
                            username: row.username,
                            content: row.content,
                            createdAt: row.created_at,
                        }));
                        resolve(comments);
                    }
                }
            );
        });
    }

    /**
     * Adds a new comment to a post
     * Simple INSERT with timestamp
     */
    addComment(comment) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            this.db.run(
                'INSERT INTO comments (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
                [comment.id, comment.postId, comment.userId, comment.content, now],
                function (err) {
                    if (err) reject(err);
                    else resolve({
                        id: comment.id,
                        postId: comment.postId,
                        userId: comment.userId,
                        content: comment.content,
                        createdAt: now,
                    });
                }
            );
        });
    }

    // ==================== FOLLOW METHODS ====================

    /**
     * Checks if one user follows another
     * Returns boolean
     */
    isFollowing(followerId, followingId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM follows WHERE follower_id = ? AND following_id = ?',
                [followerId, followingId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });
    }

    /**
     * Creates a follow relationship
     * INSERT OR IGNORE prevents duplicate follows
     */
    followUser(followerId, followingId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)',
                [followerId, followingId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    /**
     * Removes a follow relationship
     * DELETE with compound WHERE
     */
    unfollowUser(followerId, followingId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
                [followerId, followingId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    /**
     * Gets list of users who follow a specific user
     * JOIN between users and follows tables
     */
    getFollowers(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                u.id, 
                u.username, 
                u.name, 
                u.bio,
                GROUP_CONCAT(DISTINCT f1.follower_id) as followers,
                GROUP_CONCAT(DISTINCT f2.following_id) as following
             FROM users u
             JOIN follows f ON u.id = f.follower_id
             LEFT JOIN follows f1 ON u.id = f1.following_id
             LEFT JOIN follows f2 ON u.id = f2.follower_id
             WHERE f.following_id = ?
             GROUP BY u.id`,
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        const users = rows.map(row => ({
                            ...row,
                            followers: row.followers ? row.followers.split(',') : [],
                            following: row.following ? row.following.split(',') : [],
                        }));
                        resolve(users);
                    }
                }
            );
        });
    }

    /**
     * Gets list of users that a specific user follows
     * Similar to getFollowers but with reversed relationship
     */
    getFollowing(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                u.id, 
                u.username, 
                u.name, 
                u.bio,
                GROUP_CONCAT(DISTINCT f1.follower_id) as followers,
                GROUP_CONCAT(DISTINCT f2.following_id) as following
             FROM users u
             JOIN follows f ON u.id = f.following_id
             LEFT JOIN follows f1 ON u.id = f1.following_id
             LEFT JOIN follows f2 ON u.id = f2.follower_id
             WHERE f.follower_id = ?
             GROUP BY u.id`,
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        const users = rows.map(row => ({
                            ...row,
                            followers: row.followers ? row.followers.split(',') : [],
                            following: row.following ? row.following.split(',') : [],
                        }));
                        resolve(users);
                    }
                }
            );
        });
    }

    getFollowersWithDetails(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                u.id, 
                u.username, 
                u.name, 
                u.bio,
                GROUP_CONCAT(DISTINCT f1.follower_id) as followers,
                GROUP_CONCAT(DISTINCT f2.following_id) as following
            FROM users u
            JOIN follows f ON u.id = f.follower_id
            LEFT JOIN follows f1 ON u.id = f1.following_id
            LEFT JOIN follows f2 ON u.id = f2.follower_id
            WHERE f.following_id = ?
            GROUP BY u.id`,
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        const users = rows.map(row => ({
                            ...row,
                            followers: row.followers ? row.followers.split(',') : [],
                            following: row.following ? row.following.split(',') : [],
                        }));
                        resolve(users);
                    }
                }
            );
        });
    }

    getFollowingWithDetails(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                u.id, 
                u.username, 
                u.name, 
                u.bio,
                GROUP_CONCAT(DISTINCT f1.follower_id) as followers,
                GROUP_CONCAT(DISTINCT f2.following_id) as following
            FROM users u
            JOIN follows f ON u.id = f.following_id
            LEFT JOIN follows f1 ON u.id = f1.following_id
            LEFT JOIN follows f2 ON u.id = f2.follower_id
            WHERE f.follower_id = ?
            GROUP BY u.id`,
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        const users = rows.map(row => ({
                            ...row,
                            followers: row.followers ? row.followers.split(',') : [],
                            following: row.following ? row.following.split(',') : [],
                        }));
                        resolve(users);
                    }
                }
            );
        });
    }

    // ==================== BOOKMARK METHODS ====================

    /**
     * Checks if a user has bookmarked a post
     * Returns boolean (true if bookmarked, false if not)
     */
    isPostBookmarked(postId, userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM bookmarks WHERE post_id = ? AND user_id = ?',
                [postId, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row); // !! converts truthy/falsy to boolean
                }
            );
        });
    }

    /**
     * Adds a bookmark to a post
     * INSERT OR IGNORE prevents duplicate bookmarks
     */
    bookmarkPost(postId, userId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR IGNORE INTO bookmarks (post_id, user_id) VALUES (?, ?)',
                [postId, userId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    /**
     * Removes a bookmark from a post
     * DELETE with compound WHERE clause (both conditions must match)
     */
    unbookmarkPost(postId, userId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM bookmarks WHERE post_id = ? AND user_id = ?',
                [postId, userId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    /**
     * Gets all bookmarked posts for a user
     * Similar to getFeedPosts but filtered to bookmarked posts only
     */
    getBookmarkedPosts(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                p.*,
                u.username,
                GROUP_CONCAT(DISTINCT l.user_id) as likes
            FROM posts p
            JOIN users u ON p.user_id = u.id
            JOIN bookmarks b ON p.id = b.post_id
            LEFT JOIN likes l ON p.id = l.post_id
            WHERE b.user_id = ?  -- Only bookmarked posts by this user
            GROUP BY p.id
            ORDER BY b.created_at DESC  -- Most recently bookmarked first`,
                [userId],
                async (err, rows) => {
                    if (err) reject(err);
                    else {
                        const posts = await Promise.all(rows.map(async row => {
                            const comments = await this.getPostComments(row.id);
                            return {
                                id: row.id,
                                userId: row.user_id,
                                username: row.username,
                                content: row.content,
                                imageUrl: row.image_url,
                                likes: row.likes ? row.likes.split(',') : [],
                                comments: comments,
                                createdAt: row.created_at,
                                updatedAt: row.updated_at,
                            };
                        }));
                        resolve(posts);
                    }
                }
            );
        });
    }

    // ==================== MESSAGING METHODS ====================
    // (Merged: explicit group support, last_message_at for sorting, pagination on messages)

    // Helper: Promise-based db.run
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, (err) => err ? reject(err) : resolve());
        });
    }

    // Helper: Promise-based db.get
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
        });
    }

    // Helper: Promise-based db.all
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
        });
    }

    async createConversation(id, type = 'direct', name = null) {
        const now = new Date().toISOString();
        await this.run(
            'INSERT INTO conversations (id, type, name, created_at) VALUES (?, ?, ?, ?)',
            [id, type, name, now]
        );
        return { id, type, name, createdAt: now, lastMessageAt: null };
    }

    async addParticipant(conversationId, userId) {
        await this.run(
            'INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
            [conversationId, userId]
        );
    }

    async findDirectConversationBetween(userId1, userId2) {
        const row = await this.get(`
    SELECT c.id
    FROM conversations c
    JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = ?
    JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id = ?
    WHERE c.type = 'direct' 
      AND (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = c.id) = 2
  `, [userId1, userId2]);
        return row?.id || null;
    }

    async getOrCreateDirectConversation(user1, user2, newId = require('crypto').randomUUID()) {
        let convId = await this.findDirectConversationBetween(user1, user2);
        let created = false;

        if (!convId) {
            await this.createConversation(newId, 'direct');
            await this.addParticipant(newId, user1);
            await this.addParticipant(newId, user2);
            convId = newId;
            created = true;
        }

        return { id: convId, created };
    }

    getConversation(conversationId) {
        return new Promise(async (resolve, reject) => {
            try {
                const row = await this.get('SELECT * FROM conversations WHERE id = ?', [conversationId]);
                if (!row) return resolve(null);
                const participants = await this.getConversationParticipants(conversationId);
                const lastMessage = await this.getLastMessage(conversationId);
                resolve({
                    id: row.id,
                    type: row.type,
                    name: row.name,
                    participants,
                    lastMessage,
                    createdAt: row.created_at,
                    lastMessageAt: row.last_message_at
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    getConversationParticipants(conversationId) {
        return this.all(`
    SELECT u.id, u.username, u.name
    FROM users u
    JOIN conversation_participants cp ON u.id = cp.user_id
    WHERE cp.conversation_id = ?
  `, [conversationId]);
    }

    getLastMessage(conversationId) {
        return this.get(`
    SELECT m.*, u.username AS senderUsername
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at DESC
    LIMIT 1
  `, [conversationId]).then(row => row ? {
            id: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id,
            senderUsername: row.senderUsername,
            content: row.content,
            createdAt: row.created_at
        } : null);
    }

    getUserConversations(userId) {
        return new Promise(async (resolve, reject) => {
            try {
                const rows = await this.all(`
        SELECT c.*
        FROM conversations c
        JOIN conversation_participants cp ON c.id = cp.conversation_id
        WHERE cp.user_id = ?
        GROUP BY c.id
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
      `, [userId]);
                const convs = await Promise.all(rows.map(r => this.getConversation(r.id)));
                resolve(convs);
            } catch (err) {
                reject(err);
            }
        });
    }

    getConversationMessages(conversationId, { limit = 50, before = null } = {}) {
        let query = `
    SELECT m.*, u.username AS senderUsername
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = ?
  `;
        const params = [conversationId];

        if (before) {
            query += ' AND m.created_at < ?';
            params.push(before);
        }

        query += ' ORDER BY m.created_at DESC LIMIT ?';
        params.push(limit);

        return this.all(query, params).then(rows =>
            rows.reverse().map(r => ({
                id: r.id,
                conversationId: r.conversation_id,
                senderId: r.sender_id,
                senderUsername: r.senderUsername,
                content: r.content,
                createdAt: r.created_at
            }))
        );
    }

    async createMessage({ id, conversationId, senderId, content }) {
        const now = new Date().toISOString();
        await this.run(
            'INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
            [id, conversationId, senderId, content, now]
        );
        await this.run(
            'UPDATE conversations SET last_message_at = ? WHERE id = ?',
            [now, conversationId]
        );

        return this.get(`
    SELECT m.*, u.username AS senderUsername
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE m.id = ?
  `, [id]).then(row => ({
            id: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id,
            senderUsername: row.senderUsername,
            content: row.content,
            createdAt: row.created_at
        }));
    }

    isParticipant(conversationId, userId) {
        return this.get(
            'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
            [conversationId, userId]
        ).then(r => !!r);
    }
}

module.exports = Database;