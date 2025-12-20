const express = require("express");
const mongoose = require("mongoose");

// Connect to MongoDB using async/await
mongoose.connect(process.env.Url)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

const UserSchema = new mongoose.Schema({
    name: String,
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
});

const User = mongoose.model("User", UserSchema);
module.exports = User;