const XLSX = require('xlsx');
const path = require('path');

const gapFeatures = [
  { id: 1, feature: 'RSVP / "I\'m Going" System', category: 'Event Engagement', effort: 'M', impact: '***', phase: 2, dependencies: '', status: 'Not Started', notes: 'Foundation feature — unlocks reminders, calendar depth, social proof, post-event prompts' },
  { id: 2, feature: 'Pre-Event Reminders (1mo/1wk/1day)', category: 'Event Engagement', effort: 'M', impact: '***', phase: 2, dependencies: 'GAP-1', status: 'Not Started', notes: 'Keeps users engaged between booking and attending' },
  { id: 3, feature: 'Post-Event Rating Prompt', category: 'Event Engagement', effort: 'S', impact: '**', phase: 1, dependencies: 'GAP-1', status: 'Not Started', notes: 'Closes the concert loop; drives concert history usage' },
  { id: 4, feature: 'Calendar Sync (iCal/Google Calendar)', category: 'Event Engagement', effort: 'S', impact: '***', phase: 1, dependencies: '', status: 'Not Started', notes: 'Embeds app in daily life; ical-generator npm package exists' },
  { id: 5, feature: 'RSVP Counts on Events', category: 'Event Engagement', effort: 'S', impact: '*', phase: 12, dependencies: 'GAP-1', status: 'Not Started', notes: 'Needs user scale to feel authentic' },
  { id: 6, feature: 'On-Sale Date Alerts', category: 'Ticket Alerts', effort: 'M', impact: '***', phase: 2, dependencies: '', status: 'Not Started', notes: '#1 fan pain point; Event model already has tickets.onSaleDate' },
  { id: 7, feature: 'Presale Alerts', category: 'Ticket Alerts', effort: 'M', impact: '***', phase: 2, dependencies: '', status: 'Not Started', notes: 'Event model already has tickets.presales array' },
  { id: 8, feature: 'Sold-Out Detection & Notifications', category: 'Ticket Alerts', effort: 'M', impact: '**', phase: 4, dependencies: '', status: 'Not Started', notes: 'Requires periodic status polling from TM/SeatGeek' },
  { id: 9, feature: 'Waitlist for Sold-Out Events', category: 'Ticket Alerts', effort: 'S', impact: '**', phase: 4, dependencies: 'GAP-8', status: 'Not Started', notes: 'Builds loyalty when tickets reappear' },
  { id: 10, feature: 'Price Drop Alerts', category: 'Ticket Alerts', effort: 'M', impact: '**', phase: 4, dependencies: '', status: 'Not Started', notes: 'Notification model already has price_drop type defined' },
  { id: 11, feature: 'Personalized Discovery Feed', category: 'Discovery', effort: 'M', impact: '***', phase: 2, dependencies: '', status: 'Not Started', notes: 'Cross-reference Last.fm similar artists with local events' },
  { id: 12, feature: 'Trending Artists Chart', category: 'Discovery', effort: 'M', impact: '*', phase: 12, dependencies: '', status: 'Not Started', notes: 'Needs user scale for meaningful data' },
  { id: 13, feature: '"Hot Shows" / Curated Picks', category: 'Discovery', effort: 'S-M', impact: '**', phase: 11, dependencies: '', status: 'Not Started', notes: 'Admin-curated works at any scale' },
  { id: 14, feature: 'Festival Discovery & Lineup Tracking', category: 'Discovery', effort: 'L', impact: '**', phase: 10, dependencies: '', status: 'Not Started', notes: 'Seasonal (spring/summer) but high value' },
  { id: 15, feature: 'Festival Set Times', category: 'Discovery', effort: 'S', impact: '*', phase: 12, dependencies: 'GAP-14', status: 'Not Started', notes: 'Narrow audience; depends on festival feature' },
  { id: 16, feature: '"Just Announced" Feed', category: 'Discovery', effort: 'S', impact: '**', phase: 1, dependencies: '', status: 'Not Started', notes: 'Events created in last 7 days for followed artists' },
  { id: 17, feature: 'Similar Artist Auto-Follow Suggestions', category: 'Discovery', effort: 'S', impact: '**', phase: 1, dependencies: '', status: 'Not Started', notes: 'Uses existing Last.fm integration' },
  { id: 18, feature: 'Music DNA Profile Visualization', category: 'Discovery', effort: 'M', impact: '*', phase: 11, dependencies: '', status: 'Not Started', notes: 'Fun but one-time view; shareable' },
  { id: 19, feature: 'Event Sharing / Open Graph Tags', category: 'Social', effort: 'S-M', impact: '**', phase: 4, dependencies: '', status: 'Not Started', notes: 'Rich previews when links shared on social media' },
  { id: 20, feature: 'Share to Social Media Buttons', category: 'Social', effort: 'S', impact: '**', phase: 1, dependencies: '', status: 'Not Started', notes: 'One-click share to Twitter/X, Facebook, copy link' },
  { id: 21, feature: '"Request a Show" / Demand Tracking', category: 'Social', effort: 'M', impact: '**', phase: 6, dependencies: '', status: 'Not Started', notes: 'Engagement for non-touring artists' },
  { id: 22, feature: 'Friend System / Social Connections', category: 'Social', effort: 'L', impact: '**', phase: 9, dependencies: '', status: 'Not Started', notes: 'Network effects; requires user scale' },
  { id: 23, feature: 'Attendee List / "Who\'s Going"', category: 'Social', effort: 'S-M', impact: '*', phase: 12, dependencies: 'GAP-1', status: 'Not Started', notes: 'Needs user scale' },
  { id: 24, feature: 'Web Push Notifications', category: 'Notifications', effort: 'L', impact: '***', phase: 5, dependencies: '', status: 'Not Started', notes: '2-5x better tap rate vs email; needs VAPID keys + service worker' },
  { id: 25, feature: 'SMS Notifications (Twilio)', category: 'Notifications', effort: 'M', impact: '**', phase: 5, dependencies: '', status: 'Not Started', notes: '98% open rate; infrastructure exists (smsOptIn field)' },
  { id: 26, feature: 'Multi-Location Notifications', category: 'Notifications', effort: 'M', impact: '**', phase: 8, dependencies: '', status: 'Not Started', notes: 'Home + work + travel destinations' },
  { id: 27, feature: 'Configurable Notification Radius', category: 'Notifications', effort: 'S', impact: '**', phase: 1, dependencies: '', status: 'Not Started', notes: 'User model field + UI dropdown; instant personalization' },
  { id: 28, feature: 'Notify for Any New Show (Global)', category: 'Notifications', effort: 'S', impact: '**', phase: 1, dependencies: '', status: 'Not Started', notes: 'Per-artist toggle to notify regardless of distance' },
  { id: 29, feature: 'Granular Notification Preferences', category: 'Notifications', effort: 'M', impact: '*', phase: 11, dependencies: '', status: 'Not Started', notes: 'Build when users complain about too many notifications' },
  { id: 30, feature: 'Digest Frequency Options', category: 'Notifications', effort: 'S-M', impact: '*', phase: 11, dependencies: '', status: 'Not Started', notes: 'Daily/weekly/real-time toggle' },
  { id: 31, feature: 'Spotify Integration (Artist Import)', category: 'Integrations', effort: 'L', impact: '***', phase: 5, dependencies: '', status: 'Not Started', notes: 'Doubles music taste data; Spotify is dominant platform' },
  { id: 32, feature: 'Apple Music Integration', category: 'Integrations', effort: 'L', impact: '**', phase: 12, dependencies: '', status: 'Not Started', notes: '~25% streaming market; complex auth' },
  { id: 33, feature: 'Last.fm Scrobble Import', category: 'Integrations', effort: 'S-M', impact: '*', phase: 10, dependencies: '', status: 'Not Started', notes: 'API already integrated; just extend to user.getTopArtists' },
  { id: 34, feature: 'Shazam History Import', category: 'Integrations', effort: 'L', impact: '*', phase: 12, dependencies: 'GAP-32', status: 'Not Started', notes: 'No public API; indirect via Apple Music' },
  { id: 35, feature: 'Artist Claim / Verification', category: 'Artist-Side', effort: 'M', impact: '*', phase: 12, dependencies: '', status: 'Not Started', notes: 'Different product direction' },
  { id: 36, feature: 'Artist Self-Service Event Management', category: 'Artist-Side', effort: 'L', impact: '**', phase: 12, dependencies: 'GAP-35', status: 'Not Started', notes: 'Unlocks indie artist event coverage' },
  { id: 37, feature: 'Artist Analytics Dashboard', category: 'Artist-Side', effort: 'L', impact: '-', phase: 12, dependencies: 'GAP-35', status: 'Not Started', notes: 'Artist-only; no fan impact' },
  { id: 38, feature: 'Artist-to-Fan Posts / Messaging', category: 'Artist-Side', effort: 'L', impact: '**', phase: 12, dependencies: 'GAP-35', status: 'Not Started', notes: 'Exclusive content; needs artist adoption' },
  { id: 39, feature: 'Geo-Targeted Artist Posts', category: 'Artist-Side', effort: 'M', impact: '*', phase: 12, dependencies: 'GAP-38', status: 'Not Started', notes: 'Enhancement of artist posts' },
  { id: 40, feature: 'Embeddable Event Widget', category: 'Distribution', effort: 'M', impact: '*', phase: 12, dependencies: '', status: 'Not Started', notes: 'Growth tool; SEO/backlinks' },
  { id: 41, feature: 'Artist "Track" Button Embed', category: 'Distribution', effort: 'S', impact: '*', phase: 12, dependencies: '', status: 'Not Started', notes: 'User acquisition; needs artist adoption' },
  { id: 42, feature: 'Venue Profiles', category: 'Venues', effort: 'M', impact: '**', phase: 8, dependencies: '', status: 'Not Started', notes: 'Aggregate existing event data into venue pages' },
  { id: 43, feature: 'Venue Discovery / "Venues Near Me"', category: 'Venues', effort: 'M', impact: '*', phase: 11, dependencies: '', status: 'Not Started', notes: 'Leaflet map of nearby venues' },
  { id: 44, feature: 'Venue Following', category: 'Venues', effort: 'M-L', impact: '**', phase: 8, dependencies: '', status: 'Not Started', notes: 'Catches events that artist tracking misses' },
  { id: 45, feature: 'Artist Extended Profiles / Bios', category: 'Content', effort: 'M', impact: '*', phase: 10, dependencies: '', status: 'Not Started', notes: 'Last.fm provides bio/stats; fields exist but unpopulated' },
  { id: 46, feature: 'Event Photos / User Content', category: 'Content', effort: 'L', impact: '**', phase: 10, dependencies: '', status: 'Not Started', notes: 'Concert scrapbook; needs S3/file upload' },
  { id: 47, feature: 'Setlist Voting / Crowd-Sourced', category: 'Content', effort: 'M', impact: '*', phase: 12, dependencies: '', status: 'Not Started', notes: 'Setlist.fm already covers most shows' },
  { id: 48, feature: 'Live Concert Streaming', category: 'Content', effort: 'XL', impact: '-', phase: 12, dependencies: '', status: 'Not Recommended', notes: 'Wrong scale; massive infrastructure investment' },
  { id: 49, feature: 'Live Chat During Streams', category: 'Content', effort: 'L', impact: '-', phase: 12, dependencies: 'GAP-48', status: 'Not Recommended', notes: 'Depends on streaming which is not recommended' },
  { id: 50, feature: 'Merch Integration (Shopify)', category: 'Commerce', effort: 'S-L', impact: '*', phase: 12, dependencies: '', status: 'Not Started', notes: 'Start with simple links (S) before API (L)' },
  { id: 51, feature: 'In-App Ticket Purchasing', category: 'Commerce', effort: 'XL', impact: '**', phase: 12, dependencies: '', status: 'Not Started', notes: 'Requires Ticketmaster business partnership' },
  { id: 52, feature: 'Promoted Events / Paid Placement', category: 'Commerce', effort: 'XL', impact: '-', phase: 12, dependencies: '', status: 'Not Recommended', notes: 'Needs significant traffic first' },
  { id: 53, feature: 'Affiliate Revenue Dashboard', category: 'Commerce', effort: 'M', impact: '-', phase: 12, dependencies: '', status: 'Not Started', notes: 'Internal admin tool only' },
  { id: 54, feature: 'Progressive Web App (PWA)', category: 'Platform', effort: 'M', impact: '***', phase: 5, dependencies: '', status: 'Not Started', notes: 'manifest.json + service worker; 80% of native app value' },
  { id: 55, feature: 'Mobile App (Native)', category: 'Platform', effort: 'XL', impact: '**', phase: 12, dependencies: '', status: 'Not Started', notes: 'PWA first; only if user base demands it' },
  { id: 56, feature: 'Public API / Developer Access', category: 'Platform', effort: 'L', impact: '-', phase: 12, dependencies: '', status: 'Not Started', notes: 'No unique data to expose yet' },
  { id: 57, feature: 'Cross-Platform Distribution', category: 'Platform', effort: 'XL', impact: '-', phase: 12, dependencies: '', status: 'Not Started', notes: 'Requires enterprise partnerships' },
  { id: 58, feature: 'Onboarding Artist Import Flow', category: 'UX', effort: 'M', impact: '***', phase: 2, dependencies: '', status: 'Not Started', notes: 'Make-or-break for new user retention' },
  { id: 59, feature: 'Configurable Search Radius', category: 'UX', effort: 'S', impact: '**', phase: 1, dependencies: '', status: 'Not Started', notes: 'Best effort-to-impact ratio on the list' },
  { id: 60, feature: 'Multiple Saved Locations', category: 'UX', effort: 'M', impact: '**', phase: 8, dependencies: '', status: 'Not Started', notes: 'Home, work, vacation spots' },
  { id: 61, feature: 'Dark Mode', category: 'UX', effort: 'S-M', impact: '*', phase: 11, dependencies: '', status: 'Not Started', notes: 'Expected in modern apps' },
  { id: 62, feature: 'Annual Recap / Year in Review', category: 'UX', effort: 'M', impact: '**', phase: 5, dependencies: '', status: 'Not Started', notes: 'Spotify Wrapped energy; massively shareable' },
  { id: 63, feature: 'User Public Profile', category: 'UX', effort: 'M', impact: '*', phase: 9, dependencies: 'GAP-1', status: 'Not Started', notes: 'Needs active user content first' },
  { id: 64, feature: 'Account Data Export (GDPR)', category: 'Compliance', effort: 'S', impact: '*', phase: 1, dependencies: '', status: 'Not Started', notes: 'Trust signal; may become legally required' },
  { id: 65, feature: 'Account Deletion Self-Service', category: 'Compliance', effort: 'S', impact: '*', phase: 1, dependencies: '', status: 'Not Started', notes: 'GDPR/CCPA compliance' },
];

