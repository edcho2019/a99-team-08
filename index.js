import express from 'express';
import minimist from 'minimist';
import { engine } from 'express-handlebars';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcrypt';

const session = require('express-session');

const args = minimist(process.argv.slice(2));

const port = args.port || 5000;

const SALT_ROUNDS = 10;

const app = express();

app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', './views');

app.use(express.urlencoded({extended: true}));

app.use(session({
  resave: false,
  saveUninitialized: false,
  secret: 'world_cup',
  cookie: {
    sameSite: true
  }
}));

const dbPromise = open({
  filename: 'data.db',
  driver: sqlite3.Database
});

app.get('/app/', async (req, res) => {
  const { logged_in, username } = req.session;
  if (logged_in) {
    const db = await dbPromise;
    const user_info = await db.all('SELECT email, username, team FROM User WHERE username=?;', username);
    const email = user_info[0].email;
    const team = user_info[0].team;
    const matches = await db.all('SELECT * FROM Match WHERE team1=? OR team2=?;', team, team);
    const teams = await db.all('SELECT * FROM Team ORDER BY name;');
    res.render('home', { email, username, team, matches, teams });
  }
  else {
    res.redirect('/app/login/');
  }
});

app.get('/app/register/', async (req, res) => {
  const { logged_in, username } = req.session;
  if (logged_in) {
    res.redirect('/app/');
  }
  else {
    const db = await dbPromise;
    const teams = await db.all('SELECT * FROM Team ORDER BY name;');
    res.render('register', { teams });
  }
});

app.post('/app/register/', async (req, res) => {
  const db = await dbPromise;
  const { email, username, password, passwordRepeat, team } = req.body;
  if (password != passwordRepeat) {
    const teams = await db.all('SELECT * FROM Team ORDER BY name;');
    res.render('register', { teams, error: "Passwords must match" });
  }
  else {
    const users = await db.all('SELECT email, username FROM User WHERE email=? OR username=?;', email, username);
    if (users.length > 0) {
      const teams = await db.all('SELECT * FROM Team ORDER BY name;');
      res.render('register', { teams, error: "Email and/or username is already in use" });
    }
    else {
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      await db.run('INSERT INTO User (email, username, password, team) VALUES (?, ?, ?, ?);', email, username, passwordHash, team);
      req.session.logged_in = true;
      req.session.username = username;
      res.redirect('/app/');
    }
  }
});

app.get('/app/login/', (req, res) => {
  const { logged_in, username } = req.session;
  if (logged_in) {
    res.redirect('/app/')
  }
  else {
    res.render('login');
  }
});

app.post('/app/login/', async (req, res) => {
  const db = await dbPromise;
  const { username, password } = req.body;
  const users = await db.all('SELECT email, username, password, team FROM User WHERE username=?;', username);
  if (users.length == 0) {
    res.render('login', { error: "Account does not exist" });
  }
  else {
    const password_match = await bcrypt.compare(password, users[0].password);
    if (!password_match) {
      res.render('login', { error: "Incorrect password" });
    }
    else {
      req.session.logged_in = true;
      req.session.username = username;
      res.redirect('/app/');
    }
  }
});

app.post('/app/change_team/', async (req, res) => {
  const db = await dbPromise;
  await db.run('UPDATE User SET team=? WHERE username=?;', req.body.team, req.session.username);
  res.redirect('/app/');
});

app.post('/app/logout/', (req, res) => {
  req.session.logged_in = false;
  req.session.username = undefined;
  res.redirect('/app/login/');
});

app.post('/app/delete_account/', async (req, res) => {
  const db = await dbPromise;
  await db.run('DELETE FROM User WHERE username=?;', req.session.username);
  req.session.logged_in = false;
  req.session.username = undefined;
  res.redirect('/app/login/');
});

app.get('*', (req, res) => {
  res.status(404).send('404 NOT FOUND');
});

const setup = async () => {
  const db = await dbPromise;
  await db.migrate();
  const server = app.listen(port, () => {
    console.log(`Listening on localhost:${port}`);
  });
}

setup();
