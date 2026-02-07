// Authentication Functions

// Sign Up
async function signUp(email, password, displayName) {
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Update profile
        await user.updateProfile({
            displayName: displayName
        });
        
        // Create user document in Firestore
        await db.collection('users').doc(user.uid).set({
            uid: user.uid,
            email: email,
            displayName: displayName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            plan: 'Student Plan',
            monthlyBudget: 1500,
            currency: 'INR'
        });
        
        return { success: true, user: user };
    } catch (error) {
        console.error('Sign up error:', error);
        return { success: false, error: error.message };
    }
}

// Sign In with Email/Password
async function signIn(email, password) {
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error('Sign in error:', error);
        return { success: false, error: error.message };
    }
}

// Sign In with Google
async function signInWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        // Create user document if first-time Google sign-in
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            await db.collection('users').doc(user.uid).set({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || 'User',
                photoURL: user.photoURL || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                plan: 'Student Plan',
                monthlyBudget: 1500,
                currency: 'INR'
            });
        }

        return { success: true, user: user };
    } catch (error) {
        console.error('Google sign in error:', error);
        // Don't show error if user simply closed the popup
        if (error.code !== 'auth/popup-closed-by-user') {
            return { success: false, error: error.message };
        }
        return { success: false, error: 'Sign-in cancelled' };
    }
}

// Sign Out
async function signOut() {
    try {
        await auth.signOut();
        window.location.href = 'signin.html';
        return { success: true };
    } catch (error) {
        console.error('Sign out error:', error);
        return { success: false, error: error.message };
    }
}

// Auth State Observer
auth.onAuthStateChanged((user) => {
    if (user) {
        // User is signed in
        console.log('User signed in:', user.uid);
        
        // Update UI with user info
        if (typeof updateUserUI === 'function') {
            updateUserUI(user);
        }
        
        // Redirect to dashboard if on signin/signup page
        const currentPage = window.location.pathname.split('/').pop();
        if (currentPage === 'signin.html' || currentPage === 'signup.html' || currentPage === 'index.html') {
            window.location.href = 'dashboard.html';
        }
    } else {
        // User is signed out
        console.log('User signed out');
        
        // Redirect to signin if on protected pages
        const currentPage = window.location.pathname.split('/').pop();
        const publicPages = ['index.html', 'signin.html', 'signup.html'];
        
        if (!publicPages.includes(currentPage) && currentPage !== '') {
            window.location.href = 'signin.html';
        }
    }
});

// Get Current User
function getCurrentUser() {
    return auth.currentUser;
}
