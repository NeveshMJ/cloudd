const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');
const AWS = require('aws-sdk');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();

// Use the PORT environment variable provided by Render, or fallback to 6000 for local development
const port = process.env.PORT || 6000;


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'veiws'))); // Serving from "veiws" folder as in your original code
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

// Configure AWS S3
AWS.config.update({
  accessKeyId: YOUR_AWS_ACCESS_KEY_ID,
  secretAccessKey: YOUR_AWS_SECRET_ACCESS_KEY,
  region: YOUR_AWS_REGION
});

const s3 = new AWS.S3();
const bucketName = 'YOUR_BUCKET_NAME';// Your S3 bucket name

const reportsS3 = new AWS.S3({
  accessKeyId: YOUR_REPORTS_AWS_ACCESS_KEY_ID,
  secretAccessKey: YOUR_REPORTS_AWS_SECRET_ACCESS_KEY,
  region: YOUR_REPORTS_AWS_REGION  // Use reports region or fall back to main region
});
const reportsBucketName = 'YOUR_BUCKET_NAME';
const reportPrefix = 'YOUR_BUCKET_NAME/FOLDER_NAME/';
// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

const upload = multer({ storage: storage });

// Root route handler - redirect to login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'veiws', 'login.html'));
});

// Authentication routes
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

// S3 File Upload Routes
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const fileContent = fs.readFileSync(req.file.path);
    const fileType = req.body.type || 'file';
    
    // Determine the prefix based on file type
    let prefix = '';
    if (fileType === 'image') {
      prefix = 'images/';
    } else {
      prefix = 'files/';
    }

    // Upload to S3
    const params = {
      Bucket: bucketName,
      Key: `${prefix}${req.file.originalname}`,
      Body: fileContent,
      ContentType: req.file.mimetype
    };

    const uploadResult = await s3.upload(params).promise();
    
    // Delete the temporary file
    fs.unlinkSync(req.file.path);
    
    res.status(200).json({ 
      message: 'File uploaded successfully', 
      fileUrl: uploadResult.Location 
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Server error during upload' });
  }
});

// Folder upload route
app.post('/upload-folder', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const fileContent = fs.readFileSync(req.file.path);
    const filePath = req.body.path || req.file.originalname;
    
    // Upload to S3
    const params = {
      Bucket: bucketName,
      Key: filePath,
      Body: fileContent,
      ContentType: req.file.mimetype
    };

    const uploadResult = await s3.upload(params).promise();
    
    // Delete the temporary file
    fs.unlinkSync(req.file.path);
    
    res.status(200).json({ 
      message: 'File uploaded successfully', 
      fileUrl: uploadResult.Location 
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Server error during upload' });
  }
});

// List files route
app.get('/list-files', async (req, res) => {
  try {
    const prefix = req.query.prefix || '';
    
    const params = {
      Bucket: bucketName,
      Prefix: prefix
    };

    const listResult = await s3.listObjectsV2(params).promise();
    
    // Filter out directory-like objects if needed
    const files = listResult.Contents.filter(file => {
      // Skip objects that end with '/' (directories)
      return !file.Key.endsWith('/') && file.Key !== prefix;
    });
    
    res.status(200).json({ files });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ message: 'Server error while listing files' });
  }
});

// Delete file route
app.delete('/delete-file', async (req, res) => {
  try {
    const key = req.query.key;
    
    if (!key) {
      return res.status(400).json({ message: 'File key is required' });
    }
    
    const params = {
      Bucket: bucketName,
      Key: key
    };

    await s3.deleteObject(params).promise();
    
    res.status(200).json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ message: 'Server error while deleting file' });
  }
});

// Debug route to test server
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running correctly' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
// Add this route to your Express server code
app.get('/get-s3-report', async (req, res) => {
  try {
    // Use the reports-specific S3 client and bucket name
    const reportPrefix = 'human-reports/';
    
    const params = {
      Bucket: reportsBucketName,
      Prefix: reportPrefix
    };

    // Get list of objects using the reports S3 client
    const listResult = await reportsS3.listObjectsV2(params).promise();
    
    if (!listResult.Contents || listResult.Contents.length === 0) {
      return res.status(404).json({ message: 'No reports found in human-reports folder' });
    }
    
    // Sort to get the most recent report
    const sortedReports = listResult.Contents.sort((a, b) => {
      return new Date(b.LastModified) - new Date(a.LastModified);
    });
    
    // Get the most recent report
    const latestReport = sortedReports[0];
    
    // Get the report content using the reports S3 client
    const reportParams = {
      Bucket: reportsBucketName,
      Key: latestReport.Key
    };
    
    const reportObject = await reportsS3.getObject(reportParams).promise();
    
    // Convert report content to string
    const reportContent = reportObject.Body.toString('utf-8');
    
    // Return the content
    res.status(200).json({ 
      content: reportContent,
      fileName: latestReport.Key.split('/').pop(),
      lastModified: latestReport.LastModified
    });
  } catch (error) {
    console.error('Error fetching report from S3:', error);
    res.status(500).json({ message: 'Server error while fetching report' });
  }
});
