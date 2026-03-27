# ParcelPeer Backend API

A comprehensive Node.js/Express REST API for a peer-to-peer parcel delivery marketplace. Built with TypeScript, PostgreSQL, Drizzle ORM, and integrated with Paystack payments, Firebase authentication, and real-time tracking.

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: JWT + Firebase Auth
- **Payments**: Paystack
- **Notifications**: Firebase Cloud Messaging (FCM)
- **Geocoding**: OpenStreetMap Nominatim
- **Password Hashing**: bcryptjs

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Database Setup
```bash
npm run db:generate
npm run db:push
```

### 4. Run Development Server
```bash
npm run dev
```

Server will start on `http://localhost:5000`

## Project Structure

```
src/
├── db/                    # Database & ORM
│   ├── index.ts          # Connection
│   └── schema.ts         # Drizzle schema
├── middleware/           # Express middleware
│   ├── auth.ts          # JWT authentication
│   └── errorHandler.ts  # Error handling
├── routes/              # API endpoints
│   ├── auth.ts          # Authentication
│   ├── users.ts         # User profiles
│   ├── parcels.ts       # Parcel management
│   ├── routes.ts        # Carrier routes
│   ├── wallet.ts        # Payments & wallet
│   ├── conversations.ts # Messaging
│   ├── reviews.ts       # Reviews & disputes
│   ├── tracking.ts      # Live GPS tracking
│   └── public.ts        # Landing page APIs
├── utils/               # Utilities
│   ├── helpers.ts       # Password, geocoding, paystack
│   └── validation.ts    # Joi validation schemas
├── config.ts            # Environment config
└── index.ts             # Express app
```

## Key Features

### Authentication
- JWT-based access/refresh tokens
- Firebase Auth support for mobile
- Role-based access control (User, Carrier, Support, Admin)

### Core Marketplace
- Parcel creation & management
- Carrier route management
- Real-time matching algorithm
- Live GPS tracking (carrier & receiver)

### Payments (Paystack Integration)
- Wallet top-up flow
- Automatic parcel payment deduction
- Platform fee calculation by subscription tier
- Refund processing
- Auto top-up settings

### Communications
- User-to-user messaging
- Parcel-specific messages
- Dispute discussion threads

### Quality & Safety
- Review & rating system
- Dispute resolution workflow
- Admin moderation tools
- Delivery proof tracking

## API Highlights

### Public Endpoints
- `GET /api/public/stats` - Platform statistics
- `POST /api/public/contact` - Contact form
- `POST /api/public/waitlist` - Waitlist signup

### Authentication 
- `POST /api/auth/signup`
- `POST /api/auth/signin`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

### Parcels (Core)
- `POST /api/parcels` - Create parcel
- `PATCH /api/parcels/:id/accept` - Accept as carrier
- `PATCH /api/parcels/:id/status` - Update status
- `GET /api/parcels/:id/matching-routes` - Find compatible routes

### Live Tracking
- `POST /api/tracking/carrier-location` - Update GPS
- `GET /api/tracking/carrier-location/:parcelId` - Get carrier position
- `POST /api/tracking/receiver-location` - Receiver GPS update
- `GET /api/tracking/receiver-location/:parcelId` - Get receiver position

### Wallet
- `GET /api/wallet/balance`
- `POST /api/wallet/topup/initialize`
- `GET /api/wallet/topup/verify/:reference`
- `POST /api/wallet/auto-topup`

### Admin Dashboard
- `GET /api/admin/stats`
- `GET /api/admin/users`
- `GET /api/admin/parcels`
- `GET /api/admin/disputes`
- `POST /api/admin/payments/:id/refund`

## Database Schema

21+ tables including:
- `users` - Accounts with roles & wallet
- `parcels` - Delivery requests
- `routes` - Carrier routes
- `payments` - Payment ledger
- `wallet_transactions` - Wallet history
- `conversations` & `messages` - Chat system
- `reviews` - User ratings
- `disputes` - Conflict resolution
- `carrier_locations` & `receiver_locations` - GPS tracking
- And more...

## Role-Based Permissions

| Permission | User | Carrier | Support | Admin |
|---|---|---|---|---|
| View dashboard | ✅ | ✅ | ✅ | ✅ |
| Create parcel | ✅ | - | - | ✅ |
| Create route | - | ✅ | - | ✅ |
| Manage users | - | - | - | ✅ |
| Verify users | - | - | ✅ | ✅ |
| Resolve disputes | - | - | - | ✅ |
| Adjust wallets | - | - | - | ✅ |

## Environment Variables

See `.env.example` for complete list. Key variables:

```
DATABASE_URL              # PostgreSQL connection
JWT_SECRET               # Access token key (min 32 chars)
JWT_REFRESH_SECRET       # Refresh token key
PAYSTACK_SECRET_KEY      # Paystack API secret
FIREBASE_PROJECT_ID      # Firebase project
NODE_ENV                 # development | production
PORT                     # Default 5000
```

## Development Commands

```bash
npm run dev              # Dev server with hot reload
npm run build            # Build TypeScript
npm start               # Run production build
npm run type-check      # Type checking
npm run lint            # ESLint
npm run db:generate     # Create migrations
npm run db:push         # Apply migrations
npm run db:studio       # Drizzle visual editor
```

## Error Handling

All errors return consistent JSON:
```json
{
  "error": "User-friendly message",
  "code": "ERROR_CODE",
  "details": {}
}
```

## Security

- ✅ Bcrypt password hashing (12 rounds)
- ✅ JWT with expiration
- ✅ Rate limiting on auth
- ✅ CORS & Helmet headers
- ✅ Paystack webhook verification
- ✅ Suspended user enforcement
- ✅ Role-based access control

## Deployment

### Docker
```bash
docker build -t parcelpeer-api .
docker run -e DATABASE_URL=... -p 5000:5000 parcelpeer-api
```

### PM2
```bash
npm run build
pm2 start dist/index.js --name parcelpeer
```

## Next Steps

Build receiver endpoints, admin panel, push notifications, and deployment configuration.

For complete API documentation, see the specification document.