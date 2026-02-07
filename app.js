// Main Application Logic

// Update UI with user information
function updateUserUI(user) {
    // Update user email displays immediately (always available)
    const userEmailElements = document.querySelectorAll('.user-email');
    userEmailElements.forEach(el => {
        el.textContent = user.email;
    });

    // Set name from Auth profile first (may be null on fresh signup)
    const setName = (name) => {
        const userNameElements = document.querySelectorAll('.user-name');
        userNameElements.forEach(el => {
            el.textContent = name;
            el.classList.remove('opacity-0');
            el.classList.add('opacity-100');
        });
    };
    if (user.displayName) {
        setName(user.displayName);
    }

    // Always fetch from Firestore (the authoritative source for displayName)
    if (typeof db !== 'undefined') {
        db.collection('users').doc(user.uid).get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                // Use Firestore displayName (always saved correctly during signup)
                const name = data.displayName || user.displayName || 'User';
                setName(name);

                const planElements = document.querySelectorAll('.user-plan');
                planElements.forEach(el => {
                    el.textContent = data.plan || 'Student Plan';
                    el.classList.remove('opacity-0');
                    el.classList.add('opacity-100');
                });
            } else {
                // No Firestore doc yet — fall back to Auth
                setName(user.displayName || 'User');
            }
        }).catch(err => {
            console.error('User data fetch error:', err);
            setName(user.displayName || 'User');
        });
    } else {
        setName(user.displayName || 'User');
    }
}

// Load Dashboard Data
async function loadDashboard() {
    try {
        // Show loading state
        showLoading();
        
        // Get dashboard statistics
        const statsResult = await getDashboardStats();
        if (statsResult.success) {
            updateDashboardStats(statsResult.stats);
            updateMonthlyLimit(statsResult.stats);
        }
        
        // Get recent transactions (fetch more for search)
        const transactionsResult = await getUserTransactions(100);
        if (transactionsResult.success) {
            allTransactionsCache = transactionsResult.transactions;
            displayRecentTransactions(transactionsResult.transactions.slice(0, 10));
        }
        
        // AI Insight: show cached, then try fresh generation
        let hasInsight = false;
        try {
            const insightResult = await getLatestAIInsight();
            if (insightResult.success && insightResult.insight && insightResult.insight.message) {
                displayAIInsight(insightResult.insight);
                hasInsight = true;
            }
        } catch (cacheErr) {
            console.error('Cached AI insight fetch error:', cacheErr);
        }

        // Generate a fresh insight with today's actual data (max once per hour)
        const hasData = statsResult.success && (statsResult.stats.totalIncome > 0 || statsResult.stats.totalExpenses > 0);
        if (statsResult.success && transactionsResult.success && hasData) {
            const lastRefresh = localStorage.getItem('ai-insight-refresh');
            const now = Date.now();
            const ONE_HOUR = 60 * 60 * 1000;
            const isStale = !lastRefresh || (now - parseInt(lastRefresh, 10)) > ONE_HOUR;

            if (isStale) {
                try {
                    const freshInsight = await generateAIInsight(statsResult.stats, transactionsResult.transactions);
                    if (freshInsight.success && freshInsight.insight) {
                        displayAIInsight({ message: freshInsight.insight });
                        localStorage.setItem('ai-insight-refresh', String(now));
                        hasInsight = true;
                    }
                } catch (aiErr) {
                    console.error('Fresh AI insight error:', aiErr);
                }
            }
        }

        // Fallback: always show something — never leave "Loading..."
        if (!hasInsight) {
            if (hasData) {
                displayAIInsight({ message: 'Analyzing your spending patterns... Check back shortly for personalized insights!' });
            } else {
                displayAIInsight({ message: 'Start adding transactions to get personalized AI insights about your spending habits!' });
            }
        }
        
        hideLoading();
    } catch (error) {
        console.error('Load dashboard error:', error);
        hideLoading();
        showError('Failed to load dashboard data');
    }
}

// Update Dashboard Statistics Display
function updateDashboardStats(stats) {
    // Update income
    const incomeEl = document.querySelector('[data-stat="income"]');
    if (incomeEl) incomeEl.textContent = `₹${stats.totalIncome.toFixed(2)}`;
    
    // Update expenses
    const expensesEl = document.querySelector('[data-stat="expenses"]');
    if (expensesEl) expensesEl.textContent = `₹${stats.totalExpenses.toFixed(2)}`;
    
    // Update remaining
    const remainingEl = document.querySelector('[data-stat="remaining"]');
    if (remainingEl) remainingEl.textContent = `₹${stats.remaining.toFixed(2)}`;
    
    // Update budget progress
    const progressEl = document.querySelector('[data-stat="progress"]');
    if (progressEl) {
        const percentage = stats.totalIncome > 0 ? (stats.totalExpenses / stats.totalIncome * 100).toFixed(0) : 0;
        progressEl.style.width = `${percentage}%`;
        progressEl.textContent = `${percentage}%`;
    }
}

// Display Recent Transactions
function displayRecentTransactions(transactions) {
    const container = document.querySelector('#transactions-container');
    if (!container) return;
    
    if (transactions.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No transactions yet</p>';
        return;
    }
    
    container.innerHTML = transactions.map(transaction => `
        <div class="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors group cursor-pointer">
            <div class="flex items-center gap-4">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <span class="material-symbols-outlined">${getCategoryIcon(transaction.category)}</span>
                </div>
                <div>
                    <p class="font-bold text-gray-900">${transaction.description}</p>
                    <p class="text-xs font-medium text-gray-500 mt-0.5">${transaction.category} • ${formatDate(transaction.date)}</p>
                </div>
            </div>
            <p class="font-bold text-gray-900">${transaction.type === 'income' ? '+' : '-'}₹${transaction.amount.toFixed(2)}</p>
        </div>
    `).join('');
}

// Display AI Insight
function displayAIInsight(insight) {
    const container = document.querySelector('#ai-insight-container');
    if (!container) return;
    
    container.textContent = insight.message;
}

// ==================== BUDGET CATEGORIES ====================

let allBudgetCategories = [];
let bcCurrentFilter = 'all';
let bcSortAsc = false; // false = highest spend first

function filterBudgetCategories(filter) {
    bcCurrentFilter = filter;

    // Update button styles
    const activeClass = 'px-4 py-1.5 rounded-full bg-text-main text-white text-sm font-medium shadow-sm whitespace-nowrap';
    const inactiveClass = 'px-4 py-1.5 rounded-full bg-white border border-card-border text-text-muted hover:bg-slate-50 text-sm font-medium transition-colors whitespace-nowrap shadow-sm';
    const btnAll = document.querySelector('#bc-filter-all');
    const btnNear = document.querySelector('#bc-filter-near');
    const btnOver = document.querySelector('#bc-filter-over');
    if (btnAll) btnAll.className = filter === 'all' ? activeClass : inactiveClass;
    if (btnNear) btnNear.className = filter === 'near' ? activeClass : inactiveClass;
    if (btnOver) btnOver.className = filter === 'over' ? activeClass : inactiveClass;

    let filtered = [...allBudgetCategories];

    if (filter === 'near') {
        // Near limit: spent >= 75% of budget but not yet over (only categories with a budget)
        filtered = filtered.filter(c => c.budget > 0 && (c.spent / c.budget) >= 0.75 && (c.spent / c.budget) < 1);
    } else if (filter === 'over') {
        // Over budget: spent >= budget (only categories with a budget)
        filtered = filtered.filter(c => c.budget > 0 && c.spent >= c.budget);
    }

    // Apply current sort
    if (bcSortAsc) {
        filtered.sort((a, b) => a.spent - b.spent || a.name.localeCompare(b.name));
    } else {
        filtered.sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));
    }

    displayBudgetCategories(filtered);

    // Show message if no results
    if (filtered.length === 0) {
        const container = document.querySelector('#categories-container');
        if (container) {
            const msg = filter === 'near' ? 'No categories near their limit right now.' : filter === 'over' ? 'No categories over budget. Great job!' : 'No budget categories yet.';
            container.innerHTML = `<p class="text-gray-500 text-center p-5 col-span-full">${msg}</p>`;
        }
    }
}

function toggleBudgetSort() {
    bcSortAsc = !bcSortAsc;
    const label = document.querySelector('#bc-sort-label');
    if (label) label.textContent = bcSortAsc ? 'Sorted by: Lowest Spend' : 'Sorted by: Highest Spend';
    filterBudgetCategories(bcCurrentFilter);
}

