// server.js
const WebSocket = require('ws');
const http = require('http');

// Initialize data structure
let data = {
    branches: {
        nairobi: {
            id: 'nairobi',
            name: "Nairobi Branch",
            products: [
                { id: 1, name: "HP EliteBook Laptop", price: 89999, stock: 15, category: "Laptops", barcode: "123456789" },
                { id: 2, name: "Wireless Mouse", price: 2499, stock: 42, category: "Accessories", barcode: "987654321" }
            ]
        },
        mombasa: {
            id: 'mombasa',
            name: "Mombasa Branch",
            products: [
                { id: 1, name: "HP EliteBook Laptop", price: 89999, stock: 10, category: "Laptops", barcode: "123456789" },
                { id: 2, name: "Wireless Mouse", price: 2499, stock: 30, category: "Accessories", barcode: "987654321" },
                { id: 3, name: "External HDD 1TB", price: 7999, stock: 12, category: "Storage", barcode: "654321987" }
            ]
        },
        kisumu: {
            id: 'kisumu',
            name: "Kisumu Branch",
            products: [
                { id: 1, name: "HP EliteBook Laptop", price: 89999, stock: 8, category: "Laptops", barcode: "123456789" },
                { id: 2, name: "Bluetooth Speaker", price: 5999, stock: 15, category: "Audio", barcode: "321987654" }
            ]
        }
    },
    users: [
        { 
            id: 1,
            username: "admin", 
            password: "Fast@2025", 
            name: "System Admin",
            role: "admin", 
            branch: "all",
            status: "active",
            lastLogin: null
        },
        { 
            id: 2,
            username: "manager", 
            password: "Fast@2025/", 
            name: "Branch Manager",
            role: "manager", 
            branch: "nairobi",
            status: "active",
            lastLogin: null
        },
        { 
            id: 3,
            username: "cashier", 
            password: "Fast@2025//", 
            name: "Sales Cashier",
            role: "cashier", 
            branch: "nairobi",
            status: "active",
            lastLogin: null
        }
    ],
    sales: [],
    customers: [
        {
            id: 1,
            name: "John Doe",
            phone: "0712345678",
            email: "john@example.com",
            address: "123 Main St, Nairobi"
        },
        {
            id: 2,
            name: "Jane Smith",
            phone: "0723456789",
            email: "jane@example.com",
            address: "456 Park Ave, Mombasa"
        }
    ]
};

// Create HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Fastway POS Sync Server\n');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('New client connected');
    
    // Send current state to new client
    ws.send(JSON.stringify({ 
        type: 'full-sync', 
        data: data 
    }));
    
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            console.log('Received:', msg.type);
            
            switch(msg.type) {
                case 'update':
                    data[msg.store] = msg.data;
                    break;
                case 'add':
                    data[msg.store].push(msg.item);
                    break;
                case 'remove':
                    data[msg.store] = data[msg.store].filter(item => item.id !== msg.id);
                    break;
                case 'update-product':
                    const branch = data.branches[msg.branchId];
                    if (branch) {
                        const productIndex = branch.products.findIndex(p => p.id === msg.productId);
                        if (productIndex !== -1) {
                            branch.products[productIndex] = msg.product;
                        }
                    }
                    break;
            }
            
            // Broadcast to all clients except sender
            wss.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(msg));
                }
            });
            
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Start server
const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Fastway POS Sync Server running on ws://192.168.0.102:${PORT}`);
});