// Shared Sidebar Component for Event Tracker
// Include this file in any page and call initSidebar() to render the sidebar

const SIDEBAR_CONFIG = {
    navItems: [
        { href: 'index.html', icon: 'home', label: 'Home' },
        { href: 'notifications.html', icon: 'bell', label: 'Notifications' },
        { href: 'favorites.html', icon: 'heart', label: 'Favorites' },
        { href: 'favorites-activity.html', icon: 'map-pin', label: 'Favorites Activity' },
        { href: 'favorites-activity-location.html', icon: 'map', label: 'Activity by Location' },
        { href: 'discover-artists.html', icon: 'search', label: 'Discover Artists' },
        { href: 'concert-history.html', icon: 'calendar', label: 'Concert History' },
        { href: 'manage-categories.html', icon: 'folder', label: 'Categories' }
    ]
};

const SIDEBAR_ICONS = {
    home: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>`,
    bell: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
    </svg>`,
    heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>`,
    'map-pin': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
    </svg>`,
    map: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
        <line x1="8" y1="2" x2="8" y2="18"></line>
        <line x1="16" y1="6" x2="16" y2="22"></line>
    </svg>`,
    search: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
    </svg>`,
    calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>`,
    folder: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>`,
    menu: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-400">
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
    </svg>`,
    music: `<svg class="text-slate-400" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18V5l12-2v13"></path>
        <circle cx="6" cy="18" r="3"></circle>
        <circle cx="18" cy="16" r="3"></circle>
    </svg>`,
    user: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
    </svg>`,
    chevronDown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-400">
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>`,
    logout: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
    </svg>`,
    sun: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>`,
    moon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>`
};

// Sidebar state
let sidebarOpen = window.innerWidth >= 1024;

function getCurrentPage() {
    const path = window.location.pathname;
    const page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    return page;
}

function generateNavItems() {
    const currentPage = getCurrentPage();
    return SIDEBAR_CONFIG.navItems.map(item => {
        const isActive = currentPage === item.href;
        const activeClass = isActive 
            ? 'bg-slate-700 text-white' 
            : 'text-slate-400 hover:bg-slate-700 hover:text-white';
        return `
            <a href="${item.href}" class="flex items-center gap-3 px-4 py-3 ${activeClass} rounded-lg transition-colors">
                ${SIDEBAR_ICONS[item.icon]}
                ${item.label}
            </a>
        `;
    }).join('');
}

function generateSidebarHTML() {
    return `
        <aside id="sidebar" class="sidebar fixed left-0 top-0 bottom-0 w-64 bg-slate-800 text-white p-4 z-50">
            <div class="flex items-center gap-3 mb-8 px-2">
                <button onclick="toggleSidebar()" class="p-1 hover:bg-slate-700 rounded-lg">
                    ${SIDEBAR_ICONS.menu}
                </button>
                ${SIDEBAR_ICONS.music}
                <span class="font-bold text-lg">Event Tracker</span>
            </div>
            
            <nav class="space-y-1">
                ${generateNavItems()}
            </nav>
            
            <!-- Dark Mode Toggle -->
            <div class="absolute bottom-20 left-4 right-4">
                <button onclick="toggleDarkMode()" class="w-full flex items-center justify-between px-4 py-3 text-slate-400 hover:bg-slate-700 hover:text-white rounded-lg transition-colors">
                    <span class="flex items-center gap-3">
                        <span id="darkModeIcon">${SIDEBAR_ICONS.moon}</span>
                        <span id="darkModeLabel">Dark Mode</span>
                    </span>
                    <div id="darkModeToggle" class="w-10 h-6 bg-slate-600 rounded-full relative transition-colors">
                        <div id="darkModeKnob" class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform"></div>
                    </div>
                </button>
            </div>
            
            <div class="absolute bottom-4 left-4 right-4">
                <a href="account-details.html" id="userSidebarInfo" class="bg-slate-700 rounded-lg p-4 hidden block hover:bg-slate-600 transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center font-semibold text-slate-300" id="sidebarUserInitial">?</div>
                        <div>
                            <p class="font-semibold text-sm" id="sidebarUserName">Guest</p>
                            <p class="text-xs text-slate-400" id="sidebarUserLocation"></p>
                        </div>
                    </div>
                </a>
            </div>
        </aside>

        <div id="sidebarOverlay" class="fixed inset-0 bg-black/50 z-40 hidden" onclick="toggleSidebar()"></div>
    `;
}

