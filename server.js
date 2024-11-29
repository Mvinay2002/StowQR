const express = require('express');
const session = require('express-session'); // For session handling
const mysql = require('mysql');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3001;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Session Configuration
app.use(
    session({
        secret: 'stowqr_secret', // Change this to a strong secret
        resave: false,
        saveUninitialized: true,
    })
);

// MySQL connection
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'stowqrpassword',
    database: 'stowqr',
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database.');
});

// Routes

// Create Account Endpoint
app.post('/create-account', (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).send('All fields are required.');
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const query = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';

    connection.query(query, [name, email, hashedPassword], (err) => {
        if (err) {
            console.error('Error creating account:', err);
            return res.status(500).send('Error creating account.');
        }
        res.redirect('/sign-in.html');
    });
});

// Sign In Endpoint
app.post('/sign-in', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const query = 'SELECT * FROM users WHERE email = ?';

    connection.query(query, [email], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Server error.' });
        }

        if (results.length === 0) {
            return res.status(400).json({ success: false, message: 'Incorrect email or password.' });
        }

        const user = results[0];

        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(400).json({ success: false, message: 'Incorrect email or password.' });
        }

        req.session.userId = user.id;
        req.session.userName = user.name;

        console.log(`User logged in: ${user.name}`);
        res.json({ success: true, redirect: '/dashboard.html' });
    });
});

// Logout Endpoint
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error logging out:', err);
            return res.status(500).send('Error logging out.');
        }
        res.redirect('/sign-in.html'); // Redirect to the sign-in page after logout
    });
});


// Add Item Endpoint
app.post('/add-item', (req, res) => {
    const { name, location, quantity, category } = req.body;

    if (!name || !location || !quantity || !category) {
        return res.status(400).send('All fields are required.');
    }

    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).send('Unauthorized. Please log in.');
    }

    const query = 'INSERT INTO items (user_id, name, location, quantity, category) VALUES (?, ?, ?, ?, ?)';
    connection.query(query, [userId, name, location, quantity, category], (err) => {
        if (err) {
            console.error('Error adding item:', err);
            return res.status(500).send('Error adding item.');
        }
        res.redirect('/dashboard.html');
    });
});

// Middleware to check session
function isAuthenticated(req, res, next) {
    if (req.session.userId) return next();
    return res.redirect('/sign-in.html');
}

// Dashboard Route (Protected)
app.get('/dashboard', isAuthenticated, (req, res) => {
    res.sendFile(__dirname + '/dashboard.html');
});

app.get('/get-username', isAuthenticated, (req, res) => {
    res.json({ userName: req.session.userName });
});

app.get('/get-items', (req, res) => {
    const { location } = req.query;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
    }

    if (!location) {
        return res.status(400).json({ success: false, message: 'Location is required.' });
    }

    const query = 'SELECT name, quantity, category FROM items WHERE user_id = ? AND location = ?';
    connection.query(query, [userId, location], (err, results) => {
        if (err) {
            console.error('Error fetching items:', err);
            return res.status(500).json({ success: false, message: 'Error fetching items.' });
        }

        if (results.length === 0) {
            return res.json({ success: false, message: 'No items found for this location.' });
        }

        res.json({ success: true, items: results });
    });
});



// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
});

// Search Items Endpoint
app.post('/search-items', (req, res) => {
    const { searchQuery } = req.body;

    if (!searchQuery) {
        return res.status(400).send('Search query cannot be empty.');
    }

    const userId = req.session.userId; // Retrieve the user ID from the session
    if (!userId) {
        return res.status(401).send('Unauthorized. Please log in.');
    }

    const query = 'SELECT * FROM items WHERE user_id = ? AND name LIKE ?';
    connection.query(query, [userId, `%${searchQuery}%`], (err, results) => {
        if (err) {
            console.error('Error searching items:', err);
            return res.status(500).send('Error searching items.');
        }
        res.json(results); // Return the search results as JSON
    });
});
