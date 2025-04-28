const express = require('express');
var session = require('express-session')

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

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

app.get('/', (req, res) => {
    res.redirect('/home');
})

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/login.html');
})

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
        res.render('index.ejs', { username: user.username });
    } else {
        res.status(401).send('Invalid credentials');
    }
})

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    } else {
        res.redirect('/login');
    }
}

app.use(isAuthenticated);
app.get('/home', (req, res) => {
    // res.sendFile(__dirname + '/index.html');
    res.render('index.ejs', { username: req.session.user.username });
})

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