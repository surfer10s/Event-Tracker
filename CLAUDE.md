# Event Tracker Backend - Claude Context File

## Project Overview

**Event Tracker** is a concert and music event discovery platform that helps users find upcoming concerts from their favorite artists based on location, preferences, and music taste. It integrates with multiple third-party APIs to aggregate event data and provides features for tracking concert history, managing artist favorites, and receiving notifications about new events.

**Key Goals:**
- Discover concerts from favorite artists within user's proximity
- Track concert history and ratings
- Generate affiliate revenue through ticket vendor partnerships
- Create personalized notifications based on location and music preferences
- Organize favorite artists into custom categories

## Tech Stack

**Backend:**
- Node.js with Express.js 4.18.2
- MongoDB 8.0.0 (via Mongoose ODM)
- JWT authentication
- bcryptjs for password hashing
- axios for HTTP requests
- node-cron for scheduled tasks
- nodemailer for email (SMTP)

**Frontend:**
- Vanilla HTML/JS (no framework)
- Tailwind CSS for styling
- Leaflet.js for interactive tour maps
- Shared sidebar components (`sidebar.js`, `sidebar-admin.js`)

**Development:**
- nodemon for auto-restart
- PostCSS + Autoprefixer for CSS processing

**External APIs:**
- Ticketmaster - Event discovery and tickets
- SeatGeek - Ticket pricing
- Setlist.fm - Concert setlists
- Last.fm - Artist recommendations
- YouTube OAuth - Music taste extraction
- Google Geocoding - Location services

## Directory Structure

```
event-tracker-backend/
├── config/
│   └── database.js              # MongoDB connection
├── models/                      # Mongoose schemas (10 models)
│   ├── User.js                  # User accounts with preferences
│   ├── Event.js                 # Concert/event data
│   ├── Artist.js                # Artist/band profiles
│   ├── Tour.js                  # Tour groupings
│   ├── category.js              # User-defined artist categories
│   ├── artistcategory.js        # Category assignments
│   ├── concerthistory.js        # Attended concerts
│   ├── notification.js          # Event alerts
│   ├── UserMusicTaste.js        # YouTube-extracted taste
│   └── songcache.js             # YouTube video cache
├── controllers/                 # Business logic
│   ├── authController.js
│   ├── userController.js
│   ├── EventController.js
│   ├── categorycontroller.js
│   ├── concerthistorycontroller.js
│   ├── TicketmasterController.js
│   └── setlistController.js
├── routes/                      # API endpoint definitions
│   ├── auth.js                  # /api/v1/auth/*
│   ├── users.js                 # /api/v1/users/*
│   ├── events.js                # /api/v1/events/*
│   ├── ticketmaster.js          # /api/v1/ticketmaster/*
│   ├── categoryroutes.js        # /api/v1/categories/*
│   ├── setlist.js               # /api/v1/setlist/*
│   ├── notifications.js         # /api/v1/notifications/*
│   ├── sync.js                  # /api/v1/sync/*
│   ├── lastfm.js                # /api/v1/lastfm/*
│   ├── seatgeek.js              # /api/v1/seatgeek/*
│   ├── artistCache.js           # /api/v1/artist-cache/*
│   ├── test.js                  # /api/v1/test/*
│   └── youtube.js               # /auth/youtube/*, /api/youtube/*
├── services/                    # Reusable business logic
│   ├── ticketmasterService.js
│   ├── seatgeekService.js
│   ├── setlistService.js
│   ├── notificationService.js
│   ├── backgroundSyncService.js
│   ├── artistCacheService.js
│   └── geocodingService.js
├── middleware/
│   ├── auth.js                  # JWT verification
│   └── adminAuth.js             # Admin-only protection
├── Public/                      # Frontend HTML pages (26 pages)
│   ├── index.html               # Dashboard
│   ├── auth.html                # Login/register
│   ├── account-details.html     # Profile management
│   ├── favorites.html           # Favorite artists
│   ├── Favorites-Activity.html  # Favorites activity feed (grouped by artist)
│   ├── Favorites-activity-location.html  # Location-based favorites activity
│   ├── artist-profile.html      # Artist details + embedded tour map
│   ├── Event-details.html       # Event details
│   ├── Discover-Artists.html    # Artist discovery/search
│   ├── discover-concerts.html   # Concert discovery
│   ├── future-concerts.html     # Scheduled concerts with full tour map
│   ├── tour-map.html            # Standalone tour map view
│   ├── concert-history.html     # Attended concerts
│   ├── manage-categories.html   # Category organization
│   ├── Notifications.html       # Notification center
│   ├── admin-portal.html        # Admin dashboard
│   ├── admin-users.html         # Admin user management
│   ├── admin-sync.html          # Admin sync management
│   ├── admin-notifications.html # Admin notification management
│   ├── admin-artist-cache.html  # Admin artist cache
│   ├── admin-music-taste.html   # Admin music taste
│   ├── admin-song-cache.html    # Admin song cache
│   ├── sidebar.js               # Shared sidebar component (user pages)
│   ├── sidebar-admin.js         # Shared sidebar component (admin pages)
│   ├── SeatGeek-test.html       # SeatGeek API testing
│   ├── YouTubeTest.html         # YouTube integration testing
│   ├── cache-admin.html         # Cache admin testing
│   └── music-taste-admin.html   # Music taste admin testing
├── scripts/
│   └── make-admin.js            # CLI to promote users to admin
├── .env                         # Environment variables
├── package.json
└── server.js                    # Main entry point
```

