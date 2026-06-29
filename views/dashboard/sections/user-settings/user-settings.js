export async function initUserSettings() {
    await prefillForm();
    initAvatarUpload();
    initCredentialsForm();
}

async function prefillForm() {
    try {
        const res  = await fetch('/api/user');
        const data = await res.json();
        if (!data.ok) return;

        const emailInput = document.getElementById('us__email');
        if (emailInput) emailInput.value = data.user.email || '';

        if (data.user.avatar) {
            const img = document.getElementById('settings-avatar-img');
            if (img) img.src = data.user.avatar;
        }
    } catch (err) {
        console.error('[UserSettings] prefill error:', err);
    }
}

function initAvatarUpload() {
    const btn   = document.getElementById('settingsAvatarBtn');
    const input = document.getElementById('settingsAvatarInput');
    const img   = document.getElementById('settings-avatar-img');
    if (!btn || !input || !img) return;

    btn.addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;

        const form = new FormData();
        form.append('avatar', file);

        try {
            const res  = await fetch('/api/user/avatar', { method: 'POST', body: form });
            const data = await res.json();

            if (data.ok) {
                img.src = data.avatarUrl + '?t=' + Date.now();
                updateHeaderAvatars(data.avatarUrl);
                showToast('success', 'Profile photo updated.');
            } else {
                showToast('error', data.message || 'Upload failed.');
            }
        } catch (err) {
            showToast('error', 'Network error.');
        }

        input.value = '';
    });
}

function initCredentialsForm() {
    const form = document.getElementById('credentialsForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email           = document.getElementById('us__email').value.trim();
        const currentPassword = document.getElementById('us__current-password').value;
        const newPassword     = document.getElementById('us__new-password').value;
        const confirmPassword = document.getElementById('us__confirm-password').value;

        if (newPassword && newPassword !== confirmPassword) {
            showToast('error', 'New passwords do not match.');
            return;
        }

        try {
            const res  = await fetch('/api/user/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, currentPassword, newPassword })
            });
            const data = await res.json();

            if (data.ok) {
                document.getElementById('us__current-password').value = '';
                document.getElementById('us__new-password').value     = '';
                document.getElementById('us__confirm-password').value = '';
                showToast('success', data.message || 'Account updated.');
            } else {
                showToast('error', data.message || 'Update failed.');
            }
        } catch (err) {
            showToast('error', 'Network error.');
        }
    });
}

function updateHeaderAvatars(url) {
    document.querySelectorAll('.avatar').forEach(el => {
        if (el.tagName === 'IMG') el.src = url + '?t=' + Date.now();
    });
}

function showToast(type, message) {
    if (window.GlassToast) {
        window.GlassToast.show(type, message);
    } else {
        alert(message);
    }
}