// Load Budget Categories Page
async function loadBudgetCategories() {
    try {
        showLoading();

        // Get saved category definitions (budget limits, icons, colors)
        const catResult = await getBudgetCategories();
        const savedCategories = catResult.success ? catResult.categories : [];

        // Use the SAME stats function as Dashboard so numbers always match
        const statsResult = await getDashboardStats();
        const spentByCategory = statsResult.success ? statsResult.stats.categorySpending : {};

        // Build a map of saved categories by name
        const catMap = {};
        savedCategories.forEach(cat => { catMap[cat.name] = cat; });

        // Default icons/colors for auto-generated categories
        const defaultCatMeta = {
            'Food & Dining': { icon: 'restaurant', color: 'orange' },
            'Groceries':     { icon: 'shopping_cart', color: 'green' },
            'Transport':     { icon: 'directions_car', color: 'blue' },
            'Entertainment': { icon: 'local_activity', color: 'purple' },
            'Shopping':      { icon: 'shopping_bag', color: 'pink' },
            'Education':     { icon: 'school', color: 'indigo' },
            'Housing':       { icon: 'home', color: 'teal' },
            'Healthcare':    { icon: 'medical_services', color: 'red' },
            'Other':         { icon: 'category', color: 'amber' },
        };
        const defaultColors = ['orange', 'blue', 'indigo', 'teal', 'pink', 'green', 'purple', 'red'];
        let colorIdx = 0;

        // Merge: saved categories + any new categories discovered from transactions
        const allCategoryNames = new Set([
            ...savedCategories.map(c => c.name),
            ...Object.keys(spentByCategory)
        ]);

        const categories = Array.from(allCategoryNames).map(name => {
            const saved = catMap[name];
            const meta = defaultCatMeta[name] || { icon: 'category', color: defaultColors[colorIdx++ % defaultColors.length] };
            return {
                id: saved?.id || null,
                name: name,
                budget: saved?.budget || 0,
                spent: spentByCategory[name] || 0,
                icon: saved?.icon || meta.icon,
                color: saved?.color || meta.color,
            };
        });

        // Sort: categories with spending first, then alphabetical
        categories.sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));

        displayBudgetCategories(categories);
        updateBudgetCategoryStats(categories);

        // Store for filtering/sorting
        allBudgetCategories = categories;
        bcCurrentFilter = 'all';
        bcSortAsc = false;

        hideLoading();
    } catch (error) {
        console.error('Load categories error:', error);
        hideLoading();
        showError('Failed to load budget categories');
    }
}

// Color hex map for dynamic inline styles (Tailwind CDN can't generate runtime classes)
const COLOR_MAP = {
    orange:  { bg: '#fff7ed', text: '#f97316', bar: 'linear-gradient(to right, #fdba74, #fed7aa)' },
    blue:    { bg: '#eff6ff', text: '#3b82f6', bar: 'linear-gradient(to right, #93c5fd, #bfdbfe)' },
    indigo:  { bg: '#eef2ff', text: '#6366f1', bar: 'linear-gradient(to right, #a5b4fc, #c7d2fe)' },
    red:     { bg: '#fef2f2', text: '#ef4444', bar: 'linear-gradient(to right, #fca5a5, #fecaca)' },
    yellow:  { bg: '#fefce8', text: '#eab308', bar: 'linear-gradient(to right, #fde047, #fef08a)' },
    teal:    { bg: '#f0fdfa', text: '#14b8a6', bar: 'linear-gradient(to right, #5eead4, #99f6e4)' },
    pink:    { bg: '#fdf2f8', text: '#ec4899', bar: 'linear-gradient(to right, #f9a8d4, #fbcfe8)' },
    green:   { bg: '#f0fdf4', text: '#22c55e', bar: 'linear-gradient(to right, #86efac, #bbf7d0)' },
    emerald: { bg: '#ecfdf5', text: '#059669', bar: 'linear-gradient(to right, #6ee7b7, #a7f3d0)' },
    cyan:    { bg: '#ecfeff', text: '#0891b2', bar: 'linear-gradient(to right, #67e8f9, #a5f3fc)' },
    purple:  { bg: '#faf5ff', text: '#a855f7', bar: 'linear-gradient(to right, #d8b4fe, #e9d5ff)' },
    amber:   { bg: '#fffbeb', text: '#f59e0b', bar: 'linear-gradient(to right, #fcd34d, #fde68a)' },
};
function getColor(name) { return COLOR_MAP[name] || COLOR_MAP.blue; }

// Display Budget Categories
function displayBudgetCategories(categories) {
    const container = document.querySelector('#categories-container');
    if (!container) return;
    
    if (categories.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No budget categories yet</p>';
        return;
    }
    
    container.innerHTML = categories.map(category => {
        const hasBudget = category.budget > 0;
        const percentage = hasBudget ? Math.min((category.spent / category.budget * 100), 100).toFixed(0) : 0;
        const c = getColor(category.color);
        return `
            <div class="group relative flex flex-col p-5 bg-white rounded-2xl border border-gray-200 hover:shadow-lg transition-all duration-300 cursor-pointer">
                <div class="flex justify-between items-start mb-4">
                    <div class="h-10 w-10 rounded-full flex items-center justify-center" style="background-color:${c.bg};color:${c.text}">
                        <span class="material-symbols-outlined">${category.icon}</span>
                    </div>
                </div>
                <h3 class="text-lg font-bold text-gray-900 mb-1">${category.name}</h3>
                <div class="flex items-end gap-1.5 mb-3">
                    <span class="text-2xl font-bold text-gray-900">₹${category.spent.toFixed(0)}</span>
                    ${hasBudget ? `<span class="text-sm text-gray-500 mb-1">/ ₹${category.budget.toFixed(0)}</span>` : `<span class="text-sm text-gray-400 mb-1">spent</span>`}
                </div>
                ${hasBudget ? `
                <div class="w-full bg-gray-100 rounded-full h-2 mb-2">
                    <div class="h-2 rounded-full" style="width:${percentage}%;background:${c.bar}"></div>
                </div>
                <p class="text-xs text-gray-500 text-right">${percentage}% used</p>
                ` : `
                <div class="w-full bg-gray-100 rounded-full h-2 mb-2">
                    <div class="h-2 rounded-full" style="width:100%;background:${c.bar}"></div>
                </div>
                <p class="text-xs text-gray-400 text-right">No budget set</p>
                `}
            </div>
        `;
    }).join('');
}

// ==================== INCOME STREAMS ====================

let allIncomeStreams = [];
let isCurrentFilter = 'all';
let isSortAsc = false; // false = highest amount first

function filterIncomeStreams(filter) {
    isCurrentFilter = filter;

    // Update button styles
    const activeClass = 'px-4 py-1.5 rounded-full bg-slate-900 text-white text-sm font-medium shadow-sm whitespace-nowrap';
    const inactiveClass = 'px-4 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors whitespace-nowrap';
    const btnAll = document.querySelector('#is-filter-all');
    const btnRec = document.querySelector('#is-filter-recurring');
    const btnOne = document.querySelector('#is-filter-onetime');
    if (btnAll) btnAll.className = filter === 'all' ? activeClass : inactiveClass;
    if (btnRec) btnRec.className = filter === 'recurring' ? activeClass : inactiveClass;
    if (btnOne) btnOne.className = filter === 'onetime' ? activeClass : inactiveClass;

    let filtered = [...allIncomeStreams];

    if (filter === 'recurring') {
        // Recurring = more than one transaction in the category this month
        filtered = filtered.filter(s => s.count > 1);
    } else if (filter === 'onetime') {
        // One-time = exactly one transaction in the category this month
        filtered = filtered.filter(s => s.count === 1);
    }

    // Apply current sort
    if (isSortAsc) {
        filtered.sort((a, b) => a.amount - b.amount || a.name.localeCompare(b.name));
    } else {
        filtered.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    }

    displayIncomeStreams(filtered);

    // Show message if no results
    if (filtered.length === 0) {
        const container = document.querySelector('#income-streams-container');
        if (container) {
            const msg = filter === 'recurring' ? 'No recurring income sources this month.'
                      : filter === 'onetime' ? 'No one-time income this month.'
                      : 'No income streams yet.';
            container.innerHTML = `<p class="text-gray-500 text-center p-5 col-span-full">${msg}</p>`;
        }
    }
}

function toggleIncomeSort() {
    isSortAsc = !isSortAsc;
    const label = document.querySelector('#is-sort-label');
    if (label) label.textContent = isSortAsc ? 'Sorted by: Lowest Amount' : 'Sorted by: Amount';
    filterIncomeStreams(isCurrentFilter);
}

// Load Income Streams Page
async function loadIncomeStreams() {
    try {
        showLoading();

        // Get income data from the SHARED transactions collection (same DB as dashboard)
        const txResult = await getUserTransactions(500);

        if (txResult.success) {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            // Filter income transactions for current month
            const incomeTransactions = txResult.transactions.filter(t => {
                if (t.type !== 'income') return false;
                const txDate = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.date || 0);
                return txDate >= startOfMonth;
            });

            // Group by category to form income streams
            const streamMap = {};
            const defaultIcons = { 'Salary': 'work', 'Freelance': 'laptop_mac', 'Part-time Job': 'work_history', 'Scholarship': 'school', 'Allowance': 'card_giftcard', 'Investment': 'trending_up', 'Gift': 'redeem', 'Other': 'payments' };
            const streamColors = ['emerald', 'blue', 'teal', 'cyan', 'green', 'indigo'];
            let colorIdx = 0;

            incomeTransactions.forEach(t => {
                const key = t.category || t.description || 'Other';
                if (!streamMap[key]) {
                    streamMap[key] = {
                        name: key,
                        amount: 0,
                        icon: defaultIcons[key] || 'payments',
                        color: streamColors[colorIdx++ % streamColors.length],
                        frequency: 'This month',
                        count: 0
                    };
                }
                streamMap[key].amount += t.amount || 0;
                streamMap[key].count++;
            });

            const streams = Object.values(streamMap);
            streams.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
            displayIncomeStreams(streams);
            updateIncomeStreamStats(streams);

            // Store for filtering/sorting
            allIncomeStreams = streams;
            isCurrentFilter = 'all';
            isSortAsc = false;
        }

        hideLoading();
    } catch (error) {
        console.error('Load income streams error:', error);
        hideLoading();
        showError('Failed to load income streams');
    }
}

