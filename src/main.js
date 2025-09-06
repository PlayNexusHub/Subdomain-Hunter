// PlayNexus Subdomain Hunter - Main Process
// Owner: Nortaq | Contact: playnexushq@gmail.com

const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const path = require('path');
const fs = require('fs').promises;
const dns = require('dns').promises;
const axios = require('axios');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const async = require('async');
const { format } = require('date-fns');

// Initialize secure store
const store = new Store({
    encryptionKey: 'playnexus-subdomain-hunter-key',
    name: 'subdomain-hunter-settings'
});

let mainWindow;
let isDev = process.argv.includes('--dev');

// Built-in wordlists for subdomain enumeration
const COMMON_SUBDOMAINS = [
    'www', 'mail', 'ftp', 'localhost', 'webmail', 'smtp', 'pop', 'ns1', 'webdisk', 'ns2',
    'cpanel', 'whm', 'autodiscover', 'autoconfig', 'secure', 'api', 'admin', 'blog', 'shop',
    'dev', 'test', 'staging', 'demo', 'beta', 'alpha', 'mobile', 'm', 'app', 'apps',
    'cdn', 'static', 'assets', 'img', 'images', 'css', 'js', 'media', 'files', 'download',
    'support', 'help', 'docs', 'wiki', 'forum', 'community', 'news', 'blog', 'store',
    'vpn', 'remote', 'proxy', 'gateway', 'firewall', 'router', 'switch', 'monitor',
    'backup', 'archive', 'old', 'new', 'temp', 'tmp', 'cache', 'log', 'logs',
    'db', 'database', 'mysql', 'postgres', 'redis', 'mongo', 'elastic', 'search',
    'git', 'svn', 'repo', 'code', 'jenkins', 'ci', 'cd', 'build', 'deploy'
];

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (event, navigationUrl) => {
        event.preventDefault();
        shell.openExternal(navigationUrl);
    });
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true,
            allowRunningInsecureContent: false,
            experimentalFeatures: false
        },
        icon: path.join(__dirname, '../assets/icon.png'),
        title: 'PlayNexus Subdomain Hunter',
        show: false,
        titleBarStyle: 'default'
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        if (isDev) {
            mainWindow.webContents.openDevTools();
        }
    });

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Create application menu
    createMenu();

    // Setup auto-updater
    if (!isDev) {
        autoUpdater.checkForUpdatesAndNotify();
    }
}

function createMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Hunt',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        mainWindow.webContents.send('menu-action', 'new-hunt');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Import Wordlist',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => {
                        mainWindow.webContents.send('menu-action', 'import-wordlist');
                    }
                },
                {
                    label: 'Export Results',
                    submenu: [
                        {
                            label: 'Export as JSON',
                            click: () => {
                                mainWindow.webContents.send('menu-action', 'export-json');
                            }
                        },
                        {
                            label: 'Export as CSV',
                            click: () => {
                                mainWindow.webContents.send('menu-action', 'export-csv');
                            }
                        },
                        {
                            label: 'Export as TXT',
                            click: () => {
                                mainWindow.webContents.send('menu-action', 'export-txt');
                            }
                        }
                    ]
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Tools',
            submenu: [
                {
                    label: 'DNS Lookup',
                    accelerator: 'CmdOrCtrl+D',
                    click: () => {
                        mainWindow.webContents.send('menu-action', 'dns-lookup');
                    }
                },
                {
                    label: 'Reverse DNS',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        mainWindow.webContents.send('menu-action', 'reverse-dns');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Settings',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => {
                        mainWindow.webContents.send('menu-action', 'settings');
                    }
                }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Help & Documentation',
                    accelerator: 'F1',
                    click: () => {
                        mainWindow.webContents.send('menu-action', 'help');
                    }
                },
                {
                    label: 'DNS Standards (RFC 1035)',
                    click: () => {
                        shell.openExternal('https://tools.ietf.org/html/rfc1035');
                    }
                },
                { type: 'separator' },
                {
                    label: 'About',
                    click: () => {
                        mainWindow.webContents.send('menu-action', 'about');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Subdomain Discovery Functions
async function huntSubdomains(domain, options = {}) {
    try {
        const results = {
            domain,
            timestamp: new Date().toISOString(),
            subdomains: [],
            statistics: {
                total: 0,
                alive: 0,
                dead: 0,
                timeElapsed: 0
            },
            methods: {
                bruteforce: options.enableBruteforce || true,
                dnsEnum: options.enableDnsEnum || true,
                webScraping: options.enableWebScraping || false,
                certificateTransparency: options.enableCertTransparency || false
            }
        };

        const startTime = Date.now();

        // Validate domain
        if (!isValidDomain(domain)) {
            throw new Error('Invalid domain format');
        }

        // Method 1: DNS Enumeration
        if (results.methods.dnsEnum) {
            const dnsResults = await performDnsEnumeration(domain, options);
            results.subdomains.push(...dnsResults);
        }

        // Method 2: Brute Force
        if (results.methods.bruteforce) {
            const bruteResults = await performBruteForce(domain, options);
            results.subdomains.push(...bruteResults);
        }

        // Method 3: Web Scraping (if enabled)
        if (results.methods.webScraping) {
            const webResults = await performWebScraping(domain, options);
            results.subdomains.push(...webResults);
        }

        // Method 4: Certificate Transparency (if enabled)
        if (results.methods.certificateTransparency) {
            const certResults = await performCertificateTransparency(domain, options);
            results.subdomains.push(...certResults);
        }

        // Remove duplicates and sort
        results.subdomains = removeDuplicateSubdomains(results.subdomains);
        results.subdomains.sort((a, b) => a.subdomain.localeCompare(b.subdomain));

        // Calculate statistics
        results.statistics.total = results.subdomains.length;
        results.statistics.alive = results.subdomains.filter(s => s.status === 'alive').length;
        results.statistics.dead = results.statistics.total - results.statistics.alive;
        results.statistics.timeElapsed = Date.now() - startTime;

        return results;

    } catch (error) {
        throw new Error(`Subdomain hunting failed: ${error.message}`);
    }
}

async function performDnsEnumeration(domain, options) {
    const subdomains = [];
    const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT'];

    try {
        // Try common DNS records for the main domain
        for (const recordType of recordTypes) {
            try {
                const records = await dns.resolve(domain, recordType);
                if (records && records.length > 0) {
                    // Extract potential subdomains from DNS records
                    records.forEach(record => {
                        if (typeof record === 'string' && record.includes(domain)) {
                            const subdomain = extractSubdomainFromRecord(record, domain);
                            if (subdomain) {
                                subdomains.push({
                                    subdomain,
                                    domain,
                                    method: 'dns-enum',
                                    recordType,
                                    status: 'unknown',
                                    ip: null,
                                    timestamp: new Date().toISOString()
                                });
                            }
                        }
                    });
                }
            } catch (error) {
                // DNS record type not found, continue
            }
        }

        // Try zone transfer (usually fails but worth trying)
        try {
            const nsRecords = await dns.resolve(domain, 'NS');
            for (const ns of nsRecords) {
                try {
                    // Attempt zone transfer (this will usually fail)
                    const zoneData = await attemptZoneTransfer(domain, ns);
                    if (zoneData) {
                        subdomains.push(...zoneData);
                    }
                } catch (error) {
                    // Zone transfer failed, which is expected
                }
            }
        } catch (error) {
            // No NS records found
        }

    } catch (error) {
        console.error('DNS enumeration error:', error);
    }

    return subdomains;
}

async function performBruteForce(domain, options) {
    const subdomains = [];
    const wordlist = options.customWordlist || COMMON_SUBDOMAINS;
    const concurrency = options.concurrency || 10;
    const timeout = options.timeout || 5000;

    return new Promise((resolve) => {
        const queue = async.queue(async (subdomain) => {
            try {
                const fullDomain = `${subdomain}.${domain}`;
                const result = await checkSubdomain(fullDomain, timeout);
                
                if (result.exists) {
                    subdomains.push({
                        subdomain: fullDomain,
                        domain,
                        method: 'bruteforce',
                        status: 'alive',
                        ip: result.ip,
                        recordType: result.recordType,
                        timestamp: new Date().toISOString()
                    });
                }

                // Send progress update
                mainWindow.webContents.send('hunt-progress', {
                    current: wordlist.length - queue.length(),
                    total: wordlist.length,
                    found: subdomains.length,
                    currentSubdomain: fullDomain
                });

            } catch (error) {
                // Subdomain doesn't exist or error occurred
            }
        }, concurrency);

        queue.drain(() => {
            resolve(subdomains);
        });

        // Add all subdomains to queue
        wordlist.forEach(sub => queue.push(sub));
    });
}

async function performWebScraping(domain, options) {
    const subdomains = [];
    
    try {
        // Search engines and services that might reveal subdomains
        const sources = [
            `https://www.google.com/search?q=site:${domain}`,
            `https://www.bing.com/search?q=site:${domain}`,
            `https://search.yahoo.com/search?p=site:${domain}`
        ];

        for (const url of sources) {
            try {
                const response = await axios.get(url, {
                    timeout: options.timeout || 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                const $ = cheerio.load(response.data);
                const text = $.text();
                
                // Extract potential subdomains using regex
                const subdomainRegex = new RegExp(`([a-zA-Z0-9-]+\\.${domain.replace('.', '\\.')})`, 'gi');
                const matches = text.match(subdomainRegex);
                
                if (matches) {
                    matches.forEach(match => {
                        if (!subdomains.find(s => s.subdomain === match)) {
                            subdomains.push({
                                subdomain: match,
                                domain,
                                method: 'web-scraping',
                                status: 'unknown',
                                ip: null,
                                timestamp: new Date().toISOString()
                            });
                        }
                    });
                }
            } catch (error) {
                // Failed to scrape this source
            }
        }
    } catch (error) {
        console.error('Web scraping error:', error);
    }

    return subdomains;
}

async function performCertificateTransparency(domain, options) {
    const subdomains = [];
    
    try {
        // Certificate Transparency logs
        const ctSources = [
            `https://crt.sh/?q=${domain}&output=json`,
            `https://api.certspotter.com/v1/issuances?domain=${domain}&include_subdomains=true&expand=dns_names`
        ];

        for (const url of ctSources) {
            try {
                const response = await axios.get(url, {
                    timeout: options.timeout || 10000,
                    headers: {
                        'User-Agent': 'PlayNexus-SubdomainHunter/1.0'
                    }
                });

                let certificates = [];
                if (url.includes('crt.sh')) {
                    certificates = response.data;
                } else if (url.includes('certspotter.com')) {
                    certificates = response.data.map(cert => ({
                        name_value: cert.dns_names.join('\n')
                    }));
                }

                certificates.forEach(cert => {
                    if (cert.name_value) {
                        const names = cert.name_value.split('\n');
                        names.forEach(name => {
                            name = name.trim();
                            if (name.endsWith(`.${domain}`) && !name.startsWith('*.')) {
                                if (!subdomains.find(s => s.subdomain === name)) {
                                    subdomains.push({
                                        subdomain: name,
                                        domain,
                                        method: 'certificate-transparency',
                                        status: 'unknown',
                                        ip: null,
                                        timestamp: new Date().toISOString()
                                    });
                                }
                            }
                        });
                    }
                });
            } catch (error) {
                // Failed to query this CT source
            }
        }
    } catch (error) {
        console.error('Certificate transparency error:', error);
    }

    return subdomains;
}

async function checkSubdomain(subdomain, timeout = 5000) {
    try {
        // Try A record first
        try {
            const addresses = await dns.resolve4(subdomain);
            if (addresses && addresses.length > 0) {
                return {
                    exists: true,
                    ip: addresses[0],
                    recordType: 'A'
                };
            }
        } catch (error) {
            // A record not found, try AAAA
        }

        // Try AAAA record
        try {
            const addresses = await dns.resolve6(subdomain);
            if (addresses && addresses.length > 0) {
                return {
                    exists: true,
                    ip: addresses[0],
                    recordType: 'AAAA'
                };
            }
        } catch (error) {
            // AAAA record not found, try CNAME
        }

        // Try CNAME record
        try {
            const cnames = await dns.resolve(subdomain, 'CNAME');
            if (cnames && cnames.length > 0) {
                return {
                    exists: true,
                    ip: cnames[0],
                    recordType: 'CNAME'
                };
            }
        } catch (error) {
            // CNAME record not found
        }

        return { exists: false };
    } catch (error) {
        return { exists: false };
    }
}

async function performDnsLookup(hostname, recordType = 'A') {
    try {
        const results = {
            hostname,
            recordType,
            records: [],
            timestamp: new Date().toISOString()
        };

        switch (recordType.toUpperCase()) {
            case 'A':
                results.records = await dns.resolve4(hostname);
                break;
            case 'AAAA':
                results.records = await dns.resolve6(hostname);
                break;
            case 'CNAME':
                results.records = await dns.resolve(hostname, 'CNAME');
                break;
            case 'MX':
                results.records = await dns.resolve(hostname, 'MX');
                break;
            case 'NS':
                results.records = await dns.resolve(hostname, 'NS');
                break;
            case 'TXT':
                results.records = await dns.resolve(hostname, 'TXT');
                break;
            case 'SOA':
                results.records = [await dns.resolve(hostname, 'SOA')];
                break;
            default:
                throw new Error(`Unsupported record type: ${recordType}`);
        }

        return results;
    } catch (error) {
        throw new Error(`DNS lookup failed: ${error.message}`);
    }
}

async function performReverseDns(ip) {
    try {
        const hostnames = await dns.reverse(ip);
        return {
            ip,
            hostnames,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        throw new Error(`Reverse DNS lookup failed: ${error.message}`);
    }
}

// Utility functions
function isValidDomain(domain) {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain);
}

function extractSubdomainFromRecord(record, domain) {
    if (typeof record === 'string' && record.includes(domain)) {
        const parts = record.split('.');
        const domainParts = domain.split('.');
        if (parts.length > domainParts.length) {
            return record;
        }
    }
    return null;
}

function removeDuplicateSubdomains(subdomains) {
    const seen = new Set();
    return subdomains.filter(sub => {
        if (seen.has(sub.subdomain)) {
            return false;
        }
        seen.add(sub.subdomain);
        return true;
    });
}

async function attemptZoneTransfer(domain, nameserver) {
    // Zone transfer is rarely successful but worth trying
    // This is a simplified implementation
    try {
        // Most zone transfers will fail due to security restrictions
        return [];
    } catch (error) {
        return [];
    }
}

// IPC Handlers
ipcMain.handle('hunt-subdomains', async (event, data) => {
    try {
        const { domain, options } = data;
        return await huntSubdomains(domain, options);
    } catch (error) {
        throw error;
    }
});

ipcMain.handle('dns-lookup', async (event, data) => {
    try {
        const { hostname, recordType } = data;
        return await performDnsLookup(hostname, recordType);
    } catch (error) {
        throw error;
    }
});

ipcMain.handle('reverse-dns', async (event, data) => {
    try {
        const { ip } = data;
        return await performReverseDns(ip);
    } catch (error) {
        throw error;
    }
});

ipcMain.handle('import-wordlist', async (event) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Import Wordlist',
            filters: [
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const content = await fs.readFile(result.filePaths[0], 'utf8');
            const wordlist = content.split('\n').map(line => line.trim()).filter(line => line);
            return { success: true, wordlist };
        }

        return { success: false };
    } catch (error) {
        throw error;
    }
});

ipcMain.handle('export-results', async (event, data) => {
    try {
        const { results, format } = data;
        
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Export Subdomain Results',
            defaultPath: `subdomain-hunt-${results.domain}-${Date.now()}.${format}`,
            filters: [
                { name: `${format.toUpperCase()} Files`, extensions: [format] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!result.canceled) {
            let content;
            
            switch (format) {
                case 'json':
                    content = JSON.stringify(results, null, 2);
                    break;
                case 'csv':
                    content = convertToCSV(results);
                    break;
                case 'txt':
                    content = results.subdomains.map(s => s.subdomain).join('\n');
                    break;
                default:
                    throw new Error(`Unsupported format: ${format}`);
            }
            
            await fs.writeFile(result.filePath, content, 'utf8');
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
});

ipcMain.handle('get-settings', async (event) => {
    try {
        return store.get('settings', {
            theme: 'dark',
            concurrency: 10,
            timeout: 5000,
            enableBruteforce: true,
            enableDnsEnum: true,
            enableWebScraping: false,
            enableCertTransparency: false,
            saveHistory: true
        });
    } catch (error) {
        throw error;
    }
});

ipcMain.handle('save-settings', async (event, settings) => {
    try {
        store.set('settings', settings);
        return true;
    } catch (error) {
        throw error;
    }
});

ipcMain.handle('save-to-history', async (event, data) => {
    try {
        const history = store.get('history', []);
        history.unshift(data);
        
        // Keep only last 50 entries
        if (history.length > 50) {
            history.splice(50);
        }
        
        store.set('history', history);
        return true;
    } catch (error) {
        throw error;
    }
});

// Utility functions
function convertToCSV(results) {
    const headers = ['Subdomain', 'IP', 'Method', 'Status', 'Record Type', 'Timestamp'];
    const rows = results.subdomains.map(sub => [
        sub.subdomain,
        sub.ip || 'N/A',
        sub.method,
        sub.status,
        sub.recordType || 'N/A',
        sub.timestamp
    ]);
    
    return [headers, ...rows].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
}

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
    console.log('Update available.');
});

autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available.');
});

autoUpdater.on('error', (err) => {
    console.log('Error in auto-updater. ' + err);
});

autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded');
    autoUpdater.quitAndInstall();
});
