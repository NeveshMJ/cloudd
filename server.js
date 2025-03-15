const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'veiws'))); // Serve HTML, CSS, JS from "veiws" folder
app.use('/images', express.static(path.join(__dirname, 'images'))); // Serve images from "images" folder

// Connect to MongoDB
mongoose.connect("mongodb+srv://reksitrajan01:8n4SHiaJfCZRrimg@cluster0.mperr.mongodb.net/test?retryWrites=true&w=majority")
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  gender: { type: String, required: true, enum: ['male', 'female', 'other'] },
  password: { type: String, required: true }
});

// User Model
const User = mongoose.model('User', userSchema);

// Root route handler - redirect to login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'veiws', 'login.html'));
});

// Routes
app.post('/signup', async (req, res) => {
  try {
    const { fullName, email, gender, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create new user
    const newUser = new User({
      fullName,
      email,
      gender,
      password: hashedPassword
    });
    
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }
    
    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }
    
    // Send success response
    res.status(200).json({ message: 'Login successful', user: { id: user._id, name: user.fullName } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Debug route to test server
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running correctly' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
