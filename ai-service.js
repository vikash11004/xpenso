// AI Service using Groq LLama 3

const GROQ_API_KEY = APP_CONFIG.groq.apiKey;
const GROQ_API_URL = APP_CONFIG.groq.apiUrl;

// Generate AI Insight
async function generateAIInsight(userStats, transactionHistory) {
    try {
        const prompt = `You are a financial advisor AI. Based on the following user data, provide a brief, friendly financial insight (max 50 words):

Current Month Stats:
- Total Income: ₹${userStats.totalIncome}
- Total Expenses: ₹${userStats.totalExpenses}
- Remaining Budget: ₹${userStats.remaining}

Recent Transactions:
${transactionHistory.slice(0, 5).map(t => `- ${t.description}: ₹${t.amount} (${t.category})`).join('\n')}

Category Spending:
${Object.entries(userStats.categorySpending || {}).map(([cat, amount]) => `- ${cat}: ₹${amount}`).join('\n')}

Provide a personalized, actionable insight that helps them improve their financial health.`;

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful financial advisor. Provide brief, actionable insights.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 150
            })
        });

        if (!response.ok) {
            throw new Error(`Groq API error: ${response.status}`);
        }

        const data = await response.json();
        const insight = data.choices[0].message.content.trim();

        // Save insight to database
        await saveAIInsight({
            message: insight,
            category: 'general',
            type: 'spending_analysis'
        });

        return { success: true, insight };
    } catch (error) {
        console.error('AI insight generation error:', error);
        return { 
            success: false, 
            error: error.message,
            insight: "Great job tracking your expenses! Keep monitoring your spending to stay within budget." // Fallback
        };
    }
}