// Load Alerts Page
async function loadAlerts() {
    try {
        showLoading();

        // Auto-generate smart alerts based on spending data
        await generateSmartAlerts();
        
        const result = await getUserAlerts();
        if (result.success) {
            displayAlerts(result.alerts);
        }
        
        hideLoading();
    } catch (error) {
        console.error('Load alerts error:', error);
        hideLoading();
        showError('Failed to load alerts');
    }
}

// Smart Alert Auto-Generation
async function generateSmartAlerts() {
    try {
        const user = getCurrentUser();
        if (!user) return;

        const statsResult = await getDashboardStats();
        if (!statsResult.success) return;

        const stats = statsResult.stats;
        const existingAlerts = await getUserAlerts();
        const existingTitles = (existingAlerts.success ? existingAlerts.alerts : []).map(a => a.title);

        // Get user's monthly budget
        let monthlyBudget = 1500;
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists && userDoc.data().monthlyBudget) {
                monthlyBudget = userDoc.data().monthlyBudget;
            }
        } catch (e) {}

        const alerts = [];
        const spentPct = monthlyBudget > 0 ? (stats.totalExpenses / monthlyBudget) * 100 : 0;

        // Budget exceeded alert
        if (spentPct >= 100 && !existingTitles.includes('Budget Exceeded!')) {
            alerts.push({
                title: 'Budget Exceeded!',
                message: `You've spent ₹${stats.totalExpenses.toFixed(0)} which exceeds your ₹${monthlyBudget} monthly budget. Consider reducing non-essential spending.`,
                type: 'warning',
                priority: 'high'
            });
        }
        // Near budget limit
        else if (spentPct >= 80 && !existingTitles.includes('Approaching Budget Limit')) {
            alerts.push({
                title: 'Approaching Budget Limit',
                message: `You've used ${spentPct.toFixed(0)}% of your ₹${monthlyBudget} monthly budget. You have ₹${(monthlyBudget - stats.totalExpenses).toFixed(0)} remaining.`,
                type: 'warning',
                priority: 'medium'
            });
        }

        // Low balance alert
        const remaining = stats.totalIncome - stats.totalExpenses;
        if (remaining < 500 && stats.totalIncome > 0 && !existingTitles.includes('Low Balance Warning')) {
            alerts.push({
                title: 'Low Balance Warning',
                message: `Your remaining balance is only ₹${remaining.toFixed(0)}. Be cautious with new expenses.`,
                type: 'warning',
                priority: 'high'
            });
        }

        // Savings milestone
        if (stats.totalIncome > 0) {
            const savingsRate = ((stats.totalIncome - stats.totalExpenses) / stats.totalIncome) * 100;
            if (savingsRate >= 20 && !existingTitles.includes('Great Savings Rate!')) {
                alerts.push({
                    title: 'Great Savings Rate!',
                    message: `You're saving ${savingsRate.toFixed(0)}% of your income this month. Keep up the great work!`,
                    type: 'success',
                    priority: 'low'
                });
            }
        }

        // Top spending category alert
        if (stats.categorySpending) {
            const topCat = Object.entries(stats.categorySpending).sort((a, b) => b[1] - a[1])[0];
            if (topCat && topCat[1] > monthlyBudget * 0.4 && !existingTitles.includes(`High Spending: ${topCat[0]}`)) {
                alerts.push({
                    title: `High Spending: ${topCat[0]}`,
                    message: `You've spent ₹${topCat[1].toFixed(0)} on ${topCat[0]}, which is ${((topCat[1] / stats.totalExpenses) * 100).toFixed(0)}% of your total expenses. Consider setting a category budget.`,
                    type: 'info',
                    priority: 'medium'
                });
            }
        }

        // Save new alerts to Firestore
        for (const alert of alerts) {
            await addAlert(alert);
        }
    } catch (error) {
        console.error('Generate smart alerts error:', error);
    }
}

// Display Income Streams
function displayIncomeStreams(streams) {
    const container = document.querySelector('#income-streams-container');
    if (!container) return;
    
    if (streams.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No income streams yet</p>';
        return;
    }
    
    container.innerHTML = streams.map(stream => {
        const c = getColor(stream.color || 'blue');
        return `
            <div class="group relative flex flex-col p-5 bg-white rounded-2xl border border-slate-200 hover:shadow-lg transition-all duration-300 cursor-pointer">
                <div class="flex justify-between items-start mb-4">
                    <div class="h-10 w-10 rounded-full flex items-center justify-center" style="background-color:${c.bg};color:${c.text}">
                        <span class="material-symbols-outlined">${stream.icon || 'payments'}</span>
                    </div>
                </div>
                <h3 class="text-lg font-bold text-slate-900 mb-1">${stream.name}</h3>
                <div class="flex items-end gap-1.5 mb-3">
                    <span class="text-2xl font-bold text-slate-900">₹${stream.amount.toFixed(0)}</span>
                    <span class="text-sm text-slate-500 mb-1">${stream.frequency || ''}</span>
                </div>
                <p class="text-xs text-slate-500">
                    ${stream.count ? stream.count + ' transaction' + (stream.count > 1 ? 's' : '') + ' this month' : (stream.nextPayment ? 'Next: ' + formatDate(stream.nextPayment) : 'Active')}
                </p>
            </div>
        `;
    }).join('');
}

