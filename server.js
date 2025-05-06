const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { ObjectId } = require('mongoose').Types;

const app = express();

// MongoDB Schemas
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

// Middleware setup
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

// Server & DB
const port = 3000;
app.listen(port, () => console.log(`Server is running on http://localhost:${port}`));

async function connectToMongoDB() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/test', {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000
        });
        console.log('✅ Connected to MongoDB');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
    }
}
connectToMongoDB();

// Public Routes
app.get('/', (req, res) => res.redirect('/home'));

app.get('/login', (req, res) => res.sendFile(__dirname + '/login.html'));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('🔐 Login attempt:', username);
    try {
        const user = await usersModel.findOne({ username });
        console.log('🔍 User found:', user);

        if (
            user &&
            (await bcrypt.compare(password, user.password) || user.password === password)
        ) {
            console.log('✅ Password matched!');
            req.session.user = user;
            await addToTimeline('Login', 'User logged in', new Date(), user.username);
            res.redirect('/home');
        } else {
            console.log('❌ Invalid credentials');
            res.status(401).send('Invalid credentials');
        }
    } catch (err) {
        console.error('❌ Login error:', err.message);
        res.status(500).send('Login failed');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.redirect('/home');
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

app.get('/register', (req, res) => res.sendFile(__dirname + '/register.html'));

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    console.log('📥 Register request:', username);
    try {
        const existingUser = await usersModel.findOne({ username });
        if (existingUser) {
            console.log('⚠️ Username already exists');
            return res.status(400).send('Username already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('🔐 Hashed password:', hashedPassword);

        const newUser = new usersModel({ username, password: hashedPassword });
        await newUser.save();
        console.log('✅ New user created:', newUser);

        req.session.user = newUser;
        await addToTimeline('Register', 'New user registered', new Date(), username);
        res.redirect('/home');
    } catch (err) {
        console.error('❌ Registration failed:', err);
        res.status(500).send('Registration failed');
    }
});

// ✅ Now protect all routes below
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) return next();
    res.redirect('/login');
};
app.use(isAuthenticated);

// Protected Routes
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

app.get('/addFavorite/:favorite', async (req, res) => {
    try {
        const { favorite } = req.params;
        const username = req.session.user.username;
        const result = await favoritesModel.create({ name: favorite, username });
        await addToTimeline('Added Favorite', favorite, new Date(), username);
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
            .sort({ date: 1 });
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

const addToTimeline = async (title, description, date, username) => {
    try {
        return await timelineModel.create({ title, description, date, username });
    } catch (error) {
        return null;
    }
};

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

// Error Handling
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