const novelFeatures = [
  { id: 1, feature: 'Setlist Predictions', category: 'Predictive Intelligence', effort: 'M', impact: '***', phase: 3, dependencies: '', status: 'Not Started', notes: 'Analyze Setlist.fm song frequency; no competitor does this' },
  { id: 2, feature: 'Tour Prediction / "Likely Coming"', category: 'Predictive Intelligence', effort: 'M-L', impact: '**', phase: 7, dependencies: '', status: 'Not Started', notes: 'Historical touring pattern analysis' },
  { id: 3, feature: 'Ticket Price Intelligence', category: 'Predictive Intelligence', effort: 'L', impact: '***', phase: 7, dependencies: '', status: 'Not Started', notes: 'Google Flights for concerts; data moat deepens over time' },
  { id: 4, feature: '"You Missed This" FOMO Alerts', category: 'Predictive Intelligence', effort: 'S-M', impact: '**', phase: 4, dependencies: '', status: 'Not Started', notes: 'Post-event alert for unfollowed taste artists; use sparingly' },
  { id: 5, feature: 'Live Concert Mode', category: 'At-the-Show', effort: 'L', impact: '***', phase: 7, dependencies: '', status: 'Not Started', notes: 'Real-time setlist tracking, ratings, check-in, photos' },
  { id: 6, feature: 'Concert Time Machine / "On This Day"', category: 'At-the-Show', effort: 'S', impact: '**', phase: 1, dependencies: '', status: 'Not Started', notes: 'One query against concert history; massive emotional payoff' },
  { id: 7, feature: 'Venue Intel / Crowd-Sourced Guide', category: 'At-the-Show', effort: 'L', impact: '**', phase: 8, dependencies: '', status: 'Not Started', notes: 'TripAdvisor for venues: sound, parking, tips, accessibility' },
  { id: 8, feature: 'Post-Show Recap Card', category: 'At-the-Show', effort: 'M', impact: '***', phase: 3, dependencies: '', status: 'Not Started', notes: 'Auto-generated shareable card; Spotify Wrapped per concert' },
  { id: 9, feature: 'Concert Buddy Matching', category: 'Social', effort: 'L', impact: '**', phase: 9, dependencies: '', status: 'Not Started', notes: 'Match solo concert-goers; solves "going alone" barrier' },
  { id: 10, feature: 'Music Taste Compatibility Score', category: 'Social', effort: 'M', impact: '**', phase: 9, dependencies: '', status: 'Not Started', notes: 'Spotify Blend for concerts; drives friend invites' },
  { id: 11, feature: 'Concert Challenges / Gamification', category: 'Social', effort: 'M', impact: '**', phase: 6, dependencies: '', status: 'Not Started', notes: 'Streaks, milestones, badges; motivates attendance + logging' },
  { id: 12, feature: 'Concert Budget Tracker', category: 'Planning', effort: 'M', impact: '**', phase: 10, dependencies: '', status: 'Not Started', notes: 'Monthly/annual concert spending tracker with alerts' },
  { id: 13, feature: '"Surprise Me" Concert Finder', category: 'Planning', effort: 'M', impact: '***', phase: 3, dependencies: '', status: 'Not Started', notes: '"Free Saturday, $50 budget" → constraint-based discovery' },
  { id: 14, feature: 'Concert Road Trip Planner', category: 'Planning', effort: 'L', impact: '**', phase: 10, dependencies: '', status: 'Not Started', notes: 'Multi-city concert itineraries with drive times' },
  { id: 15, feature: 'Opening Act Deep Dive', category: 'Planning', effort: 'M', impact: '**', phase: 6, dependencies: '', status: 'Not Started', notes: 'Preview openers with top songs and taste match' },
  { id: 16, feature: 'Pre-Concert Hype Playlist', category: 'Planning', effort: 'M', impact: '**', phase: 6, dependencies: '', status: 'Not Started', notes: 'Auto-generate playlist 1 week before show' },
  { id: 17, feature: 'Personal Concert Analytics Dashboard', category: 'Insights', effort: 'M-L', impact: '**', phase: 7, dependencies: '', status: 'Not Started', notes: 'Always-on stats + "concert personality" typing' },
  { id: 18, feature: 'Smart Event Scoring (Match %)', category: 'Insights', effort: 'M', impact: '***', phase: 3, dependencies: '', status: 'Not Started', notes: 'Personal 1-100 match score per event; cuts through overload' },
  { id: 19, feature: '"Fans Also Attended" Recommendations', category: 'Insights', effort: 'M-L', impact: '**', phase: 7, dependencies: '', status: 'Not Started', notes: 'Collaborative filtering from concert history; needs scale' },
  { id: 20, feature: 'Concert Weather Forecast', category: 'Logistics', effort: 'S-M', impact: '**', phase: 6, dependencies: '', status: 'Not Started', notes: 'Weather API for outdoor venues; people always Google this' },
  { id: 21, feature: 'Smart Departure Time', category: 'Logistics', effort: 'M', impact: '**', phase: 6, dependencies: '', status: 'Not Started', notes: '"Leave by 5:45 PM" with traffic + parking estimates' },
  { id: 22, feature: 'Parking & Transit Guide', category: 'Logistics', effort: 'M', impact: '*', phase: 11, dependencies: '', status: 'Not Started', notes: 'Crowd-sourced parking tips per venue' },
  { id: 23, feature: 'Artist Milestone Tracking', category: 'Engagement', effort: 'M', impact: '**', phase: 6, dependencies: '', status: 'Not Started', notes: '"Seen 5 times across 3 cities" — fan identity + pride' },
  { id: 24, feature: 'Concert Countdown Widget', category: 'Engagement', effort: 'S', impact: '**', phase: 1, dependencies: '', status: 'Not Started', notes: 'Countdown to next show; builds anticipation' },
  { id: 25, feature: '"Deep Cuts" Alert', category: 'Engagement', effort: 'S-M', impact: '**', phase: 4, dependencies: '', status: 'Not Started', notes: 'Alert when artist plays rare song; unique to setlist platforms' },
  { id: 26, feature: 'Concert Journal / Rich Notes', category: 'Engagement', effort: 'M', impact: '**', phase: 6, dependencies: '', status: 'Not Started', notes: 'Structured prompts turn history into personal archive' },
  { id: 27, feature: 'Calendar Gap Recommendations', category: 'Engagement', effort: 'M', impact: '***', phase: 3, dependencies: 'GAP-1', status: 'Not Started', notes: '"Nothing planned for March — here are 5 matches"' },
  { id: 28, feature: 'Structured Concert Reviews', category: 'Community', effort: 'M', impact: '**', phase: 9, dependencies: '', status: 'Not Started', notes: 'Sound, energy, value ratings; verified attendance' },
  { id: 29, feature: '"Ask a Fan" Community Q&A', category: 'Community', effort: 'L', impact: '*', phase: 12, dependencies: '', status: 'Not Started', notes: 'Needs active user base for timely answers' },
  { id: 30, feature: 'Crowd-Sourced Artist Live Rating', category: 'Community', effort: 'S', impact: '**', phase: 1, dependencies: '', status: 'Not Started', notes: 'Aggregate existing ratings; answers "Are they good live?"' },
];

