
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uuidv4 = () => crypto.randomUUID();
const Database = require('./database');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Initialize database
const db = new Database();

// ==================== FILE UPLOAD SETUP ====================

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: timestamp-uuid.extension
        const ext = path.extname(file.originalname);
        const filename = `${Date.now()}-${uuidv4()}${ext}`;
        cb(null, filename);
    }
});

// File filter - only allow images
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max file size
    }
});

// ==================== MIDDLEWARE ====================

app.use(cors());
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(UPLOADS_DIR));

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

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
        }
        return res.status(400).json({ message: err.message });
    } else if (err) {
        return res.status(400).json({ message: err.message });
    }
    next();
};

// ==================== AUTH ROUTES ====================

// Sign up
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password, username } = req.body;

        if (!email || !password || !username) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const existingUser = await db.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        const existingUsername = await db.getUserByUsername(username);
        if (existingUsername) {
            return res.status(400).json({ message: 'Username already taken' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const userId = uuidv4();
        await db.createUser({
            id: userId,
            email,
            username,
            password: hashedPassword,
        });

        const token = jwt.sign(
            { id: userId, email, username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            token,
            user: {
                id: userId,
                email,
                username,
            },
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await db.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

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

// Get feed
app.get('/api/posts/feed', authenticateToken, async (req, res) => {
    try {
        const posts = await db.getFeedPosts(req.user.id);
        res.json(posts);
    } catch (error) {
        console.error('Feed error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get explore posts
app.get('/api/posts/explore', authenticateToken, async (req, res) => {
    try {
        const posts = await db.getExplorePosts(req.user.id);
        res.json(posts);
    } catch (error) {
        console.error('Explore error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create post - UPDATED to handle image uploads
app.post('/api/posts', authenticateToken, upload.single('image'), handleMulterError, async (req, res) => {
    try {
        const { content } = req.body;
        const imageFile = req.file;

        // Validate: must have content or image
        if ((!content || content.trim().length === 0) && !imageFile) {
            return res.status(400).json({ message: 'Post must have content or an image' });
        }

        const postId = uuidv4();

        // Build image URL if file was uploaded
        let imageUrl = null;
        if (imageFile) {
            // Construct the full URL for the image
            imageUrl = `/uploads/${imageFile.filename}`;
        }

        const post = await db.createPost({
            id: postId,
            userId: req.user.id,
            content: content || '',
            imageUrl,
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

// Delete post - UPDATED to also delete image file
app.delete('/api/posts/:postId', authenticateToken, async (req, res) => {
    try {
        const post = await db.getPost(req.params.postId);

        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        if (post.userId !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Delete image file if exists
        if (post.imageUrl) {
            const imagePath = path.join(__dirname, post.imageUrl);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
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

// Update user profile
app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const { name, username, bio, link } = req.body;
        const userId = req.user.id;

        if (!username || username.trim().length === 0) {
            return res.status(400).json({ message: 'Username is required' });
        }

        // Check if username is taken by another user
        const existingUser = await db.getUserByUsername(username);
        if (existingUser && existingUser.id !== userId) {
            return res.status(400).json({ message: 'Username already taken' });
        }

        await db.updateUserProfile(userId, { name, username, bio, link });

        // Fetch and return updated user
        const updatedUser = await db.getUserById(userId);

        res.json({
            id: updatedUser.id,
            email: updatedUser.email,
            username: updatedUser.username,
            name: updatedUser.name,
            bio: updatedUser.bio,
            link: updatedUser.link
        });
    } catch (error) {
        console.error('Update profile error', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
    console.log(`Uploads served from http://localhost:${PORT}/uploads`);
});