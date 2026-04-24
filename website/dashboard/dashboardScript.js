// ===== API Configuration =====
const API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:5000';
    }
    return window.location.origin;
})();

let socket;

function connectWebSocket() {
    // Dynamically get the WebSocket URL
    let wsUrl;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        wsUrl = 'ws://localhost:5000';
    } else {
        // Railway uses the same host for everything. 
        // We just swap 'http' for 'ws'
        wsUrl = window.location.origin.replace(/^http/, 'ws');
    }
    
    console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("✅ WebSocket connected");
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log("📡 Live update received:", data);

            // 🚨 Ignore welcome message
            if (data.message) return;

            // 🔥 Refresh dashboard on DB events
            const token = localStorage.getItem("token");
            if (token) {
                console.log("🔄 Refreshing dashboard...");
                fetchDashboardData(token);
            }
        } catch (err) {
            console.error("❌ Failed to parse WebSocket message:", err);
        }
    };

    socket.onclose = () => {
        console.log("❌ WebSocket disconnected");

        // 🔁 Auto reconnect
        setTimeout(() => {
            console.log("🔄 Reconnecting WebSocket...");
            connectWebSocket();
        }, 2000);
    };

    socket.onerror = (err) => {
        console.error("⚠️ WebSocket error:", err);
    };
}

// 🚀 Start connection
connectWebSocket();

// ===== Sidebar Toggle =====
const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('sidebarToggle');

toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    const arrow = toggleBtn.querySelector('span') || toggleBtn;
    arrow.style.transform = sidebar.classList.contains('collapsed') 
        ? 'rotate(180deg)' 
        : 'rotate(0deg)';
});

// ===== Navigation =====
// when a sidebar category is clicked, only its corresponding section remains visible
function setupNavigation() {
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.section');

    // initial state – show only the section for the currently active menu item
    const activeItem = document.querySelector('.menu-item.active');
    if (activeItem) {
        const initialId = activeItem.getAttribute('href').substring(1);
        sections.forEach(sec => {
            const show = sec.id === initialId;
            sec.classList.toggle('show', show);
        });
    }

    menuItems.forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            const targetId = item.getAttribute('href').substring(1);

            sections.forEach(sec => {
                const show = sec.id === targetId;
                sec.classList.toggle('show', show);
            });

            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // scroll the chosen section to the top of the viewport
            // ensure the viewport is reset to the top rather than scrolling down to the section
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

document.addEventListener('DOMContentLoaded', setupNavigation);

// ===== Helper Functions =====
function toggleMini(id, show) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !show);
}

function showError(msg) {
    const b = document.getElementById('error-banner');
    if (b) {
        b.textContent = msg;
        b.classList.remove('hidden');
    }
}

function createLineChart(ctx, labels, data, label) {
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label,
                data,
                borderColor: 'rgb(56,189,248)',
                backgroundColor: 'rgba(56,189,248,0.1)',
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });
}

