// Shared Admin Sidebar Component for Event Tracker
// Include this file in any admin page and call initAdminSidebar() to render the sidebar

const ADMIN_API_BASE = 'http://localhost:5000/api/v1';

const ADMIN_SIDEBAR_CONFIG = {
    navItems: [
        { href: 'admin-portal.html', icon: 'dashboard', label: 'Dashboard' },
        { href: 'admin-song-cache.html', icon: 'music', label: 'Song Cache' },
        { href: 'admin-artist-cache.html', icon: 'users', label: 'Artist Cache' },
        { href: 'admin-sync.html', icon: 'sync', label: 'Background Sync' },
        { href: 'admin-notifications.html', icon: 'bell', label: 'Notifications' },
        { href: 'admin-music-taste.html', icon: 'heart', label: 'Music Taste' },
        { href: 'admin-users.html', icon: 'user', label: 'Users' }
    ],
    mainAppLink: { href: 'index.html', icon: 'home', label: 'Back to Event Tracker' }
};

const ADMIN_SIDEBAR_ICONS = {
    dashboard: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
    </svg>`,
    music: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18V5l12-2v13"></path>
        <circle cx="6" cy="18" r="3"></circle>
        <circle cx="18" cy="16" r="3"></circle>
    </svg>`,
    users: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>`,
    sync: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 4 23 10 17 10"></polyline>
        <polyline points="1 20 1 14 7 14"></polyline>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
    </svg>`,
    bell: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
    </svg>`,
    heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>`,
    user: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
    </svg>`,
    home: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>`,
    menu: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-indigo-300">
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
    </svg>`,
    settings: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-indigo-300">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>`,
    chevronDown: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-400">
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>`,
    logout: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
    </svg>`
};

let adminSidebarOpen = window.innerWidth >= 1024;

function getAdminCurrentPage() {
    const path = window.location.pathname;
    return path.substring(path.lastIndexOf('/') + 1) || 'admin-portal.html';
}

function generateAdminNavItems() {
    const currentPage = getAdminCurrentPage();
    return ADMIN_SIDEBAR_CONFIG.navItems.map(item => {
        const isActive = currentPage === item.href;
        const activeClass = isActive 
            ? 'bg-indigo-700 text-white' 
            : 'text-indigo-200 hover:bg-indigo-700 hover:text-white';
        return `
            <a href="${item.href}" class="flex items-center gap-3 px-4 py-3 ${activeClass} rounded-lg transition-colors">
                ${ADMIN_SIDEBAR_ICONS[item.icon]}
                ${item.label}
            </a>
        `;
    }).join('');
}

function generateAdminSidebarHTML() {
    const mainApp = ADMIN_SIDEBAR_CONFIG.mainAppLink;
    return `
        <aside id="sidebar" class="sidebar fixed left-0 top-0 bottom-0 w-64 bg-indigo-900 text-white p-4 z-50">
            <div class="flex items-center gap-3 mb-8 px-2">
                <button onclick="toggleAdminSidebar()" class="p-1 hover:bg-indigo-700 rounded-lg">
                    ${ADMIN_SIDEBAR_ICONS.menu}
                </button>
                ${ADMIN_SIDEBAR_ICONS.settings}
                <span class="font-bold text-lg">Admin Portal</span>
            </div>
            
            <nav class="space-y-1">
                ${generateAdminNavItems()}
            </nav>
            
            <div class="absolute bottom-4 left-4 right-4 space-y-2">
                <a href="${mainApp.href}" class="flex items-center gap-3 px-4 py-3 text-indigo-300 hover:bg-indigo-700 hover:text-white rounded-lg transition-colors border border-indigo-700">
                    ${ADMIN_SIDEBAR_ICONS[mainApp.icon]}
                    ${mainApp.label}
                </a>
                
                <div id="userAdminSidebarInfo" class="bg-indigo-800 rounded-lg p-4 hidden">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center font-semibold text-indigo-200" id="adminSidebarUserInitial">?</div>
                        <div>
                            <p class="font-semibold text-sm" id="adminSidebarUserName">Guest</p>
                            <p class="text-xs text-indigo-400">Administrator</p>
                        </div>
                    </div>
                </div>
            </div>
        </aside>

        <div id="sidebarOverlay" class="fixed inset-0 bg-black/50 z-40 hidden" onclick="toggleAdminSidebar()"></div>
    `;
}

