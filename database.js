const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'social_media.db'));
        // Remove init() call - migrations handle schema now
    }

    // ==================== USER METHODS ====================

    getUserByEmail(email) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM users WHERE email = ?',
                [email],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

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
                    else resolve(row);
                }
            );
        });
    }

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
                    // Fetch and return the updated user
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

    // UPDATED: createPost now accepts imageUrl
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

    isPostLiked(postId, userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM likes WHERE post_id = ? AND user_id = ?',
                [postId, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });
    }

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
}

module.exports = Database;