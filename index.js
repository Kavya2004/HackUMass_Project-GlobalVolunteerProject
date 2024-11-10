import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import pg from 'pg';
dotenv.config();

const app = express();
const port = 3000;

// Database configuration
const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: 5432,
});

db.connect();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

let currentUserId = 1;

// Database initialization queries
const initQueries = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(50) NOT NULL
  );`,
  
  `CREATE TABLE IF NOT EXISTS visited_countries (
    id SERIAL PRIMARY KEY,
    country_code VARCHAR(2) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    UNIQUE(country_code, user_id)
  );`,
  
  `CREATE TABLE IF NOT EXISTS country_info (
    id SERIAL PRIMARY KEY,
    country_code VARCHAR(2) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    info TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`
];

// Initialize database tables
async function initializeDatabase() {
  try {
    for (const query of initQueries) {
      await db.query(query);
    }
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

initializeDatabase();

// Get visited countries for current user
async function checkVisited() {
  const result = await db.query(
    'SELECT country_code FROM visited_countries WHERE user_id = $1;',
    [currentUserId]
  );
  return result.rows.map(row => row.country_code);
}

// Get current user data
async function getCurrentUser() {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [currentUserId]);
  return result.rows[0];
}

// Get all users
async function getAllUsers() {
  const result = await db.query('SELECT * FROM users ORDER BY id');
  return result.rows;
}

// Main route
app.get('/', async (req, res) => {
  try {
    const countries = await checkVisited();
    const currentUser = await getCurrentUser();
    const users = await getAllUsers();
    
    res.render('index.ejs', {
      countries: countries,
      total: countries.length,
      users: users,
      color: currentUser.color,
      currentUserId: currentUserId
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Add visited country
app.post('/add', async (req, res) => {
  const countryCode = req.body.country.toUpperCase();
  
  try {
    await db.query(
      'INSERT INTO visited_countries (country_code, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [countryCode, currentUserId]
    );
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding country');
  }
});

// Get country information
app.get('/country-info/:countryCode', async (req, res) => {
  const countryCode = req.params.countryCode;
  
  try {
    const result = await db.query(
      `SELECT info, to_char(created_at, 'MM/DD/YYYY') as formatted_date
       FROM country_info 
       WHERE country_code = $1 AND user_id = $2 
       ORDER BY created_at DESC`,
      [countryCode, currentUserId]
    );

    if (result.rows.length > 0) {
      const formattedInfo = result.rows.map(row => {
        return `[${row.formatted_date}] ${row.info}`;
      }).join('\n\n');
      
      res.json({ success: true, info: formattedInfo });
    } else {
      res.json({ success: true, info: null });
    }
  } catch (err) {
    console.error('Error fetching country info:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch country information' 
    });
  }
});

// Add country information
app.post('/add-country-info', async (req, res) => {
  const { countryCode, info } = req.body;

  if (!countryCode || !info || !info.trim()) {
    return res.status(400).json({ 
      success: false,
      error: 'Country code and information are required' 
    });
  }

  try {
    const result = await db.query(
      `INSERT INTO country_info (country_code, user_id, info) 
       VALUES ($1, $2, $3) 
       RETURNING *, to_char(created_at, 'MM/DD/YYYY') as formatted_date`,
      [countryCode, currentUserId, info.trim()]
    );

    if (result.rows.length > 0) {
      res.json({ 
        success: true,
        message: 'Information saved successfully',
        data: result.rows[0]
      });
    } else {
      throw new Error('Database operation completed but no data returned');
    }
  } catch (err) {
    console.error('Error saving country info:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to save information'
    });
  }
});

// Switch user
app.post('/user', async (req, res) => {
  if (req.body.add === 'new') {
    res.render('new.ejs');
  } else {
    currentUserId = req.body.user;
    res.redirect('/');
  }
});

// Add new user
app.post('/new', async (req, res) => {
  const { name, color } = req.body;
  
  try {
    const result = await db.query(
      'INSERT INTO users (name, color) VALUES($1, $2) RETURNING *;',
      [name, color]
    );
    currentUserId = result.rows[0].id;
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error creating new user');
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
