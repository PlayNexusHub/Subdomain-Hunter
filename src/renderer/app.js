// PlayNexus Subdomain Hunter - Renderer Process
// Owner: Nortaq | Contact: playnexushq@gmail.com

class SubdomainHunter {
    constructor() {
        this.currentResults = null;
        this.isHunting = false;
        this.settings = {
            theme: 'dark',
            concurrency: 10,
            timeout: 5000,
            enableBruteforce: true,
            enableDnsEnum: true,
            enableWebScraping: false,
            enableCertTransparency: false,
            saveHistory: true
        };
        this.customWordlist = null;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupTabs();
        await this.loadSettings();
        this.applyTheme();
        
        // Handle menu events
        window.electronAPI.onMenuAction((action) => {
            this.handleMenuAction(action);
        });

        // Handle hunt progress updates
        window.electronAPI.onHuntProgress((data) => {
            this.updateProgress(data);
        });
    }

    setupEventListeners() {
        // Hunt controls
        document.getElementById('startHuntBtn').addEventListener('click', () => this.startHunt());
        document.getElementById('stopHuntBtn').addEventListener('click', () => this.stopHunt());
        document.getElementById('clearResultsBtn').addEventListener('click', () => this.clearResults());

        // Wordlist selection
        document.getElementById('wordlistSelect').addEventListener('change', (e) => {
            const customSection = document.getElementById('customWordlistSection');
            if (e.target.value === 'custom') {
                customSection.classList.remove('hidden');
            } else {
                customSection.classList.add('hidden');
            }
        });

        // Header actions
        document.getElementById('importBtn').addEventListener('click', () => this.importWordlist());
        document.getElementById('dnsLookupBtn').addEventListener('click', () => this.showModal('dnsLookupModal'));
        document.getElementById('settingsBtn').addEventListener('click', () => this.showModal('settingsModal'));
        document.getElementById('helpBtn').addEventListener('click', () => this.showModal('helpModal'));

        // DNS Lookup
        document.getElementById('performLookup').addEventListener('click', () => this.performDnsLookup());

        // Export buttons
        document.getElementById('exportJson').addEventListener('click', () => this.exportResults('json'));
        document.getElementById('exportCsv').addEventListener('click', () => this.exportResults('csv'));
        document.getElementById('exportTxt').addEventListener('click', () => this.exportResults('txt'));

        // Copy buttons
        document.getElementById('copyAllBtn').addEventListener('click', () => this.copySubdomains('all'));
        document.getElementById('copyAliveBtn').addEventListener('click', () => this.copySubdomains('alive'));

        // Filters
        document.getElementById('filterInput').addEventListener('input', () => this.applyFilters());
        document.getElementById('statusFilter').addEventListener('change', () => this.applyFilters());
        document.getElementById('methodFilter').addEventListener('change', () => this.applyFilters());

        // Modal controls
        this.setupModalControls();
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.results-tab');
        const panes = document.querySelectorAll('.tab-pane');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetPane = tab.dataset.tab;
                
                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update active pane
                panes.forEach(p => p.classList.remove('active'));
                document.getElementById(targetPane).classList.add('active');
            });
        });
    }

    setupModalControls() {
        // Settings modal
        document.getElementById('saveSettings').addEventListener('click', () => {
            this.saveSettings();
        });

        // Close modals
        document.querySelectorAll('.modal-close, .btn-secondary').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) this.hideModal(modal.id);
            });
        });

        // Click outside to close
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hideModal(modal.id);
            });
        });
    }

    async startHunt() {
        const domain = document.getElementById('targetDomain').value.trim();
        
        if (!domain) {
            this.showError('Please enter a target domain');
            return;
        }

        if (!this.isValidDomain(domain)) {
            this.showError('Please enter a valid domain name');
            return;
        }

        this.isHunting = true;
        this.updateHuntControls();
        this.showProgress();
        this.hideNoResults();

        try {
            const options = {
                enableBruteforce: document.getElementById('enableBruteforce').checked,
                enableDnsEnum: document.getElementById('enableDnsEnum').checked,
                enableWebScraping: document.getElementById('enableWebScraping').checked,
                enableCertTransparency: document.getElementById('enableCertTransparency').checked,
                concurrency: parseInt(document.getElementById('concurrency').value) || 10,
                timeout: parseInt(document.getElementById('timeout').value) || 5000
            };

            // Add custom wordlist if selected
            if (document.getElementById('wordlistSelect').value === 'custom') {
                const customText = document.getElementById('customWordlist').value.trim();
                if (customText) {
                    options.customWordlist = customText.split('\n').map(line => line.trim()).filter(line => line);
                }
            }

            const results = await window.electronAPI.huntSubdomains({
                domain,
                options
            });
            
            this.currentResults = results;
            this.displayResults(results);
            
            if (this.settings.saveHistory) {
                await this.saveToHistory(domain, results);
            }
            
        } catch (error) {
            this.showError(`Hunt failed: ${error.message}`);
        } finally {
            this.isHunting = false;
            this.updateHuntControls();
            this.hideProgress();
        }
    }

    stopHunt() {
        this.isHunting = false;
        this.updateHuntControls();
        this.hideProgress();
        // Note: Actual hunt stopping would need to be implemented in main process
    }

    displayResults(results) {
        this.showResults();
        
        // Update statistics
        this.updateStatistics(results.statistics);
        
        // Update subdomains table
        this.updateSubdomainsTable(results.subdomains);
        
        // Update methods analysis
        this.updateMethodsAnalysis(results);
        
        // Update domain analysis
        this.updateDomainAnalysis(results.subdomains);
        
        // Show export section
        document.querySelector('.export-section').style.display = 'block';
    }

    updateStatistics(stats) {
        document.getElementById('totalFound').textContent = stats.total;
        document.getElementById('aliveCount').textContent = stats.alive;
        document.getElementById('deadCount').textContent = stats.dead;
        document.getElementById('timeElapsed').textContent = this.formatTime(stats.timeElapsed);
    }

    updateSubdomainsTable(subdomains) {
        const tableBody = document.getElementById('subdomainsTableBody');
        tableBody.innerHTML = '';

        if (subdomains.length === 0) {
            tableBody.innerHTML = '<div class="table-row"><div class="table-cell" style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary);">No subdomains found</div></div>';
            return;
        }

        subdomains.forEach(subdomain => {
            const row = document.createElement('div');
            row.className = 'table-row';
            row.dataset.subdomain = subdomain.subdomain;
            row.dataset.status = subdomain.status;
            row.dataset.method = subdomain.method;

            row.innerHTML = `
                <div class="table-cell">${subdomain.subdomain}</div>
                <div class="table-cell">${subdomain.ip || 'N/A'}</div>
                <div class="table-cell">
                    <span class="status-badge ${subdomain.status}">${subdomain.status}</span>
                </div>
                <div class="table-cell">
                    <span class="method-badge">${subdomain.method}</span>
                </div>
                <div class="table-cell">${subdomain.recordType || 'N/A'}</div>
                <div class="table-cell">
                    <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${subdomain.subdomain}')">Copy</button>
                </div>
            `;

            tableBody.appendChild(row);
        });

        // Apply current filters
        this.applyFilters();
    }

    updateMethodsAnalysis(results) {
        const methodsGrid = document.getElementById('methodsGrid');
        methodsGrid.innerHTML = '';

        const methodStats = {};
        results.subdomains.forEach(sub => {
            if (!methodStats[sub.method]) {
                methodStats[sub.method] = 0;
            }
            methodStats[sub.method]++;
        });

        Object.entries(methodStats).forEach(([method, count]) => {
            const methodStat = document.createElement('div');
            methodStat.className = 'method-stat';
            methodStat.innerHTML = `
                <h5>${this.formatMethodName(method)}</h5>
                <div class="count">${count}</div>
            `;
            methodsGrid.appendChild(methodStat);
        });
    }

    updateDomainAnalysis(subdomains) {
        // IP Distribution
        const ipDistribution = document.getElementById('ipDistribution');
        const ipCounts = {};
        
        subdomains.forEach(sub => {
            if (sub.ip) {
                ipCounts[sub.ip] = (ipCounts[sub.ip] || 0) + 1;
            }
        });

        ipDistribution.innerHTML = '';
        Object.entries(ipCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .forEach(([ip, count]) => {
                const ipItem = document.createElement('div');
                ipItem.className = 'ip-item';
                ipItem.innerHTML = `
                    <span>${ip}</span>
                    <span>${count} subdomain${count > 1 ? 's' : ''}</span>
                `;
                ipDistribution.appendChild(ipItem);
            });

        // Subdomain Patterns
        const patterns = document.getElementById('subdomainPatterns');
        const patternCounts = {};
        
        subdomains.forEach(sub => {
            const parts = sub.subdomain.split('.');
            if (parts.length > 2) {
                const pattern = parts[0];
                patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
            }
        });

        patterns.innerHTML = '';
        Object.entries(patternCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .forEach(([pattern, count]) => {
                const patternItem = document.createElement('div');
                patternItem.className = 'pattern-item';
                patternItem.innerHTML = `
                    <span>${pattern}.*</span>
                    <span>${count}</span>
                `;
                patterns.appendChild(patternItem);
            });
    }

    updateProgress(data) {
        const percent = Math.round((data.current / data.total) * 100);
        document.getElementById('progressPercent').textContent = `${percent}%`;
        document.getElementById('foundCount').textContent = data.found;
        document.getElementById('currentSubdomain').textContent = data.currentSubdomain;
        document.getElementById('progressFill').style.width = `${percent}%`;
    }

    applyFilters() {
        const filterText = document.getElementById('filterInput').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;
        const methodFilter = document.getElementById('methodFilter').value;

        const rows = document.querySelectorAll('#subdomainsTableBody .table-row');
        
        rows.forEach(row => {
            const subdomain = row.dataset.subdomain?.toLowerCase() || '';
            const status = row.dataset.status || '';
            const method = row.dataset.method || '';

            const matchesText = !filterText || subdomain.includes(filterText);
            const matchesStatus = statusFilter === 'all' || status === statusFilter;
            const matchesMethod = methodFilter === 'all' || method === methodFilter;

            if (matchesText && matchesStatus && matchesMethod) {
                row.style.display = 'grid';
            } else {
                row.style.display = 'none';
            }
        });
    }

    async performDnsLookup() {
        const hostname = document.getElementById('dnsHostname').value.trim();
        const recordType = document.getElementById('recordType').value;

        if (!hostname) {
            this.showError('Please enter a hostname');
            return;
        }

        try {
            const results = await window.electronAPI.dnsLookup({
                hostname,
                recordType
            });

            const resultsDiv = document.getElementById('dnsResults');
            resultsDiv.innerHTML = `
                <h5>DNS Lookup Results</h5>
                <p><strong>Hostname:</strong> ${results.hostname}</p>
                <p><strong>Record Type:</strong> ${results.recordType}</p>
                <p><strong>Records:</strong></p>
                <pre>${JSON.stringify(results.records, null, 2)}</pre>
            `;

        } catch (error) {
            document.getElementById('dnsResults').innerHTML = `
                <h5>DNS Lookup Failed</h5>
                <p style="color: var(--danger-color);">${error.message}</p>
            `;
        }
    }

    async importWordlist() {
        try {
            const result = await window.electronAPI.importWordlist();
            
            if (result.success) {
                this.customWordlist = result.wordlist;
                document.getElementById('wordlistSelect').value = 'custom';
                document.getElementById('customWordlistSection').classList.remove('hidden');
                document.getElementById('customWordlist').value = result.wordlist.join('\n');
                this.showSuccess(`Imported ${result.wordlist.length} words`);
            }
        } catch (error) {
            this.showError(`Import failed: ${error.message}`);
        }
    }

    async exportResults(format) {
        if (!this.currentResults) {
            this.showError('No results to export');
            return;
        }
        
        try {
            const success = await window.electronAPI.exportResults({
                results: this.currentResults,
                format: format
            });
            
            if (success) {
                this.showSuccess(`Results exported successfully as ${format.toUpperCase()}`);
            }
        } catch (error) {
            this.showError(`Export failed: ${error.message}`);
        }
    }

    async copySubdomains(type) {
        if (!this.currentResults) {
            this.showError('No results to copy');
            return;
        }

        let subdomains;
        if (type === 'alive') {
            subdomains = this.currentResults.subdomains
                .filter(s => s.status === 'alive')
                .map(s => s.subdomain);
        } else {
            subdomains = this.currentResults.subdomains.map(s => s.subdomain);
        }

        try {
            await navigator.clipboard.writeText(subdomains.join('\n'));
            this.showSuccess(`Copied ${subdomains.length} subdomains to clipboard`);
        } catch (error) {
            this.showError('Failed to copy to clipboard');
        }
    }

    async loadSettings() {
        try {
            const settings = await window.electronAPI.getSettings();
            this.settings = { ...this.settings, ...settings };
            this.applySettingsToUI();
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveSettings() {
        try {
            // Get values from form
            this.settings.theme = document.getElementById('themeSelect').value;
            this.settings.concurrency = parseInt(document.getElementById('defaultConcurrency').value) || 10;
            this.settings.timeout = parseInt(document.getElementById('defaultTimeout').value) || 5000;
            this.settings.saveHistory = document.getElementById('saveHistoryCheck').checked;
            this.settings.enableBruteforce = document.getElementById('enableBruteforceDefault').checked;
            this.settings.enableDnsEnum = document.getElementById('enableDnsEnumDefault').checked;
            
            await window.electronAPI.saveSettings(this.settings);
            this.applyTheme();
            this.hideModal('settingsModal');
            this.showSuccess('Settings saved successfully');
        } catch (error) {
            this.showError(`Failed to save settings: ${error.message}`);
        }
    }

    applySettingsToUI() {
        document.getElementById('themeSelect').value = this.settings.theme;
        document.getElementById('defaultConcurrency').value = this.settings.concurrency;
        document.getElementById('defaultTimeout').value = this.settings.timeout;
        document.getElementById('saveHistoryCheck').checked = this.settings.saveHistory;
        document.getElementById('enableBruteforceDefault').checked = this.settings.enableBruteforce;
        document.getElementById('enableDnsEnumDefault').checked = this.settings.enableDnsEnum;

        // Apply to hunt form
        document.getElementById('concurrency').value = this.settings.concurrency;
        document.getElementById('timeout').value = this.settings.timeout;
        document.getElementById('enableBruteforce').checked = this.settings.enableBruteforce;
        document.getElementById('enableDnsEnum').checked = this.settings.enableDnsEnum;
    }

    applyTheme() {
        document.body.setAttribute('data-theme', this.settings.theme);
    }

    async saveToHistory(domain, results) {
        try {
            await window.electronAPI.saveToHistory({
                domain,
                results: {
                    ...results,
                    subdomains: results.subdomains.slice(0, 100) // Limit for storage
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Failed to save to history:', error);
        }
    }

    handleMenuAction(action) {
        switch (action) {
            case 'new-hunt':
                this.clearResults();
                document.getElementById('targetDomain').focus();
                break;
            case 'import-wordlist':
                this.importWordlist();
                break;
            case 'export-json':
                this.exportResults('json');
                break;
            case 'export-csv':
                this.exportResults('csv');
                break;
            case 'export-txt':
                this.exportResults('txt');
                break;
            case 'dns-lookup':
                this.showModal('dnsLookupModal');
                break;
            case 'reverse-dns':
                // Could implement reverse DNS lookup
                break;
            case 'settings':
                this.showModal('settingsModal');
                break;
            case 'help':
                this.showModal('helpModal');
                break;
        }
    }

    clearResults() {
        this.currentResults = null;
        this.showNoResults();
        this.hideResults();
        this.hideProgress();
        document.getElementById('targetDomain').value = '';
        document.querySelector('.export-section').style.display = 'none';
    }

    updateHuntControls() {
        document.getElementById('startHuntBtn').disabled = this.isHunting;
        document.getElementById('stopHuntBtn').disabled = !this.isHunting;
    }

    showProgress() {
        document.getElementById('progressSection').classList.remove('hidden');
    }

    hideProgress() {
        document.getElementById('progressSection').classList.add('hidden');
    }

    showResults() {
        document.getElementById('resultsContent').classList.remove('hidden');
    }

    hideResults() {
        document.getElementById('resultsContent').classList.add('hidden');
    }

    showNoResults() {
        document.getElementById('noResults').classList.remove('hidden');
    }

    hideNoResults() {
        document.getElementById('noResults').classList.add('hidden');
    }

    showModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    hideModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
        document.body.style.overflow = 'auto';
    }

    showError(message) {
        // Simple alert for now - could be replaced with toast notifications
        alert(`Error: ${message}`);
    }

    showSuccess(message) {
        // Simple alert for now - could be replaced with toast notifications
        alert(`Success: ${message}`);
    }

    isValidDomain(domain) {
        const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        return domainRegex.test(domain);
    }

    formatMethodName(method) {
        const methodNames = {
            'bruteforce': 'Brute Force',
            'dns-enum': 'DNS Enumeration',
            'web-scraping': 'Web Scraping',
            'certificate-transparency': 'Certificate Transparency'
        };
        return methodNames[method] || method;
    }

    formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SubdomainHunter();
});
