// console.log("Gemini Key Loaded:", process.env.GEMINI_API_KEY);

require("dotenv").config();
// require('dotenv').config();
console.log("Gemini Key Loaded:", process.env.GEMINI_API);

const express = require("express");
const multer = require("multer");
const cookieParser = require('cookie-parser');
const PDFDocument = require("pdfkit");
const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();

const port = process.env.PORT || 5000;

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("public"));

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Configure multer first
const upload = multer({ dest: "upload/" });

// Initialize Google Generative AI with singleton pattern
let genAI;
if (!global.genAI) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API);
  global.genAI = genAI;
  console.log('Gemini AI client initialized');
} else {
  genAI = global.genAI;
}

const rateLimit = require("express-rate-limit");

// 1. Define the limit
const plantAnalyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // Limit each IP to 5 requests per window
  message: {
    error: "Too many plant scans! Please wait 15 minutes before trying again."
  },
  standardHeaders: 'draft-7', // Sends RateLimit headers to the user
  legacyHeaders: false,
});


// Configure express middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));
const UserRouter=require("./routes/UserRoutes");
//routes
app.use('/',UserRouter);
//analyze
app.post("/analyze", plantAnalyzeLimiter,upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    const imagePath = req.file.path;
    const imageData = await fsPromises.readFile(imagePath, {
      encoding: "base64",
    });

    // Use the Gemini model to analyze the image
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    
    // For image analysis, we'll use the vision model
    const prompt = "Analyze this plant image and provide detailed analysis of its species, health, and care recommendations, its characteristics, care instructions, and any interesting facts. Please provide the response in plain text without using any markdown formatting.";
    
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

    // Clean up: delete the uploaded file
    await fsPromises.unlink(imagePath);

    // Respond with the analysis result and the image data
    res.json({
      result: plantInfo,
      image: `data:${req.file.mimetype};base64,${imageData}`,
    });
  } catch (error) {
    console.error("Error analyzing image:", error);
    res
      .status(500)
      .json({ error: "An error occurred while analyzing the image" });
  }
});
app.get("/list-models", async (req, res) => {
  try {
    const models = await genAI.listModels();
    res.json(models);
  } catch (error) {
    console.error("Error listing models:", error);
    res.status(500).json({ error: "Failed to list models" });
  }
});

//download pdf
app.post("/download", express.json(), async (req, res) => {
  const { result, image } = req.body;
  try {
    //Ensure the reports directory exists
    const reportsDir = path.join(__dirname, "reports");
    await fsPromises.mkdir(reportsDir, { recursive: true });
    //generate pdf
    const filename = `plant_analysis_report_${Date.now()}.pdf`;
    const filePath = path.join(reportsDir, filename);
    const writeStream = fs.createWriteStream(filePath);
    const doc = new PDFDocument();
    doc.pipe(writeStream);
    // Add content to the PDF
    doc.fontSize(24).text("Plant Analysis Report", {
      align: "center",
    });
    doc.moveDown();
    doc.fontSize(24).text(`Date: ${new Date().toLocaleDateString()}`);
    doc.moveDown();
    doc.fontSize(14).text(result, { align: "left" });
    //insert image to the pdf
    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      doc.moveDown();
      doc.image(buffer, {
        fit: [500, 300],
        align: "center",
        valign: "center",
      });
    }
    doc.end();
    //wait for the pdf to be created
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
    res.download(filePath, (err) => {
      if (err) {
        res.status(500).json({ error: "Error downloading the PDF report" });
      }
      fsPromises.unlink(filePath);
    });
  } catch (error) {
    console.error("Error generating PDF report:", error);
    res
      .status(500)
      .json({ error: "An error occurred while generating the PDF report" });
  }
});
//start the server
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});