function generateHeaderHTML(title) {
    return `
        <header class="bg-white border-b border-slate-200 sticky top-0 z-30">
            <div class="px-4 lg:px-6 py-4 flex items-center justify-between">
                <button id="headerHamburger" onclick="toggleSidebar()" class="p-2 hover:bg-slate-100 rounded-lg mr-4 hidden">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-600">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
                
                <h1 class="text-2xl font-bold text-slate-800">${title}</h1>
                
                <div class="flex items-center gap-4">
                    <!-- Notifications Bell -->
                    <div class="relative" id="notificationContainer">
                        <button onclick="toggleNotifications()" class="p-2 hover:bg-slate-100 rounded-lg relative">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-600">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                            </svg>
                            <span id="notificationBadge" class="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-xs rounded-full flex items-center justify-center font-semibold hidden">0</span>
                        </button>
                        
                        <!-- Notifications Dropdown -->
                        <div id="notificationDropdown" class="hidden absolute right-0 mt-2 w-96 max-h-[32rem] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                            <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                                <h3 class="font-bold text-slate-800">Notifications</h3>
                                <button onclick="markAllNotificationsRead()" class="text-sm text-slate-500 hover:text-slate-700">Mark all read</button>
                            </div>
                            <div id="notificationList" class="overflow-y-auto max-h-96">
                                <div class="p-8 text-center text-slate-400">
                                    <p>Loading...</p>
                                </div>
                            </div>
                            <div class="p-3 border-t border-slate-200 bg-slate-50 text-center">
                                <a href="notifications.html" class="text-sm text-slate-600 hover:text-slate-800 font-medium">View All Notifications</a>
                            </div>
                        </div>
                    </div>
                    
                    <!-- User Menu -->
                    <div class="relative" id="userMenuContainer">
                        <button id="userMenuButton" onclick="toggleUserMenu()" class="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 rounded-lg">
                            <div class="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center text-white font-semibold text-sm" id="headerUserInitial">?</div>
                            <span class="text-slate-700 font-medium hidden md:inline" id="headerUserName">Account</span>
                            ${SIDEBAR_ICONS.chevronDown}
                        </button>
                        
                        <div id="userDropdown" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 border border-slate-200 z-50">
                            <a href="account-details.html" class="block px-4 py-2 text-slate-700 hover:bg-slate-100 flex items-center gap-2">
                                ${SIDEBAR_ICONS.user}
                                Account Details
                            </a>
                            <hr class="my-1">
                            <button onclick="logout()" class="block w-full text-left px-4 py-2 text-rose-600 hover:bg-rose-50 flex items-center gap-2">
                                ${SIDEBAR_ICONS.logout}
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    `;
}

function generateSidebarStyles() {
    return `
        <style id="sidebar-styles">
            .sidebar { transition: transform 0.3s ease; }
            .sidebar.collapsed { transform: translateX(-100%); }
            .main-content { transition: margin-left 0.3s ease; }
            .main-content.expanded { margin-left: 0 !important; }
            
            /* Dark mode transitions */
            body, .bg-white, .bg-slate-100, .bg-slate-50 {
                transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
            }
            
            /* Dark mode overrides */
            body.dark-mode {
                background-color: #0f172a !important;
                color: #e2e8f0 !important;
            }
            body.dark-mode .bg-white {
                background-color: #1e293b !important;
            }
            body.dark-mode .bg-slate-100 {
                background-color: #0f172a !important;
            }
            body.dark-mode .bg-slate-50 {
                background-color: #1e293b !important;
            }
            body.dark-mode .text-slate-800,
            body.dark-mode .text-slate-700 {
                color: #e2e8f0 !important;
            }
            body.dark-mode .text-slate-600,
            body.dark-mode .text-slate-500 {
                color: #94a3b8 !important;
            }
            body.dark-mode .border-slate-200 {
                border-color: #334155 !important;
            }
            body.dark-mode .shadow-sm,
            body.dark-mode .shadow-md,
            body.dark-mode .shadow-lg {
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.3) !important;
            }
            body.dark-mode input,
            body.dark-mode select,
            body.dark-mode textarea {
                background-color: #1e293b !important;
                border-color: #334155 !important;
                color: #e2e8f0 !important;
            }
            body.dark-mode input::placeholder {
                color: #64748b !important;
            }
            body.dark-mode .hover\\:bg-slate-100:hover {
                background-color: #334155 !important;
            }
            body.dark-mode .hover\\:bg-slate-50:hover {
                background-color: #334155 !important;
            }
            
            /* Dark mode toggle styling */
            body.dark-mode #darkModeToggle {
                background-color: #3b82f6 !important;
            }
            body.dark-mode #darkModeKnob {
                transform: translateX(16px);
            }
        </style>
    `;
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const overlay = document.getElementById('sidebarOverlay');
    const headerHamburger = document.getElementById('headerHamburger');
    
    sidebarOpen = !sidebarOpen;
    
    if (sidebarOpen) {
        sidebar.classList.remove('collapsed');
        if (window.innerWidth >= 1024) mainContent.classList.remove('expanded');
        if (window.innerWidth < 1024) overlay.classList.remove('hidden');
        headerHamburger.classList.add('hidden');
    } else {
        sidebar.classList.add('collapsed');
        mainContent.classList.add('expanded');
        overlay.classList.add('hidden');
        headerHamburger.classList.remove('hidden');
    }
}

