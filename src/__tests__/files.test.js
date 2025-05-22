const request = require('supertest');
const path = require('path');
const fs = require('fs').promises;
const app = require('../index');
const { PrismaClient } = require('@prisma/client');
const { fileQueue, worker } = require('../services/fileProcessor');

const prisma = new PrismaClient();
let authToken;
let userId;
let testFileId;

describe('File Upload and Retrieval', () => {
  beforeAll(async () => {
    // Clean up the test database
    await prisma.file.deleteMany();
    await prisma.user.deleteMany();

    // Create a test user
    const response = await request(app)
      .post('/auth/register')
      .send({
        email: 'filetest@example.com',
        password: 'password123'
      });

    authToken = response.body.token;
    userId = response.body.user.id;

    // Create test upload directory if it doesn't exist
    try {
      await fs.mkdir(path.join(__dirname, '../../uploads'), { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await fileQueue.close();
    await worker.close();
  });

  describe('POST /files/upload', () => {
    it('should upload a file successfully', async () => {
      // Create a test file
      const testFilePath = path.join(__dirname, 'test.txt');
      await fs.writeFile(testFilePath, 'Test file content');

      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('title', 'Test File')
        .field('description', 'Test file description');

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('uploaded');

      testFileId = response.body.id;

      // Clean up test file
      await fs.unlink(testFilePath);
    });

    it('should not allow upload without authentication', async () => {
      const response = await request(app)
        .post('/files/upload')
        .attach('file', Buffer.from('test'), 'test.txt');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /files/:id', () => {
    it('should retrieve file information', async () => {
      const response = await request(app)
        .get(`/files/${testFileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', testFileId);
      expect(response.body).toHaveProperty('title', 'Test File');
      expect(response.body).toHaveProperty('description', 'Test file description');
    });

    it('should not allow access to other users files', async () => {
      // Create another user
      const otherUserResponse = await request(app)
        .post('/auth/register')
        .send({
          email: 'other@example.com',
          password: 'password123'
        });

      const response = await request(app)
        .get(`/files/${testFileId}`)
        .set('Authorization', `Bearer ${otherUserResponse.body.token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /files', () => {
    it('should list user files with pagination', async () => {
      const response = await request(app)
        .get('/files')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('files');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.files)).toBe(true);
      expect(response.body.files.length).toBeGreaterThan(0);
    });

    it('should return empty array for user with no files', async () => {
      // Create another user
      const otherUserResponse = await request(app)
        .post('/auth/register')
        .send({
          email: 'nofiles@example.com',
          password: 'password123'
        });

      const response = await request(app)
        .get('/files')
        .set('Authorization', `Bearer ${otherUserResponse.body.token}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.files).toHaveLength(0);
      expect(response.body.pagination.totalItems).toBe(0);
    });
  });
}); 