// Display Alerts
function displayAlerts(alerts) {
    const container = document.querySelector('#alerts-container');
    if (!container) return;
    
    if (alerts.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <div class="mb-4">
                    <span class="material-symbols-outlined text-6xl text-slate-300">notifications_off</span>
                </div>
                <h3 class="text-lg font-semibold text-slate-600 mb-1">No alerts yet</h3>
                <p class="text-sm text-slate-500">You're all caught up for now!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = alerts.map(alert => {
        const colorName = alert.type === 'warning' ? 'amber' : alert.type === 'success' ? 'green' : 'blue';
        const c = getColor(colorName);
        const iconName = alert.type === 'warning' ? 'warning' : alert.type === 'success' ? 'check_circle' : 'info';
        return `
            <div class="group relative overflow-hidden rounded-xl shadow-sm" style="background-color:${c.bg};border:1px solid ${c.text}30">
                <div class="absolute left-0 top-0 bottom-0 w-1" style="background-color:${c.text}"></div>
                <div class="p-5 sm:p-6 flex gap-5">
                    <div class="shrink-0">
                        <div class="size-12 rounded-full bg-white flex items-center justify-center shadow-sm" style="color:${c.text};border:1px solid ${c.text}30">
                            <span class="material-symbols-outlined">${iconName}</span>
                        </div>
                    </div>
                    <div class="flex-1 flex flex-col gap-3">
                        <div class="flex justify-between items-start">
                            <div class="flex flex-col gap-1">
                                <div class="flex items-center gap-2">
                                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide" style="background-color:${c.text}20;color:${c.text}">
                                        ${alert.priority || 'medium'} priority
                                    </span>
                                    <span class="text-xs text-slate-400">${alert.createdAt ? formatDate(alert.createdAt.toDate ? alert.createdAt.toDate() : alert.createdAt) : 'Just now'}</span>
                                </div>
                                <h3 class="text-lg font-bold text-slate-900">${alert.title}</h3>
                            </div>
                        </div>
                        <p class="text-slate-700 leading-relaxed">${alert.message}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Helper Functions

function getCategoryIcon(category) {
    const icons = {
        'Food & Dining': 'restaurant',
        'Groceries': 'shopping_cart',
        'Transport': 'directions_car',
        'Entertainment': 'local_activity',
        'Shopping': 'shopping_bag',
        'Education': 'school',
        'Housing': 'home',
        'Healthcare': 'medical_services',
        'Other': 'category'
    };
    return icons[category] || 'category';
}

function formatDate(timestamp) {
    if (!timestamp) return 'Today';
    
    // Handle Firestore Timestamp
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showLoading() {
    const loader = document.querySelector('#loading-indicator');
    if (loader) loader.classList.remove('hidden');
}

function hideLoading() {
    const loader = document.querySelector('#loading-indicator');
    if (loader) loader.classList.add('hidden');
}

function showError(message) {
    // Create toast notification instead of alert
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 bg-red-600 text-white px-5 py-3 rounded-xl shadow-lg z-[100] text-sm font-medium animate-slide-up';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg z-[100] text-sm font-medium animate-slide-up';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ==================== DASHBOARD EXTRAS ====================

function updateCurrentDate() {
    const dateEl = document.querySelector('#current-date');
    if (dateEl) {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}

function updateMonthlyLimit(stats) {
    const user = getCurrentUser();
    if (!user) return;

    // Calculate days until month reset
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = lastDay - now.getDate();
    const resetEl = document.querySelector('#reset-days');
    if (resetEl) resetEl.textContent = `Reset in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;

    // Use cached budget for instant display, then refresh from Firestore
    const cachedBudget = parseInt(localStorage.getItem('xpenso-monthlyBudget')) || null;
    if (cachedBudget) {
        applyMonthlyLimit(stats, cachedBudget);
    }

    db.collection('users').doc(user.uid).get().then(doc => {
        let budget = 1500;
        if (doc.exists && doc.data()) {
            budget = doc.data().monthlyBudget || 1500;
        }
        localStorage.setItem('xpenso-monthlyBudget', budget);
        applyMonthlyLimit(stats, budget);
    }).catch(err => {
        console.error('Monthly limit error:', err);
        if (!cachedBudget) applyMonthlyLimit(stats, 1500);
    });
}

function applyMonthlyLimit(stats, budget) {
    const spent = stats?.totalExpenses || 0;
    const pct = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;

    const pctEl = document.querySelector('[data-stat="progress-pct"]');
    if (pctEl) pctEl.textContent = `${pct}%`;

    const barEl = document.querySelector('[data-stat="progress"]');
    if (barEl) {
        barEl.style.width = `${pct}%`;
        barEl.className = barEl.className.replace(/bg-(primary|rose-500|amber-500)/g, '');
        if (pct >= 90) barEl.classList.add('bg-rose-500');
        else if (pct >= 70) barEl.classList.add('bg-amber-500');
        else barEl.classList.add('bg-primary');
    }

    const usageEl = document.querySelector('[data-stat="budget-usage"]');
    if (usageEl) usageEl.textContent = `₹${spent.toFixed(0)} / ₹${budget}`;
}

// ==================== VISUAL REPORTS ====================

let vrShowingAll = false;
let vrViewMode = 'thisMonth'; // 'thisMonth', 'thisYear', 'day'
let vrSelectedDate = null;  // Date object when mode = 'day'
let vrCalendarMonth = new Date().getMonth();
let vrCalendarYear = new Date().getFullYear();

function toggleAllTransactions() {
    vrShowingAll = !vrShowingAll;
    updateLargestTransactions(allVRTransactions, vrShowingAll);
}

async function loadVisualReports() {
    try {
        showLoading();

        // Reset to default view
        vrViewMode = 'thisMonth';
        vrSelectedDate = null;
        vrShowingAll = false;

        const txResult = await getUserTransactions(500);
        if (txResult.success) {
            allVRTransactions = txResult.transactions;
        }

        // Initial render using the current view mode
        refreshVRView();

        // Also update button states to match default
        switchVRView('thisMonth');

        hideLoading();
    } catch (error) {
        console.error('Load visual reports error:', error);
        hideLoading();
        showError('Failed to load visual reports');
    }
}

// Chart.js instances (to destroy before re-creating)
let trendChartInstance = null;
let donutChartInstance = null;

function renderSpendingTrendChart(transactions) {
    const canvas = document.querySelector('#spending-trend-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Group expenses by week of the current month
    const now = new Date();
    const expenses = transactions.filter(t => t.type === 'expense');
    const weeklyData = [0, 0, 0, 0];

    expenses.forEach(t => {
        const date = t.date ? (t.date.toDate ? t.date.toDate() : new Date(t.date)) : (t.createdAt?.toDate ? t.createdAt.toDate() : new Date());
        if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
            const weekIndex = Math.min(Math.floor((date.getDate() - 1) / 7), 3);
            weeklyData[weekIndex] += Number(t.amount) || 0;
        }
    });

    if (trendChartInstance) trendChartInstance.destroy();
    trendChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [{
                label: 'Spending',
                data: weeklyData,
                borderColor: '#2dd4bf',
                backgroundColor: 'rgba(45, 212, 191, 0.15)',
                fill: true,
                tension: 0.4,
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#2dd4bf',
                pointBorderWidth: 3,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `₹${ctx.parsed.y.toFixed(2)}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: (v) => '₹' + v },
                    grid: { color: 'rgba(100,116,139,0.1)', drawBorder: false }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

function renderCategoryDonutChart(categorySpending) {
    const canvas = document.querySelector('#category-donut-chart');
    if (!canvas || typeof Chart === 'undefined' || !categorySpending) return;

    const entries = Object.entries(categorySpending).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (entries.length === 0) return;

    const colors = ['#2dd4bf', '#8b5cf6', '#fb7185', '#f59e0b', '#64748b'];

    if (donutChartInstance) donutChartInstance.destroy();
    donutChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: entries.map(e => e[0]),
            datasets: [{
                data: entries.map(e => e[1]),
                backgroundColor: colors.slice(0, entries.length),
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.label}: ₹${ctx.parsed.toFixed(2)}`
                    }
                }
            }
        }
    });
}

function updateVisualReportStats(stats) {
    const totalSpent = document.querySelector('[data-stat="vr-total-spent"]');
    if (totalSpent) totalSpent.textContent = `₹${stats.totalExpenses.toFixed(2)}`;

    const dailyAvg = document.querySelector('[data-stat="vr-daily-avg"]');
    if (dailyAvg) {
        let avg = 0;
        if (vrViewMode === 'day') {
            avg = stats.totalExpenses; // Single day: total is the daily amount
        } else if (vrViewMode === 'thisYear') {
            const dayOfYear = Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 86400000);
            avg = dayOfYear > 0 ? (stats.totalExpenses / dayOfYear) : 0;
        } else {
            const today = new Date();
            const dayOfMonth = today.getDate();
            avg = dayOfMonth > 0 ? (stats.totalExpenses / dayOfMonth) : 0;
        }
        dailyAvg.textContent = `₹${avg.toFixed(2)}`;
    }

    // Update the label for Daily Average based on view
    const dailyAvgLabel = document.querySelector('[data-stat="vr-daily-avg"]');
    if (dailyAvgLabel && dailyAvgLabel.closest('.group, [class*="rounded-2xl"]')) {
        const labelEl = dailyAvgLabel.closest('[class*="rounded-2xl"]')?.querySelector('.text-slate-500.text-sm');
        if (labelEl) {
            if (vrViewMode === 'day') labelEl.textContent = 'Day Total';
            else if (vrViewMode === 'thisYear') labelEl.textContent = 'Daily Average (YTD)';
            else labelEl.textContent = 'Daily Average (MTD)';
        }
    }

    const savingsRate = document.querySelector('[data-stat="vr-savings-rate"]');
    if (savingsRate) {
        const rate = stats.totalIncome > 0 ? Math.round(((stats.totalIncome - stats.totalExpenses) / stats.totalIncome) * 100) : 0;
        savingsRate.textContent = `${Math.max(rate, 0)}%`;
    }
}

function updateCategoryBreakdown(categorySpending) {
    const container = document.querySelector('#vr-category-breakdown');
    if (!container || !categorySpending) return;

    const total = Object.values(categorySpending).reduce((a, b) => a + b, 0);
    if (total === 0) {
        container.innerHTML = '<p class="text-sm text-slate-500 p-2">No spending data yet</p>';
        return;
    }

    const colors = ['bg-accent-teal', 'bg-accent-violet', 'bg-accent-coral', 'bg-slate-200'];
    const entries = Object.entries(categorySpending).sort((a, b) => b[1] - a[1]).slice(0, 4);

    container.innerHTML = entries.map(([cat, amount], i) => {
        const pct = Math.round((amount / total) * 100);
        return `
            <div class="flex items-center justify-between group cursor-pointer p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <div class="flex items-center gap-3">
                    <div class="w-3 h-3 rounded-full ${colors[i] || 'bg-slate-200'}"></div>
                    <span class="text-sm text-slate-600 font-medium">${cat}</span>
                </div>
                <div class="flex flex-col items-end">
                    <span class="text-sm font-bold text-slate-900">${pct}%</span>
                    <span class="text-xs text-slate-400">₹${amount.toFixed(2)}</span>
                </div>
            </div>
        `;
    }).join('');
}

let allVRTransactions = [];

function updateLargestTransactions(transactions, showAll = false) {
    const tbody = document.querySelector('#vr-transactions-table');
    if (!tbody) return;

    // Show all transaction types, sorted by amount (highest first)
    const allTx = [...transactions].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));

    if (allTx.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-500">No transactions yet</td></tr>';
        return;
    }

    const display = showAll ? allTx : allTx.slice(0, 5);

    tbody.innerHTML = display.map(t => {
        const isIncome = t.type === 'income';
        const amountColor = isIncome ? 'text-emerald-600' : 'text-slate-900';
        const amountPrefix = isIncome ? '+' : '-';
        return `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                <div class="p-2 rounded-lg bg-slate-100 text-slate-600">
                    <span class="material-symbols-outlined text-[20px]">${getCategoryIcon(t.category)}</span>
                </div>
                <div>
                    <p>${t.description}</p>
                    <p class="text-xs text-slate-400 font-normal">${t.category}</p>
                </div>
            </td>
            <td class="px-6 py-4"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">${t.category}</span></td>
            <td class="px-6 py-4">${formatDate(t.date || t.createdAt)}</td>
            <td class="px-6 py-4 text-right font-bold ${amountColor}">${amountPrefix}₹${(Number(t.amount) || 0).toFixed(2)}</td>
        </tr>
    `;}).join('');

    // Update the View All link text
    const viewAllLink = document.querySelector('#vr-view-all-btn');
    if (viewAllLink) {
        viewAllLink.style.display = '';
        if (showAll) {
            viewAllLink.innerHTML = 'Show Less <span class="material-symbols-outlined text-[16px]">expand_less</span>';
        } else if (allTx.length > 5) {
            viewAllLink.innerHTML = `View all (${allTx.length}) <span class="material-symbols-outlined text-[16px]">arrow_forward</span>`;
        } else {
            viewAllLink.innerHTML = `View all <span class="material-symbols-outlined text-[16px]">arrow_forward</span>`;
        }
    }
}

