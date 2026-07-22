const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Path to data file
const DATA_FILE = process.env.DATA_PATH || path.join(__dirname, 'data.json');
const IMPORT_FILE = path.join(__dirname, 'clients_imported.json');

// Vendedores iniciales
const initialSellers = [
  { id: 1, name: "Juan Pérez (Vendedor 1)", color: "#3B82F6" },   // Blue
  { id: 2, name: "María Gómez (Vendedor 2)", color: "#10B981" },  // Green
  { id: 3, name: "Pedro López (Vendedor 3)", color: "#F59E0B" },  // Yellow/Amber
  { id: 4, name: "Ana Martínez (Vendedor 4)", color: "#EF4444" },  // Red
  { id: 5, name: "Luis Rodríguez (Vendedor 5)", color: "#8B5CF6" },// Purple
  { id: 6, name: "Sofía Ruiz (Vendedor 6)", color: "#EC4899" }    // Pink
];

// Helper to read data from JSON
function readDB() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      // Initialize with seed data if available
      let seedClients = [];
      if (fs.existsSync(IMPORT_FILE)) {
        try {
          const importData = fs.readFileSync(IMPORT_FILE, 'utf-8');
          seedClients = JSON.parse(importData);
          console.log(`Se cargaron ${seedClients.length} clientes sembrados desde Excel.`);
        } catch (err) {
          console.error("Error leyendo archivo de importación:", err);
        }
      }
      
      const initialDB = {
        sellers: initialSellers,
        clients: seedClients,
        visits_history: [],
        last_reset: new Date().toISOString()
      };
      
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialDB, null, 2), 'utf-8');
      return initialDB;
    }
    
    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(rawData);
  } catch (err) {
    console.error("Error de lectura de BD:", err);
    return { sellers: initialSellers, clients: [], visits_history: [], last_reset: new Date().toISOString() };
  }
}

// Helper to write data to JSON
function writeDB(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error("Error escribiendo en BD:", err);
    return false;
  }
}

// Lógica de reinicio cada 72 horas
function checkAndResetRoutes(db) {
  const lastReset = new Date(db.last_reset || new Date());
  const now = new Date();
  
  // Diferencia en milisegundos
  const diffMs = now - lastReset;
  // Convertir a horas
  const diffHours = diffMs / (1000 * 60 * 60);
  
  if (diffHours >= 72) {
    console.log(`Han transcurrido ${diffHours.toFixed(1)} horas desde el último reinicio. Reseteando estados...`);
    // Restablecer estados de clientes a "Pendiente"
    db.clients = db.clients.map(client => ({
      ...client,
      status: "Pendiente"
    }));
    db.last_reset = now.toISOString();
    writeDB(db);
  }
  return db;
}

// API Endpoints

// 1. Obtener todos los datos
app.get('/api/data', (req, res) => {
  let db = readDB();
  db = checkAndResetRoutes(db);
  res.json(db);
});

// 2. Registrar nuevo cliente
app.post('/api/clients', (req, res) => {
  const { client_name, shop_name, phone, latitude, longitude, seller_id, maps_url, photo_url } = req.body;
  
  if (!client_name || !latitude || !longitude || !seller_id) {
    return res.status(400).json({ error: "Faltan campos obligatorios (nombre de cliente, coordenadas, vendedor)." });
  }
  
  const db = readDB();
  
  const newClient = {
    id: db.clients.length > 0 ? Math.max(...db.clients.map(c => c.id)) + 1 : 1,
    timestamp: new Date().toISOString(),
    client_name: client_name.trim(),
    phone: phone ? phone.trim() : "",
    shop_name: shop_name ? shop_name.trim() : "",
    maps_url: maps_url ? maps_url.trim() : `https://www.google.com/maps/place/${latitude},${longitude}`,
    photo_url: photo_url ? photo_url.trim() : "",
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    is_approximate: false,
    seller_id: parseInt(seller_id),
    status: "Pendiente" // Amarillo inicial
  };
  
  db.clients.push(newClient);
  writeDB(db);
  
  console.log(`Cliente registrado por Vendedor ${seller_id}: ${newClient.client_name}`);
  res.status(201).json(newClient);
});

// 3. Registrar una visita (actualizar estado y guardar en historial)
app.post('/api/clients/:id/visit', (req, res) => {
  const clientId = parseInt(req.params.id);
  const { seller_id, status, observations, latitude_checkin, longitude_checkin } = req.body;
  
  if (!seller_id || !status) {
    return res.status(400).json({ error: "Faltan campos obligatorios (vendedor, estado)." });
  }
  
  const db = readDB();
  const clientIdx = db.clients.findIndex(c => c.id === clientId);
  
  if (clientIdx === -1) {
    return res.status(404).json({ error: "Cliente no encontrado." });
  }
  
  const client = db.clients[clientIdx];
  
  // Actualizar estado del cliente
  client.status = status; // "Visitado" (Verde), "Cerrado" (Rojo), "Pendiente" (Amarillo)
  client.last_status_time = new Date().toISOString();
  
  // Agregar al historial de visitas
  const visitRecord = {
    id: Date.now(),
    client_id: clientId,
    client_name: client.client_name,
    shop_name: client.shop_name,
    seller_id: parseInt(seller_id),
    timestamp: new Date().toISOString(),
    status: status,
    observations: observations || "",
    latitude_checkin: latitude_checkin ? parseFloat(latitude_checkin) : null,
    longitude_checkin: longitude_checkin ? parseFloat(longitude_checkin) : null
  };
  
  db.visits_history.push(visitRecord);
  writeDB(db);
  
  console.log(`Visita registrada para ${client.client_name} - Estado: ${status}`);
  res.json({ client, visit: visitRecord });
});

// 4. Forzar reinicio manual de estados
app.post('/api/reset', (req, res) => {
  const db = readDB();
  db.clients = db.clients.map(client => ({
    ...client,
    status: "Pendiente"
  }));
  db.last_reset = new Date().toISOString();
  writeDB(db);
  
  console.log("Reinicio manual de rutas ejecutado.");
  res.json({ message: "Todas las rutas han sido restablecidas a Pendiente.", last_reset: db.last_reset });
});

// 5. Actualizar nombre de vendedor
app.put('/api/sellers/:id', (req, res) => {
  const sellerId = parseInt(req.params.id);
  const { name } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "El nombre del vendedor es obligatorio." });
  }
  
  const db = readDB();
  const sellerIdx = db.sellers.findIndex(s => s.id === sellerId);
  
  if (sellerIdx === -1) {
    return res.status(404).json({ error: "Vendedor no encontrado." });
  }
  
  db.sellers[sellerIdx].name = name.trim();
  writeDB(db);
  
  console.log(`Vendedor ${sellerId} renombrado a: ${db.sellers[sellerIdx].name}`);
  res.json(db.sellers[sellerIdx]);
});

// Servir frontend compilado en producción
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  if (fs.existsSync(path.join(__dirname, 'dist', 'index.html'))) {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    res.send("Backend activo. El frontend de React aún no está compilado. Corre 'npm run dev' en desarrollo.");
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de Rutas GPS corriendo en puerto ${PORT}`);
});
