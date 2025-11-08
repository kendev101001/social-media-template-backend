const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const Database = require('./database');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Initialize database
const db = new Database();

// Middleware
app.use(cors());
app.use(express.json());

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// ==================== AUTH ROUTES ====================

// Sign up
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password, username } = req.body;

        // Validate input
        if (!email || !password || !username) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if user exists
        const existingUser = await db.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        const existingUsername = await db.getUserByUsername(username);
        if (existingUsername) {
            return res.status(400).json({ message: 'Username already taken' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const userId = uuidv4();
        await db.createUser({
            id: userId,
            email,
            username,
            password: hashedPassword,
        });

        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Get user
        const user = await db.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate token
        const token = jwt.sign(
            { id: user.id, email: user.email, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==================== POST ROUTES ====================

// Get feed (posts from followed users)
app.get('/api/posts/feed', authenticateToken, async (req, res) => {
    try {
        const posts = await db.getFeedPosts(req.user.id);
        res.json(posts);
    } catch (error) {
        console.error('Feed error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get explore posts (random posts from non-followed users)
app.get('/api/posts/explore', authenticateToken, async (req, res) => {
    try {
        const posts = await db.getExplorePosts(req.user.id);
        res.json(posts);
    } catch (error) {
        console.error('Explore error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create post
app.post('/api/posts', authenticateToken, async (req, res) => {
    try {
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ message: 'Post content is required' });
        }

        const postId = uuidv4();
        const post = await db.createPost({
            id: postId,
            userId: req.user.id,
            content,
        });

        res.status(201).json({
            ...post,
            username: req.user.username,
            likes: [],
            comments: [],
        });
    } catch (error) {
        console.error('Create post error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete post
app.delete('/api/posts/:postId', authenticateToken, async (req, res) => {
    try {
        const post = await db.getPost(req.params.postId);

        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        if (post.userId !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await db.deletePost(req.params.postId);
        res.json({ message: 'Post deleted' });
    } catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Like/unlike post
app.post('/api/posts/:postId/like', authenticateToken, async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user.id;

        const isLiked = await db.isPostLiked(postId, userId);

        if (isLiked) {
            await db.unlikePost(postId, userId);
        } else {
            await db.likePost(postId, userId);
        }

        res.json({ liked: !isLiked });
    } catch (error) {
        console.error('Like error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add comment
app.post('/api/posts/:postId/comment', authenticateToken, async (req, res) => {
    try {
        const { content } = req.body;
        const { postId } = req.params;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ message: 'Comment content is required' });
        }

        const commentId = uuidv4();
        const comment = await db.addComment({
            id: commentId,
            postId,
            userId: req.user.id,
            content,
        });

        res.status(201).json({
            ...comment,
            username: req.user.username,
        });
    } catch (error) {
        console.error('Comment error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==================== USER ROUTES ====================

// Get user posts
app.get('/api/users/:userId/posts', authenticateToken, async (req, res) => {
    try {
        const posts = await db.getUserPosts(req.params.userId);
        res.json(posts);
    } catch (error) {
        console.error('Get user posts error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user stats
app.get('/api/users/:userId/stats', authenticateToken, async (req, res) => {
    try {
        const stats = await db.getUserStats(req.params.userId);
        res.json(stats);
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Search users
app.get('/api/users/search', authenticateToken, async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.trim().length === 0) {
            return res.json([]);
        }

        const users = await db.searchUsers(q, req.user.id);
        res.json(users);
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Follow/unfollow user
app.post('/api/users/:userId/follow', authenticateToken, async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        const currentUserId = req.user.id;

        if (targetUserId === currentUserId) {
            return res.status(400).json({ message: 'Cannot follow yourself' });
        }

        const isFollowing = await db.isFollowing(currentUserId, targetUserId);

        if (isFollowing) {
            await db.unfollowUser(currentUserId, targetUserId);
        } else {
            await db.followUser(currentUserId, targetUserId);
        }

        res.json({ following: !isFollowing });
    } catch (error) {
        console.error('Follow error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
});