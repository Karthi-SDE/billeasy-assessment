const { Worker, Queue } = require('bullmq');
const { createHash } = require('crypto');
const fs = require('fs').promises;
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Redis connection config
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  enableOfflineQueue: true,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 100, 3000);
  }
};

// Create queue and worker only if not in test environment or explicitly needed
let fileQueue;
let worker;

const initializeQueue = () => {
  if (!fileQueue) {
    fileQueue = new Queue('fileProcessing', {
      connection: redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    });
  }
  return fileQueue;
};

const initializeWorker = () => {
  if (!worker) {
    worker = new Worker('fileProcessing', async (job) => {
      try {
        const { fileId, filePath } = job.data;
        
        // Update status to processing
        await prisma.file.update({
          where: { id: fileId },
          data: { status: 'processing' }
        });

        // Process the file
        const result = await processFile(filePath);

        // Update the file record with processed data
        await prisma.file.update({
          where: { id: fileId },
          data: {
            status: 'processed',
            extractedData: JSON.stringify(result)
          }
        });

        return result;
      } catch (error) {
        console.error(`Job ${job.id} failed for file ${job.data.fileId}:`, error);
        
        try {
          // Update status to failed
          await prisma.file.update({
            where: { id: job.data.fileId },
            data: {
              status: 'failed',
              extractedData: JSON.stringify({ error: error.message })
            }
          });
        } catch (updateError) {
          console.error('Failed to update file status:', updateError);
        }

        throw error;
      }
    }, {
      connection: redisConfig,
      concurrency: process.env.NODE_ENV === 'test' ? 1 : 5,
      autorun: process.env.NODE_ENV !== 'test'
    });

    worker.on('completed', (job) => {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`Job ${job.id} completed for file ${job.data.fileId}`);
      }
    });

    worker.on('failed', (job, error) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error(`Job ${job.id} failed for file ${job.data.fileId}:`, error);
      }
    });

    // Handle connection errors gracefully
    worker.on('error', (err) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error('Worker error:', err);
      }
    });
  }
  return worker;
};

// Process files
const processFile = async (filePath) => {
  try {
    const fileContent = await fs.readFile(filePath);
    const hash = createHash('sha256').update(fileContent).digest('hex');
    
    // Simulate some processing time (shorter in test environment)
    await new Promise(resolve => setTimeout(resolve, process.env.NODE_ENV === 'test' ? 100 : 2000));
    
    return {
      hash,
      size: fileContent.length,
      processedAt: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`File processing failed: ${error.message}`);
  }
};

// Initialize queue and worker for non-test environments
if (process.env.NODE_ENV !== 'test') {
  fileQueue = initializeQueue();
  worker = initializeWorker();
}

// Export functions and instances
module.exports = {
  fileQueue: initializeQueue(),
  worker: initializeWorker(),
  addFileProcessingJob: async (fileId, filePath) => {
    const queue = initializeQueue();
    return queue.add('processFile', { fileId, filePath });
  }
};