/* ===========================
   API Configuration
=========================== */

const API_BASE_URL = (() => {
    // If we are on localhost, point to the local backend port
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:5000';
    }
    // In production (Railway), since the server serves the HTML, 
    // we can use an empty string or just the origin.
    return window.location.origin;
})();

/* ===========================
   Slider Logic
=========================== */

// Select all slides and dots from the HTML
const slides = document.querySelectorAll(".slide");
const dots = document.querySelectorAll(".dot");

// Track the current slide index
let currentSlide = 0;

// Function to show a specific slide by index
function showSlide(index) {
    slides.forEach((slide, i) => {
        // Add "active" class to the current slide, remove from others
        slide.classList.toggle("active", i === index);
        // Add "active" class to the corresponding dot
        dots[i].classList.toggle("active", i === index);
    });
}

// Automatically switch slides every 5 seconds
let slideInterval = setInterval(() => {
    currentSlide = (currentSlide + 1) % slides.length; // loop back to first slide
    showSlide(currentSlide);
}, 5000);

// Navigation buttons (prev/next)
document.querySelectorAll(".nav.prev, .nav.next").forEach(btn => {
    btn.addEventListener("click", () => {
        clearInterval(slideInterval); // stop auto slide when manually navigating
        currentSlide += btn.classList.contains("next") ? 1 : -1;
        // Wrap around slides if needed
        if (currentSlide < 0) currentSlide = slides.length - 1;
        if (currentSlide >= slides.length) currentSlide = 0;
        showSlide(currentSlide);
        // Resume auto-slide after manual navigation
        slideInterval = setInterval(() => {
            currentSlide = (currentSlide + 1) % slides.length;
            showSlide(currentSlide);
        }, 5000);
    });
});


/* ===========================
   Password Validation
=========================== */

// Get password input and helper text element
const passwordInput = document.getElementById("password");
const passwordHelp = document.getElementById("passwordHelp");

