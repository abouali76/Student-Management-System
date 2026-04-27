/**
 * AcademiaPro Database Manager
 * Uses IndexedDB for high-performance, large-capacity local storage.
 */

const DB_NAME = 'AcademiaProDB';
const DB_VERSION = 2;

class AcademiaDB {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onblocked = () => {
                alert("يرجى إغلاق كافة تبويبات الموقع الأخرى لإتمام تحديث النظام.");
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log("Upgrading database to version", DB_VERSION);

                // Students Store
                if (!db.objectStoreNames.contains('students')) {
                    const studentStore = db.createObjectStore('students', { keyPath: 'id' });
                    studentStore.createIndex('name', 'name', { unique: false });
                    studentStore.createIndex('level', 'level', { unique: false });
                }

                // Transactions Store (Financial movements)
                if (!db.objectStoreNames.contains('transactions')) {
                    const transStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
                    transStore.createIndex('studentId', 'studentId', { unique: false });
                    transStore.createIndex('date', 'date', { unique: false });
                }

                // Logs Store (System actions)
                if (!db.objectStoreNames.contains('logs')) {
                    const logStore = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
                    logStore.createIndex('type', 'type', { unique: false });
                    logStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Config Store (Settings, Passwords)
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;

                this.db.onversionchange = () => {
                    this.db.close();
                    alert("تم تحديث النظام بنجاح، سيتم إعادة تشغيل الصفحة الآن.");
                    location.reload();
                };

                console.log("Database initialized successfully");
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error("Database error:", event.target.error);
                reject(event.target.error);
            };
        });
    }

    // --- Generic CRUD ---
    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // --- Advanced Queries ---
    async getLogs(limit = 100) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['logs'], 'readonly');
            const store = transaction.objectStore('logs');
            const index = store.index('timestamp');
            const request = index.openCursor(null, 'prev');
            const results = [];
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && results.length < limit) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // --- Backup & Restore ---
    async exportAllData() {
        const stores = ['students', 'transactions', 'logs', 'config'];
        const exportData = {};

        for (const storeName of stores) {
            exportData[storeName] = await this.getAll(storeName);
        }

        return JSON.stringify({
            version: DB_VERSION,
            timestamp: new Date().toISOString(),
            data: exportData
        }, null, 2);
    }

    async importAllData(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            if (!imported.data) throw new Error("Invalid backup file format");

            const stores = ['students', 'transactions', 'logs', 'config'];
            
            // Clear and Import
            for (const storeName of stores) {
                if (imported.data[storeName]) {
                    // Clear existing
                    const transaction = this.db.transaction([storeName], 'readwrite');
                    const store = transaction.objectStore(storeName);
                    await new Promise((resolve, reject) => {
                        const request = store.clear();
                        request.onsuccess = () => resolve();
                        request.onerror = () => reject(request.error);
                    });

                    // Add new items
                    for (const item of imported.data[storeName]) {
                        await this.put(storeName, item);
                    }
                }
            }
            return true;
        } catch (e) {
            console.error("Import failed:", e);
            throw e;
        }
    }
}

// Export singleton
const db = new AcademiaDB();