## Key Features

### User Management
- Email-based registration with verification
- Password reset via email code
- Profile customization (address, concert preferences)
- Seat preference selection
- Budget and view quality preferences

### Artist & Event Discovery
- Real-time search from Ticketmaster API
- Advanced filtering (location, date, price, status)
- Geographic proximity search ("events near me")
- Embedded Leaflet tour map with animated playback on artist profile
- Standalone tour map page (`future-concerts.html`) with date filtering
- Setlist integration from Setlist.fm
- Favorites activity feeds (grouped by artist, location-filtered)

### Favorites & Categories
- Add/remove favorite artists
- Organize into custom categories with color coding
- Track favorite statistics

### Concert History
- Log attended concerts with ratings (1-5 stars)
- Add personal notes/reviews
- Link to Setlist.fm setlists

### Smart Notifications
- **Two-tier system:**
  - Favorite tier: Concerts from favorite artists
  - Music taste tier: YouTube-extracted preferences
- Multi-channel: in-app, email digests, SMS-ready
- Location-based filtering (within 50 miles)
- Daily email digests

### YouTube Music Integration
- OAuth 2.0 connection
- Playlist and liked video extraction
- Music taste analytics (top artists)
- Automatic song caching (artist+title → videoId)
- Playlist creation from past concert setlists (via artist-profile page)
- Cover song handling: tries performing artist first, falls back to original
- Cached search results with lazy invalidation for unavailable videos

### Background Sync System
- Periodic full sync of artist events
- Real-time progress via Server-Sent Events (SSE)
- Automatic notification generation
- Cleanup of old/past events

### Affiliate System
- Ticketmaster, SeatGeek, StubHub links
- Click tracking per platform
- Revenue generation ready

## Database Models

### User
- Authentication (email, password hash)
- Profile (name, phone, address)
- Concert preferences (budget, seat section)
- Geocoded location (lat/lng)
- YouTube OAuth tokens
- Favorite artists array
- Admin flag

### Event
- Concert information
- References: Artist (required), Tour (optional)
- Venue with GeoJSON location (2dsphere index)
- Ticket info (pricing, status, presales)
- Affiliate links
- External IDs (Ticketmaster, SeatGeek)
- Click tracking

### Artist
- Profile information
- External IDs (multiple platforms)
- Genres, images, social links
- Tour status and statistics
- Text search index

### Tour
- Tour grouping for events
- Tour dates and status
- Images and promotional info

### Category
- User-defined organization
- 8 color options
- Unique per user

### ArtistCategory
- Join table: User → Artist → Category
- Assignment tracking

### ConcertHistory
- User's attended concerts
- Rating (1-5) and notes
- Setlist.fm linkage

### Notification
- Event alerts for users
- Two tiers: favorite/music_taste
- Channels: email, in_app, SMS
- Status tracking
- Deduplication

