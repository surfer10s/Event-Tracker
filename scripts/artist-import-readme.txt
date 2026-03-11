Artist Import — Quick Reference
================================

Purpose: Batch-import artists from a curated seed list into the Artist collection
via Ticketmaster search. Seeds the database for better discovery, notifications,
and music taste matching.

API Cost: 1 TM API call per artist (5,000/day limit, resets ~12:47 PM ET)


Getting Started
---------------

1. Start the server:     npm run dev
2. Open browser:         http://localhost:5000/admin-artist-import.html
3. Log in as admin


Page Walkthrough
----------------

STATS CARDS (top)
  - Total in Seed List:   250 artists across 10 genres
  - Already Imported:     How many are already in your Artist collection
  - Pending Import:       How many still need TM lookup

RUN IMPORT
  - "Import 50 Artists"   ~50 seconds, uses 50 TM calls
  - "Import 100 Artists"  ~2 minutes, uses 100 TM calls
  - "Import All Pending"  Processes everything remaining

  Checkboxes:
  - "Also fetch events"   OFF by default. Fetches upcoming events for each
                          new artist — adds extra TM calls per artist.
                          Turn on only if you have TM budget to spare.
  - "Dry run"             Preview what would happen without saving anything.
                          Great for first run to see how many will match.

RESULTS (appears after import)
  - Created:              New Artist docs saved to DB
  - Already Existed:      Skipped — name or TM ID already in collection
  - Not Found on TM:      No exact name match on Ticketmaster
  - TM Searches Used:     Total API calls consumed
  - Errors:               Failed imports (check server console for details)
  - Per-Artist Details:   Expandable list showing each artist's outcome

ADD TO SEED LIST
  - Type an artist name + optional genre, click Add
  - Appends to scripts/artist-seed-list.json

SEED LIST BROWSER (bottom)
  - Scrollable table of all 250 seed artists
  - Filter by: All / Pending / Imported
  - X button removes an artist from the seed list


Recommended First Run
---------------------

1. Start with a dry run to preview results:
   - Check "Dry run"
   - Click "Import 50 Artists"
   - Review the results — most should show "Would Create"

2. Run the real import in batches:
   - Uncheck "Dry run"
   - Click "Import 50 Artists"
   - Wait for completion, check stats update
   - Repeat until satisfied (or click "Import All Pending")

3. Optionally backfill events:
   - Check "Also fetch events"
   - Run another batch (this uses more TM calls per artist)
   - Or skip this — events will be fetched when users favorite
     these artists or during background sync

4. Re-running is safe:
   - Already-imported artists are skipped automatically
   - No duplicates will be created


TM API Budget Planning
----------------------

Seed list:  250 artists
Per artist: 1 TM call (search) + optionally 1 more (events)
Daily limit: 5,000 calls

Without events:  250 calls to import all  (5% of daily budget)
With events:     ~500 calls to import all (10% of daily budget)

You can safely import all 250 in one session without events.
With events enabled, still well within daily limits.


How Matching Works
------------------

For each seed artist:
1. Case-insensitive search in Artist collection → skip if found
2. TM attraction search by name
3. Exact case-insensitive name match required (no fuzzy/partial)
4. TM ID dedup check (prevents creating duplicate if name differs slightly)
5. Create Artist doc with TM ID, genre, images
6. 1-second delay before next search (rate limiting)

Artists that don't match exactly on TM show as "Not Found."
You can manually add them via the Artist Cache page or the
Discover Artists search on the main app.


Editing the Seed List
---------------------

The seed list lives at:  scripts/artist-seed-list.json

Format:
  [
    { "name": "Taylor Swift", "genre": "Pop", "notes": "Eras Tour" },
    { "name": "Morgan Wallen", "genre": "Country", "notes": "..." }
  ]

You can edit it directly in a text editor or use the admin page:
  - Add:    "Add to Seed List" section on the page
  - Remove: X button in the seed list table


API Endpoints (for reference)
-----------------------------

All require admin auth (Bearer token).

GET  /api/v1/artist-import/stats
     → { total, imported, pending }

GET  /api/v1/artist-import/seed-list
     → { artists: [{ index, name, genre, status, ... }] }

POST /api/v1/artist-import/run
     Body: { limit: 50, fetchEvents: false, dryRun: false }
     → { created, alreadyExisted, notFound, tmSearches, duration, artists }

POST /api/v1/artist-import/add-to-seed
     Body: { name: "Artist Name", genre: "Pop" }

DELETE /api/v1/artist-import/seed-list/:index


Genre Breakdown (seed list)
---------------------------

Pop:              35 artists
Rock/Alternative: 33
Hip-Hop/Rap:      32
Country:          26
R&B/Soul:         22
Metal/Hard Rock:  22
Indie/Alternative:22
Latin:            22
EDM/Electronic:   21
Classic/Legacy:   15
                 ---
Total:           250
