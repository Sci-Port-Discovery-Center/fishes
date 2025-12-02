(function() {
    const statusEl = document.getElementById('admin-status');
    const fishListEl = document.getElementById('fish-list');
    const clearBtn = document.getElementById('clear-tank');
    const refreshBtn = document.getElementById('refresh-list');
    const limitSelect = document.getElementById('limit');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfoEl = document.getElementById('page-info');
    const bulkUploadBtn = document.getElementById('bulk-upload-btn');
    const bulkUploadInput = document.getElementById('bulk-upload-input');
    const bulkUploadProgress = document.getElementById('bulk-upload-progress');

    let currentOffset = 0;
    let totalCount = 0;

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
        const limit = parseInt(limitSelect.value, 10) || 50;
        setStatus('Loading recent fish...');
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        pageInfoEl.textContent = 'Loading...';
        fishListEl.innerHTML = '';

        try {
            const params = new URLSearchParams({
                limit: limit.toString(),
                orderBy: 'CreatedAt',
                order: 'desc',
                offset: currentOffset.toString()
            });
            const response = await fetch(`${BACKEND_URL}/api/fish?${params.toString()}`);
            const result = await response.json();

            const fishData = result.data || [];
            totalCount = typeof result.total === 'number' ? result.total : totalCount || fishData.length;
            if (typeof result.offset === 'number') {
                currentOffset = result.offset;
            }

            renderFish(fishData);
            updatePagination(fishData.length, limit);
            setStatus(buildStatusMessage(fishData.length));
        } catch (err) {
            console.error(err);
            setStatus('Failed to load fish list. Please try again.', 'error');
        }
    }

    function buildStatusMessage(count) {
        if (!count) {
            return 'No fish found.';
        }

        const start = totalCount ? Math.min(currentOffset + 1, totalCount) : currentOffset + 1;
        const end = totalCount ? Math.min(currentOffset + count, totalCount) : currentOffset + count;
        const totalText = totalCount ? ` of ${totalCount}` : '';
        return `Showing ${start}-${end}${totalText}.`;
    }

    function updatePagination(loadedCount, limit) {
        if (!loadedCount) {
            pageInfoEl.textContent = 'No fish found.';
            prevBtn.disabled = currentOffset <= 0;
            nextBtn.disabled = true;
            return;
        }

        const start = totalCount ? Math.min(currentOffset + 1, totalCount) : currentOffset + 1;
        const end = totalCount ? Math.min(currentOffset + loadedCount, totalCount) : currentOffset + loadedCount;
        const totalText = totalCount ? ` of ${totalCount}` : '';
        pageInfoEl.textContent = `Showing ${start}-${end}${totalText}`;

        prevBtn.disabled = currentOffset <= 0;

        const reachedEnd = totalCount
            ? end >= totalCount
            : loadedCount < limit;
        nextBtn.disabled = reachedEnd;
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

    function goToPreviousPage() {
        const limit = parseInt(limitSelect.value, 10) || 50;
        currentOffset = Math.max(currentOffset - limit, 0);
        loadFish();
    }

    function goToNextPage() {
        const limit = parseInt(limitSelect.value, 10) || 50;
        const potentialOffset = currentOffset + limit;

        if (totalCount && potentialOffset >= totalCount) {
            return;
        }

        currentOffset = potentialOffset;
        loadFish();
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

    function updateBulkProgress(message) {
        if (bulkUploadProgress) {
            bulkUploadProgress.textContent = message;
        }
    }

    async function handleBulkUploadSelection(event) {
        const files = Array.from(event.target?.files || []);

        if (!files.length) {
            updateBulkProgress('No files selected.');
            return;
        }

        const totalFiles = files.length;
        setStatus(`Uploading ${totalFiles} file${totalFiles > 1 ? 's' : ''}...`);
        updateBulkProgress('Preparing upload...');

        const formData = new FormData();
        files.forEach((file) => formData.append('images', file, file.name));
        formData.append('artist', 'Admin Bulk Upload');
        formData.append('needsModeration', 'false');

        try {
            const response = await fetch(`${BACKEND_URL}/uploadfish/bulk`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (!response.ok) {
                const errorMessage = result?.error || 'Bulk upload failed.';
                throw new Error(errorMessage);
            }

            const uploadedCount = result?.uploaded ?? (result?.data?.length || 0);
            const urls = (result?.data || []).map((item) => item.Image || item.image || item.url);
            const firstUrlText = urls.length ? ` First URL: ${urls[0]}` : '';
            setStatus(`Uploaded ${uploadedCount} fish successfully.`);
            updateBulkProgress(`Completed: ${uploadedCount}/${totalFiles} files.${firstUrlText}`);
            await loadFish();
        } catch (err) {
            console.error(err);
            setStatus(err.message || 'Bulk upload failed.', 'error');
            updateBulkProgress('Bulk upload failed. Please try again.');
        } finally {
            if (bulkUploadInput) {
                bulkUploadInput.value = '';
            }
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
    limitSelect.addEventListener('change', () => {
        currentOffset = 0;
        loadFish();
    });
    prevBtn.addEventListener('click', goToPreviousPage);
    nextBtn.addEventListener('click', goToNextPage);

    bulkUploadBtn?.addEventListener('click', () => {
        if (!bulkUploadInput) return;
        bulkUploadInput.value = '';
        bulkUploadInput.click();
    });

    bulkUploadInput?.addEventListener('change', handleBulkUploadSelection);

    document.addEventListener('DOMContentLoaded', bootstrap);
})();
