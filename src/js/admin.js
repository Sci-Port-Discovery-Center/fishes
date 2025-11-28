(function() {
    const statusEl = document.getElementById('admin-status');
    const fishListEl = document.getElementById('fish-list');
    const clearBtn = document.getElementById('clear-tank');
    const refreshBtn = document.getElementById('refresh-list');
    const limitSelect = document.getElementById('limit');

    function setStatus(message, tone = 'info') {
        statusEl.textContent = message;
        statusEl.className = `admin-status ${tone}`;
    }

    function formatDate(iso) {
        if (!iso) return 'Unknown date';
        const d = new Date(iso);
        return d.toLocaleString();
    }

    async function loadFish() {
        const limit = limitSelect.value || '50';
        setStatus('Loading recent fish...');
        fishListEl.innerHTML = '';

        try {
            const params = new URLSearchParams({ limit, orderBy: 'CreatedAt', order: 'desc' });
            const response = await fetch(`${BACKEND_URL}/api/fish?${params.toString()}`);
            const result = await response.json();
            renderFish(result.data || []);
            setStatus(`Loaded ${result.data?.length || 0} fish.`);
        } catch (err) {
            console.error(err);
            setStatus('Failed to load fish list. Please try again.', 'error');
        }
    }

    function renderFish(fishArray) {
        if (!fishArray.length) {
            fishListEl.innerHTML = '<p class="muted">No fish found.</p>';
            return;
        }

        fishListEl.innerHTML = '';
        fishArray.forEach((fish) => {
            const card = document.createElement('div');
            card.className = 'fish-card';

            const img = document.createElement('img');
            img.src = fish.Image || fish.image || fish.url;
            img.alt = fish.artist || 'Anonymous';
            card.appendChild(img);

            const meta = document.createElement('div');
            meta.className = 'fish-meta';

            const title = document.createElement('div');
            title.className = 'title';
            title.innerHTML = `<strong>${fish.artist || 'Anonymous'}</strong>`;

            if (fish.isSaved) {
                const saved = document.createElement('span');
                saved.className = 'badge saved';
                saved.textContent = 'Saved';
                title.appendChild(saved);
            }

            if (fish.deleted) {
                const deleted = document.createElement('span');
                deleted.className = 'badge deleted';
                deleted.textContent = 'Hidden';
                title.appendChild(deleted);
            }

            meta.appendChild(title);

            const info = document.createElement('div');
            info.className = 'muted';
            info.innerHTML = `ID: <small class="code">${fish.id}</small><br>Added: ${formatDate(fish.CreatedAt || fish.createdAt)}`;
            meta.appendChild(info);

            const actions = document.createElement('div');
            actions.className = 'actions';

            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn';
            saveBtn.textContent = fish.isSaved ? 'Unsave' : 'Save';
            saveBtn.addEventListener('click', () => toggleSave(fish.id, !fish.isSaved));
            actions.appendChild(saveBtn);

            meta.appendChild(actions);
            card.appendChild(meta);
            fishListEl.appendChild(card);
        });
    }

    async function toggleSave(fishId, isSaved) {
        try {
            const response = await fetch(`${BACKEND_URL}/admin/fish/${fishId}/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isSaved })
            });

            const result = await response.json();
            if (result && result.data) {
                setStatus(`Fish ${isSaved ? 'saved' : 'unsaved'} successfully.`);
                await loadFish();
            } else {
                setStatus('Unexpected response while saving fish.', 'warn');
            }
        } catch (err) {
            console.error(err);
            setStatus('Failed to update saved state.', 'error');
        }
    }

    async function clearTank() {
        if (!confirm('Clear the tank? Saved fish will stay visible, everything else will be hidden.')) {
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/admin/clear-tank`, {
                method: 'POST'
            });

            const result = await response.json();
            setStatus(`Cleared ${result.cleared || 0} fish. Saved fish remain visible.`);
            await loadFish();
        } catch (err) {
            console.error(err);
            setStatus('Failed to clear the tank.', 'error');
        }
    }

    function bootstrap() {
        setStatus('Loading fish...');
        loadFish();
    }

    clearBtn.addEventListener('click', clearTank);
    refreshBtn.addEventListener('click', loadFish);
    limitSelect.addEventListener('change', loadFish);

    document.addEventListener('DOMContentLoaded', bootstrap);
})();