// Listen for user typing in password field
passwordInput?.addEventListener("input", () => {
    const val = passwordInput.value;

    // Check conditions
    const lengthCheck = val.length >= 8;
    const upperCheck = /[A-Z]/.test(val); // at least one uppercase
    const lowerCheck = /[a-z]/.test(val); // at least one lowercase
    const numberCheck = /[0-9]/.test(val); // at least one number
    const specialCheck = /[!@#$%^&*(),.?":{}|<>]/.test(val); // at least one special char

    // Display the first unmet requirement
    if (!lengthCheck) {
        passwordHelp.textContent = "Must be at least 8 characters long.";
        passwordHelp.style.color = "#f87171"; // red
    } else if (!upperCheck) {
        passwordHelp.textContent = "Include at least one uppercase letter.";
        passwordHelp.style.color = "#f87171";
    } else if (!lowerCheck) {
        passwordHelp.textContent = "Include at least one lowercase letter.";
        passwordHelp.style.color = "#f87171";
    } else if (!numberCheck) {
        passwordHelp.textContent = "Include at least one number.";
        passwordHelp.style.color = "#f87171";
    } else if (!specialCheck) {
        passwordHelp.textContent = "Include at least one special character.";
        passwordHelp.style.color = "#f87171";
    } else {
        passwordHelp.textContent = "Strong password ✔"; // all requirements met
        passwordHelp.style.color = "#34d399"; // green
    }
});


/* ===========================
   Suggest Strong Password
=========================== */

// Generate a random strong password
function generateStrongPassword(length = 12) {
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    const special = "!@#$%^&*()";
    const allChars = lower + upper + numbers + special;

    let password = "";

    // Ensure password contains at least one of each type
    password += lower[Math.floor(Math.random() * lower.length)];
    password += upper[Math.floor(Math.random() * upper.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill remaining characters randomly
    for (let i = 4; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the characters to mix required chars
    password = password.split('').sort(() => 0.5 - Math.random()).join('');
    return password;
}

// Button to generate strong password
document.getElementById("suggestPassword")?.addEventListener("click", () => {
    passwordInput.value = generateStrongPassword();
    passwordInput.dispatchEvent(new Event("input")); // trigger validation
});


/* ===========================
   Show / Hide Password
=========================== */

const togglePassword = document.querySelector(".toggle-password");

togglePassword?.addEventListener("click", () => {
    const eyeIcon = togglePassword.querySelector("svg");
    if (passwordInput.type === "password") {
        passwordInput.type = "text"; // show password
        eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.61 21.61 0 0 1 5.88-7.88"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
    } else {
        passwordInput.type = "password"; // hide password
        eyeIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        `;
    }
});


/* ===========================
   Signup Form Submission
=========================== */

const signupForm = document.querySelector(".signup-form");

if (signupForm) {
    // Create small element to show messages above the submit button
    const signupMsg = document.createElement("small");
    signupMsg.style.display = "block";
    signupMsg.style.marginBottom = "10px";
    signupForm.querySelector(".btn-submit").before(signupMsg);

    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Get form values
        const firstName = document.querySelector("#first_name").value;
        const lastName = document.querySelector("#last_name").value;
        const email = document.querySelector("#email").value;
        const passwordValue = passwordInput.value;
        const confirmValue = document.querySelector("#confirm").value;

        // ===========================
        // Email format validation
        // ===========================
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(email)) {
            signupMsg.style.color = "#f87171"; // red
            signupMsg.textContent = "Please enter a valid email address.";
            return;
        } else {
            signupMsg.textContent = ""; // clear message if valid
        }

        // Ensure password is strong
        if (passwordHelp.textContent !== "Strong password ✔") {
            passwordInput.focus();
            return;
        }

        // Check if passwords match
        if (passwordValue !== confirmValue) {
            signupMsg.style.color = "#f87171"; // red
            signupMsg.textContent = "Passwords do not match. Please re-enter.";
            return;
        }

        // Prepare data to send to backend
        const data = {
            first_name: firstName,
            last_name: lastName,
            email,
            password: passwordValue
        };

        try {
            const response = await fetch(`${API_BASE_URL}/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            // Show response message
            signupMsg.textContent = result.error || "";
            if (response.ok) {
                signupMsg.style.color = "#34d399"; // green for success
                signupMsg.textContent = result.message;
                signupForm.reset();
            } else {
                signupMsg.style.color = "#f87171"; // red for error
            }
        } catch (err) {
            signupMsg.style.color = "#f87171";
            signupMsg.textContent = "Error connecting to backend.";
        }
    });
}


/* ===========================
   Signin Form Submission & Dashboard Redirect
=========================== */

const signinForm = document.getElementById("signinForm");

// ---------------------------
// Auto-redirect if token exists
// ---------------------------

if (signinForm) {
    const signinMsg = document.createElement("small");
    signinMsg.style.display = "block";
    signinMsg.style.marginBottom = "10px";
    signinForm.querySelector(".btn-submit").before(signinMsg);

    signinForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = signinForm.email.value.trim();
        const password = signinForm.password.value.trim();

        // ---------------------------
        // Basic email validation
        // ---------------------------
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(email)) {
            signinMsg.style.color = "#f87171"; // red
            signinMsg.textContent = "Please enter a valid email address.";
            return;
        } else {
            signinMsg.textContent = "";
        }

        // ---------------------------
        // Send login request to backend
        // ---------------------------
        try {
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });

            const result = await response.json();

            if (response.ok && result.token) {
                // Login successful
                signinMsg.style.color = "#34d399"; // green
                signinMsg.textContent = "Login successful! Redirecting…";

                // Store token for future requests
                localStorage.setItem("token", result.token);

                // Redirect to dashboard after short delay
                setTimeout(() => {
                    window.location.href = "../dashboard/homePage.html";
                }, 500);
            } else {
                // Login failed
                signinMsg.style.color = "#f87171"; // red
                signinMsg.textContent = result.error || result.message || "Login failed.";
            }
        } catch (err) {
            signinMsg.style.color = "#f87171";
            signinMsg.textContent = "Error connecting to backend.";
            console.error("Login fetch error:", err);
        }
    });
}
