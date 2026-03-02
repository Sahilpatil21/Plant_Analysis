const mongoose = require("mongoose");

const PlantAnalysisSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    plantName: {
        type: String,
        default: 'Unknown Plant'
    },
    analysisResult: {
        type: String,
        required: true
    },
    language: {
        type: String,
        enum: ['english', 'marathi'],
        default: 'english'
    },
    imageData: {
        type: String, // Base64 image data
        required: true
    },
    imageMimeType: {
        type: String,
        required: true
    },
    analyzedAt: {
        type: Date,
        default: Date.now
    },
    healthStatus: {
        type: String,
        enum: ['healthy', 'needs-care', 'unhealthy', 'unknown'],
        default: 'unknown'
    },
    careRecommendations: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Create index for efficient querying
PlantAnalysisSchema.index({ userId: 1, analyzedAt: -1 });

const PlantAnalysis = mongoose.model("PlantAnalysis", PlantAnalysisSchema);
module.exports = PlantAnalysis;
