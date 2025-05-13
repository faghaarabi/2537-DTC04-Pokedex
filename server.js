const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { ObjectId } = require('mongoose').Types;

const app = express();

// Schemas
const favoritesSchema = new mongoose.Schema({ name: String, username: String });
const timelineSchema = new mongoose.Schema({ title: String, description: String, date: Date, username: String });
const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    role: { type: String, enum: ['admin', 'user'], default: 'user' }
});

const favoritesModel = mongoose.model('favorites', favoritesSchema);
const timelineModel = mongoose.model('timeline', timelineSchema);
const usersModel = mongoose.model('users', userSchema);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'keyboard cat',
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false }
}));
app.set('view engine', 'ejs');
app.use(express.static(__dirname));

const port = 3000;
app.listen(port, () => console.log(`Server is running on http://localhost:${port}`));

async function connectToMongoDB() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/test', {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000
        });
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
    }
}
connectToMongoDB();

app.get('/', (req, res) => res.redirect('/home'));
app.get('/login', (req, res) => res.sendFile(__dirname + '/login.html'));
app.get('/register', (req, res) => res.sendFile(__dirname + '/register.html'));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await usersModel.findOne({ username });
        if (user && await bcrypt.compare(password, user.password) || user.password === password) {
            req.session.user = user;
            await addToTimeline('Login', 'User logged in', new Date(), user.username);
            res.redirect('/home');
        } else {
            res.status(401).send('Invalid credentials');
        }
    } catch (err) {
        res.status(500).send('Login failed');
    }
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingUser = await usersModel.findOne({ username });
        if (existingUser) return res.status(400).send('Username already exists');
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new usersModel({ username, password: hashedPassword });
        await newUser.save();
        req.session.user = newUser;
        await addToTimeline('Register', 'New user registered', new Date(), username);
        res.redirect('/home');
    } catch (err) {
        res.status(500).send('Registration failed');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.redirect('/home');
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) return next();
    res.redirect('/login');
};

app.use(isAuthenticated);

app.get('/home', (req, res) => {
    res.render('index', {
        username: req.session.user.username,
        role: req.session.user.role
    });
});

app.get('/favorites', async (req, res) => {
    try {
        const favorites = await favoritesModel.find({ username: req.session.user.username });
        res.json(favorites);
    } catch (error) {
        res.status(500).json({ error: 'Could not retrieve favorites' });
    }
});

app.post('/addFavorite', async (req, res) => {
    try {
        const { name } = req.body;
        const username = req.session.user.username;
        const exists = await favoritesModel.findOne({ name, username });
        if (exists) return res.status(400).json({ error: 'Already in favorites' });
        const result = await favoritesModel.create({ name, username });
        await addToTimeline('Added Favorite', name, new Date(), username);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Could not add favorite' });
    }
});

app.delete('/deleteFavorite/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const username = req.session.user?.username;
        if (!username) return res.status(401).json({ error: 'User not authenticated' });
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ID' });

        const result = await favoritesModel.deleteOne({ _id: new ObjectId(id), username });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Favorite not found or not owned by user' });
        }

        await addToTimeline('Deleted Favorite', `Removed favorite with ID: ${id}`, new Date(), username);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Could not delete favorite' });
    }
});

app.get('/timeline', async (req, res) => {
    try {
        const timelineFound = await timelineModel
            .find({ username: req.session.user.username })
            .sort({ date: -1 });
        res.json(timelineFound);
    } catch (error) {
        res.status(500).json({ error: 'Could not retrieve timeline' });
    }
});

app.delete('/deleteTimeline/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const username = req.session.user?.username;
        if (!username) return res.status(401).json({ error: 'User not authenticated' });
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ID' });

        const result = await timelineModel.deleteOne({ _id: new ObjectId(id), username });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Timeline item not found or not owned by user' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Could not delete timeline item' });
    }
});

// Admin-only routes
const isAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    } else {
        res.status(403).send('Forbidden');
    }
};

app.get('/users', isAdmin, async (req, res) => {
    try {
        const usersFound = await usersModel.find({ role: 'user' });
        res.json(usersFound);
    } catch (error) {
        res.status(500).json({ error: 'Could not retrieve users' });
    }
});

app.delete('/deleteUser/:id', isAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        if (!ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, error: 'Invalid user ID' });
        }

        const result = await usersModel.deleteOne({ _id: new ObjectId(userId) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, error: 'Could not delete user' });
    }
});

app.put('/editUser/:id', isAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const { username, role } = req.body;

        if (!ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, error: 'Invalid user ID' });
        }

        const update = {};
        if (username) update.username = username;
        if (role && ['admin', 'user'].includes(role)) update.role = role;

        const result = await usersModel.updateOne({ _id: new ObjectId(userId) }, { $set: update });

        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Edit user error:', error);
        res.status(500).json({ success: false, error: 'Could not update user' });
    }
});

// Timeline utility
const addToTimeline = async (title, description, date, username) => {
    try {
        return await timelineModel.create({ title, description, date, username });
    } catch (error) {
        return null;
    }
};

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
