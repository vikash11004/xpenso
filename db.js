// Database Operations

// Helper: Get authenticated user's subcollection reference
function userCollection(collectionName) {
    const user = getCurrentUser();
    if (!user) throw new Error('User not authenticated');
    return db.collection('users').doc(user.uid).collection(collectionName);
}

// ==================== TRANSACTIONS ====================

// Add Transaction
async function addTransaction(transactionData) {
    try {
        const transaction = {
            amount: parseFloat(transactionData.amount),
            description: transactionData.description,
            category: transactionData.category,
            type: transactionData.type || 'expense',
            date: transactionData.date || new Date().toISOString(),
            wallet: transactionData.wallet || 'Personal Card',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await userCollection('transactions').add(transaction);
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Add transaction error:', error);
        return { success: false, error: error.message };
    }
}

// Get User Transactions
async function getUserTransactions(limit = 50) {
    try {
        const snapshot = await userCollection('transactions')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        
        const transactions = [];
        snapshot.forEach(doc => {
            transactions.push({ id: doc.id, ...doc.data() });
        });
        
        return { success: true, transactions };
    } catch (error) {
        console.error('Get transactions error:', error);
        return { success: false, error: error.message, transactions: [] };
    }
}

// ==================== CATEGORIES ====================

// Add Budget Category
async function addBudgetCategory(categoryData) {
    try {
        const category = {
            name: categoryData.name,
            icon: categoryData.icon,
            color: categoryData.color,
            budget: parseFloat(categoryData.budget),
            spent: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await userCollection('budgetCategories').add(category);
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Add category error:', error);
        return { success: false, error: error.message };
    }
}

// Get User Budget Categories
async function getBudgetCategories() {
    try {
        const snapshot = await userCollection('budgetCategories').get();
        
        const categories = [];
        snapshot.forEach(doc => {
            categories.push({ id: doc.id, ...doc.data() });
        });
        
        return { success: true, categories };
    } catch (error) {
        console.error('Get categories error:', error);
        return { success: false, error: error.message, categories: [] };
    }
}

// ==================== ALERTS ====================

// Add Smart Alert
async function addAlert(alertData) {
    try {
        const alert = {
            title: alertData.title,
            message: alertData.message,
            type: alertData.type,
            priority: alertData.priority,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await userCollection('alerts').add(alert);
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Add alert error:', error);
        return { success: false, error: error.message };
    }
}

// Get User Alerts
async function getUserAlerts(unreadOnly = false) {
    try {
        const snapshot = await userCollection('alerts')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        
        let alerts = [];
        snapshot.forEach(doc => {
            alerts.push({ id: doc.id, ...doc.data() });
        });
        
        if (unreadOnly) {
            alerts = alerts.filter(a => !a.read);
        }
        
        return { success: true, alerts: alerts.slice(0, 20) };
    } catch (error) {
        console.error('Get alerts error:', error);
        return { success: false, error: error.message, alerts: [] };
    }
}

// ==================== AI INSIGHTS ====================

// Save AI Insight
async function saveAIInsight(insightData) {
    try {
        const insight = {
            message: insightData.message,
            category: insightData.category,
            type: insightData.type,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await userCollection('aiInsights').add(insight);
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Save AI insight error:', error);
        return { success: false, error: error.message };
    }
}

// Get Latest AI Insight
async function getLatestAIInsight() {
    try {
        const snapshot = await userCollection('aiInsights')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            return { success: true, insight: null };
        }
        
        const insight = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        return { success: true, insight };
    } catch (error) {
        console.error('Get AI insight error:', error);
        return { success: true, insight: null };
    }
}

// ==================== STATISTICS ====================

// Get Dashboard Statistics
async function getDashboardStats() {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        // Fetch all transactions, filter current month client-side
        const snapshot = await userCollection('transactions')
            .orderBy('createdAt', 'desc')
            .get();
        
        let totalIncome = 0;
        let totalExpenses = 0;
        const categorySpending = {};
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const txDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.date || 0);
            if (txDate >= startOfMonth) {
                const amount = Number(data.amount) || 0;
                if (data.type === 'income') {
                    totalIncome += amount;
                } else {
                    totalExpenses += amount;
                    categorySpending[data.category] = (categorySpending[data.category] || 0) + amount;
                }
            }
        });
        
        const remaining = totalIncome - totalExpenses;
        
        return {
            success: true,
            stats: {
                totalIncome,
                totalExpenses,
                remaining,
                categorySpending,
                transactionCount: snapshot.size
            }
        };
    } catch (error) {
        console.error('Get stats error:', error);
        return {
            success: false,
            error: error.message,
            stats: { totalIncome: 0, totalExpenses: 0, remaining: 0, categorySpending: {}, transactionCount: 0 }
        };
    }
}
