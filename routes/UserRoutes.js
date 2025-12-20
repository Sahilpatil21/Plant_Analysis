const express = require('express');
const Userrouter = express.Router();
const {isAuthenticated, registerget, registerpost, getLoggedin, LoginSuccess} = require('../Controllers/UserController');


Userrouter.get('/', (req, res) => {
    res.render('landingpage');
});
Userrouter.get('/register', registerget);
Userrouter.post('/register', registerpost);
Userrouter.get('/login', getLoggedin);
Userrouter.post('/login', LoginSuccess);
Userrouter.get('/analyze', isAuthenticated, (req, res) => {
    res.render('index');
});
// Handle both GET and POST for logout
const handleLogout = (req, res) => {
    res.clearCookie('Token');
    res.redirect('/login');
};

Userrouter.get('/logout', isAuthenticated, handleLogout);
Userrouter.post('/logout', isAuthenticated, handleLogout);
module.exports=Userrouter