// ==================== VR VIEW SWITCHING & CALENDAR ====================

function switchVRView(mode, date) {
    vrViewMode = mode;
    vrSelectedDate = date || null;
    vrShowingAll = false;

    // Update button styles
    const btn30 = document.querySelector('#vr-btn-thisMonth');
    const btnYear = document.querySelector('#vr-btn-thisYear');
    const btnCal = document.querySelector('#vr-btn-calendar');
    const activeClass = 'bg-slate-100 text-slate-900 shadow-sm';
    const inactiveClass = 'text-slate-500 hover:bg-slate-50';

    [btn30, btnYear].forEach(btn => {
        if (!btn) return;
        btn.className = `px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${inactiveClass}`;
    });

    if (mode === 'thisMonth' && btn30) {
        btn30.className = `px-4 py-1.5 text-sm font-medium rounded-lg ${activeClass}`;
    } else if (mode === 'thisYear' && btnYear) {
        btnYear.className = `px-4 py-1.5 text-sm font-medium rounded-lg ${activeClass}`;
    }

    // Calendar button highlight when date selected
    if (btnCal) {
        btnCal.className = mode === 'day'
            ? 'px-3 py-1.5 text-primary bg-blue-50 rounded-lg transition-colors'
            : 'px-3 py-1.5 text-slate-400 hover:text-slate-600 transition-colors';
    }

    closeVRCalendar();

    // Show/hide day insights panel
    const dayPanel = document.querySelector('#vr-day-insights');
    if (dayPanel) {
        dayPanel.classList.toggle('hidden', mode !== 'day');
    }

    refreshVRView();
}

function refreshVRView() {
    if (!allVRTransactions || allVRTransactions.length === 0) return;

    const filtered = filterVRTransactions(allVRTransactions, vrViewMode, vrSelectedDate);
    const stats = computeVRStats(filtered);

    updateVisualReportStats(stats);
    updateCategoryBreakdown(stats.categorySpending);
    renderCategoryDonutChart(stats.categorySpending);
    updateLargestTransactions(filtered, vrShowingAll);

    // Update chart section title
    const chartTitle = document.querySelector('#spending-trend-chart')?.closest('[class*="rounded-2xl"]')?.querySelector('h3');
    const chartSubtitle = document.querySelector('#spending-trend-chart')?.closest('[class*="rounded-2xl"]')?.querySelector('p');
    if (chartTitle && chartSubtitle) {
        if (vrViewMode === 'thisYear') {
            chartTitle.textContent = 'Yearly Spending Trend';
            chartSubtitle.textContent = `Income vs Expenses — ${new Date().getFullYear()}`;
        } else if (vrViewMode === 'day' && vrSelectedDate) {
            const dateStr = vrSelectedDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
            chartTitle.textContent = 'Hourly Spending';
            chartSubtitle.textContent = `Breakdown for ${dateStr}`;
        } else {
            const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            chartTitle.textContent = `${monthNames[new Date().getMonth()]} Spending`;
            chartSubtitle.textContent = 'Weekly breakdown this month';
        }
    }

    if (vrViewMode === 'thisYear') {
        renderYearlyTrendChart(allVRTransactions);
    } else if (vrViewMode === 'day') {
        renderDayTrendChart(filtered, vrSelectedDate);
        updateDayInsightsPanel(filtered, stats, vrSelectedDate);
    } else {
        renderSpendingTrendChart(allVRTransactions);
    }
}

function filterVRTransactions(transactions, mode, selectedDate) {
    const now = new Date();
    return transactions.filter(t => {
        const d = t.date ? (t.date.toDate ? t.date.toDate() : new Date(t.date)) : (t.createdAt?.toDate ? t.createdAt.toDate() : new Date());
        if (mode === 'thisMonth') {
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        } else if (mode === 'thisYear') {
            return d.getFullYear() === now.getFullYear();
        } else if (mode === 'day' && selectedDate) {
            return d.getFullYear() === selectedDate.getFullYear() &&
                   d.getMonth() === selectedDate.getMonth() &&
                   d.getDate() === selectedDate.getDate();
        }
        return true;
    });
}

function computeVRStats(transactions) {
    let totalIncome = 0, totalExpenses = 0;
    const categorySpending = {};
    transactions.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') {
            totalIncome += amt;
        } else {
            totalExpenses += amt;
            categorySpending[t.category] = (categorySpending[t.category] || 0) + amt;
        }
    });
    return { totalIncome, totalExpenses, remaining: totalIncome - totalExpenses, categorySpending, transactionCount: transactions.length };
}

function renderYearlyTrendChart(transactions) {
    const canvas = document.querySelector('#spending-trend-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const year = new Date().getFullYear();
    const monthlyData = new Array(12).fill(0);
    const monthlyIncome = new Array(12).fill(0);

    transactions.forEach(t => {
        const d = t.date ? (t.date.toDate ? t.date.toDate() : new Date(t.date)) : (t.createdAt?.toDate ? t.createdAt.toDate() : new Date());
        if (d.getFullYear() === year) {
            const m = d.getMonth();
            const amt = Number(t.amount) || 0;
            if (t.type === 'income') {
                monthlyIncome[m] += amt;
            } else {
                monthlyData[m] += amt;
            }
        }
    });

    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (trendChartInstance) trendChartInstance.destroy();
    trendChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Expenses',
                    data: monthlyData,
                    backgroundColor: 'rgba(251, 113, 133, 0.7)',
                    borderColor: '#fb7185',
                    borderWidth: 1,
                    borderRadius: 6,
                    barPercentage: 0.6
                },
                {
                    label: 'Income',
                    data: monthlyIncome,
                    backgroundColor: 'rgba(45, 212, 191, 0.7)',
                    borderColor: '#2dd4bf',
                    borderWidth: 1,
                    borderRadius: 6,
                    barPercentage: 0.6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } }
                },
                tooltip: {
                    callbacks: { label: (ctx) => `${ctx.dataset.label}: ₹${ctx.parsed.y.toFixed(2)}` }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: (v) => '₹' + v },
                    grid: { color: 'rgba(100,116,139,0.1)', drawBorder: false }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderDayTrendChart(transactions, selectedDate) {
    const canvas = document.querySelector('#spending-trend-chart');
    if (!canvas || typeof Chart === 'undefined' || !selectedDate) return;

    // Show hourly breakdown for the selected day
    const hourlyData = new Array(24).fill(0);
    transactions.forEach(t => {
        const d = t.date ? (t.date.toDate ? t.date.toDate() : new Date(t.date)) : (t.createdAt?.toDate ? t.createdAt.toDate() : new Date());
        if (t.type !== 'income') {
            hourlyData[d.getHours()] += Number(t.amount) || 0;
        }
    });

    // Only show hours 6am - 11pm for cleaner display
    const labels = [];
    const data = [];
    for (let h = 6; h <= 23; h++) {
        labels.push(h === 12 ? '12 PM' : h > 12 ? `${h-12} PM` : `${h} AM`);
        data.push(hourlyData[h]);
    }

    if (trendChartInstance) trendChartInstance.destroy();
    trendChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Spending',
                data,
                backgroundColor: 'rgba(139, 92, 246, 0.6)',
                borderColor: '#8b5cf6',
                borderWidth: 1,
                borderRadius: 4,
                barPercentage: 0.7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: (ctx) => `₹${ctx.parsed.y.toFixed(2)}` }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: (v) => '₹' + v },
                    grid: { color: 'rgba(100,116,139,0.1)', drawBorder: false }
                },
                x: { grid: { display: false }, ticks: { font: { size: 10 } } }
            }
        }
    });
}

function updateDayInsightsPanel(transactions, stats, selectedDate) {
    if (!selectedDate) return;
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = selectedDate.toLocaleDateString('en-IN', opts);

    const title = document.querySelector('#vr-day-title');
    const subtitle = document.querySelector('#vr-day-subtitle');
    if (title) title.textContent = dateStr;
    if (subtitle) subtitle.textContent = `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} on this day`;

    const spent = document.querySelector('#vr-day-spent');
    const income = document.querySelector('#vr-day-income');
    const count = document.querySelector('#vr-day-count');
    const topCat = document.querySelector('#vr-day-top-cat');

    if (spent) spent.textContent = `₹${stats.totalExpenses.toFixed(2)}`;
    if (income) income.textContent = `₹${stats.totalIncome.toFixed(2)}`;
    if (count) count.textContent = transactions.length;

    if (topCat) {
        const entries = Object.entries(stats.categorySpending).sort((a, b) => b[1] - a[1]);
        topCat.textContent = entries.length > 0 ? entries[0][0] : '—';
    }
}

