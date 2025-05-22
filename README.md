# Secure File Upload & Metadata Processing Microservice

A Node.js backend microservice that handles authenticated file uploads, stores associated metadata in a database, and processes those files asynchronously.

## Features

- User authentication using JWT
- Secure file upload with metadata
- Asynchronous file processing using BullMQ
- File status tracking
- PostgreSQL database integration using Prisma
- API documentation using Swagger/OpenAPI
- Rate limiting and file size restrictions
- Pagination for file listings

## Prerequisites

- Node.js >= 18
- PostgreSQL
- Redis (for BullMQ)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd secure-file-upload-service
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# Database Configuration
DATABASE_URL="postgresql://user:password@localhost:5432/file_upload_db?schema=public"

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# File Upload Configuration
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads

# Rate Limiting
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX=100
```

4. Initialize the database:
```bash
npx prisma migrate dev
```

5. Create the uploads directory:
```bash
mkdir uploads
```

## Running the Application

1. Start the development server:
```bash
npm run dev
```

2. The server will be running at `http://localhost:3000`

## API Documentation

Once the server is running, you can access the Swagger documentation at:
`http://localhost:3000/api-docs`

### API Endpoints

#### Authentication
- POST /auth/register - Register a new user
- POST /auth/login - Login and get JWT token

#### File Operations
- POST /files/upload - Upload a file with metadata
- GET /files/:id - Get file information by ID
- GET /files - List all files (with pagination)

## Security Features

1. JWT Authentication
   - All endpoints (except login and health check) require authentication
   - Tokens expire after 24 hours

2. File Upload Security
   - File size limit (default: 5MB)
   - Secure file naming
   - File type validation
   - User-specific file access

3. Rate Limiting
   - API rate limiting per user
   - Configurable time window and request limit

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Files Table
```sql
CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  original_filename VARCHAR(255) NOT NULL,
  storage_path TEXT NOT NULL,
  title VARCHAR(255),
  description TEXT,
  status VARCHAR(50) CHECK (status IN ('uploaded', 'processing', 'processed', 'failed')) NOT NULL DEFAULT 'uploaded',
  extracted_data TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Background Processing

The service uses BullMQ for handling asynchronous file processing:

1. When a file is uploaded:
   - File is saved to disk
   - Metadata is stored in database
   - Processing job is queued

2. Background worker:
   - Picks up jobs from the queue
   - Processes files (calculates hash, simulates processing)
   - Updates file status and extracted data

## Error Handling

- Comprehensive error handling for all API endpoints
- Failed job retry mechanism
- Detailed error logging
- User-friendly error messages

## Development

### Running Tests
```bash
npm test
```

### Code Style
The project follows standard Node.js/JavaScript best practices and uses ESLint for code style enforcement.

## Limitations and Future Improvements

1. Current Limitations
   - Single-server deployment
   - Local file storage
   - Basic file processing simulation

2. Potential Improvements
   - Cloud storage integration (S3, GCS)
   - More sophisticated file processing
   - Websocket notifications for file status
   - Enhanced security features
   - Docker containerization

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 