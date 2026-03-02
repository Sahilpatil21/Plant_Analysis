const express = require('express');
const Userrouter = express.Router();
const {isAuthenticated, registerget, registerpost, getLoggedin, LoginSuccess} = require('../Controllers/UserController');
const PlantAnalysis = require('../model/PlantAnalysis');
const multer = require('multer');
const rateLimit = require("express-rate-limit");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const pdf = require('pdf-creator-node');

// Configure multer for UserRouter
const upload = multer({ dest: "upload/" });

// Initialize Google Generative AI
let genAI;
if (!global.genAI) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API);
  global.genAI = genAI;
} else {
  genAI = global.genAI;
}

// Rate limiting
const plantAnalyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // Limit each IP to 5 requests per window
  message: {
    error: "Too many plant scans! Please wait 15 minutes before trying again."
  },
  standardHeaders: true, // Sends RateLimit headers to the user
  legacyHeaders: false,
});

// Helper functions to extract information from analysis
function extractPlantName(analysis) {
  const lines = analysis.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Prefer an explicit "Plant Name:" / "Species:" style field if present
  for (const line of lines) {
    const match = line.match(/^(plant\s*name|species)\s*[:\-]\s*(.+)$/i);
    if (match && match[2]) {
      return match[2].trim();
    }
  }

  // Fallback: just use the first non-empty line as the name/title
  if (lines.length > 0) {
    return lines[0];
  }

  return 'Unknown Plant';
}

function extractHealthStatus(analysis) {
  const lowerAnalysis = analysis.toLowerCase();
  if (lowerAnalysis.includes('healthy') || lowerAnalysis.includes('good condition')) {
    return 'healthy';
  } else if (lowerAnalysis.includes('needs care') || lowerAnalysis.includes('attention')) {
    return 'needs-care';
  } else if (lowerAnalysis.includes('unhealthy') || lowerAnalysis.includes('diseased')) {
    return 'unhealthy';
  }
  return 'unknown';
}

function extractCareRecommendations(analysis) {
  const lines = analysis.split('\n');
  const careLines = lines.filter(line => 
    line.toLowerCase().includes('care') || 
    line.toLowerCase().includes('recommend') || 
    line.toLowerCase().includes('water') ||
    line.toLowerCase().includes('sunlight')
  );
  return careLines.join('\n').trim();
}

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

// Analyze route - requires authentication so we can save per-user history
Userrouter.post("/analyze", isAuthenticated, plantAnalyzeLimiter, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    const imagePath = req.file.path;
    const imageData = await fsPromises.readFile(imagePath, {
      encoding: "base64",
    });

    // Get language preference from form data
    const language = req.body.language || 'english';

    // Use the Gemini model to analyze the image
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    
    // For image analysis, we'll use the vision model with language-specific prompt
    let prompt;
    if (language === 'marathi') {
      prompt = "Analyze this plant image and provide a detailed analysis of its species, health, and care recommendations, its characteristics, care instructions, and any interesting facts. VERY IMPORTANT: The first line of the response must be exactly in the format \"Plant Name: <name>\" in Marathi (for example: \"Plant Name: मनी प्लांट\"). After that first line, provide the rest of the analysis in Marathi language (मराठी मध्ये) without using any markdown formatting and in about 700 words.";
    } else {
      prompt = "Analyze this plant image and provide a detailed analysis of its species, health, and care recommendations, its characteristics, care instructions, and any interesting facts. VERY IMPORTANT: The first line of the response must be exactly in the format \"Plant Name: <name>\" (for example: \"Plant Name: Money Plant\"). After that first line, provide the rest of the analysis in plain text without using any markdown formatting and in about 700 words.";
    }
    
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: req.file.mimetype,
                data: imageData,
              },
            },
          ],
        },
      ],
    });

    const plantInfo = result.response.text();

    // Extract plant name and health status from analysis
    const plantName = extractPlantName(plantInfo);
    const healthStatus = extractHealthStatus(plantInfo);
    const careRecommendations = extractCareRecommendations(plantInfo);

    // Save analysis to database (user is guaranteed by isAuthenticated)
    const savedAnalysis = await PlantAnalysis.create({
      userId: req.user.id,
      plantName: plantName,
      analysisResult: plantInfo,
      language: language,
      imageData: `data:${req.file.mimetype};base64,${imageData}`,
      imageMimeType: req.file.mimetype,
      healthStatus: healthStatus,
      careRecommendations: careRecommendations
    });

    // Clean up: delete the uploaded file
    await fsPromises.unlink(imagePath);

    // Respond with the analysis result and the image data
    res.json({
      result: plantInfo,
      image: `data:${req.file.mimetype};base64,${imageData}`,
      language: language,
      analysisId: savedAnalysis?._id || null
    });
  } catch (error) {
    console.error("Error analyzing image:", error);
    res
      .status(500)
      .json({ error: "An error occurred while analyzing the image" });
  }
});

// User history page
Userrouter.get('/history', isAuthenticated, async (req, res) => {
    try {
        console.log('History route accessed, user:', req.user); // Debug log
        console.log('User ID:', req.user?.id); // Debug log
        
        if (!req.user || !req.user.id) {
            console.log('No user found in request, redirecting to login');
            return res.redirect('/login');
        }
        
        const analyses = await PlantAnalysis.find({ userId: req.user.id })
            .sort({ analyzedAt: -1 })
            .limit(50); // Limit to last 50 analyses
        
        console.log('Found analyses:', analyses.length); // Debug log
        res.render('history', { analyses });
    } catch (error) {
        console.error('Error fetching user history:', error);
        res.render('history', { analyses: [] });
    }
});

// API routes for analysis management
Userrouter.get('/api/analysis/:id', isAuthenticated, async (req, res) => {
    try {
        const analysis = await PlantAnalysis.findOne({ 
            _id: req.params.id, 
            userId: req.user.id 
        });
        
        if (!analysis) {
            return res.status(404).json({ error: 'Analysis not found' });
        }
        
        res.json(analysis);
    } catch (error) {
        console.error('Error fetching analysis:', error);
        res.status(500).json({ error: 'Error fetching analysis' });
    }
});

Userrouter.delete('/api/analysis/:id', isAuthenticated, async (req, res) => {
    try {
        const result = await PlantAnalysis.deleteOne({ 
            _id: req.params.id, 
            userId: req.user.id 
        });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Analysis not found' });
        }
        
        res.json({ message: 'Analysis deleted successfully' });
    } catch (error) {
        console.error('Error deleting analysis:', error);
        res.status(500).json({ error: 'Error deleting analysis' });
    }
});

// Handle both GET and POST for logout
const handleLogout = (req, res) => {
    res.clearCookie('Token');
    res.redirect('/login');
};

Userrouter.get('/logout', isAuthenticated, handleLogout);
Userrouter.post('/logout', isAuthenticated, handleLogout);
module.exports=Userrouter