// ==================== VR CALENDAR ====================

function toggleVRCalendar() {
    const popup = document.querySelector('#vr-calendar-popup');
    if (!popup) return;
    if (popup.classList.contains('hidden')) {
        vrCalendarMonth = new Date().getMonth();
        vrCalendarYear = new Date().getFullYear();
        renderVRCalendar();
        popup.classList.remove('hidden');
    } else {
        popup.classList.add('hidden');
    }
}

function closeVRCalendar() {
    const popup = document.querySelector('#vr-calendar-popup');
    if (popup) popup.classList.add('hidden');
}

function navigateVRCalendar(dir) {
    vrCalendarMonth += dir;
    if (vrCalendarMonth > 11) { vrCalendarMonth = 0; vrCalendarYear++; }
    if (vrCalendarMonth < 0) { vrCalendarMonth = 11; vrCalendarYear--; }
    renderVRCalendar();
}

function selectVRToday() {
    const today = new Date();
    switchVRView('day', today);
}

function switchToThisMonth() {
    switchVRView('thisMonth');
}

function selectVRDate(year, month, day) {
    const date = new Date(year, month, day);
    switchVRView('day', date);
}

function renderVRCalendar() {
    const title = document.querySelector('#vr-calendar-title');
    const grid = document.querySelector('#vr-calendar-grid');
    if (!title || !grid) return;

    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    title.textContent = `${months[vrCalendarMonth]} ${vrCalendarYear}`;

    const firstDay = new Date(vrCalendarYear, vrCalendarMonth, 1).getDay();
    const daysInMonth = new Date(vrCalendarYear, vrCalendarMonth + 1, 0).getDate();
    const today = new Date();

    // Build a set of days that have transactions for dot indicators
    const txDays = new Set();
    if (allVRTransactions) {
        allVRTransactions.forEach(t => {
            const d = t.date ? (t.date.toDate ? t.date.toDate() : new Date(t.date)) : (t.createdAt?.toDate ? t.createdAt.toDate() : new Date());
            if (d.getFullYear() === vrCalendarYear && d.getMonth() === vrCalendarMonth) {
                txDays.add(d.getDate());
            }
        });
    }

    let html = '';

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="w-9 h-9"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const isToday = d === today.getDate() && vrCalendarMonth === today.getMonth() && vrCalendarYear === today.getFullYear();
        const isSelected = vrSelectedDate && d === vrSelectedDate.getDate() && vrCalendarMonth === vrSelectedDate.getMonth() && vrCalendarYear === vrSelectedDate.getFullYear();
        const hasTx = txDays.has(d);
        const isFuture = new Date(vrCalendarYear, vrCalendarMonth, d) > today;

        let cls = 'w-9 h-9 flex flex-col items-center justify-center rounded-lg text-xs relative transition-all ';
        if (isSelected) {
            cls += 'bg-primary text-white font-bold shadow-md';
        } else if (isToday) {
            cls += 'bg-blue-50 text-primary font-bold border border-primary/30';
        } else if (isFuture) {
            cls += 'text-slate-300 cursor-default';
        } else {
            cls += 'text-slate-700 hover:bg-slate-100 cursor-pointer font-medium';
        }

        const dot = hasTx && !isSelected ? '<span class="absolute bottom-0.5 w-1 h-1 rounded-full bg-primary"></span>' : '';
        const onclick = isFuture ? '' : `onclick="selectVRDate(${vrCalendarYear},${vrCalendarMonth},${d})"`;

        html += `<div class="${cls}" ${onclick}>${d}${dot}</div>`;
    }

    grid.innerHTML = html;
}

// ==================== SETTINGS ====================

async function loadSettings() {
    try {
        const user = getCurrentUser();
        if (!user) return;

        // Wire range slider immediately (don't wait for Firestore)
        const rangeInput = document.querySelector('#budget-range');
        const limitDisplay = document.querySelector('#spending-limit-display');
        if (rangeInput && limitDisplay) {
            rangeInput.addEventListener('input', (e) => {
                limitDisplay.textContent = `₹${Number(e.target.value).toLocaleString('en-IN')}`;
            });
        }

        // Wire save button immediately
        const saveBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save Changes');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveSettings);
        }

        // Try to load existing user data
        const docSnap = await db.collection('users').doc(user.uid).get();
        if (docSnap.exists) {
            const data = docSnap.data();
            const nameInput = document.querySelector('#full-name');
            const emailInput = document.querySelector('#email');
            const uniInput = document.querySelector('#university');

            if (nameInput) nameInput.value = data.displayName || user.displayName || '';
            if (emailInput) emailInput.value = data.email || user.email || '';
            if (uniInput) uniInput.value = data.university || '';
            if (rangeInput) rangeInput.value = data.monthlyBudget || 1500;
            if (limitDisplay) limitDisplay.textContent = `₹${Number(data.monthlyBudget || 1500).toLocaleString('en-IN')}`;

            // Update AI insight in settings based on budget
            updateSettingsAIInsight(data.monthlyBudget || 1500);
        } else {
            // Create user doc if missing (e.g. Google Auth users)
            await db.collection('users').doc(user.uid).set({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || 'User',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                plan: 'Student Plan',
                monthlyBudget: 1500,
                currency: 'INR'
            });
            // Populate form with defaults
            const nameInput = document.querySelector('#full-name');
            const emailInput = document.querySelector('#email');
            if (nameInput) nameInput.value = user.displayName || '';
            if (emailInput) emailInput.value = user.email || '';
        }
    } catch (error) {
        console.error('Load settings error:', error);
    }
}

function updateSettingsAIInsight(budget) {
    const aiInsightEl = document.querySelector('.bg-primary-soft p.leading-relaxed, .border-primary\\/20 p.leading-relaxed');
    if (!aiInsightEl) return;
    
    let recommendation = '';
    if (budget < 1000) {
        recommendation = `Your ₹${budget} budget is quite tight. Consider tracking every expense to stay within limits.`;
    } else if (budget <= 2000) {
        recommendation = `A budget of <span class="font-bold text-primary">₹${budget}</span> is reasonable for a student. You're on track!`;
    } else {
        recommendation = `With ₹${budget}/month, you have good room. Consider saving at least 20% (₹${Math.round(budget * 0.2)}).`;
    }
    aiInsightEl.innerHTML = recommendation;
}

async function saveSettings() {
    try {
        const user = getCurrentUser();
        if (!user) return;

        const name = document.querySelector('#full-name')?.value || '';
        const email = document.querySelector('#email')?.value || '';
        const budget = parseInt(document.querySelector('#budget-range')?.value) || 1500;

        const updateData = {
            displayName: name,
            email: email,
            monthlyBudget: budget
        };

        await db.collection('users').doc(user.uid).set(updateData, { merge: true });

        // Update Firebase Auth display name
        if (name && user.displayName !== name) {
            await user.updateProfile({ displayName: name });
        }

        // Update AI insight display
        updateSettingsAIInsight(budget);

        // Persist budget locally so Dashboard picks it up immediately
        localStorage.setItem('xpenso-monthlyBudget', budget);

        // Update user name in sidebar
        document.querySelectorAll('.user-name').forEach(el => {
            el.textContent = name || 'User';
        });

        showSuccess('Settings saved successfully!');
    } catch (error) {
        console.error('Save settings error:', error);
        showError('Failed to save settings');
    }
}

// ==================== BUDGET CATEGORIES STATS ====================

async function updateBudgetCategoryStats(categories) {
    const totalBudget = categories.reduce((sum, c) => sum + (c.budget || 0), 0);
    const totalSpent = categories.reduce((sum, c) => sum + (c.spent || 0), 0);
    const remaining = totalBudget - totalSpent;
    const pct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    const budgetEl = document.querySelector('[data-stat="total-budget"]');
    if (budgetEl) budgetEl.textContent = `₹${totalBudget.toFixed(2)}`;

    const spentEl = document.querySelector('[data-stat="total-spent"]');
    if (spentEl) spentEl.textContent = `₹${totalSpent.toFixed(2)}`;

    const pctEl = document.querySelector('[data-stat="spent-pct"]');
    if (pctEl) pctEl.textContent = `${pct}% of total budget`;

    const remEl = document.querySelector('[data-stat="budget-remaining"]');
    if (remEl) remEl.textContent = `₹${remaining.toFixed(2)}`;
}

// ==================== INCOME STREAMS STATS ====================

async function updateIncomeStreamStats(streams) {
    const totalIncome = streams.reduce((sum, s) => sum + (s.amount || 0), 0);
    const projected = totalIncome * 1.1; // Simple 10% projection estimate

    const totalEl = document.querySelector('[data-stat="total-income"]');
    if (totalEl) totalEl.textContent = `₹${totalIncome.toFixed(2)}`;

    const projEl = document.querySelector('[data-stat="projected-income"]');
    if (projEl) projEl.textContent = `₹${projected.toFixed(2)}`;
}

// ==================== ADD TRANSACTION MODAL ====================