### UserMusicTaste
- YouTube-extracted artists
- Video counts and sources
- Sync history

### SongCache
- YouTube video cache
- Artist + title → videoId mapping

## Important API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Create account
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/me` - Get current user
- `GET /api/v1/auth/verify-email/:token` - Verify email
- `POST /api/v1/auth/forgot-password` - Request password reset

### Users
- `GET /api/v1/users/favorites` - Get favorite artists
- `POST /api/v1/users/favorites/:artistId` - Add favorite
- `DELETE /api/v1/users/favorites/:artistId` - Remove favorite
- `GET /api/v1/users/concert-history` - Get concert history
- `POST /api/v1/users/concert-history` - Add concert to history

### Events
- `GET /api/v1/events` - Get upcoming events (filterable)
- `GET /api/v1/events/nearby` - Geographic search
- `GET /api/v1/events/artist/:artistId` - Events by artist
- `GET /api/v1/events/ticketmaster/:ticketmasterId` - Get by TM ID
- `GET /api/v1/events/:id` - Get single event

### Categories
- `GET /api/v1/categories` - Get user's categories
- `POST /api/v1/categories` - Create category
- `POST /api/v1/categories/:id/artists/:artistId` - Assign artist

### Notifications
- `GET /api/v1/notifications` - Get notifications
- `GET /api/v1/notifications/unread-count` - Get unread count
- `PUT /api/v1/notifications/:id/read` - Mark as read
- `POST /api/v1/notifications/check` - Trigger notification check

### Background Sync
- `GET /api/v1/sync/progress` - SSE progress stream
- `POST /api/v1/sync/full` - Run full sync
- `POST /api/v1/sync/my-artists` - Sync user's favorites
- `POST /api/v1/sync/full-pipeline` - Sync + notifications + digests

### YouTube
- `GET /auth/youtube` - Start OAuth flow
- `GET /auth/youtube/callback` - OAuth callback
- `GET /api/youtube/status` - Check connection
- `POST /api/youtube/disconnect` - Disconnect YouTube
- `POST /api/youtube/sync-music-taste` - Extract music taste
- `POST /api/youtube/create-playlist-with-songs` - Create playlist

## Environment Variables

```bash
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/event-tracker

# Auth
JWT_SECRET=your_secret_key
JWT_EXPIRE=30d

# APIs
TICKETMASTER_API_KEY=xxxxx
SEATGEEK_API_KEY=xxxxx
SETLISTFM_API_KEY=xxxxx
LASTFM_API_KEY=xxxxx
GOOGLE_GEOCODING_API_KEY=xxxxx

# YouTube OAuth
YOUTUBE_CLIENT_ID=xxxxx
YOUTUBE_CLIENT_SECRET=xxxxx
YOUTUBE_REDIRECT_URI=http://localhost:5000/auth/youtube/callback

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Event Tracker" <noreply@eventtracker.com>

# Affiliate IDs
TICKETMASTER_AFFILIATE_ID=xxxxx
SEATGEEK_AFFILIATE_ID=xxxxx

