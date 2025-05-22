// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3001'; // Use a different port for tests
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.UPLOAD_PATH = './uploads';
process.env.MAX_FILE_SIZE = '5242880';

// Redis config for tests
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Increase timeout for async tests
jest.setTimeout(10000);

// Import required modules
const { PrismaClient } = require('@prisma/client');
const app = require('../index');
const { fileQueue, worker } = require('../services/fileProcessor');

const prisma = new PrismaClient();
let server;

// Add a dummy test to satisfy Jest
describe('Test Environment Setup', () => {
  it('should set up test environment correctly', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.PORT).toBe('3001');
  });
});

// Setup before all tests
beforeAll(async () => {
  // Start server on test port
  server = app.listen(process.env.PORT);
});

// Clean up after all tests
afterAll(async () => {
  // Close server
  await new Promise((resolve) => server.close(resolve));
  
  // Close Prisma connection
  await prisma.$disconnect();
  
  // Close Redis connections
  try {
    await fileQueue.close();
    await worker.close();
  } catch (error) {
    console.warn('Redis cleanup warning:', error.message);
  }
  
  // Add a small delay to ensure all connections are properly closed
  await new Promise(resolve => setTimeout(resolve, 500));
}); 