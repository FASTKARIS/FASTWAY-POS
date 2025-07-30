function showTime() {
    document.getElementById('currentTime').innerHTML = new Date().toUTCString();
}
showTime();
setInterval(function () {
    showTime();
}, 1000);

class DataManager {
    static socket = null;
    static data = {
        branches: {},
        users: [],
        sales: [],
        customers: []
    };

    static async initialize() {
        try {
            // Connect to WebSocket server on your local machine
            this.socket = new WebSocket('ws://192.168.0.102:8080');
            
            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleIncomingData(data);
                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                }
            };
            
            this.socket.onopen = () => {
                console.log('Connected to WebSocket server');
                if (window.posSystem && window.posSystem.dom && window.posSystem.dom.networkStatus) {
                    window.posSystem.dom.networkStatus.textContent = 'Online';
                    window.posSystem.dom.networkStatus.className = 'network-status online';
                }
                Utils.showNotification("Connected to sync server", "success");
            };
            
            this.socket.onclose = () => {
                console.log('Disconnected from WebSocket server');
                if (window.posSystem && window.posSystem.dom && window.posSystem.dom.networkStatus) {
                    window.posSystem.dom.networkStatus.textContent = 'Offline';
                    window.posSystem.dom.networkStatus.className = 'network-status offline';
                }
                Utils.showNotification("Disconnected from sync server - working offline", "warning");
                // Try to reconnect every 5 seconds
                setTimeout(() => this.initialize(), 5000);
            };
            
            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                Utils.showNotification("Sync server connection error", "error");
            };
            
            await this.initIndexedDB();
        } catch (error) {
            console.error('DataManager initialization error:', error);
        }
    }

    static async initIndexedDB() {
        return new Promise((resolve) => {
            const request = indexedDB.open('FastwayPOS', 1);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                db.createObjectStore('branches', { keyPath: 'id' });
                db.createObjectStore('users', { keyPath: 'id' });
                db.createObjectStore('sales', { keyPath: 'id' });
                db.createObjectStore('customers', { keyPath: 'id' });
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.loadFromIndexedDB().then(resolve);
            };
        });
    }

    static async loadFromIndexedDB() {
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['branches', 'users', 'sales', 'customers'], 'readonly');
            
            transaction.objectStore('branches').getAll().onsuccess = (event) => {
                event.target.result.forEach(branch => {
                    this.data.branches[branch.id] = branch;
                });
            };
            
            transaction.objectStore('users').getAll().onsuccess = (event) => {
                this.data.users = event.target.result;
            };
            
            transaction.objectStore('sales').getAll().onsuccess = (event) => {
                this.data.sales = event.target.result;
            };
            
            transaction.objectStore('customers').getAll().onsuccess = (event) => {
                this.data.customers = event.target.result;
            };
            
            transaction.oncomplete = () => resolve();
        });
    }

    static saveToIndexedDB() {
        const transaction = this.db.transaction(['branches', 'users', 'sales', 'customers'], 'readwrite');
        
        // Clear existing data
        transaction.objectStore('branches').clear();
        transaction.objectStore('users').clear();
        transaction.objectStore('sales').clear();
        transaction.objectStore('customers').clear();
        
        // Save branches
        Object.values(this.data.branches).forEach(branch => {
            transaction.objectStore('branches').put(branch);
        });
        
        // Save other data
        this.data.users.forEach(user => {
            transaction.objectStore('users').put(user);
        });
        
        this.data.sales.forEach(sale => {
            transaction.objectStore('sales').put(sale);
        });
        
        this.data.customers.forEach(customer => {
            transaction.objectStore('customers').put(customer);
        });
    }

    static handleIncomingData(data) {
        switch(data.type) {
            case 'full-sync':
                this.data = data.data;
                this.saveToIndexedDB();
                break;
            case 'update':
                this.data[data.store] = data.data;
                this.saveToIndexedDB();
                break;
            case 'add':
                this.data[data.store].push(data.item);
                this.saveToIndexedDB();
                break;
            case 'remove':
                this.data[data.store] = this.data[data.store].filter(item => item.id !== data.id);
                this.saveToIndexedDB();
                break;
            case 'update-product':
                const branch = this.data.branches[data.branchId];
                if (branch) {
                    const productIndex = branch.products.findIndex(p => p.id === data.productId);
                    if (productIndex !== -1) {
                        branch.products[productIndex] = data.product;
                        this.saveToIndexedDB();
                    }
                }
                break;
        }
        
        // Notify UI to update
        if (window.posSystem) {
            window.posSystem.dataUpdated();
        }
    }

    static broadcast(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        } else {
            console.warn('Cannot broadcast - WebSocket not connected');
            // Store for later when connection is restored
        }
    }

    // Data access methods
    static getBranches() {
        return this.data.branches;
    }

    static getProducts(branch) {
        return this.data.branches[branch]?.products || [];
    }

    static getUsers() {
        return this.data.users;
    }

    static getSalesRecords() {
        return this.data.sales;
    }

    static getCustomers() {
        return this.data.customers;
    }

    // Data modification methods
    static saveBranches(branches) {
        this.data.branches = branches;
        this.broadcast({
            type: 'update',
            store: 'branches',
            data: branches
        });
    }

    static saveUsers(users) {
        this.data.users = users;
        this.broadcast({
            type: 'update',
            store: 'users',
            data: users
        });
    }

    static saveSalesRecords(sales) {
        this.data.sales = sales;
        this.broadcast({
            type: 'update',
            store: 'sales',
            data: sales
        });
    }

    static saveCustomers(customers) {
        this.data.customers = customers;
        this.broadcast({
            type: 'update',
            store: 'customers',
            data: customers
        });
    }

    static addProduct(branchId, product) {
        if (!this.data.branches[branchId]) return;
        
        const products = this.data.branches[branchId].products;
        product.id = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
        products.push(product);
        
        this.broadcast({
            type: 'update',
            store: 'branches',
            data: this.data.branches
        });
    }

    static updateProduct(branchId, productId, updatedProduct) {
        if (!this.data.branches[branchId]) return;
        
        const products = this.data.branches[branchId].products;
        const index = products.findIndex(p => p.id === productId);
        
        if (index !== -1) {
            products[index] = {
                ...products[index],
                name: updatedProduct.name,
                price: parseInt(updatedProduct.price),
                stock: parseInt(updatedProduct.stock),
                category: updatedProduct.category,
                barcode: updatedProduct.barcode
            };
            
            this.broadcast({
                type: 'update-product',
                branchId: branchId,
                productId: productId,
                product: products[index]
            });
            
            this.broadcast({
                type: 'update',
                store: 'branches',
                data: this.data.branches
            });
        }
    }

    static deleteProduct(branchId, productId) {
        if (!this.data.branches[branchId]) return;
        
        const products = this.data.branches[branchId].products;
        const index = products.findIndex(p => p.id === productId);
        
        if (index !== -1) {
            products.splice(index, 1);
            this.broadcast({
                type: 'update',
                store: 'branches',
                data: this.data.branches
            });
        }
    }

    static addCustomer(customer) {
        const customers = this.data.customers;
        customer.id = customers.length > 0 ? Math.max(...customers.map(c => c.id)) + 1 : 1;
        customers.push(customer);
        
        this.broadcast({
            type: 'update',
            store: 'customers',
            data: customers
        });
    }

    static updateCustomer(customerId, updatedCustomer) {
        const customers = this.data.customers;
        const index = customers.findIndex(c => c.id === customerId);
        
        if (index !== -1) {
            customers[index] = {
                ...customers[index],
                name: updatedCustomer.name,
                phone: updatedCustomer.phone,
                email: updatedCustomer.email,
                address: updatedCustomer.address
            };
            
            this.broadcast({
                type: 'update',
                store: 'customers',
                data: customers
            });
        }
    }

    static deleteCustomer(customerId) {
        const customers = this.data.customers;
        const index = customers.findIndex(c => c.id === customerId);
        
        if (index !== -1) {
            customers.splice(index, 1);
            this.broadcast({
                type: 'update',
                store: 'customers',
                data: customers
            });
        }
    }

    static addEmployee(employee) {
        const users = this.data.users;
        
        // Check if username already exists
        const usernameExists = users.some(u => u.username.toLowerCase() === employee.username.toLowerCase());
        if (usernameExists) {
            throw new Error("Username already exists");
        }
        
        employee.id = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
        employee.lastLogin = null;
        users.push(employee);
        
        this.broadcast({
            type: 'update',
            store: 'users',
            data: users
        });
    }

    static updateEmployee(employeeId, updatedEmployee) {
        const users = this.data.users;
        const index = users.findIndex(u => u.id === employeeId);
        
        if (index !== -1) {
            users[index] = {
                ...users[index],
                name: updatedEmployee.name,
                username: updatedEmployee.username,
                password: updatedEmployee.password,
                role: updatedEmployee.role,
                branch: updatedEmployee.role === 'admin' ? 'all' : updatedEmployee.branch,
                status: updatedEmployee.status
            };
            
            this.broadcast({
                type: 'update',
                store: 'users',
                data: users
            });
        }
    }

    static deleteEmployee(employeeId) {
        const users = this.data.users;
        const index = users.findIndex(u => u.id === employeeId);
        
        if (index !== -1) {
            users.splice(index, 1);
            this.broadcast({
                type: 'update',
                store: 'users',
                data: users
            });
        }
    }
}

