require("dotenv").config();
console.log("Gemini Key Loaded:", process.env.GEMINI_API);

const express = require("express");
const multer = require("multer");
const cookieParser = require('cookie-parser');
const PDFDocument = require("pdfkit");
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const PlantAnalysis = require('./model/PlantAnalysis');
const rateLimit = require("express-rate-limit");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("public"));

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Configure multer
const upload = multer({ dest: "upload/" });

// Initialize Google Generative AI
let genAI;
if (!global.genAI) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API);
  global.genAI = genAI;
  console.log('Gemini AI client initialized');
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
  standardHeaders: true,
  legacyHeaders: false,
});

// Import and use UserRouter
const UserRouter=require("./routes/UserRoutes");
console.log('Registering routes...');
app.use('/',UserRouter);
console.log('Routes registered successfully');

//download pdf
app.post("/download", express.json(), async (req, res) => {
  const { result, image, language } = req.body;
  try {
    // Ensure the reports directory exists
    const reportsDir = path.join(__dirname, "reports");
    await fsPromises.mkdir(reportsDir, { recursive: true });
    
    // Generate PDF
    const filename = `plant_analysis_report_${Date.now()}.pdf`;
    const filePath = path.join(reportsDir, filename);
    
    // Create a new PDF document
    const doc = new PDFDocument();
    
    // Pipe the PDF to a file
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    
    // Add content to PDF
    doc.fontSize(20).text('Plant Analysis Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString()}`);
    doc.moveDown();
    doc.fontSize(14).text(result);
    
    // Add image if provided
    if (image) {
      doc.moveDown();
      const imageData = image.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(imageData, 'base64');
      doc.image(buffer, { fit: [500, 300], align: 'center' });
    }
    
    // Finalize the PDF
    doc.end();
    
    // Wait for the PDF to be written
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    
    // Send PDF file
    res.download(filePath, (err) => {
      if (err) {
        res.status(500).json({ error: "Error downloading the PDF report" });
      }
      // Clean up file after download
      fsPromises.unlink(filePath).catch(console.error);
    });
    
  } catch (error) {
    console.error("Error generating PDF report:", error);
    res.status(500).json({ error: "An error occurred while generating the PDF report" });
  }
});

const PORT = process.env.PORT || 3000;
//start the server
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
