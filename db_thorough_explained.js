const sqlite3 = require('sqlite3').verbose();
const { profile } = require('console');
const path = require('path');

class Database {
    constructor() {
        // ============================================================
        // DATABASE CONNECTION
        // ============================================================
        // sqlite3.Database() creates or opens a SQLite database file
        // path.join() safely constructs the file path across different OS
        // The database file 'social_media.db' will be created in the same
        // directory as this script if it doesn't exist
        this.db = new sqlite3.Database(path.join(__dirname, 'social_media.db'));
    }

    // ================================================================
    // ==================== USER METHODS ==============================
    // ================================================================

    /**
     * FIND A USER BY THEIR EMAIL ADDRESS
     * 
     * SQL: SELECT * FROM users WHERE email = ?
     * 
     * BREAKDOWN:
     * - SELECT *        : Retrieve ALL columns from the table
     *                     (id, email, username, password, name, bio, link, created_at)
     * - FROM users      : Look in the 'users' table
     * - WHERE email = ? : Filter rows where the email column matches our value
     * 
     * The '?' is a PARAMETERIZED QUERY (also called a "prepared statement"):
     * - Prevents SQL injection attacks (malicious user input)
     * - The actual value is passed separately in the array [email]
     * - SQLite safely escapes the value for you
     * 
     * BAD (vulnerable to SQL injection):
     *   `SELECT * FROM users WHERE email = '${email}'`
     * 
     * GOOD (safe):
     *   'SELECT * FROM users WHERE email = ?', [email]
     * 
     * db.get() returns ONLY THE FIRST matching row (or undefined if none)
     * Use this when you expect 0 or 1 result (emails should be unique)
     */
    getUserByEmail(email) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM users WHERE email = ?',
                [email],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row); // row is an object like {id: 1, email: '...', ...}
                }
            );
        });
    }

    /**
     * FIND A USER BY THEIR USERNAME
     * 
     * SQL: SELECT * FROM users WHERE username = ?
     * 
     * Identical pattern to getUserByEmail, just filtering on a different column.
     * Usernames should also be unique in your schema.
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
     * CREATE A NEW USER ACCOUNT
     * 
     * SQL: INSERT INTO users (id, email, username, password) VALUES (?, ?, ?, ?)
     * 
     * BREAKDOWN:
     * - INSERT INTO users  : Add a new row to the 'users' table
     * - (id, email, ...)   : Specify which columns we're providing values for
     * - VALUES (?, ?, ...) : The actual values, using parameterized placeholders
     * 
     * The order of VALUES must match the order of column names:
     *   (id, email, username, password)
     *   [user.id, user.email, user.username, user.password]
     * 
     * NOTE: The 'id' is being provided by the application (likely a UUID),
     * not auto-generated. If you wanted auto-increment, you'd omit 'id':
     *   INSERT INTO users (email, username, password) VALUES (?, ?, ?)
     * 
     * db.run() is used for INSERT, UPDATE, DELETE - queries that don't return data
     * 
     * 'function(err)' (not arrow function) gives access to 'this.lastID' and
     * 'this.changes' which tell you the inserted row ID and rows affected
     */
    createUser(user) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO users (id, email, username, password) VALUES (?, ?, ?, ?)',
                [user.id, user.email, user.username, user.password],
                function (err) {
                    if (err) reject(err);
                    else resolve(user);
                }
            );
        });
    }

    /**
     * SEARCH FOR USERS BY USERNAME (with follower/following info)
     * 
     * This is a COMPLEX QUERY demonstrating several advanced SQL concepts.
     * Let's break it down piece by piece:
     * 
     * SQL:
     * SELECT 
     *     u.id,
     *     u.username,
     *     u.email,
     *     GROUP_CONCAT(DISTINCT f1.follower_id) as followers,
     *     GROUP_CONCAT(DISTINCT f2.following_id) as following
     * FROM users u
     * LEFT JOIN follows f1 ON u.id = f1.following_id
     * LEFT JOIN follows f2 ON u.id = f2.follower_id
     * WHERE u.username LIKE ? AND u.id != ?
     * GROUP BY u.id
     * LIMIT 20
     * 
     * ============================================================
     * CONCEPT 1: TABLE ALIASES
     * ============================================================
     * 'FROM users u' - The 'u' is an ALIAS (nickname) for the users table
     * This lets us write 'u.id' instead of 'users.id'
     * Essential when joining the same table multiple times
     * 
     * ============================================================
     * CONCEPT 2: LEFT JOIN
     * ============================================================
     * LEFT JOIN keeps ALL rows from the left table (users) even if
     * there's no match in the right table (follows)
     * 
     * INNER JOIN would exclude users with no followers/following
     * 
     * Visual:
     *   users (LEFT)     follows (RIGHT)
     *   +--------+       +------------+
     *   | id: 1  | <---> | follower:2 |  ← Match found
     *   | id: 2  |       | following:1|
     *   | id: 3  | <---> | (no match) |  ← LEFT JOIN keeps this, INNER would drop it
     *   +--------+       +------------+
     * 
     * ============================================================
     * CONCEPT 3: SELF-REFERENTIAL JOINS
     * ============================================================
     * We join 'follows' TWICE with different aliases (f1, f2):
     * 
     * f1: Find who FOLLOWS this user (f1.following_id = user's id)
     *     f1.follower_id gives us the IDs of their followers
     * 
     * f2: Find who this user FOLLOWS (f2.follower_id = user's id)  
     *     f2.following_id gives us the IDs they're following
     * 
     * The 'follows' table structure:
     *   follower_id | following_id
     *   ------------|-------------
     *   2           | 1            ← User 2 follows User 1
     *   3           | 1            ← User 3 follows User 1
     *   1           | 4            ← User 1 follows User 4
     * 
     * ============================================================
     * CONCEPT 4: GROUP_CONCAT with DISTINCT
     * ============================================================
     * GROUP_CONCAT() combines multiple values into a comma-separated string
     * 
     * Without it, you'd get multiple rows per user (one for each follower)
     * With it, you get one row per user with all followers in one string
     * 
     * DISTINCT ensures no duplicates (important with multiple JOINs)
     * 
     * Example result: "2,3,5" (user IDs who follow this user)
     * 
     * ============================================================
     * CONCEPT 5: LIKE with Wildcards
     * ============================================================
     * 'WHERE u.username LIKE ?'
     * 
     * The value passed is `%${query}%` where:
     * - % is a wildcard meaning "any characters"
     * - So searching "john" becomes "%john%"
     * - This matches: "john", "johnny", "big_john", "john_doe"
     * 
     * Other wildcard: _ matches exactly one character
     *   'j_hn' matches 'john', 'jahn', but not 'johnn'
     * 
     * ============================================================
     * CONCEPT 6: GROUP BY
     * ============================================================
     * GROUP BY u.id - Combines all rows with the same user ID into one row
     * Required when using aggregate functions (GROUP_CONCAT, COUNT, SUM, etc.)
     * 
     * ============================================================
     * CONCEPT 7: LIMIT
     * ============================================================
     * LIMIT 20 - Return at most 20 results
     * Important for performance and pagination
     */
    searchUsers(query, currentUserId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                    u.id,
                    u.username,
                    u.email,
                    GROUP_CONCAT(DISTINCT f1.follower_id) as followers,
                    GROUP_CONCAT(DISTINCT f2.following_id) as following
                FROM users u
                LEFT JOIN follows f1 ON u.id = f1.following_id
                LEFT JOIN follows f2 ON u.id = f2.follower_id
                WHERE u.username LIKE ? AND u.id != ?
                GROUP BY u.id
                LIMIT 20`,
                [`%${query}%`, currentUserId],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        // Post-processing: Convert comma-separated strings to arrays
                        // "2,3,5" becomes ["2", "3", "5"]
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
     * GET STATISTICS FOR A USER (post count, followers, following)
     * 
     * SQL:
     * SELECT
     *     (SELECT COUNT(*) FROM posts WHERE user_id = ?) as posts,
     *     (SELECT COUNT(*) FROM follows WHERE following_id = ?) as followers,
     *     (SELECT COUNT(*) FROM follows WHERE follower_id = ?) as following
     * 
     * ============================================================
     * CONCEPT: SUBQUERIES (Scalar Subqueries)
     * ============================================================
     * A subquery is a query inside another query, wrapped in parentheses.
     * 
     * Each (SELECT COUNT(*) ...) is an independent mini-query that returns
     * a single value (hence "scalar" subquery).
     * 
     * This is equivalent to running 3 separate queries:
     *   Query 1: SELECT COUNT(*) FROM posts WHERE user_id = ?
     *   Query 2: SELECT COUNT(*) FROM follows WHERE following_id = ?
     *   Query 3: SELECT COUNT(*) FROM follows WHERE follower_id = ?
     * 
     * But combining them into one query is more efficient (one database call).
     * 
     * ============================================================
     * CONCEPT: COUNT(*)
     * ============================================================
     * COUNT(*) counts all rows that match the WHERE condition
     * COUNT(column_name) counts non-NULL values in that column
     * 
     * ============================================================
     * CONCEPT: Column Aliases with 'as'
     * ============================================================
     * 'as posts', 'as followers', 'as following' give names to the results
     * Without aliases, the columns would have ugly names like:
     *   "(SELECT COUNT(*) FROM posts WHERE user_id = ?)"
     * 
     * NOTE: The same userId is passed 3 times (once for each ?)
     */
    getUserStats(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT
                    (SELECT COUNT(*) FROM posts WHERE user_id = ?) as posts,
                    (SELECT COUNT(*) FROM follows WHERE following_id = ?) as followers,
                    (SELECT COUNT(*) FROM follows WHERE follower_id = ?) as following`,
                [userId, userId, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row); // {posts: 5, followers: 100, following: 50}
                }
            );
        });
    }

    /**
     * GET A USER BY THEIR ID (excluding sensitive data like password)
     * 
     * SQL: SELECT id, email, username, name, bio, link, created_at 
     *      FROM users WHERE id = ?
     * 
     * ============================================================
     * CONCEPT: Selecting Specific Columns vs SELECT *
     * ============================================================
     * Instead of SELECT * (all columns), we list specific columns.
     * 
     * Benefits:
     * 1. SECURITY: We explicitly exclude 'password' from results
     * 2. PERFORMANCE: Less data transferred (especially with large columns)
     * 3. CLARITY: Self-documenting what data this function returns
     * 4. STABILITY: Query won't break if new columns are added to table
     * 
     * Best practice: Only SELECT the columns you actually need
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
     * UPDATE A USER'S PROFILE INFORMATION
     * 
     * SQL: UPDATE users 
     *      SET name = ?, username = ?, bio = ?, link = ?
     *      WHERE id = ?
     * 
     * ============================================================
     * CONCEPT: UPDATE Statement
     * ============================================================
     * UPDATE modifies existing rows in a table.
     * 
     * Structure:
     *   UPDATE table_name
     *   SET column1 = value1, column2 = value2, ...
     *   WHERE condition
     * 
     * ⚠️  CRITICAL: Always include WHERE clause!
     * Without WHERE, you'd update EVERY row in the table:
     *   UPDATE users SET name = 'Bob'  ← Every user is now named Bob!
     * 
     * ============================================================
     * CONCEPT: SET Clause
     * ============================================================
     * SET specifies which columns to update and their new values.
     * Columns not mentioned keep their existing values.
     * 
     * The '|| ""' pattern (empty string fallback) in the JS handles null:
     *   name || ''  →  If name is null/undefined, use empty string instead
     * 
     * This function also demonstrates a common pattern:
     * After UPDATE, SELECT the updated row to return current state
     */
    updateUserProfile(userId, profileData) {
        return new Promise((resolve, reject) => {
            const { name, username, bio, link } = profileData;

            this.db.run(
                `UPDATE users 
                 SET name = ?, username = ?, bio = ?, link = ?
                 WHERE id = ?`,
                [name || '', username, bio || '', link || '', userId],
                (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    // After updating, fetch the updated user to return
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

    // ================================================================
    // ==================== POST METHODS ==============================
    // ================================================================

    /**
     * GET A SINGLE POST BY ID
     * 
     * SQL: SELECT * FROM posts WHERE id = ?
     * 
     * Simple single-row lookup. The JavaScript then transforms the 
     * snake_case database columns (user_id, image_url, created_at)
     * into camelCase for the JavaScript API (userId, imageUrl, createdAt).
     * 
     * This is a common pattern - databases traditionally use snake_case
     * while JavaScript conventionally uses camelCase.
     */
    getPost(postId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM posts WHERE id = ?',
                [postId],
                (err, row) => {
                    if (err) reject(err);
                    else if (!row) resolve(null);
                    else resolve({
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
     * GET FEED POSTS (posts from people the user follows + their own posts)
     * 
     * SQL:
     * SELECT 
     *     p.*,
     *     u.username,
     *     GROUP_CONCAT(DISTINCT l.user_id) as likes
     * FROM posts p
     * JOIN users u ON p.user_id = u.id
     * LEFT JOIN likes l ON p.id = l.post_id
     * WHERE p.user_id IN (
     *     SELECT following_id FROM follows WHERE follower_id = ?
     * ) OR p.user_id = ?
     * GROUP BY p.id
     * ORDER BY p.created_at DESC
     * LIMIT 50
     * 
     * ============================================================
     * CONCEPT: p.* (Select all columns from aliased table)
     * ============================================================
     * 'p.*' means "all columns from the posts table (aliased as p)"
     * We also add u.username from the users table
     * 
     * ============================================================
     * CONCEPT: INNER JOIN vs LEFT JOIN
     * ============================================================
     * 'JOIN users u' (same as INNER JOIN) - Only returns posts where
     * the user exists. If a post's user was deleted, post won't appear.
     * 
     * 'LEFT JOIN likes l' - Returns posts even if they have no likes.
     * The likes columns will be NULL for posts with no likes.
     * 
     * ============================================================
     * CONCEPT: Subquery in WHERE with IN
     * ============================================================
     * WHERE p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
     * 
     * This is a two-step process:
     * 1. Inner query finds all user IDs that the current user follows
     *    Result: (1, 5, 23, 42) - a list of user IDs
     * 
     * 2. Outer query finds posts where user_id is IN that list
     *    Equivalent to: WHERE p.user_id IN (1, 5, 23, 42)
     * 
     * The OR p.user_id = ? adds the user's own posts to their feed.
     * 
     * ============================================================
     * CONCEPT: ORDER BY ... DESC
     * ============================================================
     * ORDER BY p.created_at DESC - Sort by creation date, newest first
     * 
     * DESC = Descending (Z→A, 9→0, newest→oldest)
     * ASC = Ascending (A→Z, 0→9, oldest→newest) - this is the default
     * 
     * ============================================================
     * NOTE: Async callback with Promise.all
     * ============================================================
     * After getting posts, we fetch comments for each post using
     * Promise.all for parallel execution. This is an N+1 query pattern
     * (1 query for posts + N queries for comments). For better performance
     * at scale, you'd want to fetch all comments in a single query.
     */
    getFeedPosts(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                    p.*,
                    u.username,
                    GROUP_CONCAT(DISTINCT l.user_id) as likes
                FROM posts p
                JOIN users u ON p.user_id = u.id
                LEFT JOIN likes l ON p.id = l.post_id
                WHERE p.user_id IN (
                    SELECT following_id FROM follows WHERE follower_id = ?
                ) OR p.user_id = ?
                GROUP BY p.id
                ORDER BY p.created_at DESC
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
     * GET EXPLORE POSTS (posts from users NOT followed by current user)
     * 
     * SQL:
     * SELECT ... FROM posts p
     * JOIN users u ON p.user_id = u.id
     * LEFT JOIN likes l ON p.id = l.post_id
     * WHERE p.user_id != ? 
     * AND p.user_id NOT IN (
     *     SELECT following_id FROM follows WHERE follower_id = ?
     * )
     * GROUP BY p.id
     * ORDER BY RANDOM()
     * LIMIT 50
     * 
     * ============================================================
     * CONCEPT: NOT IN (Subquery)
     * ============================================================
     * Opposite of IN - excludes posts from users the person follows.
     * 
     * Combined with 'p.user_id != ?' to also exclude their own posts.
     * 
     * ============================================================
     * CONCEPT: ORDER BY RANDOM()
     * ============================================================
     * RANDOM() generates a random number for each row, then sorts by it.
     * This gives a different order each time - good for "discover" features.
     * 
     * ⚠️  WARNING: ORDER BY RANDOM() is SLOW on large tables!
     * It must generate a random number for every row, then sort them all.
     * For production with millions of rows, use alternative approaches.
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
                WHERE p.user_id != ? 
                AND p.user_id NOT IN (
                    SELECT following_id FROM follows WHERE follower_id = ?
                )
                GROUP BY p.id
                ORDER BY RANDOM()
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
     * GET ALL POSTS BY A SPECIFIC USER
     * 
     * SQL:
     * SELECT ... FROM posts p
     * JOIN users u ON p.user_id = u.id
     * LEFT JOIN likes l ON p.id = l.post_id
     * WHERE p.user_id = ?
     * GROUP BY p.id
     * ORDER BY p.created_at DESC
     * 
     * Simple filter - only posts where user_id matches.
     * No LIMIT - returns all posts by this user (consider adding pagination).
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
                WHERE p.user_id = ?
                GROUP BY p.id
                ORDER BY p.created_at DESC`,
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
     * CREATE A NEW POST
     * 
     * SQL: INSERT INTO posts (id, user_id, content, image_url, created_at, updated_at) 
     *      VALUES (?, ?, ?, ?, ?, ?)
     * 
     * Note: The id is provided by the application (UUID), and timestamps
     * are generated in JavaScript (new Date().toISOString()).
     * 
     * Alternative approach - let SQLite handle timestamps:
     *   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
     * Then you wouldn't need to pass them in the INSERT.
     */
    createPost(post) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
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
     * DELETE A POST
     * 
     * SQL: DELETE FROM posts WHERE id = ?
     * 
     * ============================================================
     * CONCEPT: DELETE Statement
     * ============================================================
     * DELETE removes rows from a table.
     * 
     * ⚠️  CRITICAL: Always include WHERE clause!
     * 'DELETE FROM posts' without WHERE deletes ALL posts!
     * 
     * NOTE: This may leave orphaned records (likes, comments for this post).
     * Consider using:
     * 1. CASCADE DELETE in your schema (automatic cleanup)
     * 2. Manually delete related records first
     * 
     * Example with cascade in schema:
     *   CREATE TABLE likes (
     *       post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
     *       ...
     *   );
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

    // ================================================================
    // ==================== LIKE METHODS ==============================
    // ================================================================

    /**
     * CHECK IF A USER HAS LIKED A POST
     * 
     * SQL: SELECT * FROM likes WHERE post_id = ? AND user_id = ?
     * 
     * ============================================================
     * CONCEPT: Multiple WHERE Conditions with AND
     * ============================================================
     * AND means BOTH conditions must be true.
     * The row must have matching post_id AND matching user_id.
     * 
     * Other logical operators:
     * - OR: Either condition can be true
     * - NOT: Negates a condition
     * 
     * The '!!' converts the result to a boolean:
     * - Row found → !!{...} → true (user has liked)
     * - No row (undefined) → !!undefined → false (user hasn't liked)
     */
    isPostLiked(postId, userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM likes WHERE post_id = ? AND user_id = ?',
                [postId, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row); // Convert to boolean
                }
            );
        });
    }

    /**
     * ADD A LIKE TO A POST
     * 
     * SQL: INSERT OR IGNORE INTO likes (post_id, user_id) VALUES (?, ?)
     * 
     * ============================================================
     * CONCEPT: INSERT OR IGNORE
     * ============================================================
     * INSERT OR IGNORE is SQLite-specific conflict handling.
     * 
     * If the insert would violate a UNIQUE constraint (user already
     * liked this post), it silently does nothing instead of erroring.
     * 
     * This requires a unique constraint on (post_id, user_id) in your schema:
     *   CREATE TABLE likes (
     *       post_id TEXT,
     *       user_id TEXT,
     *       UNIQUE(post_id, user_id)  -- or PRIMARY KEY(post_id, user_id)
     *   );
     * 
     * Other conflict handling options:
     * - INSERT OR REPLACE: Delete old row, insert new one
     * - INSERT OR ABORT: Error and rollback (default behavior)
     * - INSERT OR FAIL: Error but don't rollback
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
     * REMOVE A LIKE FROM A POST
     * 
     * SQL: DELETE FROM likes WHERE post_id = ? AND user_id = ?
     * 
     * Removes the specific like record. If no such record exists,
     * this just does nothing (no error).
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

    // ================================================================
    // ==================== COMMENT METHODS ===========================
    // ================================================================

    /**
     * GET ALL COMMENTS FOR A POST
     * 
     * SQL:
     * SELECT 
     *     c.*,
     *     u.username
     * FROM comments c
     * JOIN users u ON c.user_id = u.id
     * WHERE c.post_id = ?
     * ORDER BY c.created_at ASC
     * 
     * JOIN brings in the username for each comment's author.
     * ORDER BY ASC shows oldest comments first (chronological order).
     * 
     * db.all() returns an array of all matching rows (vs db.get for single row)
     */
    getPostComments(postId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT 
                    c.*,
                    u.username
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.post_id = ?
                ORDER BY c.created_at ASC`,
                [postId],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        // Transform each row to camelCase
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
     * ADD A COMMENT TO A POST
     * 
     * SQL: INSERT INTO comments (id, post_id, user_id, content, created_at) 
     *      VALUES (?, ?, ?, ?, ?)
     * 
     * Standard insert with application-provided ID and timestamp.
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

    // ================================================================
    // ==================== FOLLOW METHODS ============================
    // ================================================================

    /**
     * CHECK IF USER A FOLLOWS USER B
     * 
     * SQL: SELECT * FROM follows WHERE follower_id = ? AND following_id = ?
     * 
     * The 'follows' table models the follow relationship:
     *   follower_id: The user who is doing the following
     *   following_id: The user being followed
     * 
     * If A follows B:
     *   follower_id = A, following_id = B
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
     * FOLLOW A USER
     * 
     * SQL: INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)
     * 
     * INSERT OR IGNORE prevents duplicate follows (following same user twice).
     * Requires UNIQUE(follower_id, following_id) constraint in schema.
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
     * UNFOLLOW A USER
     * 
     * SQL: DELETE FROM follows WHERE follower_id = ? AND following_id = ?
     * 
     * Removes the follow relationship.
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
     * GET ALL FOLLOWERS OF A USER
     * 
     * SQL:
     * SELECT u.id, u.username, u.name, u.bio
     * FROM users u
     * JOIN follows f ON u.id = f.follower_id
     * WHERE f.following_id = ?
     * 
     * ============================================================
     * Understanding the JOIN Logic
     * ============================================================
     * We want: "Users who follow the given user"
     * 
     * In the follows table:
     *   follower_id = the person doing the following
     *   following_id = the person being followed
     * 
     * So we:
     * 1. Look in 'follows' where following_id = our user (people following them)
     * 2. JOIN with users on follower_id to get those users' details
     * 
     * Example: Get followers of User 5
     *   follows table:
     *     follower_id=1, following_id=5  ← User 1 follows User 5
     *     follower_id=3, following_id=5  ← User 3 follows User 5
     *   
     *   Result: User 1 and User 3's info
     */
    getFollowers(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT u.id, u.username, u.name, u.bio
                 FROM users u
                 JOIN follows f ON u.id = f.follower_id
                 WHERE f.following_id = ?`,
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    /**
     * GET ALL USERS THAT A USER FOLLOWS
     * 
     * SQL:
     * SELECT u.id, u.username, u.name, u.bio
     * FROM users u
     * JOIN follows f ON u.id = f.following_id
     * WHERE f.follower_id = ?
     * 
     * Opposite of getFollowers:
     * 1. Look in 'follows' where follower_id = our user (who they follow)
     * 2. JOIN with users on following_id to get those users' details
     */
    getFollowing(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT u.id, u.username, u.name, u.bio
                 FROM users u
                 JOIN follows f ON u.id = f.following_id
                 WHERE f.follower_id = ?`,
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }
}

module.exports = Database;