function openAddTransactionModal(presetType) {
    let modal = document.querySelector('#add-transaction-modal');
    if (!modal) {
        // Create modal dynamically
        modal = document.createElement('div');
        modal.id = 'add-transaction-modal';
        modal.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm hidden';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                <div class="p-6 border-b border-slate-200 flex justify-between items-center">
                    <h2 class="text-xl font-bold text-slate-900">Add Transaction</h2>
                    <button onclick="closeAddTransactionModal()" class="p-1 hover:bg-slate-100 rounded-full transition-colors">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <form id="add-transaction-form" class="p-6 flex flex-col gap-5">
                    <div class="flex gap-3">
                        <button type="button" class="tx-type-btn flex-1 py-2 rounded-lg border-2 border-rose-300 bg-rose-50 text-rose-700 font-semibold text-sm" data-type="expense">Expense</button>
                        <button type="button" class="tx-type-btn flex-1 py-2 rounded-lg border-2 border-slate-200 text-slate-500 font-semibold text-sm" data-type="income">Income</button>
                    </div>
                    <input type="hidden" id="tx-type" value="expense"/>
                    <div>
                        <label class="text-sm font-semibold text-slate-700 mb-1 block">Amount (₹)</label>
                        <input id="tx-amount" type="number" step="0.01" min="0" required placeholder="0.00" class="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary text-lg font-bold"/>
                    </div>
                    <div>
                        <label class="text-sm font-semibold text-slate-700 mb-1 block">Description</label>
                        <input id="tx-description" type="text" required placeholder="What was this for?" class="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"/>
                    </div>
                    <div>
                        <label class="text-sm font-semibold text-slate-700 mb-1 block">Category</label>
                        <select id="tx-category" class="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                            <option value="Food & Dining">Food & Dining</option>
                            <option value="Groceries">Groceries</option>
                            <option value="Transport">Transport</option>
                            <option value="Entertainment">Entertainment</option>
                            <option value="Shopping">Shopping</option>
                            <option value="Education">Education</option>
                            <option value="Housing">Housing</option>
                            <option value="Healthcare">Healthcare</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <button type="submit" class="w-full bg-primary text-white py-3 rounded-xl font-semibold text-sm hover:bg-indigo-600 transition-colors shadow-lg shadow-primary/20">
                        Add Transaction
                    </button>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        // Category options for each type
        const expenseCategories = '<option value="Food & Dining">Food & Dining</option><option value="Groceries">Groceries</option><option value="Transport">Transport</option><option value="Entertainment">Entertainment</option><option value="Shopping">Shopping</option><option value="Education">Education</option><option value="Housing">Housing</option><option value="Healthcare">Healthcare</option><option value="Other">Other</option>';
        const incomeCategories = '<option value="Salary">Salary</option><option value="Freelance">Freelance</option><option value="Part-time Job">Part-time Job</option><option value="Scholarship">Scholarship</option><option value="Allowance">Allowance</option><option value="Investment">Investment</option><option value="Gift">Gift</option><option value="Other">Other</option>';

        // Wire type toggle (switches both styling and category options)
        modal.querySelectorAll('.tx-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.tx-type-btn').forEach(b => {
                    b.className = 'tx-type-btn flex-1 py-2 rounded-lg border-2 border-slate-200 text-slate-500 font-semibold text-sm';
                });
                const type = btn.dataset.type;
                document.querySelector('#tx-type').value = type;
                const categorySelect = document.querySelector('#tx-category');
                if (type === 'expense') {
                    btn.className = 'tx-type-btn flex-1 py-2 rounded-lg border-2 border-rose-300 bg-rose-50 text-rose-700 font-semibold text-sm';
                    if (categorySelect) categorySelect.innerHTML = expenseCategories;
                } else {
                    btn.className = 'tx-type-btn flex-1 py-2 rounded-lg border-2 border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold text-sm';
                    if (categorySelect) categorySelect.innerHTML = incomeCategories;
                }
            });
        });

        // Wire form submit
        document.querySelector('#add-transaction-form').addEventListener('submit', handleAddTransaction);

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAddTransactionModal();
        });
    }

    modal.classList.remove('hidden');

    // Pre-select type if specified (e.g. 'income' from Income Streams page)
    if (presetType) {
        const btn = modal.querySelector(`.tx-type-btn[data-type="${presetType}"]`);
        if (btn) btn.click();
    }
}

function closeAddTransactionModal() {
    const modal = document.querySelector('#add-transaction-modal');
    if (modal) modal.classList.add('hidden');
}

async function handleAddTransaction(e) {
    e.preventDefault();

    const amount = document.querySelector('#tx-amount').value;
    const description = document.querySelector('#tx-description').value;
    const category = document.querySelector('#tx-category').value;
    const type = document.querySelector('#tx-type').value;

    if (!amount || !description) {
        showError('Please fill in all fields');
        return;
    }

    try {
        const result = await addTransaction({
            amount: parseFloat(amount),
            description: description,
            category: category,
            type: type,
            date: new Date().toISOString()
        });

        if (result.success) {
            showSuccess('Transaction added!');

            // Generate smart alerts after expense
            if (type === 'expense') {
                try { await generateSmartAlerts(); } catch (e) { console.error('Alert gen error:', e); }
            }

            // Close modal and reset form
            closeAddTransactionModal();
            const form = document.querySelector('#add-transaction-form');
            if (form) form.reset();
            // Reset type toggle back to expense
            document.querySelector('#tx-type').value = 'expense';
            const expBtn = document.querySelector('.tx-type-btn[data-type="expense"]');
            const incBtn = document.querySelector('.tx-type-btn[data-type="income"]');
            if (expBtn) expBtn.className = 'tx-type-btn flex-1 py-2 rounded-lg border-2 border-rose-300 bg-rose-50 text-rose-700 font-semibold text-sm';
            if (incBtn) incBtn.className = 'tx-type-btn flex-1 py-2 rounded-lg border-2 border-slate-200 text-slate-500 font-semibold text-sm';
            // Reset categories to expense
            const catSel = document.querySelector('#tx-category');
            if (catSel) catSel.innerHTML = '<option value="Food & Dining">Food & Dining</option><option value="Groceries">Groceries</option><option value="Transport">Transport</option><option value="Entertainment">Entertainment</option><option value="Shopping">Shopping</option><option value="Education">Education</option><option value="Housing">Housing</option><option value="Healthcare">Healthcare</option><option value="Other">Other</option>';

            // Refresh the current page data
            const page = window.location.pathname.split('/').pop();
            if (page === 'dashboard.html') loadDashboard();
            if (page === 'visualreports.html') loadVisualReports();
            if (page === 'budgetcategories.html') loadBudgetCategories();
            if (page === 'incomestreams.html') loadIncomeStreams();
        } else {
            showError(result.error || 'Failed to add transaction');
        }
    } catch (error) {
        console.error('Add transaction error:', error);
        showError('Failed to add transaction');
    }
}

// ==================== ADD CATEGORY MODAL ====================

