# 💰 Xpenso — AI-Powered Student Expense Tracker

<p align="center">
  <strong>A smart, AI-driven expense tracking web app built for students and first-time budgeters.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Firebase-v10.7-orange?logo=firebase" alt="Firebase" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-CDN-38B2AC?logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Chart.js-v4-FF6384?logo=chartdotjs" alt="Chart.js" />
  <img src="https://img.shields.io/badge/Groq_AI-LLaMA_3.3-blue" alt="Groq AI" />
  <img src="https://img.shields.io/badge/Currency-INR_(₹)-green" alt="INR" />
</p>

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Firebase Setup](#-firebase-setup)
- [Groq AI Setup](#-groq-ai-setup)
- [Usage](#-usage)
- [Screenshots](#-screenshots)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

| Feature | Description |
|---|---|
| **Dashboard** | Real-time overview of income, expenses, remaining balance, and recent transactions with search |
| **Budget Categories** | Auto-generated from transactions; filter by "Near Limit" or "Over Budget"; sortable |
| **Income Streams** | Track recurring and one-time income; filter and sort by amount |
| **Visual Reports** | Interactive charts — "This Month", "This Year" (monthly bar), Calendar date picker with day insights & hourly trend chart |
| **Smart Alerts** | Auto-generated alerts for budget warnings, low balance, spending spikes, and savings milestones |
| **AI Insights** | Groq-powered (LLaMA 3.3 70B) personalized financial tips displayed on the dashboard |
| **Settings** | Set monthly spending limit (₹500–₹50,000 in ₹500 steps), edit profile name & email |
| **Auth** | Email/Password + Google Sign-In via Firebase Authentication |
| **Responsive** | Fully responsive layout with collapsible sidebar and mobile FAB buttons |

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, Tailwind CSS (CDN), Vanilla JavaScript |
| **Backend / DB** | Firebase Firestore (with offline persistence) |
| **Authentication** | Firebase Auth (Email/Password + Google) |
| **AI** | Groq Cloud API — LLaMA 3.3 70B Versatile |
| **Charts** | Chart.js v4 (via CDN) |
| **Icons** | Google Material Symbols Outlined |
| **Hosting** | Any static host (Firebase Hosting, Vercel, Netlify, GitHub Pages) |

---

## 📂 Project Structure

```
xpenso/
├── index.html              # Landing page with animated dot particles
├── signin.html             # Sign-in page (Email + Google)
├── signup.html             # Sign-up page (Email + Google)
├── dashboard.html          # Main dashboard with stats, charts, transactions
├── budgetcategories.html   # Budget categories with filter/sort
├── incomestreams.html      # Income streams with filter/sort
├── visualreports.html      # Visual reports — month/year/calendar/day views
├── smartalerts.html        # Auto-generated smart alerts
├── settings.html           # Profile & spending limit settings
│
├── config.example.js       # ⬅ Template — copy to config.js & add your keys
├── config.js               # 🔒 Your local credentials (git-ignored)
├── firebase-config.js      # Firebase init (reads from config.js)
├── auth.js                 # Auth functions (signUp, signIn, Google, signOut)
├── db.js                   # Firestore CRUD (transactions, categories, alerts, insights)
├── ai-service.js           # Groq AI insight generation (reads from config.js)
├── app.js                  # Main application logic (~2000 lines)
├── theme.js                # Theme utilities
├── global.css              # Layout classes (sidebar, top-header, nav-links)
│
├── .gitignore              # Ignores config.js and other non-essentials
└── README.md               # This file
```

---

## 🚀 Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Edge, Safari)
- A [Firebase](https://console.firebase.google.com) project (free tier works)
- A [Groq](https://console.groq.com) API key (free tier available)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/xpenso.git
cd xpenso

# 2. Create your local config file
cp config.example.js config.js

# 3. Open config.js and fill in your Firebase + Groq credentials
#    (see setup sections below)

# 4. Serve the project with any static server
#    Option A — VS Code Live Server extension
#    Option B — Python
python -m http.server 5500

#    Option C — Node
npx serve .
```

Then open `http://localhost:5500` in your browser.

---

## 🔥 Firebase Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add Project** → name it (e.g. `xpenso`) → Continue
3. Disable Google Analytics if not needed → **Create Project**

### 2. Enable Authentication

1. In Firebase Console → **Build** → **Authentication** → **Get Started**
2. Enable **Email/Password** provider
3. Enable **Google** provider (set a support email)

### 3. Create Firestore Database

1. **Build** → **Firestore Database** → **Create Database**
2. Start in **test mode** (or configure rules later)
3. Choose a region close to you

### 4. Get Firebase Config

1. **Project Settings** (gear icon) → **General** → scroll to **Your Apps**
2. Click the web icon (`</>`) → Register app → copy the config object
3. Paste the values into your `config.js`:

```javascript
firebase: {
    apiKey:            "AIzaSy...",
    authDomain:        "your-project.firebaseapp.com",
    projectId:         "your-project",
    storageBucket:     "your-project.firebasestorage.app",
    messagingSenderId: "123456789",
    appId:             "1:123456789:web:abcdef",
    measurementId:     "G-XXXXXXXXXX"
}
```

### 5. Firestore Security Rules (Recommended)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 🤖 Groq AI Setup

1. Go to [Groq Console](https://console.groq.com)
2. Sign up / Sign in
3. Navigate to **API Keys** → **Create API Key**
4. Copy the key and paste into your `config.js`:

```javascript
groq: {
    apiKey:  "gsk_xxxxxxxxxxxxxxxxxxxx",
    apiUrl:  "https://api.groq.com/openai/v1/chat/completions",
    model:   "llama-3.3-70b-versatile"
}
```

---

## 📖 Usage

| Page | What it does |
|---|---|
| **Landing** (`index.html`) | Marketing page with interactive dot animation; links to Sign Up |
| **Sign Up / Sign In** | Create account or log in with email or Google |
| **Dashboard** | View balance, income, expenses, recent transactions; search; get AI insights |
| **Budget Categories** | See spending per category vs budget; filter Near Limit / Over Budget; sort |
| **Income Streams** | View income sources; filter Recurring / One-time; sort by amount |
| **Visual Reports** | This Month trend chart, This Year bar chart, Calendar date picker with day insights |
| **Smart Alerts** | Auto-generated warnings and milestones based on your data |
| **Settings** | Change name, email, monthly budget (₹500–₹50,000 in ₹500 steps); Log Out |

### Firestore Data Model

```
users/{uid}/
├── transactions/       # Single source of truth for all income & expenses
│   └── {txId}         # { description, amount, type, category, date, createdAt }
├── budgetCategories/   # User-defined category budgets
│   └── {catId}        # { name, budget, icon, color }
├── alerts/            # Auto-generated smart alerts
│   └── {alertId}     # { title, message, type, priority, createdAt }
└── aiInsights/        # AI-generated insights
    └── {insightId}   # { message, category, type, createdAt }
```

---

## 🖼 Screenshots

> Add your screenshots here after deploying:
>
> ```
> ![Dashboard](screenshots/dashboard.png)
> ![Visual Reports](screenshots/visual-reports.png)
> ![Budget Categories](screenshots/budget-categories.png)
> ```

---

## 🤝 Contributing

1. **Fork** the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a **Pull Request**

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ for students who want to take control of their finances.
</p>