function createBarChart(ctx, labels, data, label) {
    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label,
                data,
                backgroundColor: 'rgba(56,189,248,0.6)',
                borderColor: 'rgb(56,189,248)',
                borderWidth: 1,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// ===== Authentication =====
(async function checkAuth() {
    const token = localStorage.getItem("token");

    if (!token) {
        showError("You must sign in to access the dashboard.");
        setTimeout(() => window.location.href = "../frontend_auth/SignInPage.html", 1500);
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/verify-token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (!response.ok || !result.valid) {
            localStorage.removeItem("token");
            showError("Session expired. Please sign in again.");
            setTimeout(() => window.location.href = "../frontend_auth/SignInPage.html", 1500);
            return;
        }

        fetchDashboardData(token);
    } catch (err) {
        console.error("Auth error:", err);
        showError("Error connecting to backend. Please try again.");
        setTimeout(() => window.location.href = "../frontend_auth/SignInPage.html", 1500);
    }
})();

// ===== Dashboard Data =====
async function fetchDashboardData(token) {
    try {
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        };

        // Show loaders
        ['loader-total-today','loader-total-week','loader-flagged','loader-risk','loader-fraud']
            .forEach(id => toggleMini(id, true));

        /* ===========================
           1️⃣ Total Transactions Today
        =========================== */
        const totalTodayResp = await fetch(`${API_BASE_URL}/dashboard/total-transactions-today`, { headers });
        const totalToday = await totalTodayResp.json();

        document.getElementById("total-transactions-today").textContent =
            totalToday?.total_transactions_today ?? 0;
        toggleMini('loader-total-today', false);


        /* ===========================
           2️⃣ Total Transactions This Week
        =========================== */
        const totalWeekResp = await fetch(`${API_BASE_URL}/dashboard/total-transactions-week`, { headers });
        const totalWeek = await totalWeekResp.json();

        document.getElementById("total-transactions-week").textContent =
            totalWeek?.total_transactions_week ?? 0;
        toggleMini('loader-total-week', false);


        /* ===========================
           3️⃣ Total Amount Processed (chart)
        =========================== */
        try {
            const amountTimeResp = await fetch(`${API_BASE_URL}/dashboard/amount-over-time`, { headers });
            const amountTimeData = await amountTimeResp.json();
            const ctxAmt = document.getElementById('total-amount-chart').getContext('2d');
            createBarChart(
                ctxAmt,
                amountTimeData.map(r => r.transaction_date),
                amountTimeData.map(r => Number(r.total_amount)),
                'Amount Processed'
            );
        } catch (err) {
            console.warn('Could not load amount-over-time chart', err);
        }


        /* ===========================
           4️⃣ Flagged Transactions
        =========================== */
        const flaggedResp = await fetch(`${API_BASE_URL}/dashboard/flagged-transactions`, { headers });
        const flagged = await flaggedResp.json();

        document.getElementById("flagged-transactions").textContent =
            flagged?.flagged_transactions ?? 0;
        toggleMini('loader-flagged', false);


        /* ===========================
           5️⃣ Risk Level Distribution
        =========================== */
        const riskResp = await fetch(`${API_BASE_URL}/dashboard/risk-distribution`, { headers });
        const riskData = await riskResp.json();

        // risk-distribution-list matches HTML id
        const riskList = document.getElementById("risk-distribution-list");
        if (riskList) {
            riskList.innerHTML = "";
        } else {
            console.warn("Risk distribution element not found");
        }

        if (riskList) {
            if (!riskData || riskData.length === 0) {
                riskList.innerHTML = "<li>No data</li>";
            } else {
                riskData.forEach(r => {
                    const li = document.createElement("li");
                    li.textContent = `${r.risk_level}: ${r.count}`;
                    riskList.appendChild(li);
                });
            }
        }
        toggleMini('loader-risk', false);

        /* ===========================
           🛡️ Fraud vs Normal
        =========================== */
        const fraudResp = await fetch(`${API_BASE_URL}/dashboard/fraud-status`, { headers });
        const fraudData = await fraudResp.json();
        const fraudList = document.getElementById("fraud-status-list");
        if (fraudList) {
            fraudList.innerHTML = "";
            if (!fraudData || fraudData.length === 0) {
                fraudList.innerHTML = "<li>No data</li>";
            } else {
                fraudData.forEach(f => {
                    let label;
                    switch ((f.fraud_status || "").toString().toLowerCase()) {
                        case "t":
                        case "true":
                            label = "Fraud";
                            break;
                        case "f":
                        case "false":
                            label = "Not fraud";
                            break;
                        default:
                            label = "Unknown";
                    }
                    const li = document.createElement("li");
                    li.textContent = `${label}: ${f.count}`;
                    fraudList.appendChild(li);
                });
            }
        }
        toggleMini('loader-fraud', false);

        /* ===========================
           📈 Transactions Over Time Chart
        =========================== */
        try {
            const timeResp = await fetch(`${API_BASE_URL}/dashboard/transactions-over-time`, { headers });
            const timeData = await timeResp.json();
            const ctx = document.getElementById('transactions-over-time-chart').getContext('2d');
            createLineChart(
                ctx,
                timeData.map(r => r.transaction_date),
                timeData.map(r => r.transaction_count),
                'Transactions'
            );
        } catch (err) {
            console.warn('Could not load transactions-over-time chart', err);
        }

        /* ===========================
           📉 Fraud Over Time Chart
        =========================== */
        try {
            const fraudTimeResp = await fetch(`${API_BASE_URL}/dashboard/fraud-over-time`, { headers });
            const fraudTimeData = await fraudTimeResp.json();
            const ctx2 = document.getElementById('fraud-over-time-chart').getContext('2d');
            createLineChart(
                ctx2,
                fraudTimeData.map(r => r.transaction_date),
                fraudTimeData.map(r => r.fraud_count),
                'Fraud Transactions'
            );
        } catch (err) {
            console.warn('Could not load fraud-over-time chart', err);
        }

        /* ===========================
           6️⃣ Recent Transactions Table
        =========================== */
        try {
            const recentResp = await fetch(`${API_BASE_URL}/dashboard/analyst-actions`, { headers });
            const recentData = await recentResp.json();
            const recentTable = document.querySelector("#recent-transactions-table tbody");
            if (recentTable) {
                recentTable.innerHTML = "";
                if (!recentData || recentData.length === 0) {
                    recentTable.innerHTML = "<tr><td colspan='9'>No transactions found</td></tr>";
                } else {
                    recentData.forEach(tr => {
                        const row = document.createElement("tr");
                        row.innerHTML = `
                            <td>${tr.transaction_id}</td>
                            <td>${tr.user_id}</td>
                            <td>$${Number(tr.amount).toFixed(2)}</td>
                            <td>${tr.country}</td>
                            <td>${tr.city}</td>
                            <td>${tr.risk_level}</td>
                            <td>${tr.system_action}</td>
                            <td>${tr.analyst_action || "-"}</td>
                            <td>${tr.timestamp}</td>
                        `;
                        recentTable.appendChild(row);
                    });
                }
            }
        } catch (err) {
            console.warn('Could not load recent transactions', err);
        }

        /* ===========================
           7️⃣ High Risk Transactions
        =========================== */
        const highResp = await fetch(`${API_BASE_URL}/dashboard/high-risk`, { headers });
        const highData = await highResp.json();

        // select tbody inside high-risk table rather than a non-existent id
        const highTable = document.querySelector("#high-risk-table tbody");
        if (highTable) {
            highTable.innerHTML = "";

            if (!highData || highData.length === 0) {
                highTable.innerHTML = "<tr><td colspan='9'>No high-risk transactions</td></tr>";
            } else {
                highData.forEach(tr => {
                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td>${tr.transaction_id}</td>
                        <td>${tr.user_id}</td>
                        <td>$${Number(tr.amount).toFixed(2)}</td>
                        <td>${tr.country}</td>
                        <td>${tr.city}</td>
                        <td>${tr.risk_level}</td>
                        <td>${tr.system_action}</td>
                        <td>${tr.analyst_action || "-"}</td>
                        <td>${tr.timestamp}</td>
                    `;
                    highTable.appendChild(row);
                });
            }
        } else {
            console.warn("High-risk table body not found");
        }

        /* ===========================
           👥 User Profiles & Transactions
        =========================== */
        try {
            const usersResp = await fetch(`${API_BASE_URL}/dashboard/users-summary`, { headers });
            const usersData = await usersResp.json();
            console.log('users-summary response', usersData);
            const usersTable = document.querySelector("#users-table tbody");
            if (usersTable) {
                usersTable.innerHTML = "";
                if (!usersData || usersData.length === 0) {
                    usersTable.innerHTML = "<tr><td colspan='9'>No user data</td></tr>";
                } else {
                    usersData.forEach(u => {
                        const row = document.createElement("tr");
                        row.innerHTML = `
                            <td>${u.user_id || "-"}</td>
                            <td>${u.first_name || "-"}</td>
                            <td>${u.last_name || "-"}</td>
                            <td>${u.country || "-"}</td>
                            <td>${u.city || "-"}</td>
                            <td>$${u.balance ? Number(u.balance).toFixed(2) : "0.00"}</td>
                            <td>${u.suspicious_transactions || 0}</td>
                            <td>${u.total_transactions || 0}</td>
                            <td>$${u.total_volume ? Number(u.total_volume).toFixed(2) : "0.00"}</td>
                        `;
                        usersTable.appendChild(row);
                    });
                }
            }
        } catch (err) {
            console.warn("Could not load user profiles:", err);
        }

        /* ===========================
           🚨 IOC Summary
        =========================== */
        try {
            const iocSummaryResp = await fetch(`${API_BASE_URL}/dashboard/ioc-summary`, { headers });
            const iocSummaryData = await iocSummaryResp.json();
            const iocSummaryList = document.getElementById("ioc-summary-list");
            if (iocSummaryList) {
                iocSummaryList.innerHTML = "";
                if (!iocSummaryData || Object.keys(iocSummaryData).length === 0) {
                    iocSummaryList.innerHTML = "<li>No IOC flags found</li>";
                } else {
                    // API returns: {high_risk_ip: "3", disposable_email: "0", ...}
                    const flags = [
                        { name: "High Risk IP", value: iocSummaryData.high_risk_ip },
                        { name: "Disposable Email", value: iocSummaryData.disposable_email },
                        { name: "Device Velocity", value: iocSummaryData.device_velocity },
                        { name: "PII Changes", value: iocSummaryData.pii_changes },
                        { name: "Impossible Travel", value: iocSummaryData.impossible_travel }
                    ];
                    flags.forEach(flag => {
                        const li = document.createElement("li");
                        li.textContent = `${flag.name}: ${flag.value || 0}`;
                        iocSummaryList.appendChild(li);
                    });
                }
            }
        } catch (err) {
            console.warn("Could not load IOC summary:", err);
        }

        /* ===========================
           🚩 Transactions with IOC Flags
        =========================== */
        try {
            const iocTxnResp = await fetch(`${API_BASE_URL}/dashboard/transactions-ioc`, { headers });
            const iocTxnData = await iocTxnResp.json();
            const iocTxnTable = document.querySelector("#transactions-ioc-table tbody");
            if (iocTxnTable) {
                iocTxnTable.innerHTML = "";
                if (!iocTxnData || iocTxnData.length === 0) {
                    iocTxnTable.innerHTML = "<tr><td colspan='8'>No transactions with IOC flags</td></tr>";
                } else {
                    iocTxnData.forEach(txn => {
                        const row = document.createElement("tr");
                        const renderFlag = (val) => val ? "✓" : "—";
                        row.innerHTML = `
                            <td>${txn.transaction_id || "-"}</td>
                            <td>${txn.user_id || "-"}</td>
                            <td>$${Number(txn.amount || 0).toFixed(2)}</td>
                            <td>${renderFlag(txn.high_risk_network_origin)}</td>
                            <td>${renderFlag(txn.disposable_identity)}</td>
                            <td>${renderFlag(txn.device_velocity)}</td>
                            <td>${renderFlag(txn.pii_change_velocity)}</td>
                            <td>${renderFlag(txn.impossible_travel)}</td>
                        `;
                        iocTxnTable.appendChild(row);
                    });
                }
            }
        } catch (err) {
            console.warn("Could not load IOC transactions:", err);
        }

        /* ===========================
           📊 IOC Score Ranking
        =========================== */
        try {
            const iocRankingResp = await fetch(`${API_BASE_URL}/dashboard/ioc-score-ranking`, { headers });
            const iocRankingData = await iocRankingResp.json();
            const iocRankingTable = document.querySelector("#ioc-score-ranking-table tbody");
            if (iocRankingTable) {
                iocRankingTable.innerHTML = "";
                if (!iocRankingData || iocRankingData.length === 0) {
                    iocRankingTable.innerHTML = "<tr><td colspan='6'>No IOC ranking data</td></tr>";
                } else {
                    iocRankingData.forEach(rank => {
                        const row = document.createElement("tr");
                        row.innerHTML = `
                            <td>${rank.transaction_id || "-"}</td>
                            <td>${rank.user_id || "-"}</td>
                            <td>$${Number(rank.amount || 0).toFixed(2)}</td>
                            <td>${rank.risk_level || "-"}</td>
                            <td>${rank.system_action || "-"}</td>
                            <td>${Number(rank.ioc_score || 0).toFixed(3)}</td>
                        `;
                        iocRankingTable.appendChild(row);
                    });
                }
            }
        } catch (err) {
            console.warn("Could not load IOC ranking:", err);
        }

    } catch (err) {
        console.error("Error fetching dashboard data:", err);
        showError("Failed to load dashboard data.");
        ['loader-total-today','loader-total-week','loader-flagged','loader-risk','loader-fraud']
            .forEach(id => toggleMini(id, false));
    }
}