function openAddCategoryModal() {
    let modal = document.querySelector('#add-category-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'add-category-modal';
        modal.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm hidden';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                <div class="p-6 border-b border-slate-200 flex justify-between items-center">
                    <h2 class="text-xl font-bold text-slate-900">Add Budget Category</h2>
                    <button onclick="document.querySelector('#add-category-modal').classList.add('hidden')" class="p-1 hover:bg-slate-100 rounded-full transition-colors">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <form id="add-category-form" class="p-6 flex flex-col gap-5">
                    <div>
                        <label class="text-sm font-semibold text-slate-700 mb-1 block">Category Name</label>
                        <input id="cat-name" type="text" required placeholder="e.g., Groceries" class="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"/>
                    </div>
                    <div>
                        <label class="text-sm font-semibold text-slate-700 mb-1 block">Monthly Budget (\u20b9)</label>
                        <input id="cat-budget" type="number" step="1" min="0" required placeholder="500" class="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"/>
                    </div>
                    <div>
                        <label class="text-sm font-semibold text-slate-700 mb-1 block">Icon</label>
                        <select id="cat-icon" class="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 text-sm">
                            <option value="shopping_cart">🛒 Groceries</option>
                            <option value="restaurant">🍔 Food & Dining</option>
                            <option value="directions_bus">🚌 Transport</option>
                            <option value="movie">🎬 Entertainment</option>
                            <option value="home">🏠 Housing</option>
                            <option value="school">📚 Education</option>
                            <option value="health_and_safety">🏥 Health</option>
                            <option value="shopping_bag">🛍️ Shopping</option>
                            <option value="category">📦 Other</option>
                        </select>
                    </div>
                    <button type="submit" class="w-full bg-primary text-white py-3 rounded-xl font-semibold text-sm hover:bg-indigo-600 transition-colors">
                        Add Category
                    </button>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        document.querySelector('#add-category-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const colors = ['orange', 'blue', 'indigo', 'red', 'yellow', 'teal', 'pink', 'green'];
            const result = await addBudgetCategory({
                name: document.querySelector('#cat-name').value,
                budget: parseFloat(document.querySelector('#cat-budget').value),
                icon: document.querySelector('#cat-icon').value,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
            if (result.success) {
                showSuccess('Category added!');
                modal.classList.add('hidden');
                document.querySelector('#add-category-form').reset();
                loadBudgetCategories();
            } else {
                showError(result.error || 'Failed to add category');
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    }
    modal.classList.remove('hidden');
}

// ==================== ADD INCOME STREAM MODAL ====================
// Reuses the unified transaction modal, pre-set to 'income' type
function openAddIncomeModal() {
    openAddTransactionModal('income');
}

// ==================== DASHBOARD SEARCH ====================

let allTransactionsCache = [];

function initDashboardSearch() {
    const searchInput = document.querySelector('#dashboard-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (!query) {
            displayRecentTransactions(allTransactionsCache.slice(0, 10));
            return;
        }
        const filtered = allTransactionsCache.filter(t => {
            const desc = (t.description || '').toLowerCase();
            const cat = (t.category || '').toLowerCase();
            const amt = String(t.amount || '');
            return desc.includes(query) || cat.includes(query) || amt.includes(query);
        });
        displayRecentTransactions(filtered.length > 0 ? filtered : []);
        if (filtered.length === 0) {
            const container = document.querySelector('#transactions-container');
            if (container) container.innerHTML = '<p class="text-gray-500 p-5">No transactions match your search.</p>';
        }
    });
}

// ==================== AI INSIGHT DETAIL MODAL ====================

function openAIInsightModal() {
    let modal = document.querySelector('#ai-insight-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ai-insight-modal';
        modal.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm hidden';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                <div class="p-6 border-b border-slate-200 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <div class="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                            <span class="material-symbols-outlined">auto_awesome</span>
                        </div>
                        <div>
                            <h2 class="text-lg font-bold text-slate-900">AI Financial Insight</h2>
                            <p class="text-xs text-slate-500">Personalized analysis based on your data</p>
                        </div>
                    </div>
                    <button onclick="document.querySelector('#ai-insight-modal').classList.add('hidden')" class="p-1.5 hover:bg-slate-100 rounded-full transition-colors">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="p-6 flex flex-col gap-5">
                    <div class="rounded-xl bg-indigo-50/50 border border-indigo-100 p-4">
                        <p class="text-sm font-semibold text-indigo-700 mb-2 flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[16px]">lightbulb</span> Current Insight
                        </p>
                        <p class="text-slate-700 leading-relaxed" id="ai-modal-insight">Loading...</p>
                    </div>
                    <div id="ai-modal-stats" class="grid grid-cols-3 gap-3"></div>
                    <div id="ai-modal-top-categories" class="rounded-xl bg-slate-50 border border-slate-200 p-4 hidden">
                        <p class="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                            <span class="material-symbols-outlined text-[16px]">category</span> Top Spending Categories
                        </p>
                        <div id="ai-modal-cat-list" class="flex flex-col gap-2"></div>
                    </div>
                </div>
                <div class="px-6 pb-6 flex gap-3">
                    <button onclick="refreshAIInsightModal()" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-[18px]">refresh</span> Generate New Insight
                    </button>
                    <button onclick="document.querySelector('#ai-insight-modal').classList.add('hidden')" class="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors">Close</button>
                </div>
            </div>
        `;
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
        document.body.appendChild(modal);
    }

    // Populate current insight text
    const insightText = document.querySelector('#ai-insight-container')?.textContent || 'No insight available.';
    document.querySelector('#ai-modal-insight').textContent = insightText;

    // Populate stats from dashboard
    const income = document.querySelector('[data-stat="income"]')?.textContent || '₹0';
    const expenses = document.querySelector('[data-stat="expenses"]')?.textContent || '₹0';
    const remaining = document.querySelector('[data-stat="remaining"]')?.textContent || '₹0';
    document.querySelector('#ai-modal-stats').innerHTML = `
        <div class="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
            <p class="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Income</p>
            <p class="text-lg font-bold text-emerald-700 mt-1">${income}</p>
        </div>
        <div class="rounded-xl bg-rose-50 border border-rose-100 p-3 text-center">
            <p class="text-[11px] font-semibold text-rose-600 uppercase tracking-wide">Expenses</p>
            <p class="text-lg font-bold text-rose-700 mt-1">${expenses}</p>
        </div>
        <div class="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-center">
            <p class="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide">Remaining</p>
            <p class="text-lg font-bold text-indigo-700 mt-1">${remaining}</p>
        </div>
    `;

    // Show top spending categories from cached transactions
    const catSection = document.querySelector('#ai-modal-top-categories');
    const catList = document.querySelector('#ai-modal-cat-list');
    if (allTransactionsCache.length > 0) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const catSpend = {};
        allTransactionsCache.forEach(t => {
            if (t.type !== 'expense') return;
            const txDate = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.date || 0);
            if (txDate >= startOfMonth) {
                catSpend[t.category] = (catSpend[t.category] || 0) + (Number(t.amount) || 0);
            }
        });
        const sorted = Object.entries(catSpend).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (sorted.length > 0) {
            const maxAmt = sorted[0][1];
            catList.innerHTML = sorted.map(([cat, amt]) => {
                const pct = maxAmt > 0 ? Math.round((amt / maxAmt) * 100) : 0;
                return `
                    <div class="flex items-center gap-3">
                        <span class="text-sm font-medium text-slate-700 w-28 truncate">${cat}</span>
                        <div class="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div class="h-full bg-indigo-500 rounded-full" style="width:${pct}%"></div>
                        </div>
                        <span class="text-sm font-bold text-slate-900 w-20 text-right">₹${amt.toFixed(0)}</span>
                    </div>
                `;
            }).join('');
            catSection.classList.remove('hidden');
        } else {
            catSection.classList.add('hidden');
        }
    } else {
        catSection.classList.add('hidden');
    }

    modal.classList.remove('hidden');
}

async function refreshAIInsightModal() {
    const modalInsight = document.querySelector('#ai-modal-insight');
    if (modalInsight) modalInsight.textContent = 'Generating new insight...';

    try {
        const statsResult = await getDashboardStats();
        const txResult = await getUserTransactions(10);
        if (statsResult.success && txResult.success) {
            const result = await generateAIInsight(statsResult.stats, txResult.transactions);
            if (result.success && result.insight) {
                if (modalInsight) modalInsight.textContent = result.insight;
                displayAIInsight({ message: result.insight });
                localStorage.setItem('ai-insight-refresh', String(Date.now()));
            } else {
                if (modalInsight) modalInsight.textContent = result.insight || 'Could not generate insight. Please try again.';
            }
        }
    } catch (err) {
        console.error('Refresh AI modal error:', err);
        if (modalInsight) modalInsight.textContent = 'Failed to generate insight. Please try again later.';
    }
}

// Initialize page-specific logic
document.addEventListener('DOMContentLoaded', () => {
    const page = window.location.pathname.split('/').pop();

    // Wire FAB (floating action button) on pages that have one
    const fab = document.querySelector('button.fixed.bottom-8.right-8') ||
                document.querySelector('button[class*="rounded-full"][class*="fixed"]');
    
    // Wire static UI elements immediately (doesn't need auth)
    switch(page) {
        case 'dashboard.html':
            updateCurrentDate();
            if (fab) fab.addEventListener('click', openAddTransactionModal);
            initDashboardSearch();
            const aiBtn = document.querySelector('#ai-view-details-btn');
            if (aiBtn) aiBtn.addEventListener('click', openAIInsightModal);
            break;
        case 'budgetcategories.html':
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent.includes('Add Category') || 
                    (btn.closest('.sm\\:hidden') && btn.querySelector('.material-symbols-outlined'))) {
                    btn.addEventListener('click', openAddCategoryModal);
                }
            });
            break;
        case 'incomestreams.html':
            document.querySelectorAll('button').forEach(btn => {
                if (btn.textContent.includes('Add Income') || btn.textContent.includes('Add Stream') ||
                    (btn.closest('.sm\\:hidden') && btn.querySelector('.material-symbols-outlined'))) {
                    btn.addEventListener('click', openAddIncomeModal);
                }
            });
            break;
        case 'visualreports.html':
            // Close calendar when clicking outside
            document.addEventListener('click', (e) => {
                const popup = document.querySelector('#vr-calendar-popup');
                const calBtn = document.querySelector('#vr-btn-calendar');
                if (popup && !popup.contains(e.target) && !calBtn?.contains(e.target)) {
                    popup.classList.add('hidden');
                }
            });
            break;
    }

    // Wait for Firebase Auth to resolve before loading any data
    // This fixes the race condition where getCurrentUser() returns null
    let dataLoaded = false;
    auth.onAuthStateChanged((user) => {
        if (!user || dataLoaded) return;
        dataLoaded = true;

        switch(page) {
            case 'dashboard.html':
                loadDashboard();
                break;
            case 'budgetcategories.html':
                loadBudgetCategories();
                break;
            case 'incomestreams.html':
                loadIncomeStreams();
                break;
            case 'smartalerts.html':
                loadAlerts();
                break;
            case 'visualreports.html':
                loadVisualReports();
                break;
            case 'settings.html':
                loadSettings();
                break;
        }
    });

    // Wire dark mode toggle checkbox in settings
    if (page === 'settings.html') {
        const toggle = document.querySelector('input[type="checkbox"][class*="peer"]');
        if (toggle) {
            const currentTheme = localStorage.getItem('xpenso-theme') || 'dark';
            toggle.checked = currentTheme === 'dark';
            toggle.addEventListener('change', () => {
                toggleTheme();
            });
        }
    }
});