function generateAdminHeaderHTML(title) {
    return `
        <header class="bg-white border-b border-slate-200 sticky top-0 z-30">
            <div class="px-4 lg:px-6 py-4 flex items-center justify-between">
                <button id="headerHamburger" onclick="toggleAdminSidebar()" class="p-2 hover:bg-slate-100 rounded-lg mr-4 hidden">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-600">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
                
                <h1 class="text-2xl font-bold text-slate-800">${title}</h1>
                
                <div class="flex items-center gap-4">
                    <div class="relative" id="userMenuContainer">
                        <button id="userMenuButton" onclick="toggleAdminUserMenu()" class="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 rounded-lg">
                            <div class="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-semibold text-sm" id="headerUserInitial">?</div>
                            <span class="text-slate-700 font-medium hidden md:inline" id="headerUserName">Account</span>
                            ${ADMIN_SIDEBAR_ICONS.chevronDown}
                        </button>
                        
                        <div id="userDropdown" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 border border-slate-200 z-50">
                            <a href="account-details.html" class="block px-4 py-2 text-slate-700 hover:bg-slate-100 flex items-center gap-2">
                                ${ADMIN_SIDEBAR_ICONS.user}
                                Account Details
                            </a>
                            <a href="index.html" class="block px-4 py-2 text-slate-700 hover:bg-slate-100 flex items-center gap-2">
                                ${ADMIN_SIDEBAR_ICONS.home}
                                Event Tracker
                            </a>
                            <hr class="my-1">
                            <button onclick="adminLogout()" class="block w-full text-left px-4 py-2 text-rose-600 hover:bg-rose-50 flex items-center gap-2">
                                ${ADMIN_SIDEBAR_ICONS.logout}
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    `;
}

function generateAdminSidebarStyles() {
    return `
        <style id="admin-sidebar-styles">
            .sidebar { transition: transform 0.3s ease; }
            .sidebar.collapsed { transform: translateX(-100%); }
            .main-content { transition: margin-left 0.3s ease; }
            .main-content.expanded { margin-left: 0 !important; }
        </style>
    `;
}

function toggleAdminSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const overlay = document.getElementById('sidebarOverlay');
    const headerHamburger = document.getElementById('headerHamburger');
    
    adminSidebarOpen = !adminSidebarOpen;
    
    if (adminSidebarOpen) {
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

function handleAdminSidebarResize() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const overlay = document.getElementById('sidebarOverlay');
    const headerHamburger = document.getElementById('headerHamburger');
    
    if (window.innerWidth >= 1024) {
        sidebar.classList.remove('collapsed');
        mainContent.classList.remove('expanded');
        overlay.classList.add('hidden');
        headerHamburger.classList.add('hidden');
        adminSidebarOpen = true;
    } else {
        sidebar.classList.add('collapsed');
        mainContent.classList.add('expanded');
        overlay.classList.add('hidden');
        headerHamburger.classList.remove('hidden');
        adminSidebarOpen = false;
    }
}

function toggleAdminUserMenu() {
    document.getElementById('userDropdown').classList.toggle('hidden');
}

function adminLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'auth.html';
}

function updateAdminSidebarUser(user) {
    const name = user.firstName || user.username || 'Guest';
    const initial = name.charAt(0).toUpperCase();
    
    const headerInitial = document.getElementById('headerUserInitial');
    const headerName = document.getElementById('headerUserName');
    if (headerInitial) headerInitial.textContent = initial;
    if (headerName) headerName.textContent = name;
    
    const sidebarInitial = document.getElementById('adminSidebarUserInitial');
    const sidebarName = document.getElementById('adminSidebarUserName');
    const sidebarInfo = document.getElementById('userAdminSidebarInfo');
    
    if (sidebarInitial) sidebarInitial.textContent = initial;
    if (sidebarName) sidebarName.textContent = name;
    if (sidebarInfo) sidebarInfo.classList.remove('hidden');
}

// Check if user is admin - redirects to home if not
async function verifyAdminAccess() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        window.location.href = 'auth.html';
        return false;
    }
    
    try {
        const response = await fetch(`${ADMIN_API_BASE}/users/check-admin`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!data.success || !data.isAdmin) {
            alert('Access denied. Admin privileges required.');
            window.location.href = 'index.html';
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Admin verification failed:', error);
        window.location.href = 'index.html';
        return false;
    }
}

async function initAdminSidebar(pageTitle) {
    // Verify admin access first
    const isAdmin = await verifyAdminAccess();
    if (!isAdmin) return;
    
    if (!document.getElementById('admin-sidebar-styles')) {
        document.head.insertAdjacentHTML('beforeend', generateAdminSidebarStyles());
    }
    
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        sidebarContainer.innerHTML = generateAdminSidebarHTML();
    }
    
    const headerContainer = document.getElementById('header-container');
    if (headerContainer) {
        headerContainer.innerHTML = generateAdminHeaderHTML(pageTitle);
    }
    
    handleAdminSidebarResize();
    window.addEventListener('resize', handleAdminSidebarResize);
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#userMenuContainer')) {
            const dropdown = document.getElementById('userDropdown');
            if (dropdown) dropdown.classList.add('hidden');
        }
    });
}

// Export for use in pages
window.initAdminSidebar = initAdminSidebar;
window.toggleAdminSidebar = toggleAdminSidebar;
window.toggleAdminUserMenu = toggleAdminUserMenu;
window.adminLogout = adminLogout;
window.updateAdminSidebarUser = updateAdminSidebarUser;
window.handleAdminSidebarResize = handleAdminSidebarResize;