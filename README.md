# 🏨 Booking Service API

A production-ready hotel/property booking system built with modern Node.js stack. This project demonstrates real-world backend development skills including concurrent transaction handling, JWT authentication, asynchronous task processing, and deployment best practices.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🎯 Project Overview

This is a **portfolio project** designed to showcase enterprise-level backend development skills. Unlike simple CRUD applications, this service solves real business problems:

- **Race condition handling**: Prevents double-booking through database transactions and row-level locking
- **Complex date logic**: Manages booking availability with overlapping date range checks
- **Asynchronous processing**: Handles email notifications and heavy operations in background queues
- **Production deployment**: Live API with HTTPS, CI/CD, and monitoring

## ✨ Key Features

### Core Functionality

- 🔐 **JWT Authentication** with Access & Refresh tokens
- 🏠 **Property Management** (hotels, apartments, meeting rooms)
- 📅 **Booking System** with conflict prevention
- 🔍 **Advanced Search** with filters (dates, price, amenities, capacity)
- 📧 **Email Notifications** via background jobs
- 🚀 **RESTful API** with OpenAPI/Swagger documentation

### Technical Highlights

- ⚡ **ACID Transactions** with PostgreSQL isolation levels
- 🔒 **Race Condition Protection** using `SELECT ... FOR UPDATE`
- 📦 **Job Queue System** with BullMQ + Redis
- 🛡️ **Request Validation** using Zod schemas
- 📊 **Structured Logging** with Pino (JSON format)
- 🐳 **Dockerized** development and production environments
- ✅ **Comprehensive Testing** (Unit + Integration)

## 🛠️ Tech Stack

### Backend Core

- **Runtime**: Node.js 20 LTS
- **Language**: TypeScript 5+
- **Framework**: Express.js
- **Database**: PostgreSQL 16
- **ORM**: Prisma
- **Cache & Queue**: Redis 7

### Libraries & Tools

- **Authentication**: jose (JWT), bcrypt
- **Validation**: Zod
- **Logging**: Pino
- **Configuration**: dotenv, envalid
- **Background Jobs**: BullMQ
- **Security**: Helmet
- **Documentation**: Swagger UI Express
- **Testing**: Jest, Supertest

### Infrastructure

- **Containerization**: Docker + Docker Compose
- **Web Server**: Nginx (reverse proxy)
- **SSL/TLS**: Let's Encrypt
- **CI/CD**: GitHub Actions
- **Hosting**: VPS (Hetzner/DigitalOcean)

## 📋 Prerequisites

- Node.js 20+ and pnpm 8+
- Docker and Docker Compose
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)

### Installing pnpm

```bash
npm install -g pnpm
# or on Windows with winget
winget install -e --id pnpm.pnpm
```

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/booking-service.git
cd booking-service
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Start with Docker Compose

```bash
docker-compose up -d
```

### 5. Run database migrations

```bash
pnpm migrate
```

### 6. Start the development server

```bash
pnpm dev
```

The API will be available at `http://localhost:3000`

API documentation: `http://localhost:3000/api-docs`

## 📁 Project Structure

```
booking-service/
├── src/
│   ├── config/          # Configuration and environment validation
│   ├── controllers/     # Request handlers
│   ├── services/        # Business logic
│   ├── repositories/    # Database access layer
│   ├── middlewares/     # Express middlewares (auth, validation, error handling)
│   ├── validators/      # Zod schemas
│   ├── queues/          # BullMQ job definitions
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   ├── routes/          # API routes
│   └── app.ts           # Express app setup
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── migrations/      # Database migrations
├── tests/               # Jest tests
├── docker-compose.yml   # Local development setup
├── Dockerfile           # Production container
└── package.json
```

## 🔑 Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Application
NODE_ENV=development
PORT=3000
API_VERSION=v1

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/booking_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_ACCESS_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Email (for background jobs)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-password
```

## 📚 API Documentation

### Authentication

- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login and get tokens
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout (invalidate refresh token)

### Properties

- `GET /api/v1/properties` - List properties with filters
- `GET /api/v1/properties/:id` - Get property details
- `POST /api/v1/properties` - Create property (admin only)
- `PATCH /api/v1/properties/:id` - Update property (admin only)
- `DELETE /api/v1/properties/:id` - Delete property (admin only)

### Bookings

- `GET /api/v1/bookings` - List user's bookings
- `GET /api/v1/bookings/:id` - Get booking details
- `POST /api/v1/bookings` - Create booking
- `PATCH /api/v1/bookings/:id/cancel` - Cancel booking

### Advanced Search Example

```bash
GET /api/v1/properties?city=Moscow&guests=4&checkIn=2026-06-01&checkOut=2026-06-05&amenities=wifi,parking&maxPrice=5000
```

Full interactive documentation available at `/api-docs` when server is running.

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run integration tests
pnpm test:integration
```

## 🏗️ Development

```bash
# Start development server with hot reload
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run linter
pnpm lint

# Format code
pnpm format

# Generate Prisma Client
pnpm prisma:generate

# Create new migration
pnpm migrate:dev
```

## 🐳 Docker Deployment

### Development

```bash
docker-compose up
```

### Production

```bash
docker build -t booking-service:latest .
docker run -p 3000:3000 --env-file .env booking-service:latest
```

## 🚀 Production Deployment

### Manual Deployment

1. Provision a VPS (Hetzner, DigitalOcean, etc.)
2. Install Docker and Docker Compose
3. Set up Nginx as reverse proxy
4. Configure SSL with Let's Encrypt
5. Set up environment variables
6. Run `docker-compose -f docker-compose.prod.yml up -d`

### CI/CD with GitHub Actions

Push to `main` branch triggers automatic deployment:

- Runs tests
- Builds Docker image
- Deploys to production server
- Runs database migrations

## 🔒 Security Features

- Password hashing with bcrypt (12 rounds)
- JWT with short-lived access tokens (15 min)
- Refresh token rotation
- HTTP security headers (Helmet)
- SQL injection prevention (Prisma parameterized queries)
- Rate limiting
- CORS configuration
- Input validation with Zod

## 📈 Performance Optimizations

- Redis caching for frequently accessed data
- Database indexing on search columns
- Connection pooling
- Efficient query design (N+1 prevention)
- Background job processing (BullMQ)
- Response compression

## 🎓 What This Project Demonstrates

### For Interviewers

This project shows proficiency in:

1. **Database Design**: Complex relationships, proper indexing, transaction management
2. **Concurrency Handling**: Race condition prevention, optimistic/pessimistic locking
3. **Authentication**: Industry-standard JWT implementation with refresh tokens
4. **Asynchronous Processing**: Background jobs for non-blocking operations
5. **API Design**: RESTful principles, proper status codes, error handling
6. **Testing**: Unit and integration test coverage
7. **DevOps**: Docker, CI/CD, production deployment
8. **Code Quality**: TypeScript, linting, proper architecture

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