const wb = XLSX.utils.book_new();

// --- Gap Analysis Tab ---
const gapHeaders = ['ID', 'Feature', 'Category', 'Effort', 'Impact', 'Phase', 'Dependencies', 'Status', 'Notes'];
const gapData = gapFeatures.map(f => [
  `GAP-${f.id}`, f.feature, f.category, f.effort, f.impact, f.phase, f.dependencies, f.status, f.notes
]);
const gapSheet = XLSX.utils.aoa_to_sheet([gapHeaders, ...gapData]);

// Column widths
gapSheet['!cols'] = [
  { wch: 7 },   // ID
  { wch: 40 },  // Feature
  { wch: 18 },  // Category
  { wch: 7 },   // Effort
  { wch: 7 },   // Impact
  { wch: 7 },   // Phase
  { wch: 14 },  // Dependencies
  { wch: 16 },  // Status
  { wch: 60 },  // Notes
];

// Auto-filter
gapSheet['!autofilter'] = { ref: `A1:I${gapData.length + 1}` };

XLSX.utils.book_append_sheet(wb, gapSheet, 'Gap Analysis');

// --- Novel Features Tab ---
const novelHeaders = ['ID', 'Feature', 'Category', 'Effort', 'Impact', 'Phase', 'Dependencies', 'Status', 'Notes'];
const novelData = novelFeatures.map(f => [
  `NEW-${f.id}`, f.feature, f.category, f.effort, f.impact, f.phase, f.dependencies, f.status, f.notes
]);
const novelSheet = XLSX.utils.aoa_to_sheet([novelHeaders, ...novelData]);

novelSheet['!cols'] = [
  { wch: 7 },
  { wch: 40 },
  { wch: 22 },
  { wch: 7 },
  { wch: 7 },
  { wch: 7 },
  { wch: 14 },
  { wch: 16 },
  { wch: 60 },
];

novelSheet['!autofilter'] = { ref: `A1:I${novelData.length + 1}` };

XLSX.utils.book_append_sheet(wb, novelSheet, 'Novel Features');

const outPath = path.join(__dirname, '..', 'Feature-Roadmap.xlsx');
XLSX.writeFile(wb, outPath);
console.log(`Created: ${outPath}`);
console.log(`  Gap Analysis tab: ${gapFeatures.length} features`);
console.log(`  Novel Features tab: ${novelFeatures.length} features`);
