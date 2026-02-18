# Event Tracker Backend

A Node.js/Express backend API for tracking concerts and events, with integrations to multiple music and ticketing services.

## Features

- **Event Discovery** - Search and track concerts via Ticketmaster and SeatGeek APIs
- **Artist Information** - Fetch setlists from Setlist.fm, artist data from Last.fm
- **YouTube Integration** - Connect playlists to discover artists you follow
- **User Authentication** - JWT-based auth with secure password hashing
- **Favorites & Notifications** - Save events and get notified about updates
- **Concert History** - Track shows you've attended
- **Admin Portal** - Manage users, artist cache, and system sync
- **Background Sync** - Automatic updates for cached artist and event data

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Authentication**: JWT + bcrypt
- **APIs**: Ticketmaster, SeatGeek, Setlist.fm, Last.fm, YouTube

## Project Structure

```
├── config/          # Database configuration
├── controllers/     # Request handlers
├── middleware/      # Auth middleware
├── models/          # Mongoose schemas
├── routes/          # API route definitions
├── services/        # Business logic & external API calls
├── Public/          # Static frontend files
└── server.js        # Application entry point
```

## Getting Started

### Prerequisites

- Node.js (v16+)
- MongoDB instance
- API keys for: Ticketmaster, SeatGeek, Setlist.fm, Last.fm, YouTube

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/surfer10s/Event-Tracker.git
   cd Event-Tracker
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Create a `.env` file with required variables:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   TICKETMASTER_API_KEY=your_key
   SEATGEEK_CLIENT_ID=your_client_id
   SETLISTFM_API_KEY=your_key
   LASTFM_API_KEY=your_key
   YOUTUBE_CLIENT_ID=your_client_id
   YOUTUBE_CLIENT_SECRET=your_client_secret
   ```

4. Start the server
   ```bash
   npm run dev    # Development with hot reload
   npm start      # Production
   ```

## API Endpoints

All API routes are prefixed with `/api/v1`

| Route | Description |
|-------|-------------|
| `/auth` | User registration & login |
| `/users` | User profile management |
| `/ticketmaster` | Ticketmaster event search |
| `/seatgeek` | SeatGeek event search |
| `/events` | Saved events & favorites |
| `/setlist` | Setlist.fm integration |
| `/lastfm` | Last.fm artist data |
| `/notifications` | User notifications |
| `/categories` | Artist categorization |
| `/sync` | Background sync controls |
| `/artist-cache` | Cached artist data |

Health check available at `GET /health`

## Scripts

```bash
npm start        # Start production server
npm run dev      # Start with nodemon (hot reload)
npm run build:css   # Build Tailwind CSS
npm run watch:css   # Watch Tailwind CSS changes
npm run dev:full    # Run dev server + CSS watch
```

## License

ISC
