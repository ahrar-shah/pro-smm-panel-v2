const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// In-memory storage instead of JSON files
let users = {};
let contacts = {};
let chats = {};
let statuses = {};
let calls = {};

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions
function generateHexaId() {
    return 'HX-' + Math.floor(100000000 + Math.random() * 900000000);
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatLastSeen(timestamp) {
    const now = new Date();
    const lastSeen = new Date(timestamp);
    const diffMinutes = Math.floor((now - lastSeen) / (1000 * 60));
    
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    if (diffMinutes < 1440) {
        const diffHours = Math.floor(diffMinutes / 60);
        return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    }
    
    const diffDays = Math.floor(diffMinutes / 1440);
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

// API Routes

// User registration
app.post('/api/signup', async (req, res) => {
    try {
        const { firstName, lastName, password } = req.body;
        
        if (!firstName || !lastName || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        const id = generateHexaId();
        const hashedPassword = await bcrypt.hash(password, 10);
        
        users[id] = {
            id,
            firstName,
            lastName,
            password: hashedPassword,
            bio: "Hey there! I'm using Hexachats.",
            avatar: `https://ui-avatars.com/api/?name=${firstName}+${lastName}&background=random`,
            phone: "",
            email: "",
            contacts: [],
            chats: {},
            statuses: [],
            calls: [],
            settings: {
                theme: 'light',
                online: true,
                lastSeen: Date.now()
            },
            typing: {}
        };
        
        // Initialize empty data structures for this user
        contacts[id] = [];
        chats[id] = {};
        statuses[id] = [];
        calls[id] = [];
        
        res.status(201).json({ 
            message: 'User created successfully', 
            userId: id 
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// User login
app.post('/api/login', async (req, res) => {
    try {
        const { id, password } = req.body;
        
        if (!id || !password) {
            return res.status(400).json({ error: 'ID and password are required' });
        }
        
        if (!/^HX-\d{9}$/.test(id)) {
            return res.status(400).json({ error: 'Invalid Hexachats ID format' });
        }
        
        const user = users[id];
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        // Update user status
        user.settings.online = true;
        user.settings.lastSeen = Date.now();
        
        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                bio: user.bio,
                avatar: user.avatar,
                phone: user.phone,
                email: user.email,
                settings: user.settings
            },
            contacts: contacts[id] || [],
            chats: chats[id] || {},
            statuses: statuses[id] || [],
            calls: calls[id] || []
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user profile
app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    const user = users[userId];
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Return public profile information only
    res.json({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        bio: user.bio,
        avatar: user.avatar,
        phone: user.phone,
        email: user.email,
        settings: user.settings
    });
});

// Update user profile
app.put('/api/user/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const { firstName, lastName, bio, phone, email, avatar, password } = req.body;
        
        if (!users[userId]) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Update user data
        if (firstName) users[userId].firstName = firstName;
        if (lastName) users[userId].lastName = lastName;
        if (bio) users[userId].bio = bio;
        if (phone) users[userId].phone = phone;
        if (email) users[userId].email = email;
        if (avatar) users[userId].avatar = avatar;
        
        // Update password if provided
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters' });
            }
            users[userId].password = await bcrypt.hash(password, 10);
        }
        
        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add contact
app.post('/api/user/:userId/contacts', (req, res) => {
    const userId = req.params.userId;
    const { contactId } = req.body;
    
    if (!users[userId] || !users[contactId]) {
        return res.status(404).json({ error: 'User or contact not found' });
    }
    
    if (userId === contactId) {
        return res.status(400).json({ error: 'Cannot add yourself as a contact' });
    }
    
    if (contacts[userId].includes(contactId)) {
        return res.status(400).json({ error: 'Contact already exists' });
    }
    
    // Add contact to user's contact list
    contacts[userId].push(contactId);
    
    // Initialize chat between users if it doesn't exist
    if (!chats[userId][contactId]) {
        chats[userId][contactId] = [];
    }
    
    res.json({ message: 'Contact added successfully' });
});

// Get user contacts
app.get('/api/user/:userId/contacts', (req, res) => {
    const userId = req.params.userId;
    
    if (!users[userId]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const userContacts = contacts[userId].map(contactId => {
        const contact = users[contactId];
        return {
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            avatar: contact.avatar,
            settings: contact.settings
        };
    });
    
    res.json(userContacts);
});

// Get chat messages
app.get('/api/user/:userId/chats/:contactId', (req, res) => {
    const userId = req.params.userId;
    const contactId = req.params.contactId;
    
    if (!users[userId] || !users[contactId]) {
        return res.status(404).json({ error: 'User or contact not found' });
    }
    
    const userChats = chats[userId][contactId] || [];
    res.json(userChats);
});

// Send message
app.post('/api/user/:userId/chats/:contactId', (req, res) => {
    const userId = req.params.userId;
    const contactId = req.params.contactId;
    const { message } = req.body;
    
    if (!users[userId] || !users[contactId]) {
        return res.status(404).json({ error: 'User or contact not found' });
    }
    
    if (!message || message.trim() === '') {
        return res.status(400).json({ error: 'Message cannot be empty' });
    }
    
    const timestamp = Date.now();
    const newMessage = {
        sender: userId,
        message: message.trim(),
        timestamp,
        read: false
    };
    
    // Add message to sender's chat
    if (!chats[userId][contactId]) {
        chats[userId][contactId] = [];
    }
    chats[userId][contactId].push(newMessage);
    
    // Add message to recipient's chat
    if (!chats[contactId][userId]) {
        chats[contactId][userId] = [];
    }
    chats[contactId][userId].push({ ...newMessage, read: false });
    
    // Notify recipient via socket.io if online
    const recipientSocket = getUserSocket(contactId);
    if (recipientSocket) {
        recipientSocket.emit('newMessage', {
            from: userId,
            message: newMessage
        });
    }
    
    res.json({ message: 'Message sent successfully', timestamp });
});

// Mark messages as read
app.put('/api/user/:userId/chats/:contactId/read', (req, res) => {
    const userId = req.params.userId;
    const contactId = req.params.contactId;
    
    if (!users[userId] || !users[contactId]) {
        return res.status(404).json({ error: 'User or contact not found' });
    }
    
    if (chats[userId][contactId]) {
        chats[userId][contactId].forEach(msg => {
            if (msg.sender === contactId && !msg.read) {
                msg.read = true;
            }
        });
    }
    
    res.json({ message: 'Messages marked as read' });
});

// Add status
app.post('/api/user/:userId/status', (req, res) => {
    const userId = req.params.userId;
    const { media, caption, type } = req.body;
    
    if (!users[userId]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (!media) {
        return res.status(400).json({ error: 'Media is required' });
    }
    
    const newStatus = {
        media,
        caption: caption || '',
        type: type || 'image',
        timestamp: Date.now()
    };
    
    statuses[userId].push(newStatus);
    
    // Notify contacts about new status
    contacts[userId].forEach(contactId => {
        const contactSocket = getUserSocket(contactId);
        if (contactSocket) {
            contactSocket.emit('newStatus', {
                userId,
                status: newStatus
            });
        }
    });
    
    res.json({ message: 'Status added successfully', status: newStatus });
});

// Get user statuses
app.get('/api/user/:userId/status', (req, res) => {
    const userId = req.params.userId;
    
    if (!users[userId]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(statuses[userId]);
});

// Add call record
app.post('/api/user/:userId/calls', (req, res) => {
    const userId = req.params.userId;
    const { contactId, type, direction, missed } = req.body;
    
    if (!users[userId] || !users[contactId]) {
        return res.status(404).json({ error: 'User or contact not found' });
    }
    
    const newCall = {
        contactId,
        type,
        direction,
        missed: missed || false,
        timestamp: Date.now()
    };
    
    calls[userId].push(newCall);
    
    res.json({ message: 'Call recorded successfully', call: newCall });
});

// Get user call history
app.get('/api/user/:userId/calls', (req, res) => {
    const userId = req.params.userId;
    
    if (!users[userId]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(calls[userId]);
});

// Socket.io connection handling
const userSockets = {};

function getUserSocket(userId) {
    return userSockets[userId];
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('register', (userId) => {
        userSockets[userId] = socket;
        console.log(`User ${userId} registered with socket ${socket.id}`);
        
        // Set user as online
        if (users[userId]) {
            users[userId].settings.online = true;
            users[userId].settings.lastSeen = Date.now();
            
            // Notify contacts about online status
            contacts[userId].forEach(contactId => {
                const contactSocket = getUserSocket(contactId);
                if (contactSocket) {
                    contactSocket.emit('userOnline', { userId });
                }
            });
        }
    });
    
    socket.on('typing', (data) => {
        const { userId, contactId, isTyping } = data;
        
        // Notify the contact
        const contactSocket = getUserSocket(contactId);
        if (contactSocket) {
            contactSocket.emit('typing', {
                userId,
                isTyping
            });
        }
    });
    
    socket.on('disconnect', () => {
        // Find which user disconnected
        for (const [userId, userSocket] of Object.entries(userSockets)) {
            if (userSocket === socket) {
                console.log(`User ${userId} disconnected`);
                
                // Set user as offline
                if (users[userId]) {
                    users[userId].settings.online = false;
                    users[userId].settings.lastSeen = Date.now();
                    
                    // Notify contacts about offline status
                    contacts[userId].forEach(contactId => {
                        const contactSocket = getUserSocket(contactId);
                        if (contactSocket) {
                            contactSocket.emit('userOffline', { userId });
                        }
                    });
                }
                
                delete userSockets[userId];
                break;
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