# Frontend
FRONTEND_URL=http://localhost:5000
```

## Common Tasks

### Start Development Server
```bash
npm run dev          # Start with nodemon (auto-restart)
npm start            # Start normally
```

### Build CSS
```bash
npm run build:css    # Build Tailwind CSS once
npm run watch:css    # Watch for CSS changes
npm run dev:full     # Run both CSS watch + nodemon
```

### Make User Admin
```bash
node scripts/make-admin.js <email>
```

### Database Connection
- MongoDB runs on localhost:27017
- Database name: `event-tracker`
- Ensure MongoDB is running before starting server

### Testing APIs
- Use `SeatGeek-test.html` for SeatGeek API testing
- Use `YouTubeTest.html` for YouTube integration testing
- Admin portal at `admin-portal.html`

## Important Notes & Gotchas

### Port Management
- Server runs on port 5000
- Only one process can use port 5000 at a time
- If you get `EADDRINUSE` error, kill the process:
  ```powershell
  netstat -ano | findstr :5000
  taskkill /PID <number> /F
  ```

### YouTube OAuth
- Tokens expire after 1 hour but auto-refresh
- Refresh tokens may expire after 7 days if Google app is in "Testing" mode
- Publish app in Google Cloud Console for indefinite refresh tokens
- Access type must be `offline` to get refresh tokens

### File Naming
- Some HTML files use capital letters (e.g., `Event-details.html`, `Discover-Artists.html`)
- Case matters on some servers - be consistent in links

### Authentication Flow
- Users must verify email before login
- JWT tokens expire in 30 days
- Password reset codes expire in 15 minutes
- Email verification tokens expire in 24 hours

### Geospatial Queries
- Event venues have 2dsphere index for proximity search
- Coordinates stored as GeoJSON: `[longitude, latitude]` (note order!)
- Distance calculated in miles

### Background Sync
- Use Server-Sent Events (SSE) to monitor progress
- Sync runs in background, doesn't block API
- Can sync all artists or just user's favorites
- Automatic notification generation after sync

### Notifications
- Two-tier system: favorite artists vs music taste
- Deduplication prevents duplicate notifications
- Location filtering defaults to 50 miles
- Email digests compile multiple notifications

### Affiliate Links
- Click tracking increments on each platform click
- Links stored per event per platform
- Affiliate IDs configured in environment variables

### Schema Warnings
- Mongoose may warn about duplicate indexes
- Current warning about `{"name":1}` index is harmless
- Pre-existing from schema definition + schema.index()

### Model Relationships
- Events reference Artists (required) and Tours (optional)
- Users have array of favorite Artist ObjectIds
- Categories are user-scoped (userId + name must be unique)
- ArtistCategory is join table with compound unique index

### API Rate Limits
- Ticketmaster: 5000 requests/day per key
- YouTube: 10,000 quota units/day (search = 100 units)
- Setlist.fm: No official limit, respect rate limiting
- Song cache reduces YouTube API usage

## Frontend Pages Summary

- **User Pages**: auth, index, account-details, favorites, Favorites-Activity, Favorites-activity-location, Discover-Artists, discover-concerts, artist-profile, future-concerts, tour-map, Event-details, concert-history, Notifications, manage-categories
- **Admin Pages**: admin-portal, admin-users, admin-sync, admin-notifications, admin-artist-cache, admin-music-taste, admin-song-cache
- **Testing Pages**: YouTubeTest, SeatGeek-test, cache-admin, music-taste-admin

## Architecture Patterns

- **MVC Pattern**: Models (schemas) → Controllers (logic) → Routes (endpoints)
- **Service Layer**: Services abstract API calls and complex logic
- **Middleware**: JWT auth protection, admin-only routes
- **Real-Time Updates**: Server-Sent Events for sync progress
- **Background Jobs**: Event sync, notification checks
- **Geospatial**: MongoDB 2dsphere indexes for proximity
- **Caching**: Song cache, artist cache to reduce API calls

## Security

- JWT-based authentication
- bcryptjs password hashing (10 salt rounds)
- Email verification required
- Password reset via email codes
- Admin role flag for protected routes
- CORS enabled for localhost and Claude.ai
- Environment variables for secrets

## Development Tips

1. **Server Management**: Use nodemon for auto-restart during development
2. **Database**: Keep MongoDB running in background
3. **Testing**: Use admin portal to trigger syncs and check data
4. **CSS Changes**: Use `npm run watch:css` during frontend work
5. **API Testing**: Test pages available for YouTube and SeatGeek
6. **Logs**: Check console for sync progress and errors
7. **Port Conflicts**: Only run one server instance at a time

## Production Considerations

1. **Environment**: Set `NODE_ENV=production`
2. **Secrets**: Use proper secrets manager for API keys
3. **Database**: Use MongoDB Atlas or hosted instance
4. **Email**: Configure production SMTP server
5. **CORS**: Update allowed origins for production domain
6. **Google OAuth**: Publish app in Google Cloud Console
7. **SSL/TLS**: Use HTTPS for OAuth callback URLs
8. **Monitoring**: Add logging and error tracking
9. **Rate Limiting**: Implement API rate limiting middleware
10. **Caching**: Consider Redis for session storage

---

**Last Updated**: 2026-02-18
**Version**: 1.1.0
**Author**: Billy Wagner
