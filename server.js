const express = require("express");
const app = express();
const PORT = 3000;

// Serve static files from the current directory
app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

app.get('/', (req, res) => {
    res.redirect('/home');
})
app.get('/home', (req, res) => {
    res.sendFile(__dirname + '/index.html');
})