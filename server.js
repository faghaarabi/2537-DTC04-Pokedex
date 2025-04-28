const express = require('express');
var session = require('express-session')
const mongoose = require('mongoose');

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

app.use(session({
    secret: 'keyboard cat',
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false }
}))

const port = 3000;

app.set('view engine', 'ejs')

// Serve static files from the current directory
app.use(express.static(__dirname));

// Start the server regardless of MongoDB connection status
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

// Connect to MongoDB with better error handling
async function connectToMongoDB() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/test', {
            serverSelectionTimeoutMS: 5000, // Give up after 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        });
        console.log('Successfully connected to MongoDB');
        return true;
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        console.log('Make sure MongoDB is running at mongodb://127.0.0.1:27017');
        console.log('You can start MongoDB using the mongod command from the MongoDB bin directory');
        return false;
    }
}

// Try to connect to MongoDB
connectToMongoDB();

app.get('/', (req, res) => {
    res.redirect('/home');
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

const usersArr = [
    { username: 'admin1', password: 'admin1' },
    { username: 'admin2', password: 'admin2' },
    { username: 'user1', password: 'password1' },
    { username: 'user2', password: 'password2' },
    { username: 'user3', password: 'password3' }
];

app.use(express.urlencoded({ extended: true }));
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = usersArr.find(user => user.username === username && user.password === password);

    if (user) {
        req.session.user = user;
        addToTimeline('Login', 'User logged in', new Date(), user.username); // Add to timeline
        res.render('index.ejs', { username: user.username });
    } else {
        res.status(401).send('Invalid credentials');
    }
});

app.get('/logout', (req, res) => {
    // Destroy the session
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/home'); // Error handling
        }
        res.clearCookie('connect.sid'); // Clear the session cookie
        res.redirect('/login'); // Redirect to login page
    });
});

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    } else {
        res.redirect('/login');
    }
}

app.use(isAuthenticated);
app.get('/home', (req, res) => {
    res.render('index.ejs', { username: req.session.user.username });
});

app.get('/favorites', async(req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            // If MongoDB is not connected, return empty array
            console.log('MongoDB is not connected. Cannot retrieve favorites.');
            return res.json([]);
        }

        const favoritesFound = await favoritesModel.find({ username: req.session.user.username });
        res.json(favoritesFound);
    } catch (error) {
        console.log('Database error:', error);
        res.status(500).json({ error: 'Could not retrieve favorites' });
    }
});

app.get('/addFavorite/:favorite', async(req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            // If MongoDB is not connected, return error
            console.log('MongoDB is not connected. Cannot add favorite.');
            return res.status(503).json({ error: 'Database not available' });
        }

        const favorite = req.params.favorite;
        const username = req.session.user.username;

        const result = await favoritesModel.create({ name: favorite, username: username });
        addToTimeline('Added Favorite', favorite, new Date(), username); // Add to timeline
        res.json(result);
    } catch (error) {
        console.log('Database error:', error);
        res.status(500).json({ error: 'Could not add favorite' });
    }
});

app.get('/timeline', async(req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            // If MongoDB is not connected, return empty array
            console.log('MongoDB is not connected. Cannot retrieve timeline.');
            return res.json([]);
        }

        const timelineFound = await timelineModel.find({ username: req.session.user.username });
        res.json(timelineFound);
    } catch (error) {
        console.log('Database error:', error);
        res.status(500).json({ error: 'Could not retrieve timeline' });
    }
});

const addToTimeline = async(title, description, date, username) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            // If MongoDB is not connected, log error and return
            console.log('MongoDB is not connected. Cannot add to timeline.');
            return null;
        }

        const result = await timelineModel.create({ title, description, date, username });
        return result;
    } catch (error) {
        console.log('Database error when adding to timeline:', error);
        return null;
    }
};

// Handle any uncaught errors
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Keep the process alive
});