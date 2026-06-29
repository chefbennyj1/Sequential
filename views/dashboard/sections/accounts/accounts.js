export async function initAccounts() {
    initTabs();
    initCreateForm();
    await loadUsers();
}

function initTabs() {
    const tabList = document.getElementById('accounts-tab-list');
    if (!tabList) return;

    tabList.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-accounts-tab]');
        if (!btn) return;

        const target = btn.dataset.accountsTab;

        tabList.querySelectorAll('.glass-tab').forEach(t => t.setAttribute('aria-selected', 'false'));
        btn.setAttribute('aria-selected', 'true');

        document.querySelectorAll('.glass-tab-panel[id^="accounts-panel-"]').forEach(p => p.classList.remove('is-active'));
        document.getElementById(`accounts-panel-${target}`)?.classList.add('is-active');

        if (target === 'users')    await loadUsers();
        if (target === 'requests') await loadRequests();
    });
}

async function loadUsers() {
    try {
        const res  = await fetch('/accounts/users');
        const data = await res.json();
        if (!data.ok) return;

        const tbody = document.getElementById('users-tbody');
        const table = document.getElementById('users-table');
        const empty = document.getElementById('users-empty');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!data.users.length) {
            if (empty) empty.style.display = '';
            if (table) table.style.display = 'none';
            return;
        }

        if (empty) empty.style.display = 'none';
        if (table) table.style.display = '';

        for (const u of data.users) {
            const tr = document.createElement('tr');
            tr.dataset.userId = u._id;

            const tdName  = document.createElement('td'); tdName.textContent  = u.username;
            const tdEmail = document.createElement('td'); tdEmail.textContent = u.email;

            const tdRole = document.createElement('td');
            const roleChip = document.createElement('span');
            const roleColor = { admin: 'violet', moderator: 'aqua', basic: 'amber' };
            roleChip.className = `glass-chip glass-chip--${roleColor[u.role] || 'amber'}`;
            roleChip.style.cursor = 'default';
            roleChip.textContent = u.role;
            tdRole.appendChild(roleChip);

            const tdDate = document.createElement('td');
            tdDate.textContent = new Date(u.createdAt).toLocaleDateString();

            const tdActions = document.createElement('td');
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'accounts-action-btn delete';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', () => handleDelete(u._id, u.username, tr));
            tdActions.appendChild(deleteBtn);

            tr.append(tdName, tdEmail, tdRole, tdDate, tdActions);
            tbody.appendChild(tr);
        }
    } catch (err) {
        console.error('[Accounts] loadUsers error:', err);
    }
}

async function loadRequests() {
    try {
        const res  = await fetch('/accounts/requests');
        const data = await res.json();
        if (!data.ok) return;

        const tbody = document.getElementById('requests-tbody');
        const table = document.getElementById('requests-table');
        const empty = document.getElementById('requests-empty');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!data.requests.length) {
            if (empty) empty.style.display = '';
            if (table) table.style.display = 'none';
            return;
        }

        if (empty) empty.style.display = 'none';
        if (table) table.style.display = '';

        for (const r of data.requests) {
            const tr = document.createElement('tr');
            tr.dataset.requestId = r._id;

            const tdName  = document.createElement('td'); tdName.textContent  = r.username;
            const tdEmail = document.createElement('td'); tdEmail.textContent = r.email;
            const tdDate  = document.createElement('td'); tdDate.textContent  = new Date(r.createdAt).toLocaleDateString();

            const tdActions = document.createElement('td');

            const approveBtn = document.createElement('button');
            approveBtn.className = 'accounts-action-btn';
            approveBtn.textContent = 'Approve';
            approveBtn.addEventListener('click', () => handleApprove(r._id, tr));

            const denyBtn = document.createElement('button');
            denyBtn.className = 'accounts-action-btn deny';
            denyBtn.textContent = 'Deny';
            denyBtn.addEventListener('click', () => handleDeny(r._id, tr));

            tdActions.append(approveBtn, denyBtn);
            tr.append(tdName, tdEmail, tdDate, tdActions);
            tbody.appendChild(tr);
        }
    } catch (err) {
        console.error('[Accounts] loadRequests error:', err);
    }
}

async function handleApprove(requestId, row) {
    try {
        const res  = await fetch(`/accounts/approve/${requestId}`, { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
            row.remove();
            showToast('success', data.message);
        } else {
            showToast('error', data.message);
        }
    } catch { showToast('error', 'Network error.'); }
}

async function handleDeny(requestId, row) {
    try {
        const res  = await fetch(`/accounts/deny/${requestId}`, { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
            row.remove();
            showToast('info', data.message);
        } else {
            showToast('error', data.message);
        }
    } catch { showToast('error', 'Network error.'); }
}

async function handleDelete(userId, username, row) {
    if (!confirm(`Delete account for "${username}"? This cannot be undone.`)) return;
    try {
        const res  = await fetch(`/accounts/delete/${userId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) {
            row.remove();
            showToast('success', data.message);
        } else {
            showToast('error', data.message);
        }
    } catch { showToast('error', 'Network error.'); }
}

function initCreateForm() {
    const form = document.getElementById('createAccountForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('ca__username').value;
        const email    = document.getElementById('ca__email').value;
        const password = document.getElementById('ca__password').value;
        const role     = document.getElementById('ca__role').value;

        try {
            const res  = await fetch('/accounts/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, role })
            });
            const data = await res.json();
            if (data.ok) {
                form.reset();
                showToast('success', data.message);
            } else {
                showToast('error', data.message);
            }
        } catch { showToast('error', 'Network error.'); }
    });
}

function showToast(type, message) {
    if (window.GlassToast) {
        window.GlassToast.show(type, message);
    } else {
        alert(message);
    }
}