function handleSidebarResize() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const overlay = document.getElementById('sidebarOverlay');
    const headerHamburger = document.getElementById('headerHamburger');
    
    if (window.innerWidth >= 1024) {
        sidebar.classList.remove('collapsed');
        mainContent.classList.remove('expanded');
        overlay.classList.add('hidden');
        headerHamburger.classList.add('hidden');
        sidebarOpen = true;
    } else {
        sidebar.classList.add('collapsed');
        mainContent.classList.add('expanded');
        overlay.classList.add('hidden');
        headerHamburger.classList.remove('hidden');
        sidebarOpen = false;
    }
}

function toggleUserMenu() {
    document.getElementById('userDropdown').classList.toggle('hidden');
    // Close notifications if open
    document.getElementById('notificationDropdown')?.classList.add('hidden');
}

// Notification functions
function toggleNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    dropdown.classList.toggle('hidden');
    // Close user menu if open
    document.getElementById('userDropdown').classList.add('hidden');
    
    if (!dropdown.classList.contains('hidden')) {
        loadNotifications();
    }
}

async function loadNotifications() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    const container = document.getElementById('notificationList');
    
    try {
        const response = await fetch('http://localhost:5000/api/v1/notifications?limit=10', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && data.notifications?.length > 0) {
            container.innerHTML = data.notifications.map(n => renderNotification(n)).join('');
        } else {
            container.innerHTML = `
                <div class="p-8 text-center text-slate-400">
                    <svg class="mx-auto mb-2" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <p>No new notifications</p>
                </div>
            `;
        }
        
        // Update badge
        updateNotificationBadge(data.unreadCount || 0);
        
    } catch (err) {
        console.error('Load notifications error:', err);
        container.innerHTML = '<div class="p-4 text-center text-slate-400">Failed to load</div>';
    }
}

function renderNotification(n) {
    const date = new Date(n.eventDate).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric'
    });
    
    const tierColors = {
        favorite: 'bg-amber-100 text-amber-700',
        music_taste: 'bg-blue-100 text-blue-700'
    };
    
    const isUnread = n.status === 'pending' || n.status === 'sent';
    
    return `
        <div class="p-4 border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${isUnread ? 'bg-blue-50/50' : ''}" onclick="openNotification('${n._id}', '${n.ticketUrl || ''}')">
            <div class="flex justify-between items-start mb-1">
                <span class="text-xs px-2 py-0.5 rounded-full font-medium ${tierColors[n.tier] || 'bg-slate-100 text-slate-600'}">
                    ${n.reason}
                </span>
                <span class="text-xs text-slate-400">${n.distance} mi</span>
            </div>
            <p class="font-semibold text-slate-800 text-sm">${n.artistName}</p>
            <p class="text-xs text-slate-500">${date} • ${n.venueName}</p>
            <p class="text-xs text-slate-400">${n.venueCity}, ${n.venueState}</p>
        </div>
    `;
}

