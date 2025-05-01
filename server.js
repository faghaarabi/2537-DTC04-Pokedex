const express = require('express');
var session = require('express-session');
const mongoose = require('mongoose');
const { ObjectId } = require('mongoose').Types;

const favoritesSchema = new mongoose.Schema({
    name: String,
    username: String,
});

const favoritesModel = mongoose.model('favorites', favoritesSchema);

const timelineSchema = new mongoose.Schema({
    title: String,
    description: String,
    date: Date,
    username: String
});

const timelineModel = mongoose.model('timeline', timelineSchema);

const app = express();

app.use(express.json());

app.use(session({
    secret: 'keyboard cat',
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false }
}));

const port = 3000;

app.set('view engine', 'ejs');
app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

async function connectToMongoDB() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/test', {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log('Successfully connected to MongoDB');
        return true;
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        console.log('Make sure MongoDB is running at mongodb://127.0.0.1:27017');
        return false;
    }
}

connectToMongoDB();

const usersArr = [
    { username: 'admin1', password: 'admin1' },
    { username: 'admin2', password: 'admin2' },
    { username: 'user1', password: 'password1' },
    { username: 'user2', password: 'password2' },
    { username: 'user3', password: 'password3' }
];

app.get('/', (req, res) => {
    res.redirect('/home');
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = usersArr.find(user => user.username === username && user.password === password);

    if (user) {
        req.session.user = user;
        addToTimeline('Login', 'User logged in', new Date(), user.username);
        res.render('index.ejs', { username: user.username });
    } else {
        res.status(401).send('Invalid credentials');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/home');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    } else {
        res.redirect('/login');
    }
};

app.use(isAuthenticated);

app.get('/home', (req, res) => {
    res.render('index.ejs', { username: req.session.user.username });
});

app.get('/favorites', async (req, res) => {
    try {
        const favoritesFound = await favoritesModel.find({ username: req.session.user.username });
        res.json(favoritesFound);
    } catch (error) {
        console.log('Database error:', error);
        res.status(500).json({ error: 'Could not retrieve favorites' });
    }
});

app.get('/addFavorite/:favorite', async (req, res) => {
    try {
        const favorite = req.params.favorite;
        const username = req.session.user.username;

        const result = await favoritesModel.create({ name: favorite, username: username });
        addToTimeline('Added Favorite', favorite, new Date(), username);
        res.json(result);
    } catch (error) {
        console.log('Database error:', error);
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
        console.log('Error deleting favorite:', error.message);
        res.status(500).json({ error: 'Could not delete favorite', details: error.message });
    }
});

app.get('/timeline', async (req, res) => {
    try {
        const timelineFound = await timelineModel
            .find({ username: req.session.user.username })
    .sort({ date: -1 }); // -1 = descending, 1 = ascending

        res.json(timelineFound);
    } catch (error) {
        console.log('Database error:', error);
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
        console.log('Error deleting timeline item:', error.message);
        res.status(500).json({ error: 'Could not delete timeline item', details: error.message });
    }
});

const addToTimeline = async (title, description, date, username) => {
    try {
        const result = await timelineModel.create({ title, description, date, username });
        return result;
    } catch (error) {
        console.log('Database error when adding to timeline:', error);
        return null;
    }
};

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
