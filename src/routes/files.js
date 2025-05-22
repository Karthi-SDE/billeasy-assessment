const express = require('express');
const multer = require('multer');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const { addFileProcessingJob } = require('../services/fileProcessor');

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_PATH || './uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880') // 5MB default
  }
});

/**
 * @swagger
 * /files/upload:
 *   post:
 *     summary: Upload a file with metadata
 *     security:
 *       - BearerAuth: []
 *     tags: [Files]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, description } = req.body;
    const file = await prisma.file.create({
      data: {
        userId: req.user.id,
        originalFilename: req.file.originalname,
        storagePath: req.file.path,
        title,
        description,
        status: 'uploaded'
      }
    });

    // Add job to process the file
    await addFileProcessingJob(file.id, req.file.path);

    res.status(201).json({
      id: file.id,
      status: file.status,
      message: 'File uploaded successfully and queued for processing'
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Error uploading file' });
  }
});

/**
 * @swagger
 * /files/{id}:
 *   get:
 *     summary: Get file information by ID
 *     security:
 *       - BearerAuth: []
 *     tags: [Files]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: File information retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: File not found
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const file = await prisma.file.findUnique({
      where: { id: fileId }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if user owns the file
    if (file.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      id: file.id,
      originalFilename: file.originalFilename,
      title: file.title,
      description: file.description,
      status: file.status,
      extractedData: file.extractedData ? JSON.parse(file.extractedData) : null,
      uploadedAt: file.uploadedAt
    });
  } catch (error) {
    console.error('File retrieval error:', error);
    res.status(500).json({ error: 'Error retrieving file information' });
  }
});

/**
 * @swagger
 * /files:
 *   get:
 *     summary: Get all files for the authenticated user
 *     security:
 *       - BearerAuth: []
 *     tags: [Files]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of files retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [files, total] = await Promise.all([
      prisma.file.findMany({
        where: { userId: req.user.id },
        skip,
        take: limit,
        orderBy: { uploadedAt: 'desc' }
      }),
      prisma.file.count({
        where: { userId: req.user.id }
      })
    ]);

    res.json({
      files: files.map(file => ({
        id: file.id,
        originalFilename: file.originalFilename,
        title: file.title,
        status: file.status,
        uploadedAt: file.uploadedAt
      })),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    });
  } catch (error) {
    console.error('Files retrieval error:', error);
    res.status(500).json({ error: 'Error retrieving files' });
  }
});

module.exports = router; 