async function openNotification(notificationId, ticketUrl) {
    const token = localStorage.getItem('token');
    
    // Mark as read
    try {
        await fetch(`http://localhost:5000/api/v1/notifications/${notificationId}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        // Refresh count
        loadNotificationCount();
    } catch (err) {
        console.error('Mark read error:', err);
    }
    
    // Open ticket URL if available
    if (ticketUrl) {
        window.open(ticketUrl, '_blank');
    }
    
    // Close dropdown
    document.getElementById('notificationDropdown').classList.add('hidden');
}

async function markAllNotificationsRead() {
    const token = localStorage.getItem('token');
    
    try {
        await fetch('http://localhost:5000/api/v1/notifications/read-all', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        updateNotificationBadge(0);
        loadNotifications();
    } catch (err) {
        console.error('Mark all read error:', err);
    }
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

async function loadNotificationCount() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch('http://localhost:5000/api/v1/notifications/unread-count', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            updateNotificationBadge(data.count);
        }
    } catch (err) {
        console.error('Load notification count error:', err);
    }
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark ? 'true' : 'false');
    updateDarkModeUI(isDark);
}

function updateDarkModeUI(isDark) {
    const icon = document.getElementById('darkModeIcon');
    const label = document.getElementById('darkModeLabel');
    
    if (icon) icon.innerHTML = isDark ? SIDEBAR_ICONS.sun : SIDEBAR_ICONS.moon;
    if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

function initDarkMode() {
    const savedMode = localStorage.getItem('darkMode');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedMode === 'true' || (savedMode === null && prefersDark);
    
    if (isDark) {
        document.body.classList.add('dark-mode');
    }
    updateDarkModeUI(isDark);
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'auth.html';
}

function updateSidebarUser(user) {
    const name = user.firstName || user.username || 'Guest';
    const initial = name.charAt(0).toUpperCase();
    const location = user.homeCity && user.homeState 
        ? `${user.homeCity}, ${user.homeState}` 
        : '';
    
    // Update header
    const headerInitial = document.getElementById('headerUserInitial');
    const headerName = document.getElementById('headerUserName');
    if (headerInitial) headerInitial.textContent = initial;
    if (headerName) headerName.textContent = name;
    
    // Update sidebar
    const sidebarInitial = document.getElementById('sidebarUserInitial');
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarLocation = document.getElementById('sidebarUserLocation');
    const sidebarInfo = document.getElementById('userSidebarInfo');
    
    if (sidebarInitial) sidebarInitial.textContent = initial;
    if (sidebarName) sidebarName.textContent = name;
    if (sidebarLocation) sidebarLocation.textContent = location;
    if (sidebarInfo) sidebarInfo.classList.remove('hidden');
}

function initSidebar(pageTitle) {
    // Inject styles if not already present
    if (!document.getElementById('sidebar-styles')) {
        document.head.insertAdjacentHTML('beforeend', generateSidebarStyles());
    }
    
    // Initialize dark mode first (before rendering)
    initDarkMode();
    
    // Get the sidebar container
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        sidebarContainer.innerHTML = generateSidebarHTML();
    }
    
    // Get the header container
    const headerContainer = document.getElementById('header-container');
    if (headerContainer) {
        headerContainer.innerHTML = generateHeaderHTML(pageTitle);
    }
    
    // Update dark mode UI after sidebar is rendered
    const isDark = document.body.classList.contains('dark-mode');
    updateDarkModeUI(isDark);
    
    // Initialize responsive behavior
    handleSidebarResize();
    window.addEventListener('resize', handleSidebarResize);
    
    // Close user dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#userMenuContainer')) {
            const dropdown = document.getElementById('userDropdown');
            if (dropdown) dropdown.classList.add('hidden');
        }
        if (!e.target.closest('#notificationContainer')) {
            const dropdown = document.getElementById('notificationDropdown');
            if (dropdown) dropdown.classList.add('hidden');
        }
    });
    
    // Load notification count on page load
    loadNotificationCount();
}

// Export for use in pages
window.initSidebar = initSidebar;
window.toggleSidebar = toggleSidebar;
window.toggleUserMenu = toggleUserMenu;
window.toggleDarkMode = toggleDarkMode;
window.toggleNotifications = toggleNotifications;
window.loadNotifications = loadNotifications;
window.openNotification = openNotification;
window.markAllNotificationsRead = markAllNotificationsRead;
window.loadNotificationCount = loadNotificationCount;
window.logout = logout;
window.updateSidebarUser = updateSidebarUser;
window.handleSidebarResize = handleSidebarResize;