class Utils {
    // ... (Keep all existing Utils methods exactly the same) ...
}

class POSSystem {
    constructor() {
        this.state = {
            currentBranch: "nairobi",
            currentUser: null,
            cart: [],
            subtotal: 0,
            discount: 0,
            total: 0,
            currentProductId: null,
            currentCustomerId: null,
            currentEmployeeId: null,
            isEditing: false,
            filteredProducts: null,
            showSalesReport: false,
            showCustomerSection: false,
            showEmployeeSection: false,
            sessionTimeout: null
        };
        
        this.initializeDOMReferences();
        this.loadInitialState();
        this.resetSessionTimer();
    }
    
    initializeDOMReferences() {
        // ... (Keep existing initializeDOMReferences exactly the same) ...
    }
    
    loadInitialState() {
        // ... (Keep existing loadInitialState exactly the same) ...
    }
    
    dataUpdated() {
        this.loadProducts();
        this.loadCustomers();
        this.loadEmployees();
        
        if (this.state.showSalesReport) {
            this.generateSalesReport();
        }
        
        // Update cart if products changed
        this.updateCartDisplay();
    }
    
    // ... (Keep all other existing methods exactly the same until checkout) ...

    async checkout() {
        if (this.state.cart.length === 0) {
            Utils.showNotification("Your cart is empty!", "error");
            return;
        }
        
        Utils.showLoading("Processing sale...");
        
        try {
            const branches = DataManager.getBranches();
            const products = branches[this.state.currentBranch].products;
            
            // Check stock levels before processing
            for (const item of this.state.cart) {
                const product = products.find(p => p.id === item.id);
                if (!product || product.stock < item.quantity) {
                    Utils.showNotification(`Not enough stock for ${item.name}`, "error");
                    Utils.hideLoading();
                    return;
                }
            }
            
            // Update stock levels and broadcast changes
            for (const item of this.state.cart) {
                const product = products.find(p => p.id === item.id);
                if (product) {
                    product.stock -= item.quantity;
                    
                    // Broadcast individual product updates
                    DataManager.broadcast({
                        type: 'update-product',
                        branchId: this.state.currentBranch,
                        productId: product.id,
                        product: product
                    });
                }
            }
            
            // Broadcast the complete branches structure
            DataManager.broadcast({
                type: 'update',
                store: 'branches',
                data: branches
            });
            
            this.recordSale();
            this.generateReceipt();
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.printReceipt();
            
            // Reset cart
            this.state.cart = [];
            this.state.subtotal = 0;
            this.state.discount = 0;
            this.state.total = 0;
            this.dom.discountInput.value = '';
            this.updateCartDisplay();
            
            // Data will be refreshed via WebSocket updates
            Utils.showNotification("Sale completed successfully!", "success");
        } catch (error) {
            console.error("Checkout error:", error);
            Utils.showNotification("An error occurred during checkout", "error");
        } finally {
            Utils.hideLoading();
        }
    }

    // ... (Keep all remaining existing methods exactly the same) ...
}

// Register service worker if supported
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed: ', error);
            });
    });
}

// Initialize the POS system when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.posSystem = new POSSystem();
    window.posSystem.init();
});